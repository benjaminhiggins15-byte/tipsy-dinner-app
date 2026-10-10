// Permanent unit test for pairings generation + caching
// (getPairingsForRecipe / computePairingsFingerprint in pairingsGeneration.ts).
// No live AI or DB calls — every dependency is injected via overrides.
// Run with: bun run src/tipsy/pairingsGeneration.test.ts
import {
  computePairingsFingerprint,
  getPairingsForRecipe,
  type PairingsRecipeRecord,
  type PairingsProfileRecord,
} from "./pairingsGeneration";
import type { PairingItem } from "./pairingsSafety";

let pass = 0;
let fail = 0;

function check(description: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (!ok) {
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
  if (ok) pass += 1;
  else fail += 1;
}

console.log("=".repeat(80));
console.log("PAIRINGS GENERATION + CACHING TEST");
console.log("=".repeat(80));
console.log();

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

const baseRecipeContent = {
  title: "Spanish Pork",
  ingredients: [{ name: "pork shoulder", qty: "2 lb" }, { name: "paprika", qty: "1 tbsp" }],
  steps: ["Sear the pork.", "Braise for two hours."],
};
const baseProfileInputs = {
  drinkPreference: "red wine",
  alcoholOk: true,
  allergies: { big9: ["wheat", "egg"] as const, other: ["mustard"] } as any,
};

check(
  "same recipe + profile inputs produce the same fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, baseProfileInputs),
  true
);

check(
  "allergy array order does not affect the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, {
      ...baseProfileInputs,
      allergies: { big9: ["egg", "wheat"], other: ["mustard"] } as any,
    }),
  true
);

check(
  "NULL allergies and confirmed-empty allergies produce DIFFERENT fingerprints",
  computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, allergies: null }) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, allergies: { big9: [], other: [] } as any }),
  false
);

check(
  "changing a step's text changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(
      { ...baseRecipeContent, steps: ["Sear the pork.", "Braise for THREE hours."] },
      baseProfileInputs
    ),
  false
);

check(
  "changing drink_preference text changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, drinkPreference: "whiskey" }),
  false
);

check(
  "changing alcohol_ok changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, alcoholOk: false }),
  false
);

// ---------------------------------------------------------------------------
// getPairingsForRecipe — test fixtures
// ---------------------------------------------------------------------------

function makeRecipeRecord(overrides: Partial<PairingsRecipeRecord> = {}): PairingsRecipeRecord {
  return {
    id: "recipe-1",
    title: "Spanish Pork",
    ingredients: [{ name: "pork shoulder", qty: "2 lb" }],
    steps: ["Sear the pork.", "Braise for two hours."],
    pairings: null,
    pairings_fingerprint: null,
    ...overrides,
  };
}

function makeProfileRecord(overrides: Partial<PairingsProfileRecord> = {}): PairingsProfileRecord {
  return {
    drink_preference: "red wine",
    alcohol_ok: true,
    allergies: { big9: [], other: [] },
    ...overrides,
  };
}

const AI_ITEMS: PairingItem[] = [
  { name: "Tempranillo", why: "A medium-bodied red that echoes the pork's smoky paprika.", is_alcoholic: true },
  { name: "Old Fashioned", why: "A stirred whiskey cocktail with enough weight for braised pork.", is_alcoholic: true },
  { name: "Dry Cider", why: "A crisp, fruity foil for the rich braise.", is_alcoholic: true },
  { name: "Sparkling Water with Lime", why: "A refreshing, zero-proof palate cleanser.", is_alcoholic: false },
];

// ---------------------------------------------------------------------------
// Cache-hit path: fingerprint matches -> no AI call, no persist, re-filters
// ---------------------------------------------------------------------------

{
  const recipe = makeRecipeRecord();
  const profile = makeProfileRecord();
  const fingerprint = computePairingsFingerprint(
    { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps },
    { drinkPreference: profile.drink_preference, alcoholOk: profile.alcohol_ok, allergies: profile.allergies }
  );
  recipe.pairings = AI_ITEMS;
  recipe.pairings_fingerprint = fingerprint;

  let aiCalls = 0;
  let persistCalls = 0;

  getPairingsForRecipe("recipe-1", "user-1", {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => {
      aiCalls += 1;
      return JSON.stringify(AI_ITEMS);
    },
    persistPairings: async () => {
      persistCalls += 1;
    },
  }).then((result) => {
    check("cache hit: all 4 cached items survive the re-filter", result.items.length, 4);
    check("cache hit: complete is true", result.complete, true);
    check("cache hit: AI is never called", aiCalls, 0);
    check("cache hit: nothing is persisted", persistCalls, 0);
    runSecondBatch();
  });
}

// ---------------------------------------------------------------------------
// Cache hit still re-filters: a stale cached item an updated safety filter
// would now catch gets dropped, even though the fingerprint matches.
// ---------------------------------------------------------------------------

function runSecondBatch() {
  const recipe = makeRecipeRecord();
  const profile = makeProfileRecord({ allergies: { big9: ["wheat"], other: [] } });
  const fingerprint = computePairingsFingerprint(
    { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps },
    { drinkPreference: profile.drink_preference, alcoholOk: profile.alcohol_ok, allergies: profile.allergies }
  );
  recipe.pairings = [
    { name: "IPA", why: "A hoppy India Pale Ale to match the spice.", is_alcoholic: true },
    ...AI_ITEMS.slice(0, 3),
  ];
  recipe.pairings_fingerprint = fingerprint;

  getPairingsForRecipe("recipe-2", "user-1", {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => JSON.stringify(AI_ITEMS),
    persistPairings: async () => {},
  }).then((result) => {
    check(
      "cache hit + wheat allergy: stale IPA is caught by the re-filter even though fingerprint matched",
      result.items.some((i) => i.name === "IPA"),
      false
    );
    runThirdBatch();
  });
}

// ---------------------------------------------------------------------------
// Cache-miss path: null pairings -> calls AI, filters, persists
// ---------------------------------------------------------------------------

function runThirdBatch() {
  const recipe = makeRecipeRecord({ pairings: null, pairings_fingerprint: null });
  const profile = makeProfileRecord();

  let aiCalls = 0;
  let persisted: { recipeId: string; userId: string; items: PairingItem[]; fingerprint: string } | null = null;

  getPairingsForRecipe("recipe-3", "user-1", {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => {
      aiCalls += 1;
      return JSON.stringify(AI_ITEMS);
    },
    persistPairings: async (recipeId, userId, items, fingerprint) => {
      persisted = { recipeId, userId, items, fingerprint };
    },
  }).then((result) => {
    check("cache miss: AI is called exactly once", aiCalls, 1);
    check("cache miss: all 4 AI items survive filtering", result.items.length, 4);
    check("cache miss: result is persisted", persisted !== null, true);
    check("cache miss: persisted recipeId/userId are correct", [persisted?.recipeId, persisted?.userId], ["recipe-3", "user-1"]);
    const expectedFingerprint = computePairingsFingerprint(
      { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps },
      { drinkPreference: profile.drink_preference, alcoholOk: profile.alcohol_ok, allergies: profile.allergies }
    );
    check("cache miss: persisted fingerprint matches computePairingsFingerprint", persisted?.fingerprint, expectedFingerprint);
    runFourthBatch();
  });
}

// ---------------------------------------------------------------------------
// Fingerprint-mismatch path: non-null pairings, but stale fingerprint ->
// still calls AI (this is the "preferences changed -> replaced" path)
// ---------------------------------------------------------------------------

function runFourthBatch() {
  const recipe = makeRecipeRecord({
    pairings: [{ name: "Old Fashioned", why: "stale", is_alcoholic: true }],
    pairings_fingerprint: "stale-fingerprint-from-before-a-preference-change",
  });
  const profile = makeProfileRecord({ alcohol_ok: false });

  let aiCalls = 0;

  getPairingsForRecipe("recipe-4", "user-1", {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => {
      aiCalls += 1;
      return JSON.stringify(AI_ITEMS);
    },
    persistPairings: async () => {},
  }).then((result) => {
    check("fingerprint mismatch: AI is called even though pairings was non-null", aiCalls, 1);
    check(
      "fingerprint mismatch + alcohol_ok now false: only the non-alcoholic survivor remains",
      result.items.map((i) => i.name),
      ["Sparkling Water with Lime"]
    );
    runFifthBatch();
  });
}

// ---------------------------------------------------------------------------
// Malformed AI response: never throws, persists an empty result
// ---------------------------------------------------------------------------

function runFifthBatch() {
  const recipe = makeRecipeRecord();
  const profile = makeProfileRecord();
  let persistedItems: PairingItem[] | null = null;

  getPairingsForRecipe("recipe-5", "user-1", {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => "not valid json at all",
    persistPairings: async (_recipeId, _userId, items) => {
      persistedItems = items;
    },
  }).then((result) => {
    check("malformed AI response: resolves instead of throwing, with zero items", result.items, []);
    check("malformed AI response: complete is false", result.complete, false);
    check("malformed AI response: still persists (an empty array, not left uncached)", persistedItems, []);
    runConcurrencyBatch();
  });
}

// ---------------------------------------------------------------------------
// Concurrency guard: two simultaneous requests for the same recipe id must
// only trigger one AI call.
// ---------------------------------------------------------------------------

function runConcurrencyBatch() {
  const recipe = makeRecipeRecord();
  const profile = makeProfileRecord();
  let aiCalls = 0;

  const overrides = {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: async () => {
      aiCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return JSON.stringify(AI_ITEMS);
    },
    persistPairings: async () => {},
  };

  Promise.all([
    getPairingsForRecipe("recipe-6", "user-1", overrides),
    getPairingsForRecipe("recipe-6", "user-1", overrides),
  ]).then(([first, second]) => {
    check("concurrency guard: two simultaneous requests trigger exactly one AI call", aiCalls, 1);
    check("concurrency guard: both callers get the same result", JSON.stringify(first) === JSON.stringify(second), true);
    finish();
  });
}

function finish() {
  console.log();
  console.log("=".repeat(80));
  console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log("=".repeat(80));

  if (fail > 0) {
    process.exit(1);
  }
}
