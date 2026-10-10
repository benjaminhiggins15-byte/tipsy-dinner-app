// Deterministic (non-AI) safety filter for AI-generated drink pairings.
// Pure functions only — no AI calls, no UI, no DB/edge-function access.
//
// Allergen resolution and the Big-9 free-text scan are REUSED, read-only,
// from the same engine the Build/cook-chat allergy-hardening path uses
// (src/tipsy/allergyMap.ts, wired into src/tipsy/App.tsx's
// scanRecipeDraftForBig9 at the effectiveAllergensForScan/scanFreeTextForBig9
// call sites). ALLERGEN_SYNONYM_MAP itself is never touched here.
import {
  type Big9Id,
  type StructuredAllergies,
  effectiveAllergensForScan,
  scanFreeTextForBig9,
} from "./allergyMap";

// Thin wrapper, not a reimplementation — this IS
// allergyMap.ts's effectiveAllergensForScan, the same resolver Build/cook-chat
// uses (App.tsx ~5783/5964/6270): NULL allergies -> all nine Big-9 ids
// (fail-closed), confirmed-none ({big9:[], other:[]}) -> empty set, unparsed
// -> deterministic scan of the raw failed-answer text.
export function resolveAllergenSet(
  allergies: StructuredAllergies | null | undefined
): Big9Id[] {
  return effectiveAllergensForScan(allergies);
}

// Pairings-only hidden-carrier list: drink/cocktail names that carry a Big-9
// allergen even when the allergen word itself never appears (e.g. "IPA" never
// says "wheat"; "Baileys" never says "milk"). Deliberately separate from
// ALLERGEN_SYNONYM_MAP in allergyMap.ts, which is about raw ingredient text,
// not drink/cocktail names — merging them would risk off-target matches in
// the ingredient-scanning paths that map already serves. A term may appear
// under more than one Big-9 id (e.g. "eggnog" under both milk and egg;
// "clamato"/"caesar"/"michelada" under both fish and shellfish) since a
// single drink can carry more than one allergen.
//
// Conflict check against ALLERGEN_SYNONYM_MAP (read-only reuse, not
// modified): no term below maps to a DIFFERENT Big9 id than an identical key
// already in that map. Two terms ("peanut", "hazelnut") already exist there
// mapped to the same ids used below (peanut, tree_nut) — harmless redundant
// overlap, not a conflict. Several other terms here (e.g. "almond milk",
// "cashew milk") would already be caught by that map's bare "almond"/"cashew"
// entries via word-boundary matching too; they're listed explicitly anyway
// for clarity of this list's own intent. Terms like "eggnog", "latte",
// "IPA", "baileys" have no equivalent in the ingredient map at all — that's
// the actual gap this list exists to close.
const DRINK_CARRIER_TERMS: ReadonlyArray<{ term: string; big9: Big9Id }> = [
  // wheat
  { term: "beer", big9: "wheat" },
  { term: "ale", big9: "wheat" },
  { term: "lager", big9: "wheat" },
  { term: "stout", big9: "wheat" },
  { term: "porter", big9: "wheat" },
  { term: "ipa", big9: "wheat" },
  { term: "pilsner", big9: "wheat" },
  { term: "hefeweizen", big9: "wheat" },
  { term: "wheat beer", big9: "wheat" },
  { term: "malt", big9: "wheat" },
  { term: "barley", big9: "wheat" },
  { term: "kvass", big9: "wheat" },

  // milk
  { term: "baileys", big9: "milk" },
  { term: "irish cream", big9: "milk" },
  { term: "cream liqueur", big9: "milk" },
  { term: "rumchata", big9: "milk" },
  { term: "eggnog", big9: "milk" },
  { term: "white russian", big9: "milk" },
  { term: "milk punch", big9: "milk" },
  { term: "latte", big9: "milk" },
  { term: "cappuccino", big9: "milk" },
  { term: "chai latte", big9: "milk" },
  { term: "milkshake", big9: "milk" },
  { term: "lassi", big9: "milk" },
  { term: "horchata", big9: "milk" },
  { term: "affogato", big9: "milk" },

  // egg
  { term: "egg white", big9: "egg" },
  { term: "sour", big9: "egg" },
  { term: "fizz", big9: "egg" },
  { term: "flip", big9: "egg" },
  { term: "clover club", big9: "egg" },
  { term: "eggnog", big9: "egg" },
  { term: "ramos", big9: "egg" },

  // tree_nut
  { term: "amaretto", big9: "tree_nut" },
  { term: "frangelico", big9: "tree_nut" },
  { term: "nocello", big9: "tree_nut" },
  { term: "nocino", big9: "tree_nut" },
  { term: "disaronno", big9: "tree_nut" },
  { term: "orgeat", big9: "tree_nut" },
  { term: "almond milk", big9: "tree_nut" },
  { term: "hazelnut", big9: "tree_nut" },
  { term: "cashew milk", big9: "tree_nut" },

  // peanut
  { term: "peanut", big9: "peanut" },

  // soy
  { term: "soy milk", big9: "soy" },
  { term: "soy latte", big9: "soy" },

  // fish
  { term: "bloody mary", big9: "fish" },
  { term: "caesar", big9: "fish" },
  { term: "michelada", big9: "fish" },
  { term: "clamato", big9: "fish" },

  // shellfish
  { term: "clamato", big9: "shellfish" },
  { term: "caesar", big9: "shellfish" },
  { term: "michelada", big9: "shellfish" },
];

// Bare alcohol vocabulary — used only when the user is NOT alcohol-ok, to
// catch an item mislabeled is_alcoholic:false (or simply named/described in a
// way that reveals it's alcoholic) that the boolean flag alone would miss.
export const ALCOHOL_TERMS: readonly string[] = [
  "wine", "beer", "ale", "lager", "stout", "porter", "ipa", "pilsner",
  "cider", "mead", "sake", "soju", "shochu", "baijiu", "champagne",
  "prosecco", "cava", "cocktail", "martini", "margarita", "negroni",
  "spritz", "vodka", "gin", "rum", "tequila", "mezcal", "whiskey",
  "whisky", "bourbon", "scotch", "brandy", "cognac", "liqueur", "vermouth",
  "amaro", "aperol", "campari", "port", "sherry", "absinthe", "schnapps",
  "grappa", "hard seltzer", "sangria", "mimosa", "bellini",
];

// Word-boundary, case-insensitive test. Multi-word terms match across
// run-on whitespace the same way allergyMap.ts's own key-matching does
// (`key.replace(/\s+/g, "\\s+")`). Escapes regex metacharacters defensively —
// none of the configured terms currently need it, but a future addition
// might.
function wordBoundaryMatch(term: string, text: string): boolean {
  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => wordBoundaryMatch(term, text));
}

function matchesCarrierForAllergens(text: string, allergySet: ReadonlySet<Big9Id>): boolean {
  if (allergySet.size === 0) return false;
  return DRINK_CARRIER_TERMS.some(
    ({ term, big9 }) => allergySet.has(big9) && wordBoundaryMatch(term, text)
  );
}

export interface PairingItem {
  name: string;
  why: string;
  is_alcoholic: boolean;
}

export interface FilterPairingsOptions {
  // true = user is open to alcohol; false or null = treat as not alcohol-ok
  // (null is the "never asked / not parsed yet" case — fails closed, same
  // direction as alcohol_ok's own fail-closed default elsewhere in the app).
  alcoholOk: boolean | null;
  // Pre-resolved via resolveAllergenSet (or any caller that already has the
  // Big-9 ids) — filterPairings itself does no allergy-record parsing.
  allergySet: Big9Id[];
  otherAllergyTerms?: string[];
}

export interface FilterPairingsResult {
  items: PairingItem[];
  complete: boolean;
}

function isWellFormedPairingItem(value: unknown): value is PairingItem {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" && obj.name.trim().length > 0 &&
    typeof obj.why === "string" && obj.why.trim().length > 0 &&
    typeof obj.is_alcoholic === "boolean"
  );
}

function isAlcoholTextMatch(item: PairingItem): boolean {
  return matchesAnyTerm(`${item.name} ${item.why}`, ALCOHOL_TERMS);
}

// Drops malformed items, then applies the alcohol gate and the three-source
// allergen scan ((a) shared Big-9 free-text scan, reused from allergyMap.ts;
// (b) the pairings-only drink-carrier list above; (c) the user's own free-
// text "other" allergy terms) to name+why. Keeps at most the first 4
// survivors, in input order.
export function filterPairings(
  items: unknown[],
  options: FilterPairingsOptions
): FilterPairingsResult {
  const { alcoholOk, allergySet, otherAllergyTerms = [] } = options;
  const allergySetSet = new Set(allergySet);
  const survivors: PairingItem[] = [];

  for (const raw of items) {
    if (!isWellFormedPairingItem(raw)) continue;
    const combinedText = `${raw.name} ${raw.why}`;

    if (alcoholOk !== true) {
      if (raw.is_alcoholic === true) continue;
      if (matchesAnyTerm(combinedText, ALCOHOL_TERMS)) continue;
    }

    if (scanFreeTextForBig9(combinedText, allergySet, "pairing").length > 0) continue;
    if (matchesCarrierForAllergens(combinedText, allergySetSet)) continue;
    if (otherAllergyTerms.length > 0 && matchesAnyTerm(combinedText, otherAllergyTerms)) continue;

    survivors.push(raw);
    if (survivors.length >= 4) break;
  }

  let complete = survivors.length === 4;
  if (complete && alcoholOk === true) {
    const hasNonAlcoholic = survivors.some(
      (item) => item.is_alcoholic === false && !isAlcoholTextMatch(item)
    );
    if (!hasNonAlcoholic) complete = false;
  }

  return { items: survivors, complete };
}
