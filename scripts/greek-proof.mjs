// Single-cell proof for the suggested-recipes pool pipeline: greek:breakfast.
// Calls the real ai-chat edge function with the real buildSystemPrompt(), parses
// with the real parseRecipeFromAIResponse(), tags via a message-appended
// instruction (not baked into the system prompt), and writes 3 rows to
// suggested_recipe_pool via the service role. Run once, reports to stdout.

import { createClient } from "@supabase/supabase-js";
import { buildSystemPrompt, parseRecipeFromAIResponse } from "../src/tipsy/App.tsx";
import { parseSSEStream } from "../src/tipsy/data.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in env"
  );
}

const BATCH_ID = "greek-proof-01";
const MATRIX_CELL = "greek:breakfast";
const CUISINE = "greek";
const MEAL_TYPE = "breakfast";

const TAG_INSTRUCTION = `

After the recipe block, also output a separate tags block in exactly this format, with no other text before or after it:
<tags>
<season>spring|summer|fall|winter|any</season>
<effort>quick|moderate|project</effort>
<holiday>none|<holiday name></holiday>
<is_vegetarian>true|false</is_vegetarian>
<is_vegan>true|false</is_vegan>
<is_gluten_free>true|false</is_gluten_free>
<is_dairy_free>true|false</is_dairy_free>
<contains_pork>true|false</contains_pork>
<contains_shellfish>true|false</contains_shellfish>
<contains_nuts>true|false</contains_nuts>
</tags>
Answer each boolean strictly based on this specific recipe's actual ingredients as written. For season, use "any" if the dish isn't tied to a particular season. For holiday, use "none" if it isn't tied to a holiday.`;

function parseTags(fullText) {
  const tagsMatch = fullText.match(/<tags>([\s\S]*?)<\/tags>/);
  if (!tagsMatch) return null;
  const block = tagsMatch[1];

  const getField = (name) => {
    const m = block.match(new RegExp(`<${name}>(.*?)<\\/${name}>`));
    return m ? m[1].trim() : null;
  };
  const getBool = (name) => {
    const v = getField(name);
    if (v === null) return null;
    if (v.toLowerCase() === "true") return true;
    if (v.toLowerCase() === "false") return false;
    return null;
  };

  const season = getField("season");
  const holiday = getField("holiday");

  return {
    season: !season || season.toLowerCase() === "any" ? null : season,
    effort: getField("effort"),
    holiday: !holiday || holiday.toLowerCase() === "none" ? null : holiday,
    is_vegetarian: getBool("is_vegetarian"),
    is_vegan: getBool("is_vegan"),
    is_gluten_free: getBool("is_gluten_free"),
    is_dairy_free: getBool("is_dairy_free"),
    contains_pork: getBool("contains_pork"),
    contains_shellfish: getBool("contains_shellfish"),
    contains_nuts: getBool("contains_nuts"),
  };
}

async function callAIChat(userMessage) {
  const systemPrompt = buildSystemPrompt(
    { palate: "", inspiration: "", constraints: "" },
    null
  );

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

  const stream = parseSSEStream(response);
  let fullText = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
      fullText += chunk.delta.text;
    }
  }
  return fullText;
}

const previousTitles = [];
const results = [];

for (let i = 0; i < 3; i++) {
  const distinctClause = previousTitles.length
    ? ` It must be a genuinely different dish from: ${previousTitles.join(", ")}.`
    : "";
  const userMessage =
    `Pick one specific, genuinely traditional Greek breakfast dish yourself` +
    ` — don't ask me anything, just choose one and commit to it — then write` +
    ` me the complete recipe for it right now.${distinctClause}` +
    TAG_INSTRUCTION;

  console.log(`\n=== Calling ai-chat for recipe ${i + 1}/3 ===`);
  const fullText = await callAIChat(userMessage);

  const parsedRecipe = parseRecipeFromAIResponse(fullText);
  if (!parsedRecipe) {
    console.error("PARSE FAILURE: parseRecipeFromAIResponse returned null. Raw response:\n");
    console.error(fullText);
    process.exit(1);
  }

  const tags = parseTags(fullText);
  const requiredBoolFields = [
    "is_vegetarian",
    "is_vegan",
    "is_gluten_free",
    "is_dairy_free",
    "contains_pork",
    "contains_shellfish",
    "contains_nuts",
  ];
  const tagsIncomplete =
    !tags || !tags.effort || requiredBoolFields.some((f) => tags[f] === null);
  if (tagsIncomplete) {
    console.error("TAG PARSE FAILURE. Parsed so far:", tags);
    console.error("Raw response:\n");
    console.error(fullText);
    process.exit(1);
  }

  previousTitles.push(parsedRecipe.title);
  results.push({ parsedRecipe, tags });
  console.log(`Got: "${parsedRecipe.title}"`);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const rows = results.map(({ parsedRecipe, tags }) => ({
  batch_id: BATCH_ID,
  matrix_cell: MATRIX_CELL,
  title: parsedRecipe.title,
  description: parsedRecipe.description,
  ingredients: parsedRecipe.ingredients,
  steps: parsedRecipe.steps,
  cook_time: null,
  serves: null,
  cuisine: CUISINE,
  meal_type: MEAL_TYPE,
  season: tags.season,
  effort: tags.effort,
  holiday: tags.holiday,
  is_vegetarian: tags.is_vegetarian,
  is_vegan: tags.is_vegan,
  is_gluten_free: tags.is_gluten_free,
  is_dairy_free: tags.is_dairy_free,
  contains_pork: tags.contains_pork,
  contains_shellfish: tags.contains_shellfish,
  contains_nuts: tags.contains_nuts,
  dietary_check_status: "unchecked",
  vetting_status: "pending",
}));

console.log("\n=== Inserting 3 rows into suggested_recipe_pool ===");
const { data: inserted, error: insertError } = await supabase
  .from("suggested_recipe_pool")
  .insert(rows)
  .select();

if (insertError) {
  console.error("INSERT FAILED:", insertError);
  process.exit(1);
}
console.log(`Inserted ${inserted.length} rows.`);

for (const row of inserted) {
  console.log("\n\n========================================");
  console.log("TITLE:", row.title);
  console.log("DESCRIPTION:", row.description);
  console.log("\nINGREDIENTS:");
  for (const ing of row.ingredients) console.log(`  - ${ing.name}: ${ing.qty}`);
  console.log("\nSTEPS:");
  row.steps.forEach((s, idx) => {
    console.log(`  ${idx + 1}. ${s.title ? s.title + " — " : ""}${s.instruction}`);
  });
  console.log("\nTAGS:", {
    cuisine: row.cuisine,
    meal_type: row.meal_type,
    season: row.season,
    effort: row.effort,
    holiday: row.holiday,
    is_vegetarian: row.is_vegetarian,
    is_vegan: row.is_vegan,
    is_gluten_free: row.is_gluten_free,
    is_dairy_free: row.is_dairy_free,
    contains_pork: row.contains_pork,
    contains_shellfish: row.contains_shellfish,
    contains_nuts: row.contains_nuts,
  });
  console.log(
    "id:",
    row.id,
    "batch_id:",
    row.batch_id,
    "matrix_cell:",
    row.matrix_cell,
    "vetting_status:",
    row.vetting_status,
    "dietary_check_status:",
    row.dietary_check_status
  );
}

console.log("\n\n=== Selecting rows back from suggested_recipe_pool (batch_id = 'greek-proof-01') ===");
const { data: verifyRows, error: verifyError } = await supabase
  .from("suggested_recipe_pool")
  .select("id, title, cuisine, meal_type, matrix_cell, batch_id, vetting_status, dietary_check_status, created_at")
  .eq("batch_id", BATCH_ID);

if (verifyError) {
  console.error("VERIFY SELECT FAILED:", verifyError);
  process.exit(1);
}
console.log(verifyRows);
