import { createClient } from 'npm:@supabase/supabase-js@2.106.2'

// NOT DEPLOYED. Written as part of Phase 3 Step 2 of the account-deletion
// build (branch feature/account-deletion). Do NOT run
// `supabase functions deploy delete-account` until a founder explicitly
// approves it — same standing rule as the paired migration
// 20261020000001_delete_user_account_data.sql, which this function calls
// and which must be applied FIRST, manually, before this is ever deployed.
//
// Pattern: authorize-with-caller, act-with-admin — same split established by
// copy-received-recipe-photo/index.ts (the app's first service-role Edge
// Function). Three steps, each fully verified before moving to the next:
//   1. data   — public.delete_user_account_data(uid) via admin RPC
//   2. storage — sweep recipe-photos/ and menu-photos/ under ${uid}/
//   3. auth   — auth.admin.deleteUser(uid), then confirm via getUserById
// All three must succeed, and each is independently re-run-safe, so a retry
// after a partial failure (e.g. storage succeeded, auth step crashed) is
// safe to call again.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const STORAGE_BUCKETS = ['recipe-photos', 'menu-photos']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 100

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// supabase-js storage.list() defaults to 100 and caps at 1000 per call —
// paginate explicitly so an account with >1 page of photos isn't left with
// orphaned objects after a "successful" single-page sweep.
async function listAllUnderPrefix(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await adminClient.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset })
    if (error) throw new Error(`list failed for ${bucket}/${prefix}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const entry of data) paths.push(`${prefix}${entry.name}`)
    if (data.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }
  return paths
}

async function removeInBatches(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE)
    const { error } = await adminClient.storage.from(bucket).remove(batch)
    if (error) throw new Error(`remove failed for ${bucket} batch starting at ${i}: ${error.message}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization header' }, 401)
  }

  // CALLER client — RLS-scoped to the real caller via the forwarded JWT.
  // Identity comes ONLY from this verified token, never from the request
  // body — a user can only ever delete their own account through this path.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'not authenticated' }, 401)
  }
  const uid = userData.user.id

  // Defense in depth: uid comes from a verified Supabase JWT and is always
  // a UUID, but every downstream use of uid is either a storage path prefix
  // or an admin API argument — cheap to double-check the shape before using
  // it as a prefix for a recursive-feeling list+remove sweep.
  if (!UUID_RE.test(uid)) {
    return jsonResponse({ error: 'invalid caller id' }, 500)
  }

  // ADMIN client — service role. Used ONLY for the three elevated acts
  // below (DB RPC, storage sweep, auth deletion). Never used for the
  // identity check above.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // --- Step 1: data -------------------------------------------------------
  // delete_user_account_data is SECURITY DEFINER, idempotent, and performs
  // its own before/after snapshot + zero-rows + over-deletion verification
  // inside one transaction — a thrown exception here means the whole DB
  // side rolled back cleanly, so it's safe to report failure and let the
  // caller retry.
  const { data: deleteSummary, error: dataError } = await adminClient.rpc(
    'delete_user_account_data',
    { p_user_id: uid },
  )
  if (dataError) {
    return jsonResponse({ error: 'account data deletion failed', step: 'data', details: dataError.message }, 500)
  }

  // --- Step 2: storage ------------------------------------------------------
  // Sweep every bucket under the caller's own prefix only. Re-list after
  // remove() to CONFIRM zero objects remain — storage.remove() reports
  // success even for paths that never existed, so it cannot be trusted on
  // its own as proof of a clean sweep.
  const storageResults: Record<string, { removed: number; remaining: number }> = {}
  try {
    for (const bucket of STORAGE_BUCKETS) {
      const prefix = `${uid}/`
      const paths = await listAllUnderPrefix(adminClient, bucket, prefix)
      if (paths.length > 0) {
        await removeInBatches(adminClient, bucket, paths)
      }
      const remaining = await listAllUnderPrefix(adminClient, bucket, prefix)
      if (remaining.length > 0) {
        return jsonResponse(
          { error: `storage sweep incomplete for ${bucket}`, step: 'storage', remaining: remaining.length },
          500,
        )
      }
      storageResults[bucket] = { removed: paths.length, remaining: remaining.length }
    }
  } catch (err) {
    return jsonResponse(
      { error: 'storage sweep failed', step: 'storage', details: err instanceof Error ? err.message : String(err) },
      500,
    )
  }

  // --- Step 3: auth ---------------------------------------------------------
  // Idempotency: if a prior call already deleted the auth user but crashed
  // before returning (e.g. the response never reached the client), a retry
  // must not treat "already gone" as a failure.
  const { data: existingUser, error: getBeforeError } = await adminClient.auth.admin.getUserById(uid)
  if (getBeforeError && getBeforeError.status !== 404) {
    return jsonResponse(
      { error: 'could not verify auth user before deletion', step: 'auth', details: getBeforeError.message },
      500,
    )
  }

  if (existingUser?.user) {
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(uid)
    if (deleteAuthError) {
      return jsonResponse(
        { error: 'auth user deletion failed', step: 'auth', details: deleteAuthError.message },
        500,
      )
    }
  }

  // Confirm via a fresh read — never trust deleteUser's own success signal
  // alone, same "re-list to confirm" discipline as the storage step above.
  const { data: confirmUser, error: getAfterError } = await adminClient.auth.admin.getUserById(uid)
  const stillExists = !getAfterError && !!confirmUser?.user
  if (stillExists) {
    return jsonResponse({ error: 'auth user still exists after deletion', step: 'auth' }, 500)
  }

  return jsonResponse(
    {
      deleted: true,
      user_id: uid,
      data: deleteSummary,
      storage: storageResults,
      auth: { deleted: true },
    },
    200,
  )
})
