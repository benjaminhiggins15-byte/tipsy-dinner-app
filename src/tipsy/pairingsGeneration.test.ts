// Permanent unit test for pairings generation + caching
// (getPairingsForRecipe / regeneratePairings / computePairingsFingerprint in
// pairingsGeneration.ts). No live AI or DB calls — every dependency is
// injected via overrides.
// Run with: bun run src/tipsy/pairingsGeneration.test.ts
import {
  computePairingsFingerprint,
  getPairingsForRecipe,
  regeneratePairings,
  classifyDishOccasion,
  type PairingsRecipeRecord,
  type PairingsProfileRecord,
  type PairingsGenerationOverrides,
} from "./pairingsGeneration";
import { ALCOHOL_TERMS, type PairingItem } from "./pairingsSafety";
import { ALL_BIG9_IDS, BIG9_DISPLAY_NAMES, type Big9Id } from "./allergyMap";

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
  description: "A slow-braised pork shoulder with smoked paprika.",
  ingredients: [{ name: "pork shoulder", qty: "2 lb" }, { name: "paprika", qty: "1 tbsp" }],
  steps: ["Sear the pork.", "Braise for two hours."],
};
const baseProfileInputs = {
  drinkPreference: "red wine",
  alcoholOk: true,
  allergies: { big9: ["wheat", "egg"] as const, other: ["mustard"] } as any,
  palate: "bold, savory flavors",
};

check(
  "fingerprint: same recipe + profile inputs produce the same fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, baseProfileInputs),
  true
);

check(
  "fingerprint: allergy array order does not affect the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, {
      ...baseProfileInputs,
      allergies: { big9: ["egg", "wheat"], other: ["mustard"] } as any,
    }),
  true
);

check(
  "fingerprint: NULL allergies and confirmed-empty allergies produce DIFFERENT fingerprints",
  computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, allergies: null }) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, allergies: { big9: [], other: [] } as any }),
  false
);

check(
  "fingerprint: changing a step's text changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(
      { ...baseRecipeContent, steps: ["Sear the pork.", "Braise for THREE hours."] },
      baseProfileInputs
    ),
  false
);

check(
  "fingerprint: changing drink_preference text changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, drinkPreference: "whiskey" }),
  false
);

check(
  "fingerprint: changing alcohol_ok changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, alcoholOk: false }),
  false
);

check(
  "fingerprint: changing the recipe description changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint({ ...baseRecipeContent, description: "A quick weeknight pork chop." }, baseProfileInputs),
  false
);

check(
  "fingerprint: changing palate changes the fingerprint",
  computePairingsFingerprint(baseRecipeContent, baseProfileInputs) ===
    computePairingsFingerprint(baseRecipeContent, { ...baseProfileInputs, palate: "light, delicate flavors" }),
  false
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecipeRecord(overrides: Partial<PairingsRecipeRecord> = {}): PairingsRecipeRecord {
  return {
    id: "recipe-1",
    title: "Spanish Pork",
    description: "A slow-braised pork shoulder with smoked paprika.",
    ingredients: [{ name: "pork shoulder", qty: "2 lb" }],
    steps: ["Sear the pork.", "Braise for two hours."],
    pairings: null,
    pairings_fingerprint: null,
    ...overrides,
  };
}

function makeProfileRecord(overrides: Partial<PairingsProfileRecord> = {}): PairingsProfileRecord {
  return {
    wants_pairings: true,
    drink_preference: "red wine",
    alcohol_ok: true,
    allergies: { big9: [], other: [] },
    palate: "bold, savory flavors",
    ...overrides,
  };
}

function fingerprintFor(recipe: PairingsRecipeRecord, profile: PairingsProfileRecord): string {
  return computePairingsFingerprint(
    { title: recipe.title, description: recipe.description, ingredients: recipe.ingredients, steps: recipe.steps },
    {
      drinkPreference: profile.drink_preference,
      alcoholOk: profile.alcohol_ok,
      allergies: profile.allergies,
      palate: profile.palate,
    }
  );
}

const DRINKER_ITEMS: PairingItem[] = [
  { name: "Tempranillo", why: "A medium-bodied red that echoes the pork's smoky paprika.", is_alcoholic: true },
  { name: "Old Fashioned", why: "A stirred whiskey cocktail with enough weight for braised pork.", is_alcoholic: true },
  { name: "Dry Cider", why: "A crisp, fruity foil for the rich braise.", is_alcoholic: true },
  { name: "Sparkling Water with Lime", why: "A refreshing, zero-proof palate cleanser.", is_alcoholic: false },
];

const NON_DRINKER_ITEMS: PairingItem[] = [
  { name: "Ginger Mule", why: "A ginger-forward mocktail with enough spice to stand up to the dish.", is_alcoholic: false },
  { name: "Sparkling Blackberry Shrub", why: "Tart and fizzy, it cuts through the richness.", is_alcoholic: false },
  { name: "Hibiscus Cooler", why: "Bright and floral against the smoky paprika.", is_alcoholic: false },
  { name: "Cucumber Mint Soda", why: "Clean and refreshing alongside the braise.", is_alcoholic: false },
];

function makeOverrides(
  recipe: PairingsRecipeRecord,
  profile: PairingsProfileRecord,
  opts: {
    callAI?: (systemPrompt: string, userId: string) => Promise<string>;
    persistPairings?: PairingsGenerationOverrides["persistPairings"];
  } = {}
): PairingsGenerationOverrides {
  return {
    fetchRecipe: async () => recipe,
    fetchProfile: async () => profile,
    callAI: opts.callAI ?? (async () => JSON.stringify(DRINKER_ITEMS)),
    persistPairings: opts.persistPairings ?? (async () => {}),
  };
}

async function run() {
  // -------------------------------------------------------------------------
  // 1. Cache hit, fingerprint match, passes re-filter -> zero AI calls
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord();
    const profile = makeProfileRecord();
    recipe.pairings = DRINKER_ITEMS;
    recipe.pairings_fingerprint = fingerprintFor(recipe, profile);

    let aiCalls = 0;
    let persistCalls = 0;
    const result = await getPairingsForRecipe(
      "recipe-1",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(DRINKER_ITEMS);
        },
        persistPairings: async () => {
          persistCalls += 1;
        },
      })
    );

    check("cache hit + passes re-filter: status is ok", result.status, "ok");
    check(
      "cache hit + passes re-filter: returns all 4 cached items",
      result.status === "ok" ? result.items.length : -1,
      4
    );
    check("cache hit + passes re-filter: zero AI calls", aiCalls, 0);
    check("cache hit + passes re-filter: nothing persisted", persistCalls, 0);
  }

  // -------------------------------------------------------------------------
  // 2. Cache hit, fingerprint match, FAILS re-filter (cached "IPA", new wheat
  //    allergy) -> regenerates
  // -------------------------------------------------------------------------
  {
    const profile = makeProfileRecord({ allergies: { big9: ["wheat"], other: [] } });
    const recipe = makeRecipeRecord({ id: "recipe-2" });
    // Fingerprint is computed from CURRENT recipe/profile — a cache hit here
    // means "nothing in recipe/profile changed since generation," which can
    // only happen in practice if the safety filter's own carrier list
    // changed after the cache was written. We simulate that directly: stamp
    // the fingerprint for the CURRENT state, but seed pairings with an item
    // (IPA) that state would no longer allow.
    recipe.pairings = [
      { name: "IPA", why: "A hoppy India Pale Ale to match the spice.", is_alcoholic: true },
      ...DRINKER_ITEMS.slice(0, 3),
    ];
    recipe.pairings_fingerprint = fingerprintFor(recipe, profile);

    let aiCalls = 0;
    const result = await getPairingsForRecipe(
      "recipe-2",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("cache hit fails re-filter (stale IPA + new wheat allergy): regenerates via AI", aiCalls, 1);
    check("cache hit fails re-filter: status is ok after regeneration", result.status, "ok");
    check(
      "cache hit fails re-filter: IPA is not in the final result",
      result.status === "ok" ? result.items.some((i) => i.name === "IPA") : true,
      false
    );
  }

  // -------------------------------------------------------------------------
  // 3. Recipe ingredients changed -> regenerates
  // -------------------------------------------------------------------------
  {
    const profile = makeProfileRecord();
    const recipe = makeRecipeRecord({ id: "recipe-3" });
    // Stamp the cache under the OLD ingredients, then change them — the
    // fingerprint computed fresh (inside getPairingsForRecipe) will no
    // longer match the stored one.
    recipe.pairings_fingerprint = fingerprintFor(recipe, profile);
    recipe.pairings = DRINKER_ITEMS;
    recipe.ingredients = [...recipe.ingredients, { name: "smoked paprika", qty: "2 tsp" }];

    let aiCalls = 0;
    const result = await getPairingsForRecipe(
      "recipe-3",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("ingredients changed since caching: regenerates via AI", aiCalls, 1);
    check("ingredients changed since caching: status is ok", result.status, "ok");
  }

  // -------------------------------------------------------------------------
  // 4. drink_preference / alcohol_ok / allergies changed -> regenerates
  // -------------------------------------------------------------------------
  const mutations: [string, (p: PairingsProfileRecord) => PairingsProfileRecord][] = [
    ["drink_preference", (p) => ({ ...p, drink_preference: "whiskey" })],
    ["alcohol_ok", (p) => ({ ...p, alcohol_ok: false })],
    ["allergies", (p) => ({ ...p, allergies: { big9: ["milk"] as Big9Id[], other: [] } })],
  ];
  for (const [label, mutate] of mutations) {
    const originalProfile = makeProfileRecord();
    const recipe = makeRecipeRecord({ id: `recipe-4-${label}` });
    recipe.pairings = DRINKER_ITEMS;
    recipe.pairings_fingerprint = fingerprintFor(recipe, originalProfile);

    const changedProfile = mutate(originalProfile);

    let aiCalls = 0;
    const result = await getPairingsForRecipe(
      `recipe-4-${label}`,
      "user-1",
      makeOverrides(recipe, changedProfile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(
            changedProfile.alcohol_ok === true ? DRINKER_ITEMS : NON_DRINKER_ITEMS
          );
        },
      })
    );

    check(`${label} changed since caching: regenerates via AI`, aiCalls, 1);
    check(`${label} changed since caching: status is ok`, result.status, "ok");
  }

  // -------------------------------------------------------------------------
  // 5. wants_pairings false and null -> "off", zero AI calls, no writes
  // -------------------------------------------------------------------------
  for (const wantsPairings of [false, null] as const) {
    const recipe = makeRecipeRecord({ id: `recipe-5-${String(wantsPairings)}` });
    const profile = makeProfileRecord({ wants_pairings: wantsPairings });

    let aiCalls = 0;
    let persistCalls = 0;
    const result = await getPairingsForRecipe(
      `recipe-5-${String(wantsPairings)}`,
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(DRINKER_ITEMS);
        },
        persistPairings: async () => {
          persistCalls += 1;
        },
      })
    );

    check(`wants_pairings=${wantsPairings}: status is off`, result.status, "off");
    check(`wants_pairings=${wantsPairings}: zero AI calls`, aiCalls, 0);
    check(`wants_pairings=${wantsPairings}: nothing persisted`, persistCalls, 0);
  }

  // -------------------------------------------------------------------------
  // 6. Stale fingerprint baked under alcohol_ok=true, but DB now says
  //    alcohol_ok=false -> generates non-alcoholic only (never trusts
  //    anything but the freshly-fetched DB profile)
  // -------------------------------------------------------------------------
  {
    const staleProfile = makeProfileRecord({ alcohol_ok: true });
    const recipe = makeRecipeRecord({ id: "recipe-6" });
    recipe.pairings = DRINKER_ITEMS;
    recipe.pairings_fingerprint = fingerprintFor(recipe, staleProfile);

    const currentProfile = makeProfileRecord({ alcohol_ok: false });

    const result = await getPairingsForRecipe(
      "recipe-6",
      "user-1",
      makeOverrides(recipe, currentProfile, {
        callAI: async () => JSON.stringify(NON_DRINKER_ITEMS),
      })
    );

    check("DB alcohol_ok=false overrides a stale true baked into the old cache: status ok", result.status, "ok");
    check(
      "DB alcohol_ok=false overrides a stale true baked into the old cache: all 4 items are non-alcoholic",
      result.status === "ok" ? result.items.every((i) => i.is_alcoholic === false) : false,
      true
    );
  }

  // -------------------------------------------------------------------------
  // alcohol_ok NULL is treated as false (fail-closed), never as true
  // -------------------------------------------------------------------------
  {
    const profile = makeProfileRecord({ alcohol_ok: null });
    const recipe = makeRecipeRecord({ id: "recipe-6b" });

    let aiCalls = 0;
    const result = await getPairingsForRecipe(
      "recipe-6b",
      "user-1",
      makeOverrides(recipe, profile, {
        // Always returns a set that would be COMPLETE for a drinker
        // (3 alcoholic + 1 non-alcoholic) but is incomplete for a
        // non-drinker once the 3 alcoholic ones are dropped.
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("alcohol_ok=null: never treated as true (3 attempts exhausted, not accepted as complete)", aiCalls, 3);
    check("alcohol_ok=null: status is failed, same as alcohol_ok=false would be", result.status, "failed");
  }

  // -------------------------------------------------------------------------
  // 7. Two concurrent calls, same recipe -> exactly one AI call
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-7" });
    const profile = makeProfileRecord();
    let aiCalls = 0;

    const overrides = makeOverrides(recipe, profile, {
      callAI: async () => {
        aiCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return JSON.stringify(DRINKER_ITEMS);
      },
    });

    const [first, second] = await Promise.all([
      getPairingsForRecipe("recipe-7", "user-1", overrides),
      getPairingsForRecipe("recipe-7", "user-1", overrides),
    ]);

    check("concurrency guard: two simultaneous requests trigger exactly one AI call", aiCalls, 1);
    check("concurrency guard: both callers get the same result", JSON.stringify(first) === JSON.stringify(second), true);
  }

  // -------------------------------------------------------------------------
  // 8. Attempt 1 has an alcoholic item for a non-drinker, attempt 2 clean -> saved
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-8" });
    const profile = makeProfileRecord({ alcohol_ok: false });
    let aiCalls = 0;
    let persisted: PairingItem[] | null = null;

    const dirtyBatch = [...NON_DRINKER_ITEMS.slice(0, 3), { name: "Whiskey Sour", why: "A tart cocktail.", is_alcoholic: true }];

    const result = await getPairingsForRecipe(
      "recipe-8",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(aiCalls === 1 ? dirtyBatch : NON_DRINKER_ITEMS);
        },
        persistPairings: async (_recipeId, _userId, items) => {
          persisted = items;
        },
      })
    );

    check("attempt 1 dirty (1 alcoholic item), attempt 2 clean: exactly 2 AI calls", aiCalls, 2);
    check("attempt 1 dirty, attempt 2 clean: status is ok", result.status, "ok");
    check(
      "attempt 1 dirty, attempt 2 clean: saved result is the clean attempt-2 set",
      persisted,
      NON_DRINKER_ITEMS
    );
  }

  // -------------------------------------------------------------------------
  // 9. 3 incomplete attempts -> "failed", nothing saved
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-9" });
    const profile = makeProfileRecord({ alcohol_ok: false });
    let aiCalls = 0;
    let persistCalls = 0;

    const alwaysDirty = [...NON_DRINKER_ITEMS.slice(0, 2), { name: "Whiskey Sour", why: "A tart cocktail.", is_alcoholic: true }];

    const result = await getPairingsForRecipe(
      "recipe-9",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return JSON.stringify(alwaysDirty);
        },
        persistPairings: async () => {
          persistCalls += 1;
        },
      })
    );

    check("3 incomplete attempts: exactly 3 AI calls (no more, no fewer)", aiCalls, 3);
    check("3 incomplete attempts: status is failed", result.status, "failed");
    check("3 incomplete attempts: nothing persisted", persistCalls, 0);
  }

  // -------------------------------------------------------------------------
  // 10. Malformed JSON counts as an attempt
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-10" });
    const profile = makeProfileRecord();
    let aiCalls = 0;

    const result = await getPairingsForRecipe(
      "recipe-10",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return aiCalls === 1 ? "not valid json at all" : JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("malformed JSON on attempt 1 consumes an attempt, attempt 2 succeeds: 2 AI calls", aiCalls, 2);
    check("malformed JSON on attempt 1, clean attempt 2: status is ok", result.status, "ok");
  }
  {
    // All 3 attempts malformed -> failed, not an infinite retry and not a thrown error.
    const recipe = makeRecipeRecord({ id: "recipe-10b" });
    const profile = makeProfileRecord();
    let aiCalls = 0;

    const result = await getPairingsForRecipe(
      "recipe-10b",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async () => {
          aiCalls += 1;
          return "{ this is not json";
        },
      })
    );

    check("malformed JSON on all 3 attempts: exactly 3 AI calls, never throws", aiCalls, 3);
    check("malformed JSON on all 3 attempts: status is failed", result.status, "failed");
  }

  // -------------------------------------------------------------------------
  // 11. regenerate: failure keeps old pairings; success overwrites
  // -------------------------------------------------------------------------
  {
    // 11a. regenerate success: overwrites, and asks the AI to avoid the
    // currently-cached names.
    const recipe = makeRecipeRecord({ id: "recipe-11a" });
    const profile = makeProfileRecord();
    recipe.pairings = DRINKER_ITEMS;
    recipe.pairings_fingerprint = fingerprintFor(recipe, profile);

    const NEW_ITEMS: PairingItem[] = [
      { name: "Malbec", why: "A dark-fruited red with enough tannin for the braise.", is_alcoholic: true },
      { name: "Negroni", why: "Bitter and herbal, a sharp contrast to the rich pork.", is_alcoholic: true },
      { name: "Dry Sherry", why: "Nutty and saline, it cuts the fat nicely.", is_alcoholic: true },
      { name: "Hibiscus Cooler", why: "Bright and floral against the smoky paprika.", is_alcoholic: false },
    ];

    let capturedPrompt = "";
    let persisted: PairingItem[] | null = null;

    const result = await regeneratePairings(
      "recipe-11a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(NEW_ITEMS);
        },
        persistPairings: async (_recipeId, _userId, items) => {
          persisted = items;
        },
      })
    );

    check("regenerate success: status is ok", result.status, "ok");
    check("regenerate success: overwrites with the new set", persisted, NEW_ITEMS);
    check(
      "regenerate success: prompt asks the AI to avoid the currently-cached names",
      DRINKER_ITEMS.every((item) => capturedPrompt.includes(item.name)),
      true
    );

    // 11b. regenerate failure: nothing is persisted, old cache untouched —
    // confirmed by a follow-up getPairingsForRecipe cache hit returning the
    // original items unchanged.
    const recipeB = makeRecipeRecord({ id: "recipe-11b" });
    const profileB = makeProfileRecord();
    recipeB.pairings = DRINKER_ITEMS;
    recipeB.pairings_fingerprint = fingerprintFor(recipeB, profileB);

    let persistCallsB = 0;
    const alwaysIncomplete = [DRINKER_ITEMS[0]];

    const regenResult = await regeneratePairings(
      "recipe-11b",
      "user-1",
      makeOverrides(recipeB, profileB, {
        callAI: async () => JSON.stringify(alwaysIncomplete),
        persistPairings: async () => {
          persistCallsB += 1;
        },
      })
    );

    check("regenerate failure: status is failed", regenResult.status, "failed");
    check("regenerate failure: nothing persisted", persistCallsB, 0);

    const followUp = await getPairingsForRecipe(
      "recipe-11b",
      "user-1",
      makeOverrides(recipeB, profileB, {
        callAI: async () => {
          throw new Error("should not be called — cache should still be valid");
        },
      })
    );

    check("regenerate failure: old pairings are still served afterward (kept, not cleared)", followUp, {
      status: "ok",
      items: DRINKER_ITEMS,
    });
  }

  // -------------------------------------------------------------------------
  // 12. Prompt content: tags present, recipe text confined to <recipe>
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({
      id: "recipe-12a",
      title: "Braised Short Rib Supreme",
      description: "A rich, slow-braised short rib with red wine jus.",
      ingredients: [{ name: "beef short rib", qty: "3 lb" }],
      steps: ["Sear the short rib until deeply browned.", "Braise in red wine for three hours."],
    });
    const profile = makeProfileRecord({ drink_preference: "I love bold reds", palate: "rich, savory flavors" });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-12a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: <recipe> opening tag present", capturedPrompt.includes("<recipe>"), true);
    check("prompt content: </recipe> closing tag present", capturedPrompt.includes("</recipe>"), true);

    const recipeStart = capturedPrompt.indexOf("<recipe>");
    const recipeEnd = capturedPrompt.indexOf("</recipe>") + "</recipe>".length;
    const insideRecipe = capturedPrompt.slice(recipeStart, recipeEnd);
    const outsideRecipe = capturedPrompt.slice(0, recipeStart) + capturedPrompt.slice(recipeEnd);

    check("prompt content: title appears inside <recipe>", insideRecipe.includes("Braised Short Rib Supreme"), true);
    check("prompt content: title does NOT appear outside <recipe>", outsideRecipe.includes("Braised Short Rib Supreme"), false);
    check("prompt content: description appears inside <recipe>", insideRecipe.includes("red wine jus"), true);
    check("prompt content: description does NOT appear outside <recipe>", outsideRecipe.includes("red wine jus"), false);
    check("prompt content: ingredient appears inside <recipe>", insideRecipe.includes("beef short rib"), true);
    check("prompt content: ingredient does NOT appear outside <recipe>", outsideRecipe.includes("beef short rib"), false);
    check("prompt content: method appears inside <recipe>", insideRecipe.includes("deeply browned"), true);
    check("prompt content: method does NOT appear outside <recipe>", outsideRecipe.includes("deeply browned"), false);
  }

  // -------------------------------------------------------------------------
  // 13. Prompt content: NULL allergies -> all nine allergen words; confirmed
  //     -none -> no allergy block
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-13a" });
    const profile = makeProfileRecord({ allergies: null });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-13a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: NULL allergies -> allergy block present", capturedPrompt.includes("Allergies:"), true);
    check(
      "prompt content: NULL allergies -> all nine Big-9 allergen words appear",
      ALL_BIG9_IDS.every((id) => capturedPrompt.includes(BIG9_DISPLAY_NAMES[id])),
      true
    );
  }
  {
    const recipe = makeRecipeRecord({ id: "recipe-13b" });
    const profile = makeProfileRecord({ allergies: { big9: [], other: [] } });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-13b",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: confirmed-none allergies -> no allergy block", capturedPrompt.includes("Allergies:"), false);
  }

  // -------------------------------------------------------------------------
  // 14. Prompt content: drinker/non-drinker blocks are mutually exclusive
  // -------------------------------------------------------------------------
  const DRINKER_ONLY_PHRASE = "Always include at least 1 non-alcoholic option.";
  const NON_DRINKER_ONLY_PHRASE = "Give each a descriptive, appetizing name based on what's in it";
  {
    const recipe = makeRecipeRecord({ id: "recipe-14a" });
    const profile = makeProfileRecord({ alcohol_ok: true });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-14a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: drinker prompt contains the drinker block", capturedPrompt.includes(DRINKER_ONLY_PHRASE), true);
    check("prompt content: drinker prompt does NOT contain the non-drinker block", capturedPrompt.includes(NON_DRINKER_ONLY_PHRASE), false);
  }
  {
    const recipe = makeRecipeRecord({ id: "recipe-14b" });
    const profile = makeProfileRecord({ alcohol_ok: false });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-14b",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(NON_DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: non-drinker prompt contains the non-drinker block", capturedPrompt.includes(NON_DRINKER_ONLY_PHRASE), true);
    check("prompt content: non-drinker prompt does NOT contain the drinker block", capturedPrompt.includes(DRINKER_ONLY_PHRASE), false);
  }

  // -------------------------------------------------------------------------
  // 15. Prompt content: empty description/palate/drink_preference are
  //     omitted cleanly (no stray tag, no stray line)
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-15", description: "" });
    const profile = makeProfileRecord({ drink_preference: null, palate: null });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-15",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check("prompt content: empty description -> no Description: line", capturedPrompt.includes("Description:"), false);
    check("prompt content: empty drink_preference -> no <drink_preference> tag", capturedPrompt.includes("<drink_preference>"), false);
    check("prompt content: empty palate -> no <palate> tag", capturedPrompt.includes("<palate>"), false);
    check("prompt content: title is still present even when other tags are omitted", capturedPrompt.includes(`Title: ${recipe.title}`), true);
  }

  // -------------------------------------------------------------------------
  // 16. Prompt content: non-drinker prompt (NULL allergies) contains no bare
  //     alcohol-term words, except inside the "do not use names borrowed
  //     from..." prohibition line (which names them deliberately, as things
  //     to avoid).
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-16" });
    const profile = makeProfileRecord({ alcohol_ok: false, allergies: null, drink_preference: null });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-16",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(NON_DRINKER_ITEMS);
        },
      })
    );

    const PROHIBITION_LINE =
      'Do not mention alcohol at all, and do not use names borrowed from cocktails, beer, or wine (no "virgin", "mocktail", "spritz", "mule", "sour", "ginger beer", "NA beer", "cider").';
    check(
      "prompt content: the naming-prohibition line is present verbatim",
      capturedPrompt.includes(PROHIBITION_LINE),
      true
    );

    const promptWithoutProhibitionLine = capturedPrompt.split(PROHIBITION_LINE).join("");

    function wordBoundaryMatch(term: string, text: string): boolean {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }

    const leakedTerms = ALCOHOL_TERMS.filter((term) => wordBoundaryMatch(term, promptWithoutProhibitionLine));
    check(
      "prompt content: non-drinker prompt (NULL allergies) has no alcohol-term words outside the prohibition line",
      leakedTerms,
      []
    );

    check(
      "prompt content: non-drinker allergy block contains the non-drinker wheat exclusion line",
      capturedPrompt.includes("No malt drinks and no barley tea."),
      true
    );
    check(
      "prompt content: non-drinker allergy block contains the non-drinker egg exclusion line",
      capturedPrompt.includes("No eggnog or drinks made with egg."),
      true
    );
    check(
      "prompt content: non-drinker allergy block contains the non-drinker fish/shellfish exclusion line",
      capturedPrompt.includes("No clam juice or fish sauce."),
      true
    );
    check(
      "prompt content: non-drinker allergy block does NOT contain the drinker-only wheat/egg/fish exclusion lines",
      [
        "No beer of any kind (lager, ale, IPA, pilsner, wheat beer, sour beer), no malt drinks, no barley tea.",
        "No sours, fizzes, flips, or eggnog.",
        "No Bloody Mary, Caesar, michelada, or clam juice.",
      ].some((line) => capturedPrompt.includes(line)),
      false
    );
  }

  // -------------------------------------------------------------------------
  // 18. Allergy block: per-allergen exclusion lines, drinker vs non-drinker
  //     wordings, and fish/shellfish collapsing to one line
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-18a" });
    const profile = makeProfileRecord({ alcohol_ok: true, allergies: { big9: ["wheat", "egg"], other: [] } });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-18a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check(
      "drinker wheat+egg: allergy block contains the drinker wheat exclusion line",
      capturedPrompt.includes(
        "No beer of any kind (lager, ale, IPA, pilsner, wheat beer, sour beer), no malt drinks, no barley tea."
      ),
      true
    );
    check(
      "drinker wheat+egg: allergy block contains the drinker egg exclusion line",
      capturedPrompt.includes("No sours, fizzes, flips, or eggnog."),
      true
    );
    check(
      "drinker wheat+egg: allergy block does NOT contain exclusion lines for allergens not present",
      [
        "No lattes, cream, or milk- or yogurt-based drinks.",
        "No amaretto, orgeat, or nut milks.",
        "Nothing made with peanuts.",
        "No soy milk.",
        "Nothing made with sesame.",
        "No Bloody Mary, Caesar, michelada, or clam juice.",
      ].some((line) => capturedPrompt.includes(line)),
      false
    );
  }
  {
    const recipe = makeRecipeRecord({ id: "recipe-18b" });
    const profile = makeProfileRecord({ alcohol_ok: true, allergies: { big9: ["shellfish"], other: [] } });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-18b",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    const occurrences = capturedPrompt.split("No Bloody Mary, Caesar, michelada, or clam juice.").length - 1;
    check("shellfish-only drinker: fish/shellfish exclusion line appears exactly once (never doubled)", occurrences, 1);
  }

  // -------------------------------------------------------------------------
  // 17. drink_preference containing an alcohol term is omitted entirely for
  //     non-drinkers; included unchanged for drinkers; included for
  //     non-drinkers when it names no alcohol term.
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({ id: "recipe-17a" });
    const profile = makeProfileRecord({ alcohol_ok: false, drink_preference: "I used to love whiskey" });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-17a",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(NON_DRINKER_ITEMS);
        },
      })
    );

    check(
      "non-drinker drink_preference naming an alcohol term: <drink_preference> tag omitted",
      capturedPrompt.includes("<drink_preference>"),
      false
    );
    check(
      'non-drinker drink_preference naming an alcohol term: "whiskey" appears nowhere in the prompt',
      capturedPrompt.toLowerCase().includes("whiskey"),
      false
    );
  }
  {
    const recipe = makeRecipeRecord({ id: "recipe-17b" });
    const profile = makeProfileRecord({ alcohol_ok: false, drink_preference: "tea and sparkling water" });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-17b",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(NON_DRINKER_ITEMS);
        },
      })
    );

    check(
      "non-drinker drink_preference naming no alcohol term: <drink_preference> tag present",
      capturedPrompt.includes("<drink_preference>tea and sparkling water</drink_preference>"),
      true
    );
  }
  {
    const recipe = makeRecipeRecord({ id: "recipe-17c" });
    const profile = makeProfileRecord({ alcohol_ok: true, drink_preference: "I love wine, but only red" });

    let capturedPrompt = "";
    await getPairingsForRecipe(
      "recipe-17c",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(DRINKER_ITEMS);
        },
      })
    );

    check(
      "drinker drink_preference naming an alcohol term: <drink_preference> tag present unchanged",
      capturedPrompt.includes("<drink_preference>I love wine, but only red</drink_preference>"),
      true
    );
  }

  // -------------------------------------------------------------------------
  // 18. Dish occasion classification (title + description only).
  // -------------------------------------------------------------------------
  {
    check(
      "classifyDishOccasion: 'Kid-Friendly Mac and Cheese' -> no_alcohol",
      classifyDishOccasion(
        makeRecipeRecord({
          title: "Kid-Friendly Mac and Cheese",
          description: "A creamy, comforting pasta bake the whole family loves.",
        })
      ),
      "no_alcohol"
    );
    check(
      "classifyDishOccasion: 'Braised Short Rib' -> normal",
      classifyDishOccasion(
        makeRecipeRecord({
          title: "Braised Short Rib",
          description: "A slow-cooked, red-wine braised short rib.",
        })
      ),
      "normal"
    );
  }

  // -------------------------------------------------------------------------
  // 19. A no_alcohol dish (smoothie) forces non-drinker generation for a
  //     drinker, for this generation only; any alcoholic item that still
  //     comes back is dropped by the filter.
  // -------------------------------------------------------------------------
  {
    const recipe = makeRecipeRecord({
      id: "recipe-19",
      title: "Mango Banana Smoothie",
      description: "A creamy, fruit-forward blended smoothie.",
    });
    const profile = makeProfileRecord({
      alcohol_ok: true,
      allergies: { big9: [], other: [] },
      drink_preference: null,
    });

    const mixedItems: PairingItem[] = [
      { name: "Mimosa", why: "Bright and bubbly, a brunch classic.", is_alcoholic: true },
      { name: "Sparkling Blackberry Shrub", why: "Tart and fizzy, echoes the fruit.", is_alcoholic: false },
      { name: "Hibiscus Cooler", why: "Bright and floral against the mango.", is_alcoholic: false },
      { name: "Cucumber Mint Soda", why: "Clean and refreshing alongside the smoothie.", is_alcoholic: false },
      { name: "Ginger Fizz", why: "Zesty and light, a nice contrast to the sweetness.", is_alcoholic: false },
    ];

    let capturedPrompt = "";
    const result = await getPairingsForRecipe(
      "recipe-19",
      "user-1",
      makeOverrides(recipe, profile, {
        callAI: async (systemPrompt) => {
          capturedPrompt = systemPrompt;
          return JSON.stringify(mixedItems);
        },
      })
    );

    check(
      "smoothie for a drinker: non-drinker block phrase present in prompt",
      capturedPrompt.includes("Give each a descriptive, appetizing name based on what's in it"),
      true
    );
    check(
      "smoothie for a drinker: drinker-only phrase absent from prompt",
      capturedPrompt.includes("Always include at least 1 non-alcoholic option."),
      false
    );
    check("smoothie for a drinker: result status is ok", result.status, "ok");

    let itemNames: string[] = [];
    if (result.status === "ok") {
      itemNames = result.items.map((i) => i.name);
    }
    check("smoothie for a drinker: alcoholic 'Mimosa' dropped from final result", itemNames.includes("Mimosa"), false);
  }

  console.log();
  console.log("=".repeat(80));
  console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log("=".repeat(80));

  if (fail > 0) {
    process.exit(1);
  }
}

await run();
