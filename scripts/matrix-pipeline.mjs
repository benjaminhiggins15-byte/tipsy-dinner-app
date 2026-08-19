// Re-runnable, additive matrix generation pipeline for suggested_recipe_pool.
//
// Default mode (no flag, or --dry-run): prints the cell-by-cell plan and a
// cost estimate, makes ZERO ai-chat calls, writes ZERO rows, then exits.
// Real generation only happens with the explicit --live flag.
//
// Reuses the exact building blocks proven in scripts/greek-proof.mjs:
// buildSystemPrompt() + ai-chat (SSE consumed in-script) for generation,
// parseRecipeFromAIResponse() for parsing, the same message-appended tagging
// instruction (verbatim, not reworded), and script-stamped cuisine/meal_type.

import { createClient } from "@supabase/supabase-js";
import { buildSystemPrompt, parseRecipeFromAIResponse, recipeToXML } from "../src/tipsy/App.tsx";
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
const SLICE = process.argv.includes("--slice");
const BATCH_ID = "batch-01"; // real generation rows this run; next real run uses batch-02, etc.

// The curated ~50-recipe "spread slice" — a second proof before the full
// batch. Chosen to span all three tiers and satisfy the stated minimums
// (>=2 Tier-3 snack/dessert, >=1 Tier-3 breakfast, >=1 cell per tier).
// Only used when --slice is passed; the full-matrix CELLS list above is
// untouched and reusable as-is for the eventual full run.
const SLICE_CELLS = [
  // Tier 1
  "italian:dinner",
  "japanese:dinner",
  "indian:lunch",
  "greek:breakfast",
  "mexican:dessert",
  "american_comfort:snack",
  // Tier 2
  "thai:dinner",
  "french:lunch",
  "korean:dinner",
  "spanish:breakfast",
  "middle_eastern:snack",
  // Tier 3
  "scandinavian:breakfast",
  "african:snack",
  "jamaican_caribbean:dinner",
  "german:dessert",
  "british_scottish_irish:lunch",
  "portuguese:breakfast",
  "hawaiian:dessert",
  "south_american:snack",
];

// ---------------------------------------------------------------------------
// THE MATRIX
// ---------------------------------------------------------------------------

// slug for "Greek/Mediterranean" is deliberately 'greek' — matches the
// cuisine value already stamped on the 3 greek-proof-01 rows, so those rows
// count toward this cell's target instead of starting a duplicate bucket.
const CUISINES = [
  { label: "Italian", slug: "italian", tier: 1 },
  { label: "American/Comfort", slug: "american_comfort", tier: 1 },
  { label: "Mexican", slug: "mexican", tier: 1 },
  { label: "American Southern", slug: "american_southern", tier: 1 },
  { label: "BBQ", slug: "bbq", tier: 1 },
  { label: "Chinese", slug: "chinese", tier: 1 },
  { label: "Japanese", slug: "japanese", tier: 1 },
  { label: "Indian", slug: "indian", tier: 1 },
  { label: "Modern/California", slug: "modern_california", tier: 1 },
  { label: "Greek/Mediterranean", slug: "greek", tier: 1 }, // promoted from Tier 2 -> Tier 1

  { label: "Thai", slug: "thai", tier: 2 },
  { label: "French", slug: "french", tier: 2 },
  { label: "Spanish", slug: "spanish", tier: 2 },
  { label: "Korean", slug: "korean", tier: 2 },
  { label: "Vietnamese", slug: "vietnamese", tier: 2 },
  { label: "Middle Eastern", slug: "middle_eastern", tier: 2 },

  { label: "Hawaiian", slug: "hawaiian", tier: 3 },
  { label: "German", slug: "german", tier: 3 },
  { label: "Scandinavian", slug: "scandinavian", tier: 3 },
  { label: "British/Scottish/Irish", slug: "british_scottish_irish", tier: 3 },
  { label: "Jamaican/Caribbean", slug: "jamaican_caribbean", tier: 3 },
  { label: "South American", slug: "south_american", tier: 3 },
  { label: "African", slug: "african", tier: 3 },
  { label: "Portuguese", slug: "portuguese", tier: 3 },
];

const TIER_DEPTH = { 1: 5, 2: 3, 3: 2 };
const MEAL_TYPES = ["dinner", "lunch", "breakfast", "dessert", "snack"];

function targetForCell(tier, mealType) {
  const depth = TIER_DEPTH[tier];
  if (mealType === "dinner" || mealType === "lunch") return depth;
  if (mealType === "breakfast") return tier === 1 ? depth : 2;
  if (mealType === "dessert" || mealType === "snack") return 2;
  throw new Error(`Unknown meal type: ${mealType}`);
}

const CELLS = [];
for (const cuisine of CUISINES) {
  for (const mealType of MEAL_TYPES) {
    CELLS.push({
      cuisineLabel: cuisine.label,
      cuisineSlug: cuisine.slug,
      tier: cuisine.tier,
      mealType,
      target: targetForCell(cuisine.tier, mealType),
    });
  }
}

// ---------------------------------------------------------------------------
// Tagging instruction — copied verbatim from scripts/greek-proof.mjs.
// It produced accurate dietary flags in the proof run; reworded nothing.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deterministic dietary contradiction check — flag-for-review only, never
// auto-corrects the recipe or the flags themselves.
// ---------------------------------------------------------------------------

const MEAT_FISH_TERMS = [
  "chicken", "beef", "pork", "bacon", "sausage", "ham", "turkey", "duck",
  "lamb", "veal", "venison", "rabbit", "goat",
  "fish", "salmon", "tuna", "cod", "anchovy", "anchovies",
  "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster",
  "squid", "calamari", "gelatin", "lard", "tallow",
  "chorizo", "prosciutto", "pancetta", "salami", "pepperoni",
];
const DAIRY_TERMS = [
  "milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "feta",
  "parmesan", "mozzarella", "ricotta", "mascarpone", "ghee", "buttermilk",
  "custard", "whey", "casein",
];
const EGG_HONEY_TERMS = ["egg", "eggs", "mayonnaise", "mayo", "honey"];
const VEGAN_EXCLUDE_TERMS = [...MEAT_FISH_TERMS, ...DAIRY_TERMS, ...EGG_HONEY_TERMS];
const GLUTEN_TERMS = [
  "wheat", "flour", "barley", "rye", "malt", "pasta", "noodle", "bread",
  "breadcrumb", "breadcrumbs", "phyllo", "filo", "semolina", "couscous",
  "bulgur", "farro", "spelt", "seitan", "soy sauce", "panko", "cracker",
];
const PORK_TERMS = [
  "pork", "bacon", "ham", "prosciutto", "pancetta", "chorizo", "salami",
  "pepperoni", "lard", "sausage",
];
const SHELLFISH_TERMS = [
  "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel",
  "oyster", "squid", "calamari", "crawfish", "langoustine",
];
const NUT_TERMS = [
  "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "peanut",
  "macadamia", "pine nut", "chestnut",
]; // coconut deliberately excluded — not a tree nut for allergen purposes

// Known-innocent compound phrases that contain a bare DAIRY_TERMS word but are
// not actually dairy. Masked out of ingredient text ONLY before dairy-term
// matching (is_dairy_free check + the dairy portion of the vegan check) — the
// bare terms ("milk", "butter") still trip everywhere else this phrase isn't
// present. "lard or vegetable shortening" is meat-adjacent (MEAT_FISH_TERMS/
// PORK_TERMS), not dairy, so it's unaffected by this list — see
// matchedTermsExcludingOrVegetable below for how that case is handled instead.
const DAIRY_COMPOUND_EXCLUSIONS = [
  "coconut milk", "almond milk", "oat milk", "soy milk", "rice milk", "cashew milk",
  "butter beans", "butter lettuce", "peanut butter", "apple butter", "cocoa butter", "nut butter",
];

// Non-wheat flour compounds that are genuinely gluten-free. Masked out of
// ingredient text ONLY before gluten-term matching (the is_gluten_free check)
// — bare "flour" and "wheat flour"/"all-purpose flour" are NOT in this list
// and still trip everywhere.
const GLUTEN_FREE_FLOUR_COMPOUND_EXCLUSIONS = [
  "glutinous rice flour", "sweet rice flour", "rice flour",
  "chickpea flour", "besan flour", "cassava flour", "almond flour",
  "corn flour", "tapioca flour", "mochiko flour",
];

// Bread-family terms that should NOT trip the gluten check when they appear
// only as a serving accompaniment, not a dish ingredient. Every other
// GLUTEN_TERMS word (flour, pasta, wheat, etc.) is unaffected by this list.
const BREAD_SERVING_EXCLUDABLE_TERMS = ["bread", "breadcrumb", "breadcrumbs"];
const SERVING_ACCOMPANIMENT_PHRASES = ["for serving", "to serve", "on the side", "for dipping"];

// Marks an ingredient item as non-load-bearing for the dairy-free check ONLY —
// either explicitly optional (e.g. "butter (optional, for finishing)") or a
// serving/garnish accompaniment (reuses SERVING_ACCOMPANIMENT_PHRASES verbatim).
// Every other dairy-term match (no "optional"/serving phrase present) still trips.
const OPTIONAL_OR_SERVING_PHRASES = ["optional", ...SERVING_ACCOMPANIMENT_PHRASES];

// "Honey mango"/"Ataulfo... honey mango" names a mango variety, not honey.
// Masked out of ingredient text ONLY before EGG_HONEY_TERMS matching in the
// vegan check — bare "honey" still trips everywhere else this phrase isn't
// present.
const HONEY_COMPOUND_EXCLUSIONS = ["honey mango"];

function termRegex(term) {
  return new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i");
}

function maskPhrases(text, phrases) {
  let masked = text;
  for (const phrase of phrases) {
    masked = masked.replace(new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi"), "");
  }
  return masked;
}

function ingredientItemTexts(ingredients) {
  return (ingredients || []).map((i) => `${i.name} ${i.qty}`);
}

// Matches terms against each ingredient's own text independently (not one
// joined blob) so exclusion logic can reason about a single ingredient's
// context without cross-ingredient boundary artifacts.
function matchedTermsAcrossItems(itemTexts, terms) {
  const found = new Set();
  for (const term of terms) {
    const re = termRegex(term);
    if (itemTexts.some((text) => re.test(text))) found.add(term);
  }
  return [...found];
}

// Same as above, but for `excludableTerms`, a match only counts if at least
// one matching ingredient's text is NOT itself excluded by `isExcluded`.
function matchedTermsWithExclusion(itemTexts, terms, excludableTerms, isExcluded) {
  const found = new Set();
  for (const term of terms) {
    const re = termRegex(term);
    const matchingItems = itemTexts.filter((text) => re.test(text));
    if (!matchingItems.length) continue;
    if (excludableTerms.includes(term)) {
      if (matchingItems.some((text) => !isExcluded(text))) found.add(term);
    } else {
      found.add(term);
    }
  }
  return [...found];
}

// A meat/pork term immediately followed by "or vegetable" (e.g. "chicken or
// vegetable stock", "lard or vegetable shortening") names an explicit
// compliant alternative in the same breath, so it doesn't count as a
// contradiction. Deliberately narrow and literal — this does NOT generalize to
// arbitrary "X or Y" phrasing. A term match only counts if at least one
// matching ingredient's text is NOT immediately followed by "or vegetable"
// (e.g. "beef or pork" still trips on "pork", since "vegetable" never follows
// the matched term there).
function matchedTermsExcludingOrVegetable(itemTexts, terms) {
  const found = new Set();
  for (const term of terms) {
    const re = termRegex(term);
    const orVegetableRe = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\s+or\\s+vegetable\\b`, "i");
    const matchingItems = itemTexts.filter((text) => re.test(text));
    if (!matchingItems.length) continue;
    if (matchingItems.some((text) => !orVegetableRe.test(text))) found.add(term);
  }
  return [...found];
}

// Pork-specific extension of matchedTermsExcludingOrVegetable: ALSO excludes
// the literal phrase "beef or pork" for the "pork" term only — that phrasing
// names beef as the primary ingredient and pork as an interchangeable
// leftover-meat alternative (e.g. Pytt i Panna's "leftover cooked beef or
// pork"), not a pork-containing recipe. Deliberately narrow: no other term in
// PORK_TERMS gets this exclusion, and "pork" only gets it for this exact
// literal phrase — "chicken or pork", "beef and pork", etc. still trip.
function matchedTermsExcludingPorkAlternatives(itemTexts, terms) {
  const found = new Set();
  for (const term of terms) {
    const re = termRegex(term);
    const orVegetableRe = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\s+or\\s+vegetable\\b`, "i");
    const beefOrPorkRe = term === "pork" ? /\bbeef\s+or\s+pork\b/i : null;
    const matchingItems = itemTexts.filter((text) => re.test(text));
    if (!matchingItems.length) continue;
    if (
      matchingItems.some(
        (text) => !orVegetableRe.test(text) && !(beefOrPorkRe && beefOrPorkRe.test(text))
      )
    ) {
      found.add(term);
    }
  }
  return [...found];
}

function dietaryContradictionCheck(row) {
  const itemTexts = ingredientItemTexts(row.ingredients);
  const dairyMaskedItemTexts = itemTexts.map((t) => maskPhrases(t, DAIRY_COMPOUND_EXCLUSIONS));
  const glutenMaskedItemTexts = itemTexts.map((t) => maskPhrases(t, GLUTEN_FREE_FLOUR_COMPOUND_EXCLUSIONS));
  const honeyMaskedItemTexts = itemTexts.map((t) => maskPhrases(t, HONEY_COMPOUND_EXCLUSIONS));
  const isServingAccompaniment = (text) =>
    SERVING_ACCOMPANIMENT_PHRASES.some((p) => new RegExp(p, "i").test(text));
  const isOptionalOrServing = (text) =>
    OPTIONAL_OR_SERVING_PHRASES.some((p) => new RegExp(`\\b${p.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));

  const reasons = [];

  if (row.is_vegetarian) {
    const m = matchedTermsExcludingOrVegetable(itemTexts, MEAT_FISH_TERMS);
    if (m.length) reasons.push(`vegetarian=true but meat/fish term present (matched: ${m.join(", ")})`);
  }

  if (row.is_vegan) {
    const meatM = matchedTermsAcrossItems(itemTexts, MEAT_FISH_TERMS);
    const dairyM = matchedTermsAcrossItems(dairyMaskedItemTexts, DAIRY_TERMS);
    const eggM = matchedTermsAcrossItems(honeyMaskedItemTexts, EGG_HONEY_TERMS);
    const all = [...meatM, ...dairyM, ...eggM];
    if (all.length) reasons.push(`vegan=true but animal-product term present (matched: ${all.join(", ")})`);
  }

  if (row.is_gluten_free) {
    const m = matchedTermsWithExclusion(glutenMaskedItemTexts, GLUTEN_TERMS, BREAD_SERVING_EXCLUDABLE_TERMS, isServingAccompaniment);
    if (m.length) reasons.push(`gluten_free=true but gluten term present (matched: ${m.join(", ")})`);
  }

  if (row.is_dairy_free) {
    const m = matchedTermsWithExclusion(dairyMaskedItemTexts, DAIRY_TERMS, DAIRY_TERMS, isOptionalOrServing);
    if (m.length) reasons.push(`dairy_free=true but dairy term present (matched: ${m.join(", ")})`);
  }

  if (!row.contains_pork) {
    const m = matchedTermsExcludingPorkAlternatives(itemTexts, PORK_TERMS);
    if (m.length) reasons.push(`contains_pork=false but pork term present (matched: ${m.join(", ")})`);
  }

  if (!row.contains_shellfish) {
    const m = matchedTermsAcrossItems(itemTexts, SHELLFISH_TERMS);
    if (m.length) reasons.push(`contains_shellfish=false but shellfish term present (matched: ${m.join(", ")})`);
  }

  if (!row.contains_nuts) {
    const m = matchedTermsAcrossItems(itemTexts, NUT_TERMS);
    if (m.length) reasons.push(`contains_nuts=false but nut term present (matched: ${m.join(", ")})`);
  }

  return { status: reasons.length ? "flagged" : "clean", reasons };
}

// ---------------------------------------------------------------------------
// Self-test — proves the exclusions are narrow, not a general relaxation.
// Runs against synthetic rows only; touches no DB data.
// ---------------------------------------------------------------------------
function runSelfTest() {
  const results = [];
  const real_butter = dietaryContradictionCheck({
    is_dairy_free: true,
    ingredients: [{ name: "unsalted butter", qty: "1 stick" }, { name: "flour", qty: "1 cup" }],
  });
  results.push(["Real 'unsalted butter' with is_dairy_free=true", real_butter.status, "expected: flagged"]);

  const coconut_milk = dietaryContradictionCheck({
    is_dairy_free: true,
    is_vegan: true,
    ingredients: [{ name: "coconut milk", qty: "1 can" }, { name: "sugar", qty: "1 cup" }],
  });
  results.push(["'coconut milk' with is_dairy_free=true, is_vegan=true", coconut_milk.status, "expected: clean"]);

  const bread_ingredient = dietaryContradictionCheck({
    is_gluten_free: true,
    ingredients: [{ name: "bread", qty: "2 slices, cubed" }],
  });
  results.push(["'bread' as a dish ingredient with is_gluten_free=true", bread_ingredient.status, "expected: flagged"]);

  const bread_serving = dietaryContradictionCheck({
    is_gluten_free: true,
    ingredients: [{ name: "crusty bread, for serving", qty: "as needed" }],
  });
  results.push(["'crusty bread, for serving' with is_gluten_free=true", bread_serving.status, "expected: clean"]);

  const lard_or_shortening = dietaryContradictionCheck({
    is_vegetarian: true,
    contains_pork: false,
    ingredients: [{ name: "lard or vegetable shortening", qty: "3 tbsp" }],
  });
  results.push(["'lard or vegetable shortening' with vegetarian=true, contains_pork=false", lard_or_shortening.status, "expected: clean (explicit compliant alternative named)"]);

  const beef_or_pork = dietaryContradictionCheck({
    contains_pork: false,
    ingredients: [{ name: "leftover cooked beef or pork", qty: "8 oz" }],
  });
  results.push(["'beef or pork' with contains_pork=false", beef_or_pork.status, "expected: clean (beef named as primary, pork as an interchangeable leftover-meat alternative — e.g. Pytt i Panna)"]);

  const chicken_or_pork = dietaryContradictionCheck({
    contains_pork: false,
    ingredients: [{ name: "leftover cooked chicken or pork", qty: "8 oz" }],
  });
  results.push(["'chicken or pork' with contains_pork=false", chicken_or_pork.status, "expected: flagged (only the literal 'beef or pork' phrase is excluded, not any 'X or pork' phrasing)"]);

  const chicken_or_vegetable_stock = dietaryContradictionCheck({
    is_vegetarian: true,
    ingredients: [{ name: "chicken or vegetable stock", qty: "1 cup" }],
  });
  results.push(["'chicken or vegetable stock' with vegetarian=true", chicken_or_vegetable_stock.status, "expected: clean"]);

  const rice_flour = dietaryContradictionCheck({
    is_gluten_free: true,
    ingredients: [{ name: "rice flour", qty: "1 cup" }, { name: "chickpea flour (besan)", qty: "1 cup" }],
  });
  results.push(["'rice flour' + 'chickpea flour (besan)' with is_gluten_free=true", rice_flour.status, "expected: clean"]);

  const wheat_flour = dietaryContradictionCheck({
    is_gluten_free: true,
    ingredients: [{ name: "all-purpose flour", qty: "1 cup" }],
  });
  results.push(["'all-purpose flour' with is_gluten_free=true", wheat_flour.status, "expected: flagged (unchanged — not a gluten-free flour)"]);

  const optional_butter = dietaryContradictionCheck({
    is_dairy_free: true,
    ingredients: [{ name: "unsalted butter", qty: "1 tablespoon (optional, for finishing)" }],
  });
  results.push(["'unsalted butter... (optional, for finishing)' with is_dairy_free=true", optional_butter.status, "expected: clean (optional garnish, not load-bearing)"]);

  const optional_feta_for_serving = dietaryContradictionCheck({
    is_dairy_free: true,
    ingredients: [{ name: "Feta cheese", qty: "Optional, crumbled for serving" }],
  });
  results.push(["'Feta cheese: Optional, crumbled for serving' with is_dairy_free=true", optional_feta_for_serving.status, "expected: clean (optional + serving accompaniment)"]);

  const mandatory_butter_dairy_free = dietaryContradictionCheck({
    is_dairy_free: true,
    ingredients: [{ name: "unsalted butter", qty: "1 stick, melted" }],
  });
  results.push(["'unsalted butter, melted' (no optional/serving phrase) with is_dairy_free=true", mandatory_butter_dairy_free.status, "expected: flagged (unchanged — not optional or a serving accompaniment)"]);

  const honey_mango = dietaryContradictionCheck({
    is_vegan: true,
    ingredients: [{ name: "Ripe mangoes", qty: "2 to 3, preferably Ataulfo or another honey mango" }],
  });
  results.push(["'...or another honey mango' with is_vegan=true", honey_mango.status, "expected: clean (mango variety name, not honey)"]);

  const bare_honey = dietaryContradictionCheck({
    is_vegan: true,
    ingredients: [{ name: "honey", qty: "2 tablespoons" }],
  });
  results.push(["bare 'honey' with is_vegan=true", bare_honey.status, "expected: flagged (unchanged — real honey, not a mango variety)"]);

  const soy_sauce_still_flags = dietaryContradictionCheck({
    is_gluten_free: true,
    ingredients: [{ name: "soy sauce", qty: "2 tablespoons" }],
  });
  results.push(["'soy sauce' with is_gluten_free=true", soy_sauce_still_flags.status, "expected: flagged (regression check — none of this session's exclusions touch gluten/soy sauce detection)"]);

  return results;
}

// ---------------------------------------------------------------------------
// Shared setup: connect, fetch existing rows, compute shortfall per cell.
// This DB read happens in both dry-run and live mode — it's a read, not a
// paid generation call.
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const { data: existingRows, error: fetchError } = await supabase
  .from("suggested_recipe_pool")
  .select("id, cuisine, meal_type, title, description, ingredients, steps, season, effort, holiday, is_vegetarian, is_vegan, is_gluten_free, is_dairy_free, contains_pork, contains_shellfish, contains_nuts, dietary_check_status");

if (fetchError) {
  console.error("Failed to fetch existing rows:", fetchError);
  process.exit(1);
}

const existingCountMap = {};
const existingTitlesMap = {};
for (const row of existingRows) {
  const key = `${row.cuisine}:${row.meal_type}`;
  existingCountMap[key] = (existingCountMap[key] || 0) + 1;
  (existingTitlesMap[key] ||= []).push(row.title);
}

for (const cell of CELLS) {
  const key = `${cell.cuisineSlug}:${cell.mealType}`;
  cell.existing = existingCountMap[key] || 0;
  cell.shortfall = Math.max(0, cell.target - cell.existing);
  cell.existingTitles = existingTitlesMap[key] || [];
}

const grandTotalShortfall = CELLS.reduce((s, c) => s + c.shortfall, 0);

// ---------------------------------------------------------------------------
// RECHECK-ONLY MODE — re-runs the deterministic checker over every existing
// row and updates ONLY dietary_check_status. Zero AI calls, zero changes to
// ingredients/steps/tag columns. Exits before the cost estimate or any
// generation code runs.
// ---------------------------------------------------------------------------

const RECHECK_ONLY = process.argv.includes("--recheck-only");

if (RECHECK_ONLY) {
  console.log("=".repeat(80));
  console.log("RECHECK-ONLY MODE — re-running the dietary contradiction checker over all");
  console.log(`existing rows (${existingRows.length} total). Zero AI calls. The only column`);
  console.log("written this pass is dietary_check_status.");
  console.log("=".repeat(80));

  console.log("\n--- REFINED TERM / EXCLUSION LISTS ---");
  console.log("MEAT_FISH_TERMS:", MEAT_FISH_TERMS.join(", "));
  console.log("DAIRY_TERMS:", DAIRY_TERMS.join(", "));
  console.log("EGG_HONEY_TERMS:", EGG_HONEY_TERMS.join(", "));
  console.log("GLUTEN_TERMS:", GLUTEN_TERMS.join(", "));
  console.log("PORK_TERMS:", PORK_TERMS.join(", "));
  console.log("SHELLFISH_TERMS:", SHELLFISH_TERMS.join(", "));
  console.log("NUT_TERMS:", NUT_TERMS.join(", "));
  console.log("DAIRY_COMPOUND_EXCLUSIONS (suppress dairy-term match ONLY for these exact phrases):");
  console.log(" ", DAIRY_COMPOUND_EXCLUSIONS.join(", "));
  console.log("GLUTEN_FREE_FLOUR_COMPOUND_EXCLUSIONS (suppress gluten-term match ONLY for these exact phrases; bare \"flour\"/\"wheat flour\"/\"all-purpose flour\" still trip):");
  console.log(" ", GLUTEN_FREE_FLOUR_COMPOUND_EXCLUSIONS.join(", "));
  console.log("BREAD_SERVING_EXCLUDABLE_TERMS (suppress ONLY when the same ingredient's text also matches a serving-accompaniment phrase):");
  console.log(" ", BREAD_SERVING_EXCLUDABLE_TERMS.join(", "));
  console.log("SERVING_ACCOMPANIMENT_PHRASES:", SERVING_ACCOMPANIMENT_PHRASES.join(", "));
  console.log("matchedTermsExcludingOrVegetable (vegetarian + contains_pork checks only): suppresses a meat/pork term match ONLY when that exact term is immediately followed by \"or vegetable\" (e.g. \"chicken or vegetable stock\", \"lard or vegetable shortening\") — \"beef or pork\" still trips on \"pork\", since \"vegetable\" never follows it.");

  console.log("\n--- SELF-TEST (synthetic rows only, no DB access) ---");
  for (const [desc, status, expectation] of runSelfTest()) {
    console.log(`  ${desc} -> ${status}  (${expectation})`);
  }

  console.log("\n--- RE-RUNNING CHECK OVER ALL EXISTING ROWS ---");
  let flaggedBefore = 0;
  let flaggedAfter = 0;
  const flippedToClean = [];
  const stillFlagged = [];
  const newlyFlagged = [];

  for (const row of existingRows) {
    const before = row.dietary_check_status;
    if (before === "flagged") flaggedBefore++;

    const check = dietaryContradictionCheck(row);
    const after = check.status;
    if (after === "flagged") flaggedAfter++;

    const cell = `${row.cuisine}:${row.meal_type}`;
    if (before === "flagged" && after === "clean") {
      flippedToClean.push({ title: row.title, cell });
    } else if (after === "flagged") {
      stillFlagged.push({ title: row.title, cell, reasons: check.reasons, changed: before !== after });
      if (before !== "flagged") newlyFlagged.push({ title: row.title, cell, reasons: check.reasons });
    }

    const { error: updateError } = await supabase
      .from("suggested_recipe_pool")
      .update({ dietary_check_status: after })
      .eq("id", row.id);
    if (updateError) {
      console.error(`UPDATE FAILED for row id=${row.id} (${row.title}):`, updateError);
      process.exit(1);
    }
  }

  console.log(`\nRows checked: ${existingRows.length}`);
  console.log(`Flagged BEFORE this pass: ${flaggedBefore}`);
  console.log(`Flagged AFTER this pass:  ${flaggedAfter}`);

  console.log("\nFlipped flagged -> clean:");
  if (flippedToClean.length === 0) console.log("  (none)");
  for (const r of flippedToClean) console.log(`  ${r.title} (${r.cell})`);

  console.log("\nStill flagged (reason each remaining flag stands):");
  if (stillFlagged.length === 0) console.log("  (none)");
  for (const r of stillFlagged) console.log(`  ${r.title} (${r.cell}): ${r.reasons.join("; ")}`);

  if (newlyFlagged.length > 0) {
    console.log("\nWARNING — newly flagged rows that were NOT flagged before (unexpected, review these):");
    for (const r of newlyFlagged) console.log(`  ${r.title} (${r.cell}): ${r.reasons.join("; ")}`);
  }

  console.log("\n--- CONFIRMATION ---");
  console.log("Zero calls to ai-chat / Anthropic this pass.");
  console.log("The ONLY column written was dietary_check_status, one row at a time, keyed by id.");
  console.log("No ingredient, step, or dietary tag (is_vegetarian/is_vegan/is_gluten_free/is_dairy_free/contains_pork/contains_shellfish/contains_nuts) was modified.");

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Cost estimate — built from real, already-generated data where possible.
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4; // standard rough English-text approximation; not an exact tokenizer count
const INPUT_PRICE_PER_MTOK = 3; // USD per 1M input tokens, Claude Sonnet published rate (<=200K context)
const OUTPUT_PRICE_PER_MTOK = 15; // USD per 1M output tokens, Claude Sonnet published rate (<=200K context)
const HANDOFF_SENTENCE_CHARS_ESTIMATE = 150; // the 1-2 sentence natural handoff before <recipe> — mandated by the system prompt but stripped before storage, so not measurable from stored rows; flat estimate

function renderTagsBlockForEstimate(row) {
  return [
    "<tags>",
    `<season>${row.season || "any"}</season>`,
    `<effort>${row.effort || "quick"}</effort>`,
    `<holiday>${row.holiday || "none"}</holiday>`,
    `<is_vegetarian>${row.is_vegetarian}</is_vegetarian>`,
    `<is_vegan>${row.is_vegan}</is_vegan>`,
    `<is_gluten_free>${row.is_gluten_free}</is_gluten_free>`,
    `<is_dairy_free>${row.is_dairy_free}</is_dairy_free>`,
    `<contains_pork>${row.contains_pork}</contains_pork>`,
    `<contains_shellfish>${row.contains_shellfish}</contains_shellfish>`,
    `<contains_nuts>${row.contains_nuts}</contains_nuts>`,
    "</tags>",
  ].join("\n").length;
}

let avgOutputChars;
let outputSampleSource;
if (existingRows.length > 0) {
  // recipeToXML() is the same exported function the app uses — its output
  // format (attribute-based <step title="...">, <item><name>/<qty>) matches
  // exactly what buildSystemPrompt() instructs the model to produce, so
  // running it over real stored recipes is a faithful proxy for real output
  // size, not a guess.
  const totalChars = existingRows.reduce((sum, row) => {
    const recipeXmlChars = recipeToXML({
      title: row.title,
      description: row.description,
      ingredients: row.ingredients,
      steps: row.steps,
    }).length;
    return sum + recipeXmlChars + renderTagsBlockForEstimate(row) + HANDOFF_SENTENCE_CHARS_ESTIMATE;
  }, 0);
  avgOutputChars = totalChars / existingRows.length;
  outputSampleSource = `measured from the ${existingRows.length} existing pool row(s) via recipeToXML()`;
} else {
  avgOutputChars = 1900; // fallback if the pool is ever empty when this runs
  outputSampleSource = "fallback assumption (pool was empty) — no real sample available";
}

const systemPromptChars = buildSystemPrompt({ palate: "", inspiration: "", constraints: "" }, null).length;
const sampleDishInstruction =
  `Pick one specific, genuinely traditional Greek/Mediterranean breakfast dish yourself` +
  ` — don't ask me anything, just choose one and commit to it — then write` +
  ` me the complete recipe for it right now.`;
const userMessageChars = sampleDishInstruction.length + TAG_INSTRUCTION.length;

const avgInputChars = systemPromptChars + userMessageChars;
const avgInputTokens = avgInputChars / CHARS_PER_TOKEN;
const avgOutputTokens = avgOutputChars / CHARS_PER_TOKEN;

const costPerRecipe =
  (avgInputTokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
  (avgOutputTokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK;

const projectedInputTokens = Math.round(avgInputTokens * grandTotalShortfall);
const projectedOutputTokens = Math.round(avgOutputTokens * grandTotalShortfall);
const projectedTotalCost = costPerRecipe * grandTotalShortfall;

// ---------------------------------------------------------------------------
// DRY RUN — print plan + cost estimate, then stop. No AI calls, no writes.
// ---------------------------------------------------------------------------

function printDryRun() {
  console.log("=".repeat(80));
  console.log("MATRIX PLAN — cell by cell (cuisine, meal_type, tier, target, existing, shortfall)");
  console.log("=".repeat(80));
  for (const cell of CELLS) {
    console.log(
      `${cell.cuisineSlug.padEnd(24)} ${cell.mealType.padEnd(10)} tier=${cell.tier} target=${cell.target} existing=${cell.existing} shortfall=${cell.shortfall}` +
        (cell.existingTitles.length ? `  [existing: ${cell.existingTitles.join(", ")}]` : "")
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log(`GRAND TOTAL recipes this run would generate (sum of shortfalls): ${grandTotalShortfall}`);
  console.log("=".repeat(80));

  console.log("\n--- COST ESTIMATE ---");
  console.log(`Output size sample source: ${outputSampleSource}`);
  console.log(`Avg output chars/recipe (recipe XML + tags block + handoff-sentence estimate): ${avgOutputChars.toFixed(0)}`);
  console.log(`Avg input chars/recipe (system prompt + user message): ${avgInputChars.toFixed(0)}`);
  console.log(`  system prompt: ${systemPromptChars} chars (measured live via buildSystemPrompt(), zero-cost)`);
  console.log(`  user message: ${userMessageChars} chars (sample dish instruction + full TAG_INSTRUCTION)`);
  console.log(`Chars-per-token approximation used: ${CHARS_PER_TOKEN} (standard rough English-text heuristic, not an exact tokenizer count)`);
  console.log(`Avg input tokens/recipe: ~${avgInputTokens.toFixed(0)}`);
  console.log(`Avg output tokens/recipe: ~${avgOutputTokens.toFixed(0)}`);
  console.log(`Pricing assumed: $${INPUT_PRICE_PER_MTOK}/million input tokens, $${OUTPUT_PRICE_PER_MTOK}/million output tokens (Claude Sonnet published rate, <=200K context) — verify against Anthropic's current pricing page before treating as final; actuals vary with recipe length.`);
  console.log(`Estimated cost per recipe: ~$${costPerRecipe.toFixed(4)}`);
  console.log(`Projected input tokens (x${grandTotalShortfall} recipes): ~${projectedInputTokens.toLocaleString()}`);
  console.log(`Projected output tokens (x${grandTotalShortfall} recipes): ~${projectedOutputTokens.toLocaleString()}`);
  console.log(`PROJECTED TOTAL ESTIMATED COST: ~$${projectedTotalCost.toFixed(2)}`);

  console.log("\n--- PACING (for the real --live run) ---");
  console.log("Sequential generation, concurrency = 1 (one ai-chat call in flight at a time),");
  console.log("with a 1000ms pause after each successful insert before starting the next call.");
  console.log("Chosen for simplicity and safety on this pipeline's first real run — no concurrency");
  console.log("bugs to reason about, no risk of bursting the provider or overlapping DB writes.");
  console.log("Can be raised to small concurrency (2-3) later once proven stable.");

  console.log("\n--- DIETARY CONTRADICTION CHECK TERM LISTS ---");
  console.log("MEAT_FISH_TERMS (vegetarian check):", MEAT_FISH_TERMS.join(", "));
  console.log("VEGAN_EXCLUDE_TERMS (vegan check) = MEAT_FISH_TERMS + DAIRY_TERMS + EGG_HONEY_TERMS:");
  console.log("  DAIRY_TERMS:", DAIRY_TERMS.join(", "));
  console.log("  EGG_HONEY_TERMS:", EGG_HONEY_TERMS.join(", "));
  console.log("GLUTEN_TERMS (gluten-free check):", GLUTEN_TERMS.join(", "));
  console.log("DAIRY_TERMS (dairy-free check): same DAIRY_TERMS list as above");
  console.log("PORK_TERMS (contains_pork check):", PORK_TERMS.join(", "));
  console.log("SHELLFISH_TERMS (contains_shellfish check):", SHELLFISH_TERMS.join(", "));
  console.log("NUT_TERMS (contains_nuts check):", NUT_TERMS.join(", "), " (coconut deliberately excluded, not a tree nut for allergen purposes)");
  console.log("Matching: case-insensitive, word-boundary regex per term, tested against ingredient name+qty text only.");
  console.log("Known false-positive risks (flag-for-review only, so a false positive just means extra manual review, never a data change):");
  console.log('  - "flour" matches rice/almond/corn/gluten-free flour too (still gluten-free in reality)');
  console.log('  - "sausage" matches chicken/turkey sausage too (not necessarily pork)');

  console.log("\n--- ADDITIVE / RESUMABLE LOGIC CONFIRMATION ---");
  console.log(`Existing rows fetched and grouped by (cuisine, meal_type) BEFORE any generation decision: ${existingRows.length} total rows across ${Object.keys(existingCountMap).length} cell(s) currently populated.`);
  console.log("Each cell's shortfall = max(0, target - existing) — never generates when already at/over target.");
  console.log("The 3 existing greek-proof-01 rows (cuisine='greek', meal_type='breakfast') were counted above:");
  const greekBreakfast = CELLS.find((c) => c.cuisineSlug === "greek" && c.mealType === "breakfast");
  console.log(`  greek:breakfast -> target=${greekBreakfast.target}, existing=${greekBreakfast.existing}, shortfall=${greekBreakfast.shortfall} (existing rows counted toward target, not ignored)`);
  console.log("In the real --live run, each recipe is inserted immediately after it's generated and checked —");
  console.log("NOT batched and inserted at the end. So an interrupted run leaves partial progress in the table,");
  console.log("and re-running recomputes existing counts (now including that partial progress) and only");
  console.log("generates whatever is still short. This is the same mechanism as the additive logic above —");
  console.log("there is no separate resume-tracking file or state; the table itself is the resume state.");

  console.log("\n--- CONFIRMATION ---");
  console.log("This dry run made ZERO calls to ai-chat / Anthropic and wrote ZERO rows to suggested_recipe_pool.");
  console.log("The only network activity was one read query (SELECT) against the existing pool, used to compute the plan above.");
}

if (!LIVE) {
  printDryRun();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// LIVE generation — not executed this pass. Included so the pipeline is
// complete and ready; only runs when invoked with --live.
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A hung connection (server accepts the request but never sends/finishes the
// stream) would otherwise wait forever — fetch() has no built-in timeout.
// AbortController bounds both the initial connect AND the SSE stream read:
// aborting mid-stream makes the reader's next .read() throw, so a stalled
// stream is caught the same way a stalled connect is.
const AI_CALL_TIMEOUT_MS = 90_000;

async function callAIChatOnce(userMessage) {
  const systemPrompt = buildSystemPrompt({ palate: "", inspiration: "", constraints: "" }, null);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`ai-chat call timed out after ${AI_CALL_TIMEOUT_MS}ms`)),
    AI_CALL_TIMEOUT_MS
  );

  try {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ai-chat error ${response.status}: ${errText}`);
    }

    const stream = parseSSEStream(response);
    let fullText = "";
    let inputTokens = null;
    let outputTokens = null;
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
        fullText += chunk.delta.text;
      } else if (chunk.type === "message_start" && chunk.message?.usage) {
        inputTokens = chunk.message.usage.input_tokens ?? null;
      } else if (chunk.type === "message_delta" && chunk.usage) {
        outputTokens = chunk.usage.output_tokens ?? null;
      }
    }
    return { fullText, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Exactly one bounded retry on top of the per-call timeout — self-heals a
// single transient blip (timeout or dropped connection) without looping.
// A second failure in a row is treated as real and propagates to the
// caller's catch block, which logs it, skips the recipe, and moves on.
async function callAIChat(userMessage) {
  try {
    return await callAIChatOnce(userMessage);
  } catch (err) {
    console.error(`  ai-chat call failed (${err instanceof Error ? err.message : err}), retrying once...`);
    return await callAIChatOnce(userMessage);
  }
}

let totalGenerated = 0;
let realInputTokens = 0;
let realOutputTokens = 0;

const runCells = SLICE
  ? CELLS.filter((c) => SLICE_CELLS.includes(`${c.cuisineSlug}:${c.mealType}`))
  : CELLS;

if (SLICE) {
  console.log("=".repeat(80));
  console.log(`SLICE MODE — restricting this run to ${SLICE_CELLS.length} cells:`);
  for (const key of SLICE_CELLS) console.log(`  ${key}`);
  console.log("=".repeat(80));
}

// Per-recipe failures (generation error, parse failure, tag-parse failure,
// insert error) are caught, logged, and skipped — NOT retried, NOT fatal to
// the run. A cell that hits a failure simply ends up short of target and is
// reported in the final summary for a manual top-up run later.
const failures = [];

for (const cell of runCells) {
  if (cell.shortfall === 0) continue;

  const previousTitles = [...cell.existingTitles];

  for (let i = 0; i < cell.shortfall; i++) {
    const distinctClause = previousTitles.length
      ? ` It must be a genuinely different dish from: ${previousTitles.join(", ")}.`
      : "";
    const userMessage =
      `Pick one specific, genuinely traditional ${cell.cuisineLabel} ${cell.mealType} dish yourself` +
      ` — don't ask me anything, just choose one and commit to it — then write` +
      ` me the complete recipe for it right now.${distinctClause}` +
      TAG_INSTRUCTION;

    console.log(`\n[${cell.cuisineSlug}:${cell.mealType}] generating ${i + 1}/${cell.shortfall}...`);

    try {
      const { fullText, inputTokens, outputTokens } = await callAIChat(userMessage);
      if (inputTokens != null) realInputTokens += inputTokens;
      if (outputTokens != null) realOutputTokens += outputTokens;

      const parsedRecipe = parseRecipeFromAIResponse(fullText);
      if (!parsedRecipe) {
        throw new Error(`PARSE FAILURE — parseRecipeFromAIResponse returned null. Raw response head: ${fullText.slice(0, 300)}`);
      }

      const tags = parseTags(fullText);
      const requiredBoolFields = [
        "is_vegetarian", "is_vegan", "is_gluten_free", "is_dairy_free",
        "contains_pork", "contains_shellfish", "contains_nuts",
      ];
      const tagsIncomplete = !tags || !tags.effort || requiredBoolFields.some((f) => tags[f] === null);
      if (tagsIncomplete) {
        throw new Error(`TAG PARSE FAILURE. Parsed so far: ${JSON.stringify(tags)}. Raw response head: ${fullText.slice(0, 300)}`);
      }

      const row = {
        batch_id: BATCH_ID,
        matrix_cell: `${cell.cuisineSlug}:${cell.mealType}`,
        title: parsedRecipe.title,
        description: parsedRecipe.description,
        ingredients: parsedRecipe.ingredients,
        steps: parsedRecipe.steps,
        cook_time: null,
        serves: null,
        cuisine: cell.cuisineSlug,
        meal_type: cell.mealType,
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
        vetting_status: "pending",
      };

      const check = dietaryContradictionCheck(row);
      row.dietary_check_status = check.status;
      if (check.status === "flagged") {
        console.log(`  dietary check FLAGGED: ${check.reasons.join("; ")}`);
      }

      const { error: insertError } = await supabase.from("suggested_recipe_pool").insert(row);
      if (insertError) {
        throw new Error(`INSERT FAILED: ${JSON.stringify(insertError)}`);
      }

      previousTitles.push(parsedRecipe.title);
      totalGenerated++;
      console.log(
        `  inserted: "${parsedRecipe.title}" (dietary_check_status=${row.dietary_check_status}, ` +
          `input_tokens=${inputTokens ?? "unknown"}, output_tokens=${outputTokens ?? "unknown"})`
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED [${cell.cuisineSlug}:${cell.mealType}] attempt ${i + 1}/${cell.shortfall}: ${reason}`);
      failures.push({ cell: `${cell.cuisineSlug}:${cell.mealType}`, attempt: i + 1, reason });
    }

    await sleep(1000);
  }
}

const realCostAtAssumedRate =
  (realInputTokens / 1_000_000) * INPUT_PRICE_PER_MTOK +
  (realOutputTokens / 1_000_000) * OUTPUT_PRICE_PER_MTOK;

console.log(`\nDone. Generated and inserted ${totalGenerated} recipes.`);
console.log("\n--- REAL TOKEN USAGE (measured from Anthropic SSE stream, not estimated) ---");
console.log(`Real total input tokens: ${realInputTokens.toLocaleString()}`);
console.log(`Real total output tokens: ${realOutputTokens.toLocaleString()}`);
console.log(
  `Real cost at $${INPUT_PRICE_PER_MTOK}/M input + $${OUTPUT_PRICE_PER_MTOK}/M output (dry-run-assumed rate): $${realCostAtAssumedRate.toFixed(4)}`
);

console.log(`\n--- FAILURES (${failures.length}) ---`);
if (failures.length === 0) {
  console.log("  (none)");
} else {
  for (const f of failures) console.log(`  [${f.cell}] attempt ${f.attempt}: ${f.reason}`);
}
