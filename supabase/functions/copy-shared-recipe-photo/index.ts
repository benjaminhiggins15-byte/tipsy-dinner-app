// Modeled directly on supabase/functions/copy-received-recipe-photo/index.ts
// — same "authorize with the caller, act with admin" pattern. Differences
// from that function: the source lives under the SHARER's folder as
// {sharerUserId}/share-{token}.jpg (the public-share-mint path in data.ts),
// not a recipient-visible recipe_sends.photo_url column, so the source path
// is derived server-side from recipe_shares via the service-role client —
// never from client input, and never from a client-supplied path fragment.
//
// Three-actor sequence (same shape as copy-received-recipe-photo): client
// saveRecipe() -> SQL finish_shared_recipe_save() -> this function, in that
// fixed order. By the time this runs, shared_recipe_discoveries should
// already be 'saved' for (caller, token, recipe_id) — this function checks
// that status explicitly rather than accepting any row, so it can't be
// invoked ahead of the stamp step.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: { share_token?: string; recipe_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const shareToken = body.share_token
  const recipeId = body.recipe_id
  if (typeof shareToken !== 'string' || typeof recipeId !== 'string') {
    return jsonResponse({ error: 'share_token and recipe_id are required' }, 400)
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

  // Ownership recheck: the caller must own the destination recipe.
  const { data: recipeRow, error: recipeError } = await callerClient
    .from('recipes')
    .select('id, user_id, photo_version')
    .eq('id', recipeId)
    .maybeSingle()

  if (recipeError || !recipeRow || recipeRow.user_id !== callerId) {
    return jsonResponse({ error: 'recipe not found or not owned by caller' }, 403)
  }

  // The discovery row is the only authority linking this (caller, token)
  // pair to THIS recipe_id — proves the caller actually went through
  // finish_shared_recipe_save for this exact token, not an arbitrary one
  // borrowed from elsewhere. status='saved' additionally proves the stamp
  // step has already run, enforcing call order at this layer too, not just
  // by client discipline.
  const { data: discoveryRow, error: discoveryError } = await callerClient
    .from('shared_recipe_discoveries')
    .select('user_id, share_token, recipe_id, status')
    .eq('user_id', callerId)
    .eq('share_token', shareToken)
    .eq('recipe_id', recipeId)
    .eq('status', 'saved')
    .maybeSingle()

  if (discoveryError || !discoveryRow) {
    return jsonResponse({ error: 'no matching saved discovery for this share_token/recipe_id' }, 403)
  }

  // ADMIN client — service role. Needed because the source photo lives
  // under the SHARER's folder, which the caller has no read access to.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Source path is derived ENTIRELY server-side from the token via
  // recipe_shares — never from client input. Mirrors the
  // {userId}/share-{token}.jpg convention from the share-mint path
  // (data.ts, ~line 1720).
  const { data: shareRow, error: shareError } = await adminClient
    .from('recipe_shares')
    .select('user_id, recipe')
    .eq('share_token', shareToken)
    .maybeSingle()

  if (shareError || !shareRow) {
    return jsonResponse({ error: 'share not found' }, 404)
  }

  const snapshot = shareRow.recipe as { photoUrl?: string | null }
  if (!snapshot?.photoUrl) {
    // Legitimate no-op: this share never had a photo.
    return jsonResponse({ copied: false, reason: 'share has no photo' }, 200)
  }

  const sourcePath = `${shareRow.user_id}/share-${shareToken}.jpg`
  // Destination is COMPUTED from verified identity — never from raw input.
  const destinationPath = `${callerId}/${recipeId}.jpg`

  let copyResult = await adminClient.storage.from(BUCKET).copy(sourcePath, destinationPath)
  if (copyResult.error) {
    // Retry-safe: a prior attempt may have left an object at the
    // destination. Clear it and retry once so a repeat call can't get stuck
    // behind a "destination exists" condition either way.
    await adminClient.storage.from(BUCKET).remove([destinationPath])
    copyResult = await adminClient.storage.from(BUCKET).copy(sourcePath, destinationPath)
  }
  if (copyResult.error) {
    return jsonResponse({ error: 'photo copy failed', details: copyResult.error.message }, 500)
  }

  const { data: publicUrlData } = adminClient.storage.from(BUCKET).getPublicUrl(destinationPath)

  // photo_version: fresh-read-then-increment, same convention as
  // copy-received-recipe-photo and uploadRecipePhoto in data.ts — never a
  // render-time value like Date.now().
  const nextVersion = (recipeRow.photo_version ?? 0) + 1

  const { error: patchError } = await adminClient
    .from('recipes')
    .update({ photo_url: publicUrlData.publicUrl, photo_version: nextVersion })
    .eq('id', recipeId)

  if (patchError) {
    return jsonResponse({ error: 'photo copied but photo_url patch failed', details: patchError.message }, 500)
  }

  return jsonResponse({ copied: true, photo_url: publicUrlData.publicUrl, photo_version: nextVersion }, 200)
})
