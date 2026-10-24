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
//   0. storage buckets exist (checked up front, see review finding F6)
//   1. data   — public.delete_user_account_data(uid) via admin RPC
//   2. storage — sweep recipe-photos/, menu-photos/, and cook-photos-private/
//      under ${uid}/ (cook-photos-private added 2026-10-25, see below)
//   3. auth   — auth.admin.deleteUser(uid), then confirm via getUserById
// All three numbered steps must succeed, and each is independently
// re-run-safe, so a retry after a partial failure (e.g. storage succeeded,
// auth step crashed) is safe to call again.
//
// Error responses (review finding F3): every failure past the identity check
// returns ONLY a generic { success: false, step, message } to the client —
// never a raw Postgres/SDK error string, which could otherwise embed another
// user's id or other internal detail (e.g. a tripped ownership-check
// exception in delete_user_account_data). Full details are logged
// server-side via console.error for debugging; nothing sensitive crosses the
// response boundary.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// cook-photos-private added 2026-10-25 alongside cook_posts (migration
// 20261025000001_cook_posts_feed_v1.sql) — a NON-public bucket for live,
// unposted cook photos. Same one-level-deep {uid}/ sweep as the other two;
// its DB rows (cook_events.photo_url) are already removed by
// delete_user_account_data, this just removes the corresponding objects so
// a deleted account's private cook photos don't survive in storage.
const STORAGE_BUCKETS = ['recipe-photos', 'menu-photos', 'cook-photos-private']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 100

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Review finding F3: the single place every post-identity failure funnels
// through. Logs the full, possibly-sensitive detail server-side; returns
// only a generic, step-tagged message to the client.
function failResponse(step: 'storage' | 'data' | 'auth', logMessage: string, details?: unknown) {
  console.error(`delete-account: ${logMessage}`, details ?? '')
  return jsonResponse(
    { success: false, step, message: 'Account deletion failed — please try again' },
    500,
  )
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

// Review finding F4: confirmed against the pinned @supabase/supabase-js
// 2.106.2 (auth-js) source — GoTrueAdminApi.getUserById/deleteUser both wrap
// their HTTP call in try/catch and return `{ data: { user: null }, error }`
// on any AuthApiError rather than throwing. AuthApiError carries both
// `.status` (HTTP status, 404 for an unknown/already-deleted user) and
// `.code` (GoTrue's stable error-code string; 'user_not_found' is a real,
// documented code in that SDK version's ErrorCode union). Checking both,
// not just `.status`, is defense against a future GoTrue response that sets
// one but not the other.
function isUserNotFoundError(error: { status?: number; code?: string } | null | undefined): boolean {
  if (!error) return false
  return error.status === 404 || error.code === 'user_not_found'
}

// Shared handling for auth.admin.getUserById, used both BEFORE and AFTER
// the delete call. A user counts as "gone" ONLY on a confirmed not-found, or
// a successful call that returns no user. Any other error (timeout, 5xx,
// rate limit, etc.) is NOT evidence of deletion — treating it as "gone"
// would let a transient read error on the final confirmation produce a
// false success response that the caller never retries.
type UserGoneCheck =
  | { outcome: 'gone' }
  | { outcome: 'present' }
  | { outcome: 'error'; message: string }

async function checkUserGone(
  adminClient: ReturnType<typeof createClient>,
  uid: string,
): Promise<UserGoneCheck> {
  const { data, error } = await adminClient.auth.admin.getUserById(uid)
  if (error) {
    if (isUserNotFoundError(error)) return { outcome: 'gone' }
    return { outcome: 'error', message: error.message }
  }
  if (!data?.user) return { outcome: 'gone' }
  return { outcome: 'present' }
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

  // ADMIN client — service role. Used ONLY for the elevated acts below (DB
  // RPC, storage sweep, auth deletion). Never used for the identity check
  // above.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // --- Step 0: storage buckets exist --------------------------------------
  // Review finding F6: moved to the very start, before any deletion work
  // happens, instead of being discovered partway through Step 2 after Step
  // 1's data deletion already ran. Confirmed present at review time: both
  // 'recipe-photos' (public) and 'menu-photos' (private) exist as real
  // buckets in storage.buckets. Still verify on every call rather than
  // assuming — a bucket could be renamed or removed later, and a missing
  // bucket must be a loud, named failure here, not a silent no-op inside the
  // sweep loop.
  const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets()
  if (bucketsError) {
    return failResponse('storage', `could not list storage buckets: ${bucketsError.message}`, bucketsError)
  }
  const bucketNames = new Set((buckets ?? []).map((b) => b.name))
  const missingBuckets = STORAGE_BUCKETS.filter((b) => !bucketNames.has(b))
  if (missingBuckets.length > 0) {
    return failResponse(
      'storage',
      `required storage bucket(s) missing: ${missingBuckets.join(', ')}`,
      { missingBuckets },
    )
  }

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
    return failResponse('data', `account data deletion failed: ${dataError.message}`, dataError)
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
        return failResponse('storage', `storage sweep incomplete for ${bucket}`, { remaining: remaining.length })
      }
      storageResults[bucket] = { removed: paths.length, remaining: remaining.length }
    }
  } catch (err) {
    return failResponse(
      'storage',
      'storage sweep failed',
      err instanceof Error ? err.message : String(err),
    )
  }

  // --- Step 3: auth ---------------------------------------------------------
  // Idempotency: if a prior call already deleted the auth user but crashed
  // before returning (e.g. the response never reached the client), a retry
  // must not treat "already gone" as a failure.
  const beforeCheck = await checkUserGone(adminClient, uid)
  if (beforeCheck.outcome === 'error') {
    return failResponse('auth', `could not verify auth user before deletion: ${beforeCheck.message}`, beforeCheck)
  }

  if (beforeCheck.outcome === 'present') {
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(uid)
    // Review finding F5: a concurrent duplicate request (e.g. a double-tap)
    // can win the race and delete the user first, making THIS call's
    // deleteUser fail with "not found" even though beforeCheck saw them as
    // present moments earlier. That is not a failure — it's the same
    // already-gone outcome this function is designed to treat as success —
    // so fall through to the final confirmation read instead of failing.
    if (deleteAuthError && !isUserNotFoundError(deleteAuthError)) {
      return failResponse('auth', `auth user deletion failed: ${deleteAuthError.message}`, deleteAuthError)
    }
  }

  // Confirm via a fresh read — never trust deleteUser's own success signal
  // alone, same "re-list to confirm" discipline as the storage step above.
  // Uses the SAME gone/present/error handling as the pre-delete check above
  // — an error here must fail the request, not be read as "deleted."
  const afterCheck = await checkUserGone(adminClient, uid)
  if (afterCheck.outcome === 'error') {
    return failResponse('auth', `could not verify auth user after deletion: ${afterCheck.message}`, afterCheck)
  }
  if (afterCheck.outcome === 'present') {
    return failResponse('auth', 'auth user still exists after deletion')
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
