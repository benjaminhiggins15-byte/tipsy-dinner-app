import { createClient } from 'npm:@supabase/supabase-js@2.106.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'recipe-photos'

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// recipe_sends.photo_url is trigger-immutable once set (Build 2 guarantee) —
// it holds the exact send-{token}.jpg path the sender's own client uploaded.
// Parsing it is the only reliable way to the source key; token is unrelated
// to send_id and isn't reconstructable from identifiers alone.
function extractObjectPath(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return publicUrl.slice(idx + marker.length)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: { send_id?: string; recipe_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const sendId = body.send_id
  const recipeId = body.recipe_id
  if (typeof sendId !== 'string' || typeof recipeId !== 'string') {
    return jsonResponse({ error: 'send_id and recipe_id are required' }, 400)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization header' }, 401)
  }

  // CALLER client — RLS-scoped to the real caller via the forwarded JWT.
  // Every authorization decision below runs on this client. Never on admin.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'not authenticated' }, 401)
  }
  const callerId = userData.user.id

  const { data: sendRow, error: sendError } = await callerClient
    .from('recipe_sends')
    .select('sender_id, recipient_id, status, saved_recipe_id, photo_url')
    .eq('id', sendId)
    .maybeSingle()

  if (sendError || !sendRow) {
    return jsonResponse({ error: 'send not found or not accessible' }, 404)
  }
  if (sendRow.recipient_id !== callerId) {
    return jsonResponse({ error: 'caller is not the recipient of this send' }, 403)
  }
  if (sendRow.status !== 'saved') {
    return jsonResponse({ error: `send is not saved (status=${sendRow.status})` }, 403)
  }
  if (sendRow.saved_recipe_id !== recipeId) {
    return jsonResponse({ error: "recipe_id does not match this send's saved_recipe_id" }, 403)
  }

  // Independent ownership recheck (defense in depth beyond the Gate 1
  // trigger's own ownership guarantee on saved_recipe_id).
  const { data: recipeRow, error: recipeError } = await callerClient
    .from('recipes')
    .select('id, user_id')
    .eq('id', recipeId)
    .maybeSingle()

  if (recipeError || !recipeRow || recipeRow.user_id !== callerId) {
    return jsonResponse({ error: 'recipe not found or not owned by caller' }, 403)
  }

  // Legitimate no-op: this send never had a photo.
  if (!sendRow.photo_url) {
    return jsonResponse({ copied: false, reason: 'send has no photo' }, 200)
  }

  const sourcePath = extractObjectPath(sendRow.photo_url)
  if (!sourcePath) {
    return jsonResponse({ error: 'could not parse source photo path' }, 500)
  }

  // Destination is COMPUTED from verified identity — never from raw input.
  const destinationPath = `${callerId}/${recipeId}.jpg`

  // ADMIN client — service role. Used ONLY for the two elevated acts below.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let copyResult = await adminClient.storage.from(BUCKET).copy(sourcePath, destinationPath)
  if (copyResult.error) {
    // Retry-safe: a prior attempt may have left an object at the
    // destination. Clear it and retry once so a repeat call can't get
    // stuck behind a "destination exists" condition either way.
    await adminClient.storage.from(BUCKET).remove([destinationPath])
    copyResult = await adminClient.storage.from(BUCKET).copy(sourcePath, destinationPath)
  }
  if (copyResult.error) {
    return jsonResponse({ error: 'photo copy failed', details: copyResult.error.message }, 500)
  }

  const { data: publicUrlData } = adminClient.storage.from(BUCKET).getPublicUrl(destinationPath)

  // photo_version: fresh-read-then-increment, same convention as
  // uploadRecipePhoto in data.ts — never a render-time value.
  const { data: currentRecipe } = await adminClient
    .from('recipes')
    .select('photo_version')
    .eq('id', recipeId)
    .single()
  const nextVersion = (currentRecipe?.photo_version ?? 0) + 1

  const { error: patchError } = await adminClient
    .from('recipes')
    .update({ photo_url: publicUrlData.publicUrl, photo_version: nextVersion })
    .eq('id', recipeId)

  if (patchError) {
    return jsonResponse({ error: 'photo copied but photo_url patch failed', details: patchError.message }, 500)
  }

  return jsonResponse({ copied: true, photo_url: publicUrlData.publicUrl, photo_version: nextVersion }, 200)
})
