// One-off backfill: generates profiles.taste_profile for existing rows that
// predate the feature. Same shape as scripts/greek-proof.mjs / matrix-pipeline.mjs
// (service-role client, env-var config, --dry-run default / explicit --live flag).
//
// Only ever touches rows where taste_profile IS NULL, and only ever writes the
// taste_profile column. Never reads or writes palate/inspiration/constraints.
// Idempotent: safe to re-run — it will simply pick up any rows that failed or
// were never reached last time.
//
// The system prompt below is copied VERBATIM from TASTE_PROFILE_SYSTEM_PROMPT_TEMPLATE
// in src/tipsy/data.ts (that constant isn't exported, so it's replicated here
// rather than modifying app code to export it — per the same content, word for word).

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

const LIVE = process.argv.includes("--live");

const TASTE_PROFILE_SYSTEM_PROMPT_TEMPLATE = (palate, inspiration, constraints) => `You are interpreting a home cook's onboarding answers into a "taste profile" — a short natural-language description of their cooking tastes.

This profile is NOT read by the user. It is read by another AI system that uses it to help personalize recipe suggestions and other features. Write for that reader: clear, confident, and directly usable. Do not hedge with phrases like "may" or "possibly" or "it's unclear." Instead, let the STRENGTH of your wording match the STRENGTH of the signal in their answers — state strong signals firmly, and frame weak or thin signals as loose leanings rather than facts.

How this profile is meant to be used (state this understanding in your framing): the taste and flavor leanings below are a CENTER OF GRAVITY, not a boundary — something to lean toward, not a rule that forbids everything else. A well-chosen dish outside these leanings can be a welcome surprise; the goal is personalization, never restriction. The ONE exception is the constraints section: dietary restrictions, allergies, and dislikes are binding and must always be respected.

You are given three answers:
- PALATE — the cuisines, flavors, and techniques that define their cooking.
- INSPIRATION — who or what inspires how they cook.
- NO-GOS — dislikes, restrictions, and allergies.

Write a taste profile as a few short prose movements (no bullet points, no scores, no numeric ratings, no markdown formatting — plain text only). Cover, in flowing prose:

1. Their palate and flavor leanings — the cuisines and sensory qualities they gravitate toward, including any tension or nuance worth preserving (e.g. wanting food both bright and comforting). Describe QUALITIES and characteristics, not specific dishes. Capture the "why" or the feel where the answer supports it.

2. Their inspiration and cooking register — what their inspiration says about the LEVEL and STYLE of food they aspire to (approachable vs. fine-dining, familiar vs. adventurous, etc). If this answer is thin, state it as a soft lean, not a strong fact — do not inflate two words into a detailed philosophy.

3. Their constraints — ALWAYS include a clear, explicitly labeled statement of dietary restrictions, allergies, and dislikes, and ALWAYS name the SEVERITY of each in plain words the downstream system can act on: "hard allergy," "dietary restriction," "strong dislike," or "mild dislike." If there are no restrictions or allergies, say so explicitly (e.g. "No dietary restrictions or allergies.").

   Judge severity from the INTENSITY OF THE USER'S OWN WORDS, not from the mere fact that they named something. If they used no intensity language — just naming an item plainly (e.g. "parsley") — default to the MILDEST accurate reading ("mild dislike"). Reserve "strong dislike" for when the user actually signals intensity (words like "hate," "can't stand," "never," "really don't like"). Reserve "hard allergy" / "dietary restriction" for explicit allergies or diets (e.g. "allergic to shellfish," "vegetarian," "no pork"). Never escalate severity beyond what the words support. Never omit this constraint statement, even if the answer is empty.

Rules:
- Read intent, not spelling. If an answer contains an obvious typo (e.g. "parsely"), interpret the intended meaning silently without correcting or commenting on it.
- Do NOT invent preferences, cuisines, or constraints that are not supported by the answers. In particular, do NOT invent specific example dishes, recipes, or menus — describe flavor qualities and characteristics instead. A thin answer should produce a thin, honest interpretation — not a fabricated rich one.
- Do NOT restate the questions or quote the raw answers back. Interpret them.
- Keep it focused and readable — a clean interpretation another system can reason against, not a rambling essay. A few tight paragraphs at most. End when the interpretation is complete; do NOT add a closing flourish, epigram, or lifestyle summary.

PALATE: ${palate}
INSPIRATION: ${inspiration}
NO-GOS: ${constraints}`;

async function callAIChat(systemPrompt) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Generate the taste profile now." }],
      systemPrompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Edge Function error: ${errorText}`);
  }

  let fullText = "";
  for await (const chunk of parseSSEStream(response)) {
    if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
      fullText += chunk.delta.text;
    }
  }

  if (!fullText.trim()) throw new Error("Empty response from taste profile generation call");
  return fullText.trim();
}

async function main() {
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error: selectError } = await serviceClient
    .from("profiles")
    .select("id, palate, inspiration, constraints")
    .is("taste_profile", null);

  if (selectError) throw selectError;

  console.log(`Found ${rows.length} row(s) with taste_profile IS NULL.`);
  console.log(LIVE ? "Mode: LIVE (will call ai-chat and write rows)\n" : "Mode: DRY RUN (no ai-chat calls, no writes)\n");

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const palate = (row.palate || "").trim();
    const inspiration = (row.inspiration || "").trim();
    const constraints = (row.constraints || "").trim();

    if (!palate && !inspiration && !constraints) {
      console.log(`${row.id}  action=skipped-no-answers`);
      skipped += 1;
      continue;
    }

    if (!LIVE) {
      console.log(`${row.id}  action=would-generate (dry run)`);
      continue;
    }

    try {
      const systemPrompt = TASTE_PROFILE_SYSTEM_PROMPT_TEMPLATE(palate, inspiration, constraints);
      const profileText = await callAIChat(systemPrompt);

      const { error: updateError } = await serviceClient
        .from("profiles")
        .update({ taste_profile: profileText })
        .eq("id", row.id)
        .is("taste_profile", null);

      if (updateError) throw updateError;

      const preview = profileText.slice(0, 100).replace(/\n/g, " ");
      console.log(`${row.id}  action=generated  preview="${preview}${profileText.length > 100 ? "…" : ""}"`);
      generated += 1;
    } catch (err) {
      console.error(`${row.id}  action=failed  error=${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log(`\nSummary: ${generated} generated, ${skipped} skipped, ${failed} failed (of ${rows.length} candidate rows).`);
}

main().catch((err) => {
  console.error("Backfill script crashed:", err);
  process.exit(1);
});
