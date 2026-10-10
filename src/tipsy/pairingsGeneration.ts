// Generation + caching for AI drink pairings. This is the code that actually
// asks the AI for pairings and runs the result through the deterministic
// safety filter (pairingsSafety.ts) — no UI, no screen wiring here.
//
// All AI and DB access is reachable only through the `overrides` parameter
// of getPairingsForRecipe, mirroring saveDrinkPreference's overrides
// convention in data.ts: production call sites get the real fetch/Supabase
// defaults for free; tests inject fakes and never touch either.
import { supabase } from "../lib/supabase";
import { type RecipeStep, normalizeStep, parseSSEStream } from "./data";
import { type Big9Id, type StructuredAllergies, BIG9_DISPLAY_NAMES } from "./allergyMap";
import { filterPairings, resolveAllergenSet, type PairingItem } from "./pairingsSafety";

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
// trusted or persisted, same two-layer posture as Build/cook-chat's
// prompt-level salience + scanRecipeDraftForBig9 backstop.
function buildPairingsSystemPrompt(
  recipe: PairingsFingerprintRecipeContent,
  profile: PairingsFingerprintProfileInputs
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
    .select("drink_preference, alcohol_ok, allergies")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return {
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
// Orchestration
// ---------------------------------------------------------------------------

export interface PairingsGenerationOverrides {
  fetchRecipe?: FetchPairingsRecipe;
  fetchProfile?: FetchPairingsProfile;
  callAI?: CallPairingsAI;
  persistPairings?: PersistPairings;
}

export interface PairingsGenerationResult {
  items: PairingItem[];
  complete: boolean;
}

// Dedupes concurrent requests for the same recipe's pairings so two
// near-simultaneous opens of the Pairings tab can never trigger two AI
// calls — same shared-in-flight-promise shape as Onboarding's
// onboardingHandoffPromiseRef/runHandoffOnce, keyed per recipe here since
// more than one recipe's pairings can legitimately be in flight at once.
const inFlightByRecipeId = new Map<string, Promise<PairingsGenerationResult>>();

// The single entry point: read the recipe's cached pairings + current
// profile inputs fresh from the DB (never from passed-in app state),
// compute today's fingerprint, and either re-filter the cached result (fast
// path — also acts as a defense-in-depth re-check in case the safety filter
// itself has since changed) or call the AI and persist a fresh one (the
// fingerprint-mismatch path — this is what actually replaces stale pairings
// when allergies/preferences change). Every return path, cached or fresh,
// passes through filterPairings before the caller ever sees it.
export async function getPairingsForRecipe(
  recipeId: string,
  userId: string,
  overrides: PairingsGenerationOverrides = {}
): Promise<PairingsGenerationResult> {
  const existing = inFlightByRecipeId.get(recipeId);
  if (existing) return existing;

  const run = (async (): Promise<PairingsGenerationResult> => {
    const fetchRecipe = overrides.fetchRecipe ?? fetchRecipeFromDb;
    const fetchProfile = overrides.fetchProfile ?? fetchProfileFromDb;
    const callAI = overrides.callAI ?? callPairingsAIViaEdgeFunction;
    const persistPairings = overrides.persistPairings ?? persistPairingsToDb;

    const [recipe, profile] = await Promise.all([
      fetchRecipe(recipeId, userId),
      fetchProfile(userId),
    ]);

    const profileInputs: PairingsFingerprintProfileInputs = {
      drinkPreference: profile.drink_preference,
      alcoholOk: profile.alcohol_ok,
      allergies: profile.allergies,
    };
    const currentFingerprint = computePairingsFingerprint(recipe, profileInputs);

    const filterOptions = {
      alcoholOk: profile.alcohol_ok,
      allergySet: resolveAllergenSet(profile.allergies),
      otherAllergyTerms: profile.allergies?.other ?? [],
    };

    if (recipe.pairings !== null && recipe.pairings_fingerprint === currentFingerprint) {
      const cachedItems = Array.isArray(recipe.pairings) ? recipe.pairings : [];
      return filterPairings(cachedItems, filterOptions);
    }

    const systemPrompt = buildPairingsSystemPrompt(recipe, profileInputs);
    const rawResponse = await callAI(systemPrompt, userId);
    const parsedItems = parsePairingsResponse(rawResponse);
    const filtered = filterPairings(parsedItems, filterOptions);

    await persistPairings(recipeId, userId, filtered.items, currentFingerprint);

    return filtered;
  })();

  inFlightByRecipeId.set(recipeId, run);
  try {
    return await run;
  } finally {
    inFlightByRecipeId.delete(recipeId);
  }
}
