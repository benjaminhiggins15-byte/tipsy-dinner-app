// Generation + caching for AI drink pairings. This is the code that actually
// asks the AI for pairings and runs the result through the deterministic
// safety filter (pairingsSafety.ts) — no UI, no screen wiring here.
//
// All AI and DB access is reachable only through the `overrides` parameter
// of getPairingsForRecipe/regeneratePairings, mirroring saveDrinkPreference's
// overrides convention in data.ts: production call sites get the real
// fetch/Supabase defaults for free; tests inject fakes and never touch
// either.
//
// Hard rule: NO PARTIAL RESULTS, EVER. A caller only ever sees a complete,
// filtered, exactly-4-item set, or a "failed"/"off" status — never a
// shrunken or unfiltered one, cached or fresh.
import { supabase } from "../lib/supabase";
import { type RecipeStep, normalizeStep, parseSSEStream } from "./data";
import { type Big9Id, type StructuredAllergies, BIG9_DISPLAY_NAMES } from "./allergyMap";
import { filterPairings, resolveAllergenSet, type PairingItem, type FilterPairingsOptions } from "./pairingsSafety";

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

// Duplicated from compute-slice/index.ts's canonicalizeAllergiesForFingerprint
// / computeGateFingerprint on purpose, not shared — that function lives in an
// Edge Function (different runtime, not importable from client code), and
// allergyMap.ts already has a precedent for this exact kind of deliberate
// duplication (scanTextForBig9Ids there is a documented "sibling of
// compute-slice's scanTextForBig9Ids"). Same canonicalization rules apply:
// array order must not affect the fingerprint (sort before serializing), and
// a NULL ("never asked") allergies record must canonicalize to a value
// (`null`) distinct from a confirmed-empty one — they are different gating
// states, not coincidentally-equal empty results.
function canonicalizeAllergiesForFingerprint(
  allergies: StructuredAllergies | null | undefined
): unknown {
  if (allergies === null || allergies === undefined) return null;
  const big9 = [...allergies.big9].map(String).sort();
  const other = [...allergies.other].map(String).sort();
  return { big9, other, unparsed: allergies.unparsed === true };
}

export interface PairingsFingerprintRecipeContent {
  title: string;
  ingredients?: { name: string; qty: string }[];
  steps?: RecipeStep[];
}

export interface PairingsFingerprintProfileInputs {
  drinkPreference: string | null;
  alcoholOk: boolean | null;
  allergies: StructuredAllergies | null | undefined;
}

// Pins the pairings cache to both the recipe's own content (title +
// ingredients + steps — any edit invalidates the cache) and the profile
// inputs pairings were generated under (drink_preference + alcohol_ok +
// allergies — any of those changing invalidates it too). A mismatch means
// regenerate, never trust-the-stale-cache, mirroring
// user_recipe_slices.gate_fingerprint in compute-slice.
export function computePairingsFingerprint(
  recipe: PairingsFingerprintRecipeContent,
  profile: PairingsFingerprintProfileInputs
): string {
  const ingredients = (recipe.ingredients ?? []).map((ingredient) => ({
    name: ingredient.name ?? "",
    qty: ingredient.qty ?? "",
  }));
  const steps = (recipe.steps ?? []).map((step) => normalizeStep(step));

  return JSON.stringify({
    recipe: {
      title: recipe.title ?? "",
      ingredients,
      steps,
    },
    profile: {
      drinkPreference: profile.drinkPreference ?? null,
      alcoholOk: profile.alcoholOk,
      allergies: canonicalizeAllergiesForFingerprint(profile.allergies),
    },
  });
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function allergyBlockForPrompt(allergies: StructuredAllergies | null | undefined): string {
  const allergySet = resolveAllergenSet(allergies);
  const otherTerms = allergies?.other ?? [];
  if (allergySet.length === 0 && otherTerms.length === 0) return "";

  const parts: string[] = [];
  if (allergySet.length > 0) {
    parts.push(allergySet.map((id) => BIG9_DISPLAY_NAMES[id]).join(", "));
  }
  if (otherTerms.length > 0) {
    parts.push(otherTerms.join(", "));
  }
  return `\nALLERGY — avoid suggesting any drink that contains or is traditionally made with: ${parts.join(", ")}. This includes hidden carriers (e.g. a beer-style drink contains wheat; a cream liqueur contains milk).\n`;
}

// Quality layer only — NOT the enforcement boundary. filterPairings (the
// deterministic, non-AI backstop) always runs on this output before it is
// trusted, retried-around, or persisted, same two-layer posture as
// Build/cook-chat's prompt-level salience + scanRecipeDraftForBig9 backstop.
//
// `excludeNames` serves two callers with one mechanism: a retry after a
// failed/incomplete attempt (avoid repeating what was just rejected) and
// regeneratePairings (avoid repeating what's already cached) both just need
// "don't suggest these names again" — the reason doesn't change the ask.
function buildPairingsSystemPrompt(
  recipe: PairingsFingerprintRecipeContent,
  profile: PairingsFingerprintProfileInputs,
  excludeNames: string[] = []
): string {
  const ingredientLines = (recipe.ingredients ?? [])
    .map((i) => `- ${i.qty ? `${i.qty} ` : ""}${i.name}`)
    .join("\n");

  const alcoholOk = profile.alcoholOk === true;
  const drinkPreference = profile.drinkPreference?.trim();

  const drinkerInstructions = `This person is open to alcohol. Suggest exactly 4 pairings: 3 alcoholic and 1 non-alcoholic. Give the 3 alcoholic options real range — don't default to variations on the same drink (e.g. not three different wines). If the dish is a breakfast or brunch dish, feel free to flex toward more non-alcoholic options instead of forcing alcohol onto a morning meal.`;

  const nonDrinkerInstructions = `This person is not drinking alcohol. Suggest exactly 4 non-alcoholic pairings, each with its own descriptive, appetizing name (e.g. "Ginger Mule" or "Sparkling Blackberry Shrub") — never a "virgin ___" or "mocktail ___" label, and never comment on the fact that they don't drink alcohol.`;

  return `You are a knowledgeable sommelier and bartender suggesting drink pairings for a home-cooked dish.

DISH: ${recipe.title}
${ingredientLines ? `INGREDIENTS:\n${ingredientLines}\n` : ""}
${drinkPreference ? `This person's stated drink taste: "${drinkPreference}". Lean toward it where it fits the dish.\n` : ""}
${alcoholOk ? drinkerInstructions : nonDrinkerInstructions}
${allergyBlockForPrompt(profile.allergies)}
For every pairing, lead with how it fits THIS dish and this person's taste — never a generic or interchangeable blurb. Name drink styles, not brands (e.g. "a dry Riesling," not a specific label). Write one warm, economical sentence of "why" per pairing — no more.
${excludeNames.length > 0 ? `\nDo not suggest any of the following drinks — give different options instead: ${excludeNames.join(", ")}.\n` : ""}
Respond with ONLY raw JSON, nothing else — no preamble, no explanation, no markdown code fences. A JSON array of exactly 4 objects, each shaped:
{"name": "...", "why": "...", "is_alcoholic": true}`;
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

// Loose shape validation only — filterPairings is what actually enforces
// well-formedness (isWellFormedPairingItem) and safety. This just keeps a
// completely malformed AI response (not an array, or not JSON at all) from
// reaching filterPairings as something other than `unknown[]`.
function parsePairingsResponse(rawText: string): unknown[] {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Pairings generation: could not parse AI response as JSON", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Default (real) DB + AI dependencies
// ---------------------------------------------------------------------------

export interface PairingsRecipeRecord {
  id: string;
  title: string;
  ingredients: { name: string; qty: string }[];
  steps: RecipeStep[];
  pairings: unknown | null;
  pairings_fingerprint: string | null;
}

export interface PairingsProfileRecord {
  wants_pairings: boolean | null;
  drink_preference: string | null;
  alcohol_ok: boolean | null;
  allergies: StructuredAllergies | null;
}

export type FetchPairingsRecipe = (recipeId: string, userId: string) => Promise<PairingsRecipeRecord>;
export type FetchPairingsProfile = (userId: string) => Promise<PairingsProfileRecord>;
export type CallPairingsAI = (systemPrompt: string, userId: string) => Promise<string>;
export type PersistPairings = (
  recipeId: string,
  userId: string,
  pairings: PairingItem[],
  fingerprint: string
) => Promise<void>;

const fetchRecipeFromDb: FetchPairingsRecipe = async (recipeId, userId) => {
  const { data, error } = await supabase
    .from("recipes")
    .select(`
      id,
      title,
      steps,
      pairings,
      pairings_fingerprint,
      ingredients (
        name,
        quantity,
        sort_order
      )
    `)
    .eq("id", recipeId)
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  const rawIngredients = (data.ingredients ?? []) as { name: string; quantity: string; sort_order: number }[];
  return {
    id: data.id,
    title: data.title,
    ingredients: [...rawIngredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ name: i.name, qty: i.quantity })),
    steps: (data.steps ?? []) as RecipeStep[],
    pairings: data.pairings ?? null,
    pairings_fingerprint: data.pairings_fingerprint ?? null,
  };
};

const fetchProfileFromDb: FetchPairingsProfile = async (userId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("wants_pairings, drink_preference, alcohol_ok, allergies")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return {
    wants_pairings: data.wants_pairings ?? null,
    drink_preference: data.drink_preference ?? null,
    alcohol_ok: data.alcohol_ok ?? null,
    allergies: (data.allergies ?? null) as StructuredAllergies | null,
  };
};

const callPairingsAIViaEdgeFunction: CallPairingsAI = async (systemPrompt, userId) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase config missing");

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      systemPrompt,
      messages: [{ role: "user", content: "Suggest the pairings now." }],
      call_type: "pairings-gen",
      user_id: userId,
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
  if (!fullText.trim()) throw new Error("Empty response from pairings generation call");
  return fullText;
};

const persistPairingsToDb: PersistPairings = async (recipeId, userId, pairings, fingerprint) => {
  const { error } = await supabase
    .from("recipes")
    .update({ pairings, pairings_fingerprint: fingerprint })
    .eq("id", recipeId)
    .eq("user_id", userId);

  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Retry-bounded generation (shared by getPairingsForRecipe + regeneratePairings)
// ---------------------------------------------------------------------------

const MAX_GENERATION_ATTEMPTS = 3;

// Generates up to MAX_GENERATION_ATTEMPTS times, filtering every attempt.
// Returns the first COMPLETE filtered result; returns null if every attempt
// was incomplete (a malformed/unparseable response counts as an attempt,
// since parsePairingsResponse resolves it to [] rather than throwing).
// Never returns a partial/shrunken set — null means "all 3 attempts failed",
// full stop.
async function generatePairingsWithRetries(
  recipe: PairingsFingerprintRecipeContent,
  profileInputs: PairingsFingerprintProfileInputs,
  filterOptions: FilterPairingsOptions,
  callAI: CallPairingsAI,
  userId: string,
  initialExcludeNames: string[] = []
): Promise<{ items: PairingItem[] } | null> {
  const excludeNames = [...initialExcludeNames];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const systemPrompt = buildPairingsSystemPrompt(recipe, profileInputs, excludeNames);

    let parsedItems: unknown[];
    try {
      const rawResponse = await callAI(systemPrompt, userId);
      parsedItems = parsePairingsResponse(rawResponse);
    } catch (error) {
      console.error("Pairings generation: AI call failed", error);
      parsedItems = [];
    }

    const filtered = filterPairings(parsedItems, filterOptions);
    if (filtered.complete) {
      return { items: filtered.items };
    }

    const survivorNames = new Set(filtered.items.map((i) => i.name));
    for (const raw of parsedItems) {
      if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string") {
        const name = (raw as Record<string, unknown>).name as string;
        if (!survivorNames.has(name) && !excludeNames.includes(name)) excludeNames.push(name);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface PairingsGenerationOverrides {
  fetchRecipe?: FetchPairingsRecipe;
  fetchProfile?: FetchPairingsProfile;
  callAI?: CallPairingsAI;
  persistPairings?: PersistPairings;
}

// No other shapes, and no "complete" flag — a caller that gets "ok" can
// trust `items` is always the full, filtered 4-item set.
export type PairingsOutcome =
  | { status: "ok"; items: PairingItem[] }
  | { status: "off" }
  | { status: "failed" };

// Dedupes concurrent requests for the same recipe's pairings so two
// near-simultaneous opens of the Pairings tab (or a get racing a regenerate)
// can never trigger two AI calls — same shared-in-flight-promise shape as
// Onboarding's onboardingHandoffPromiseRef/runHandoffOnce, keyed per recipe
// here since more than one recipe's pairings can legitimately be in flight
// at once. Shared between getPairingsForRecipe and regeneratePairings.
const inFlightByRecipeId = new Map<string, Promise<PairingsOutcome>>();

function resolveDeps(overrides: PairingsGenerationOverrides) {
  return {
    fetchRecipe: overrides.fetchRecipe ?? fetchRecipeFromDb,
    fetchProfile: overrides.fetchProfile ?? fetchProfileFromDb,
    callAI: overrides.callAI ?? callPairingsAIViaEdgeFunction,
    persistPairings: overrides.persistPairings ?? persistPairingsToDb,
  };
}

function buildFilterOptions(profile: PairingsProfileRecord): FilterPairingsOptions {
  return {
    // alcohol_ok NULL is treated as not-alcohol-ok everywhere it's read —
    // filterPairings itself already fails closed on anything other than
    // `true` (`if (alcoholOk !== true) { ... }`), so passing the raw
    // (possibly null) value through here is correct, not an oversight.
    alcoholOk: profile.alcohol_ok,
    allergySet: resolveAllergenSet(profile.allergies),
    otherAllergyTerms: profile.allergies?.other ?? [],
  };
}

function runExclusive(recipeId: string, task: () => Promise<PairingsOutcome>): Promise<PairingsOutcome> {
  const existing = inFlightByRecipeId.get(recipeId);
  if (existing) return existing;

  const run = task();
  inFlightByRecipeId.set(recipeId, run);
  return run.finally(() => {
    inFlightByRecipeId.delete(recipeId);
  });
}

// The single read-path entry point: gated on wants_pairings, then reads the
// recipe's cached pairings + current profile inputs fresh from the DB
// (never from passed-in app state), computes today's fingerprint, and
// either re-filters the cached result (fast path — also acts as a
// defense-in-depth re-check in case the safety filter itself has since
// changed) or generates a fresh one (fingerprint mismatch, no cache yet, OR
// the cached set no longer passes the re-filter — all three are treated as
// a miss). A cache hit that fails the re-filter is NEVER returned shrunken;
// it falls through to full regeneration like any other miss.
export async function getPairingsForRecipe(
  recipeId: string,
  userId: string,
  overrides: PairingsGenerationOverrides = {}
): Promise<PairingsOutcome> {
  return runExclusive(recipeId, async () => {
    const { fetchRecipe, fetchProfile, callAI, persistPairings } = resolveDeps(overrides);

    const [recipe, profile] = await Promise.all([
      fetchRecipe(recipeId, userId),
      fetchProfile(userId),
    ]);

    if (profile.wants_pairings !== true) {
      return { status: "off" };
    }

    const profileInputs: PairingsFingerprintProfileInputs = {
      drinkPreference: profile.drink_preference,
      alcoholOk: profile.alcohol_ok,
      allergies: profile.allergies,
    };
    const currentFingerprint = computePairingsFingerprint(recipe, profileInputs);
    const filterOptions = buildFilterOptions(profile);

    if (recipe.pairings !== null && recipe.pairings_fingerprint === currentFingerprint) {
      const cachedItems = Array.isArray(recipe.pairings) ? recipe.pairings : [];
      const refiltered = filterPairings(cachedItems, filterOptions);
      if (refiltered.complete) {
        return { status: "ok", items: refiltered.items };
      }
      // Cache hit that fails the re-filter = miss. Fall through to generate.
    }

    const generated = await generatePairingsWithRetries(recipe, profileInputs, filterOptions, callAI, userId);
    if (!generated) {
      return { status: "failed" };
    }

    await persistPairings(recipeId, userId, generated.items, currentFingerprint);
    return { status: "ok", items: generated.items };
  });
}

// User-initiated "give me different ones." Ignores the cache entirely,
// tells the AI to avoid the currently-cached names, and runs the same
// filter/retry rules as getPairingsForRecipe. On success, overwrites the
// cache. On failure, writes nothing — the existing cached pairings are left
// exactly as they were (still usable on the next getPairingsForRecipe call,
// provided they still pass filterPairings; if they no longer would, that
// call's own cache-hit-fails-refilter=miss rule regenerates them then,
// which is the correct self-healing behavior either way).
export async function regeneratePairings(
  recipeId: string,
  userId: string,
  overrides: PairingsGenerationOverrides = {}
): Promise<PairingsOutcome> {
  return runExclusive(recipeId, async () => {
    const { fetchRecipe, fetchProfile, callAI, persistPairings } = resolveDeps(overrides);

    const [recipe, profile] = await Promise.all([
      fetchRecipe(recipeId, userId),
      fetchProfile(userId),
    ]);

    if (profile.wants_pairings !== true) {
      return { status: "off" };
    }

    const profileInputs: PairingsFingerprintProfileInputs = {
      drinkPreference: profile.drink_preference,
      alcoholOk: profile.alcohol_ok,
      allergies: profile.allergies,
    };
    const currentFingerprint = computePairingsFingerprint(recipe, profileInputs);
    const filterOptions = buildFilterOptions(profile);

    const currentNames = Array.isArray(recipe.pairings)
      ? (recipe.pairings as unknown[])
          .map((item) =>
            item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string"
              ? ((item as Record<string, unknown>).name as string)
              : null
          )
          .filter((name): name is string => name !== null)
      : [];

    const generated = await generatePairingsWithRetries(
      recipe,
      profileInputs,
      filterOptions,
      callAI,
      userId,
      currentNames
    );

    if (!generated) {
      return { status: "failed" };
    }

    await persistPairings(recipeId, userId, generated.items, currentFingerprint);
    return { status: "ok", items: generated.items };
  });
}
