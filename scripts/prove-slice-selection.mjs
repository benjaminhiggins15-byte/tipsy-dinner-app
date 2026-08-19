// THROWAWAY proof-of-quality diagnostic for the Layer 3 assignment runtime.
// Not wired into the app. Not committed. Reads suggested_recipe_pool via the
// service role (deny-all to the app itself) and profiles.taste_profile, runs a
// real Stage-1 filter + one real Stage-2 ai-chat selection call per user, and
// prints everything so the prompt/output quality can be judged directly.

import { createClient } from "@supabase/supabase-js";
import { parseSSEStream } from "../src/tipsy/data.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in env"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Chosen per instructions: founder's own account (Ben Higgins, Mediterranean/
// Italian comfort-food palate, Food Network inspiration, no hard dietary
// constraints) vs. the most-different real profile available (Brendan
// Higgins: bold international high-protein health-focused palate, Instagram
// inspiration, and a HARD shrimp/shellfish allergy — a genuine constraint to
// prove binds). Ids read live below, not hardcoded blind.
const USERS = [
  {
    label: "User 1 — founder (Ben Higgins)",
    id: "0e81fa42-9261-4869-9d53-6336ddd0f8ee",
    dietaryFilter: null, // no hard constraint named in profile
    dietaryFilterReason:
      "Profile constraints = 'mild dislike of parsley, no dietary restrictions or allergies' — no hard gate; parsley isn't a boolean pool column anyway, and a mild dislike is a leaning, not a binding constraint.",
  },
  {
    label: "User 2 — most-different (Brendan Higgins)",
    id: "f7f88268-554e-4a31-9e1c-2fbf63fc1d0d",
    dietaryFilter: { column: "contains_shellfish", value: false },
    dietaryFilterReason:
      "Profile constraints = 'Hard allergy to shrimp' — shrimp is shellfish, so contains_shellfish = false is applied as a hard Stage-1 gate.",
  },
];

const SELECTION_SYSTEM_PROMPT = `You are selecting a daily set of 3 or 4 dinner recipes for one home cook, chosen from a fixed list of candidate recipes.

You are given:
- TASTE PROFILE — a natural-language interpretation of this cook's flavor leanings, cooking register, and constraints.
- CANDIDATES — a JSON array of recipes, each with an id, title, description, cuisine, effort, and dietary boolean flags.

How to use the taste profile: it is a CENTER OF GRAVITY, not a cage. Lean toward it, but a genuinely excellent dish that sits slightly outside the cook's usual leanings is a welcome surprise, not a violation — do not pick only the four most dead-center-safe options. The one exception is anything the profile names as a firm constraint (dietary restriction, allergy, or a dislike stated with real intensity) — those DO bind and must never be violated, unlike soft leanings.

Aim for genuine VARIETY across your 3-4 picks — a spread of cuisine, protein, and style — so the set reads as a considered little menu, not four versions of the same idea.

Pick exactly 3 or 4 recipes, and ONLY from the candidate ids provided. Never invent an id or a recipe not in the candidate list.

Return STRICT JSON only. No markdown, no code fences, no prose outside the JSON. Exact shape:
{"picks":[{"id":"<pool recipe uuid>","title":"<title>","reason":"<one sentence: why this one, for this cook>"}],"slice_reason":"<2-3 sentences: why this set as a whole suits this cook>"}`;

async function callAIChat(systemPrompt, userMessage) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      systemPrompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ai-chat error ${response.status}: ${errText}`);
  }

  let fullText = "";
  for await (const chunk of parseSSEStream(response)) {
    if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
      fullText += chunk.delta.text;
    }
  }
  return fullText;
}

function parseSelectionResponse(rawText, validIds) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { error: `Could not parse AI response as JSON: ${e.message}`, raw: rawText };
  }

  if (!parsed || !Array.isArray(parsed.picks)) {
    return { error: "Parsed JSON has no 'picks' array", raw: rawText };
  }
  if (parsed.picks.length < 3 || parsed.picks.length > 4) {
    return { error: `Expected 3-4 picks, got ${parsed.picks.length}`, raw: rawText };
  }
  for (const p of parsed.picks) {
    if (!p.id || !validIds.has(p.id)) {
      return { error: `Pick id "${p.id}" is not in the candidate set`, raw: rawText };
    }
  }
  if (typeof parsed.slice_reason !== "string" || !parsed.slice_reason.trim()) {
    return { error: "Missing or empty slice_reason", raw: rawText };
  }

  return { picks: parsed.picks, slice_reason: parsed.slice_reason };
}

const CANDIDATE_SELECT_COLS =
  "id,title,description,cuisine,effort,season,is_vegetarian,is_vegan,is_gluten_free,is_dairy_free,contains_pork,contains_shellfish,contains_nuts";

const results = [];

for (const user of USERS) {
  console.log("\n\n========================================================");
  console.log(user.label);
  console.log("========================================================");

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, taste_profile")
    .eq("id", user.id)
    .single();

  if (profileError || !profileRow?.taste_profile) {
    console.error("FAILED to load taste_profile for", user.label, profileError);
    process.exit(1);
  }

  console.log(`\n--- Full taste_profile (display_name: ${profileRow.display_name}) ---\n`);
  console.log(profileRow.taste_profile);

  // Stage 1: deterministic filter, no AI.
  let query = supabase
    .from("suggested_recipe_pool")
    .select(CANDIDATE_SELECT_COLS)
    .eq("meal_type", "dinner")
    .or("season.is.null,season.eq.summer");

  if (user.dietaryFilter) {
    query = query.eq(user.dietaryFilter.column, user.dietaryFilter.value);
  }

  const { data: candidates, error: candidatesError } = await query;

  if (candidatesError) {
    console.error("Stage 1 query FAILED for", user.label, candidatesError);
    process.exit(1);
  }

  console.log(`\n--- Stage 1 ---`);
  console.log(`Dietary filter applied: ${user.dietaryFilter ? `${user.dietaryFilter.column} = ${user.dietaryFilter.value}` : "none"}`);
  console.log(`Reason: ${user.dietaryFilterReason}`);
  console.log(`Candidate count (meal_type=dinner, season null-or-summer, dietary filter as above): ${candidates.length}`);

  if (candidates.length < 3) {
    console.error("Fewer than 3 candidates survived Stage 1 — cannot proceed to Stage 2 for", user.label);
    process.exit(1);
  }

  const validIds = new Set(candidates.map((c) => c.id));

  const userMessage = JSON.stringify({
    taste_profile: profileRow.taste_profile,
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
  });

  console.log(`\n--- Stage 2: calling ai-chat (payload ~${userMessage.length} chars) ---`);
  const fullText = await callAIChat(SELECTION_SYSTEM_PROMPT, userMessage);

  if (!fullText.trim()) {
    console.error("EMPTY response from ai-chat for", user.label);
    process.exit(1);
  }

  const parsed = parseSelectionResponse(fullText, validIds);
  if (parsed.error) {
    console.error(`PARSE/VALIDATION FAILURE for ${user.label}: ${parsed.error}`);
    console.error("Raw response:\n", parsed.raw);
    process.exit(1);
  }

  console.log(`\n--- Picks (${parsed.picks.length}) ---`);
  for (const p of parsed.picks) {
    console.log(`  • ${p.title}`);
    console.log(`    reason: ${p.reason}`);
  }
  console.log(`\nSlice reason: ${parsed.slice_reason}`);

  results.push({ user, picks: parsed.picks, slice_reason: parsed.slice_reason, candidateCount: candidates.length });
}

console.log("\n\n========================================================");
console.log("SIDE-BY-SIDE");
console.log("========================================================");

const maxLen = Math.max(...results.map((r) => r.picks.length));
const colWidth = 46;
const pad = (s, w) => (s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w));

console.log(pad(results[0].user.label, colWidth) + " | " + results[1].user.label);
console.log("-".repeat(colWidth) + "-+-" + "-".repeat(colWidth));
for (let i = 0; i < maxLen; i++) {
  const left = results[0].picks[i]?.title ?? "";
  const right = results[1].picks[i]?.title ?? "";
  console.log(pad(left, colWidth) + " | " + right);
}

const titles0 = new Set(results[0].picks.map((p) => p.title.toLowerCase()));
const titles1 = new Set(results[1].picks.map((p) => p.title.toLowerCase()));
const overlap = [...titles0].filter((t) => titles1.has(t));

console.log(`\nOverlap in exact titles: ${overlap.length} (${overlap.join(", ") || "none"})`);
console.log(
  overlap.length === 0
    ? "VERDICT: the two slices are fully distinct picks — no shared titles."
    : `VERDICT: ${overlap.length} shared title(s) between the two slices.`
);
