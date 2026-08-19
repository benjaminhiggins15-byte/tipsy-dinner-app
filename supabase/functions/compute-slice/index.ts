import { createClient } from 'npm:@supabase/supabase-js@2.106.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DONT_REPEAT_LOOKBACK = 30
const MIN_CANDIDATES_AFTER_DONT_REPEAT = 8

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function seasonForMonth(month: number): string {
  if (month === 12 || month === 1 || month === 2) return 'winter'
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  return 'fall'
}

function isPlausibleLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const t = new Date(`${value}T00:00:00Z`).getTime()
  return !Number.isNaN(t)
}

// Keyword gate derivation, scoped to sentences carrying Layer 2's own
// severity vocabulary ("hard allergy" / "dietary restriction") — mirrors the
// judgment call made by hand in scripts/prove-slice-selection.mjs, just
// automated. Deliberately does NOT gate on "strong dislike"/"mild dislike" —
// those are leanings, not binding constraints, per the same Layer 2 contract.
function deriveDietaryGates(tasteProfile: string): { column: string; value: boolean }[] {
  const gates: { column: string; value: boolean }[] = []
  if (!tasteProfile) return gates

  const sentences = tasteProfile.split(/(?<=[.!?])\s+/)
  const hardSignal = /(hard allergy|dietary restriction)/i
  const seen = new Set<string>()
  const addGate = (column: string, value: boolean) => {
    if (seen.has(column)) return
    seen.add(column)
    gates.push({ column, value })
  }

  for (const sentence of sentences) {
    if (!hardSignal.test(sentence)) continue
    const s = sentence.toLowerCase()
    if (/\bvegan\b/.test(s)) addGate('is_vegan', true)
    else if (/\bvegetarian\b/.test(s)) addGate('is_vegetarian', true)
    if (/gluten/.test(s)) addGate('is_gluten_free', true)
    if (/\bdairy\b|lactose/.test(s)) addGate('is_dairy_free', true)
    if (/shellfish|shrimp|prawn|lobster|crab/.test(s)) addGate('contains_shellfish', false)
    if (/\bpork\b|\bhalal\b|\bkosher\b|\bpig\b|\bbacon\b|\bham\b/.test(s)) addGate('contains_pork', false)
    if (/\bnuts?\b|peanut/.test(s)) addGate('contains_nuts', false)
  }

  return gates
}

// Same system prompt proven in scripts/prove-slice-selection.mjs — reused
// verbatim. This Edge Function cannot import that browser-facing script (it
// pulls in src/tipsy/data.ts, which assumes import.meta.env/browser globals),
// so the prompt text and parse logic are duplicated here on purpose, not
// re-derived. Any future wording change must be made in both places.
const SELECTION_SYSTEM_PROMPT = `You are selecting a daily set of 3 or 4 dinner recipes for one home cook, chosen from a fixed list of candidate recipes.

You are given:
- TASTE PROFILE — a natural-language interpretation of this cook's flavor leanings, cooking register, and constraints.
- CANDIDATES — a JSON array of recipes, each with an id, title, description, cuisine, effort, and dietary boolean flags.

How to use the taste profile: it is a CENTER OF GRAVITY, not a cage. Lean toward it, but a genuinely excellent dish that sits slightly outside the cook's usual leanings is a welcome surprise, not a violation — do not pick only the four most dead-center-safe options. The one exception is anything the profile names as a firm constraint (dietary restriction, allergy, or a dislike stated with real intensity) — those DO bind and must never be violated, unlike soft leanings.

Aim for genuine VARIETY across your 3-4 picks — a spread of cuisine, protein, and style — so the set reads as a considered little menu, not four versions of the same idea.

Pick exactly 3 or 4 recipes, and ONLY from the candidate ids provided. Never invent an id or a recipe not in the candidate list.

Return STRICT JSON only. No markdown, no code fences, no prose outside the JSON. Exact shape:
{"picks":[{"id":"<pool recipe uuid>","title":"<title>","reason":"<one sentence: why this one, for this cook>"}],"slice_reason":"<2-3 sentences: why this set as a whole suits this cook>"}`

// Same fetch + SSE-drain shape as parseSSEStream (src/tipsy/data.ts) /
// generateTasteProfile / enrichGroceryItems — duplicated here for the same
// import-boundary reason as the prompt above.
async function callAIChatAndDrain(userMessage: string): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt: SELECTION_SYSTEM_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ai-chat error ${response.status}: ${errorText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body from ai-chat')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            fullText += parsed.delta.text
          }
        } catch {
          // Same tolerant behavior as parseSSEStream: skip an unparseable line.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}

type SelectionPick = { id: string; title: string; reason: string }
type ParseResult =
  | { picks: SelectionPick[]; sliceReason: string | null }
  | { error: string }

function parseSelectionResponse(rawText: string, validIds: Set<string>): ParseResult {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    return { error: `unparseable JSON: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  if (!parsed || !Array.isArray(parsed.picks)) {
    return { error: 'response has no picks array' }
  }

  const validPicks: SelectionPick[] = parsed.picks
    .filter((p: any) => p && typeof p.id === 'string' && validIds.has(p.id) && typeof p.title === 'string')
    .slice(0, 4)
    .map((p: any) => ({ id: p.id, title: p.title, reason: typeof p.reason === 'string' ? p.reason : '' }))

  if (validPicks.length < 3) {
    return { error: `only ${validPicks.length} valid picks after filtering (need >= 3)` }
  }

  const sliceReason =
    typeof parsed.slice_reason === 'string' && parsed.slice_reason.trim() ? parsed.slice_reason.trim() : null

  return { picks: validPicks, sliceReason }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // AUTH — identity comes ONLY from the caller's JWT, never the body.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'missing authorization header' }, 401)
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'not authenticated' }, 401)
  }
  const callerId = userData.user.id

  let body: { local_date?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Empty/missing body is tolerated — falls through to the server-UTC fallback below.
  }

  let localDate: string
  let usedServerDateFallback = false
  if (isPlausibleLocalDate(body.local_date)) {
    localDate = body.local_date
  } else {
    localDate = new Date().toISOString().slice(0, 10)
    usedServerDateFallback = true
  }

  // ADMIN client — service role, used for the pool read (deny-all to the
  // app) and the slice table read/write. All authorization already happened
  // above via the caller-scoped client; nothing here trusts caller input for
  // WHO this is, only for WHAT DATE.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // FRESHNESS CHECK — must happen before any pool read or AI call.
  const { data: existingSlice, error: existingError } = await adminClient
    .from('user_recipe_slices')
    .select('*')
    .eq('user_id', callerId)
    .eq('slice_date', localDate)
    .eq('status', 'ready')
    .maybeSingle()

  if (existingError) {
    return jsonResponse({ error: `freshness check failed: ${existingError.message}`, computed: false }, 200)
  }
  if (existingSlice) {
    return jsonResponse({ slice: existingSlice, computed: false }, 200)
  }

  async function fallbackToPriorSliceOrError(reason: string) {
    const { data: priorSlice } = await adminClient
      .from('user_recipe_slices')
      .select('*')
      .eq('user_id', callerId)
      .eq('status', 'ready')
      .order('slice_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (priorSlice) {
      return jsonResponse({ slice: priorSlice, computed: false, fallback: true, reason }, 200)
    }
    return jsonResponse({ error: reason, computed: false }, 200)
  }

  try {
    const { data: profileRow } = await adminClient
      .from('profiles')
      .select('taste_profile')
      .eq('id', callerId)
      .maybeSingle()

    const tasteProfile = profileRow?.taste_profile ?? ''
    const dietaryGates = deriveDietaryGates(tasteProfile)
    const month = Number(localDate.slice(5, 7))
    const season = seasonForMonth(month)

    // STAGE 1 — deterministic filter, no AI. meal_type + soft season gate +
    // hard dietary gates, in one query; don't-repeat is applied in-memory below.
    let stage1Query = adminClient
      .from('suggested_recipe_pool')
      .select(
        'id,title,description,cuisine,effort,season,is_vegetarian,is_vegan,is_gluten_free,is_dairy_free,contains_pork,contains_shellfish,contains_nuts'
      )
      .eq('meal_type', 'dinner')
      .or(`season.is.null,season.eq.${season}`)

    for (const gate of dietaryGates) {
      stage1Query = stage1Query.eq(gate.column, gate.value)
    }

    const { data: stage1Pool, error: stage1Error } = await stage1Query
    if (stage1Error) {
      return await fallbackToPriorSliceOrError(`Stage 1 pool query failed: ${stage1Error.message}`)
    }
    const pool = stage1Pool ?? []

    // DON'T-REPEAT — exclude ids from the last 30 slices, relaxing
    // least-recently-shown-first if that drops the candidate set below 8.
    const { data: recentSlices } = await adminClient
      .from('user_recipe_slices')
      .select('recipe_ids, slice_date')
      .eq('user_id', callerId)
      .order('slice_date', { ascending: false })
      .limit(DONT_REPEAT_LOOKBACK)

    let relaxed = false
    let candidates = pool

    if (recentSlices && recentSlices.length > 0) {
      const idToRecency = new Map<string, number>()
      recentSlices.forEach((s, idx) => {
        const ids: string[] = Array.isArray(s.recipe_ids) ? s.recipe_ids : []
        for (const id of ids) {
          if (!idToRecency.has(id)) idToRecency.set(id, idx)
        }
      })

      // Oldest-first — the order relaxation brings ids back in.
      const oldestFirst = [...idToRecency.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
      const excluded = new Set(idToRecency.keys())
      candidates = pool.filter((r) => !excluded.has(r.id))

      let relaxIdx = 0
      while (candidates.length < MIN_CANDIDATES_AFTER_DONT_REPEAT && relaxIdx < oldestFirst.length) {
        excluded.delete(oldestFirst[relaxIdx])
        relaxIdx += 1
        relaxed = true
        candidates = pool.filter((r) => !excluded.has(r.id))
      }
    }

    if (candidates.length < 3) {
      return await fallbackToPriorSliceOrError(
        `Only ${candidates.length} Stage 1 candidates survived filtering — too few for a slice`
      )
    }

    // STAGE 2 — AI selection. Payload mirrors scripts/prove-slice-selection.mjs
    // exactly: taste_profile + lean candidate fields (no season, no full pool metadata).
    const validIds = new Set(candidates.map((c) => c.id))
    const userMessage = JSON.stringify({
      taste_profile: tasteProfile,
      candidates: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        cuisine: c.cuisine,
        effort: c.effort,
        is_vegetarian: c.is_vegetarian,
        is_vegan: c.is_vegan,
        is_gluten_free: c.is_gluten_free,
        is_dairy_free: c.is_dairy_free,
        contains_pork: c.contains_pork,
        contains_shellfish: c.contains_shellfish,
        contains_nuts: c.contains_nuts,
      })),
    })

    const fullText = await callAIChatAndDrain(userMessage)
    if (!fullText.trim()) {
      return await fallbackToPriorSliceOrError('Empty response from ai-chat selection call')
    }

    const parsed = parseSelectionResponse(fullText, validIds)
    if ('error' in parsed) {
      return await fallbackToPriorSliceOrError(`Stage 2 selection failed: ${parsed.error}`)
    }

    // WRITE — upsert on the (user_id, slice_date) unique constraint.
    const { data: upserted, error: upsertError } = await adminClient
      .from('user_recipe_slices')
      .upsert(
        {
          user_id: callerId,
          slice_date: localDate,
          recipe_ids: parsed.picks.map((p) => p.id),
          selection_reason: parsed.sliceReason,
          status: 'ready',
        },
        { onConflict: 'user_id,slice_date' }
      )
      .select()
      .single()

    if (upsertError) {
      return await fallbackToPriorSliceOrError(`Slice write failed: ${upsertError.message}`)
    }

    return jsonResponse(
      {
        slice: upserted,
        computed: true,
        picks_with_reasons: parsed.picks,
        relaxed,
        used_server_date_fallback: usedServerDateFallback,
      },
      200
    )
  } catch (err) {
    console.error('compute-slice unexpected error:', err)
    return await fallbackToPriorSliceOrError(err instanceof Error ? err.message : 'unknown error')
  }
})
