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

// ---------------------------------------------------------------------------
// TENTPOLE OCCASION WINDOW — COPIED from src/tipsy/chips.ts (the
// ChipTiming fixedHoliday/floatingHoliday shapes, isInLeadInWindow, and the 5
// tentpole timing constants, with their exact date/lead-in values). Single
// source of truth lives there. If you update floating-holiday dates
// (Thanksgiving/Super Bowl) here, update chips.ts too, and vice versa.
// Floating dates expire after 2027.
//
// Deliberately narrower than chips.ts's full ChipTiming union: the 5
// tentpoles only ever use "fixedHoliday"/"floatingHoliday", so "seasonal"/
// "recurringWeekly"/"oneOff" are not copied. Deliberately re-implemented on
// UTC epoch-day integer math rather than chips.ts's local-timezone `Date`
// objects — Deno has no meaningful "user local timezone" the way a browser
// does, so this operates purely on the already-resolved `localDate` calendar
// string, not wall-clock time. Same fixedHoliday limitation as chips.ts,
// inherited on purpose (not fixed here): only checks the holiday's date in
// `localDate`'s own year, so a lead-in window that would wrap into the prior
// December is not handled — none of these 5 tentpoles' lead-in windows do
// that (all comfortably fit inside one calendar month), so it's a non-issue
// today, same as it is in chips.ts.
// ---------------------------------------------------------------------------

type FixedHolidayTiming = { kind: 'fixedHoliday'; monthDay: string; leadInDays: number }
type FloatingHolidayTiming = { kind: 'floatingHoliday'; dates: string[]; leadInDays: number }
type TentpoleTiming = FixedHolidayTiming | FloatingHolidayTiming

const TENTPOLE_TIMINGS: Record<string, TentpoleTiming> = {
  christmas: { kind: 'fixedHoliday', monthDay: '12-25', leadInDays: 10 },
  'thanksgiving-week': { kind: 'floatingHoliday', dates: ['2026-11-26', '2027-11-25'], leadInDays: 18 },
  'super-bowl': { kind: 'floatingHoliday', dates: ['2026-02-08', '2027-02-14'], leadInDays: 7 },
  'fourth-of-july': { kind: 'fixedHoliday', monthDay: '07-04', leadInDays: 7 },
  valentines: { kind: 'fixedHoliday', monthDay: '02-14', leadInDays: 6 },
}

function dateStringToEpochDay(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function monthDayToEpochDayInYear(monthDay: string, year: number): number {
  const [month, day] = monthDay.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

// Mirrors chips.ts's isInLeadInWindow exactly: active if
// (target - leadInDays) <= today <= target, in whole calendar days.
function isInLeadInWindowEpoch(todayEpochDay: number, targetEpochDay: number, leadInDays: number): boolean {
  return todayEpochDay >= targetEpochDay - leadInDays && todayEpochDay <= targetEpochDay
}

// Given the request's already-resolved "YYYY-MM-DD" localDate, returns the
// active tentpole occasion slug (one of the 5 keys above) or null. Mirrors
// chips.ts's isChipActive for fixedHoliday/floatingHoliday only.
function activeTentpoleOccasion(localDate: string): string | null {
  const todayEpochDay = dateStringToEpochDay(localDate)
  const todayYear = Number(localDate.slice(0, 4))

  for (const [slug, timing] of Object.entries(TENTPOLE_TIMINGS)) {
    if (timing.kind === 'fixedHoliday') {
      const targetEpochDay = monthDayToEpochDayInYear(timing.monthDay, todayYear)
      if (isInLeadInWindowEpoch(todayEpochDay, targetEpochDay, timing.leadInDays)) {
        return slug
      }
    } else {
      for (const dateStr of timing.dates) {
        const targetEpochDay = dateStringToEpochDay(dateStr)
        if (isInLeadInWindowEpoch(todayEpochDay, targetEpochDay, timing.leadInDays)) {
          return slug
        }
      }
    }
  }
  return null
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

    // Hoisted out of the `if` below (was block-scoped) so the OCCASION
    // GUARANTEE's unseen-check can read it after this block — it stays the
    // UNRELAXED seen-set (every id from the last 30 slices) even though
    // `excluded` below gets relaxed for the normal shelf's 8-candidate floor.
    const idToRecency = new Map<string, number>()

    if (recentSlices && recentSlices.length > 0) {
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

    // ---------------------------------------------------------------------
    // OCCASION GUARANTEE — near a tentpole holiday window, try to reserve one
    // extra seat on the shelf for an occasion-matching recipe. Deliberately
    // NOT gated on meal_type='dinner' (an occasion seat may be any meal
    // type — e.g. a Thanksgiving side or a Super Bowl snack) and NOT
    // season-gated (the occasion itself already implies the timing, so a
    // redundant season filter would only risk dropping valid occasion rows
    // for no benefit). Reuses `dietaryGates` verbatim — the same hard
    // constraints that bind the normal shelf bind this seat too.
    //
    // FAIL SILENT BY DESIGN: this entire block is wrapped in its own
    // try/catch that only logs. It must NEVER call
    // fallbackToPriorSliceOrError and must NEVER throw out to the outer
    // try/catch — an occasion-guarantee failure (query error, no active
    // occasion, no unseen row, none dietary-safe) degrades to "no bonus
    // seat," not a degraded/stale/broken shelf. The normal shelf computed
    // above (and everything after this block) is completely unaffected by
    // anything that happens in here.
    // ---------------------------------------------------------------------
    let occasionPick: {
      id: string
      title: string
      description: string | null
      cuisine: string | null
      effort: string | null
      occasionSlug: string
    } | null = null

    try {
      const activeSlug = activeTentpoleOccasion(localDate)
      if (activeSlug) {
        let occasionQuery = adminClient
          .from('suggested_recipe_pool')
          .select(
            'id,title,description,cuisine,effort,is_vegetarian,is_vegan,is_gluten_free,is_dairy_free,contains_pork,contains_shellfish,contains_nuts'
          )
          .eq('occasion', activeSlug)

        for (const gate of dietaryGates) {
          occasionQuery = occasionQuery.eq(gate.column, gate.value)
        }

        const { data: occasionRows, error: occasionError } = await occasionQuery
        if (occasionError) {
          console.error('occasion guarantee: query failed, skipping bonus seat:', occasionError.message)
        } else {
          // UNSEEN CHECK — the unrelaxed idToRecency set, not the relaxed
          // `excluded` set: don't-repeat wins over the occasion guarantee,
          // full stop, with no floor-driven relaxation for this seat.
          const unseen = (occasionRows ?? []).filter((r) => !idToRecency.has(r.id))
          if (unseen.length > 0) {
            const chosen = unseen[0]
            occasionPick = {
              id: chosen.id,
              title: chosen.title,
              description: chosen.description ?? null,
              cuisine: chosen.cuisine ?? null,
              effort: chosen.effort ?? null,
              occasionSlug: activeSlug,
            }
          }
        }
      }
    } catch (occasionErr) {
      console.error(
        'occasion guarantee: unexpected error, skipping bonus seat:',
        occasionErr instanceof Error ? occasionErr.message : occasionErr
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

    // Splice the occasion guarantee in AFTER Stage 2 has already succeeded on
    // its own ("≥3 valid picks or fallback" already happened above,
    // untouched by anything here). ADD a 5th seat rather than replacing one
    // of the AI's picks — per CLAUDE.md, `user_recipe_slices` has "no shelf
    // UI yet," so there is no live consumer assuming a fixed 3-4 card count;
    // growing to 5 on tentpole days carries no known UI risk today, and
    // replacing a pick would silently discard a pick the AI already
    // justified for this cook. Guard against a duplicate: if the AI
    // independently already picked the same recipe, don't add it twice.
    const finalPicks =
      occasionPick && !parsed.picks.some((p) => p.id === occasionPick!.id)
        ? [
            ...parsed.picks,
            {
              id: occasionPick.id,
              title: occasionPick.title,
              reason: `A ${occasionPick.occasionSlug} pick, just for the occasion.`,
            },
          ]
        : parsed.picks

    // Denormalized per-pick display fields for the future suggestions
    // carousel — additive only, does not change recipe_ids or any selection
    // logic above. candidates is already in scope from Stage 1, so this is a
    // lookup by id, not a new query. The occasion pick isn't in `candidates`
    // (it came from a separate query), so it's special-cased by hand from
    // `occasionPick` itself rather than through `candidateById`.
    const candidateById = new Map(candidates.map((c) => [c.id, c]))
    const pickDetails = finalPicks.map((p) => {
      if (occasionPick && p.id === occasionPick.id) {
        return {
          id: p.id,
          title: p.title,
          cuisine: occasionPick.cuisine,
          effort: occasionPick.effort,
          description: occasionPick.description,
          reason: p.reason,
        }
      }
      const candidate = candidateById.get(p.id)
      return {
        id: p.id,
        title: p.title,
        cuisine: candidate?.cuisine ?? null,
        effort: candidate?.effort ?? null,
        description: candidate?.description ?? null,
        reason: p.reason,
      }
    })

    // WRITE — upsert on the (user_id, slice_date) unique constraint.
    const { data: upserted, error: upsertError } = await adminClient
      .from('user_recipe_slices')
      .upsert(
        {
          user_id: callerId,
          slice_date: localDate,
          recipe_ids: finalPicks.map((p) => p.id),
          selection_reason: parsed.sliceReason,
          status: 'ready',
          pick_details: pickDetails,
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
        picks_with_reasons: finalPicks,
        occasion_bonus: occasionPick
          ? { id: occasionPick.id, title: occasionPick.title, occasion: occasionPick.occasionSlug }
          : null,
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
