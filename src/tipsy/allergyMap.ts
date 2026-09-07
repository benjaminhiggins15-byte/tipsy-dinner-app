// Deterministic (non-AI) mapping from free-text allergy words to the Big-9
// canonical id set. This is a normalization convenience only — it does NOT
// decide what is or isn't an allergy (that judgment call already happened
// upstream, in the ALLERGY/DISLIKES composer in data.ts). Its only job is to
// take items already bucketed as "hard allergy" and canonicalize the ones it
// confidently recognizes.
//
// Fail-closed rule: nothing is ever dropped. An item that doesn't confidently
// match a Big-9 id is preserved verbatim in `other`, never discarded.
export type Big9Id =
  | "egg"
  | "milk"
  | "fish"
  | "shellfish"
  | "tree_nut"
  | "peanut"
  | "wheat"
  | "soy"
  | "sesame";

export interface StructuredAllergies {
  big9: Big9Id[];
  other: string[];
  // Present only when the upstream composer failed/timed out/produced an
  // unparseable answer — distinguishes "we couldn't structure this" from
  // "asked, and there's genuinely nothing in `other` either."
  unparsed?: true;
}

// The full Big-9 set, used as the fail-closed default for a NULL (never
// asked) profile in effectiveAllergensForScan below.
export const ALL_BIG9_IDS: Big9Id[] = [
  "egg",
  "milk",
  "fish",
  "shellfish",
  "tree_nut",
  "peanut",
  "wheat",
  "soy",
  "sesame",
];

// Longer/multi-word keys are matched before their component single words
// (see matchAllergyItem) so "tree nut" isn't shadowed by a bare "nut" match
// that doesn't exist, and so compound phrases resolve to one clean id.
const ALLERGEN_SYNONYM_MAP: Record<string, Big9Id> = {
  // shellfish
  shellfish: "shellfish",
  shrimp: "shellfish",
  shrimps: "shellfish",
  prawn: "shellfish",
  prawns: "shellfish",
  lobster: "shellfish",
  crab: "shellfish",
  crabs: "shellfish",
  crayfish: "shellfish",
  crawfish: "shellfish",
  langoustine: "shellfish",
  scallop: "shellfish",
  scallops: "shellfish",
  mussel: "shellfish",
  mussels: "shellfish",
  clam: "shellfish",
  clams: "shellfish",
  oyster: "shellfish",
  oysters: "shellfish",
  squid: "shellfish",
  calamari: "shellfish",

  // fish
  fish: "fish",
  salmon: "fish",
  tuna: "fish",
  cod: "fish",
  anchovy: "fish",
  anchovies: "fish",
  halibut: "fish",
  tilapia: "fish",
  trout: "fish",
  bass: "fish",
  mackerel: "fish",
  sardine: "fish",
  sardines: "fish",
  herring: "fish",
  // hidden carrier: Worcestershire sauce is traditionally anchovy-based
  worcestershire: "fish",

  // milk
  milk: "milk",
  dairy: "milk",
  lactose: "milk",
  cheese: "milk",
  butter: "milk",
  cream: "milk",
  yogurt: "milk",
  yoghurt: "milk",
  // hidden carriers
  ghee: "milk",
  paneer: "milk",

  // egg
  egg: "egg",
  eggs: "egg",
  albumen: "egg",
  mayonnaise: "egg",
  mayo: "egg",
  // hidden carriers — dish/product names that reliably contain egg even when
  // "egg" itself never appears in the ingredient text. Known-carriers list,
  // not exhaustive.
  brioche: "egg",
  aioli: "egg",
  carbonara: "egg",
  custard: "egg",
  meringue: "egg",
  hollandaise: "egg",
  frittata: "egg",
  quiche: "egg",

  // peanut
  peanut: "peanut",
  peanuts: "peanut",
  groundnut: "peanut",
  groundnuts: "peanut",

  // tree_nut
  "tree nut": "tree_nut",
  "tree nuts": "tree_nut",
  treenut: "tree_nut",
  treenuts: "tree_nut",
  almond: "tree_nut",
  almonds: "tree_nut",
  walnut: "tree_nut",
  walnuts: "tree_nut",
  cashew: "tree_nut",
  cashews: "tree_nut",
  pecan: "tree_nut",
  pecans: "tree_nut",
  pistachio: "tree_nut",
  pistachios: "tree_nut",
  hazelnut: "tree_nut",
  hazelnuts: "tree_nut",
  macadamia: "tree_nut",
  macadamias: "tree_nut",
  "brazil nut": "tree_nut",
  "brazil nuts": "tree_nut",
  chestnut: "tree_nut",
  chestnuts: "tree_nut",

  // wheat (gluten is broader than wheat, but for capture purposes the
  // closest Big-9 id is wheat; the raw word survives too when it doesn't
  // match anything more specific — see PART 2 note in the calling code)
  wheat: "wheat",
  gluten: "wheat",
  // hidden carriers
  panko: "wheat",
  couscous: "wheat",
  seitan: "wheat",

  // soy
  soy: "soy",
  soya: "soy",
  soybean: "soy",
  soybeans: "soy",
  edamame: "soy",
  tofu: "soy",
  // hidden carriers
  miso: "soy",
  tempeh: "soy",
  tamari: "soy",

  // sesame
  sesame: "sesame",
  tahini: "sesame",
};

// Multi-word keys first so e.g. "tree nut" matches before scanning falls
// through to component words.
const SORTED_KEYS = Object.keys(ALLERGEN_SYNONYM_MAP).sort((a, b) => b.length - a.length);

function singularize(word: string): string {
  return word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word;
}

// Matches a single allergy item (already split out of the comma-separated
// ALLERGY line) against the synonym map. Tries a direct whole-item match
// first (the common case — most items are a single word or short phrase),
// then falls back to a word-boundary scan so compound phrases like "shrimp
// and crab" still resolve to both ids instead of neither.
function matchAllergyItem(item: string): Big9Id[] {
  const normalized = item.toLowerCase().trim();
  if (!normalized) return [];

  const direct = ALLERGEN_SYNONYM_MAP[normalized] || ALLERGEN_SYNONYM_MAP[singularize(normalized)];
  if (direct) return [direct];

  const found = new Set<Big9Id>();
  for (const key of SORTED_KEYS) {
    const pattern = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(normalized)) found.add(ALLERGEN_SYNONYM_MAP[key]);
  }
  return Array.from(found);
}

// Takes the raw content of the composer's ALLERGY line (e.g. "shellfish,
// tree nuts" or "None") and returns the structured big9/other split.
// Case-insensitive, trims, handles simple plurals. Never throws, never drops
// an item — anything unmatched survives verbatim in `other`.
export function mapAllergyItems(allergyContent: string): { big9: Big9Id[]; other: string[] } {
  const trimmed = allergyContent.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return { big9: [], other: [] };
  }

  const items = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  const big9Set = new Set<Big9Id>();
  const other: string[] = [];

  for (const item of items) {
    const matched = matchAllergyItem(item);
    if (matched.length > 0) {
      matched.forEach((id) => big9Set.add(id));
    } else {
      other.push(item);
    }
  }

  return { big9: Array.from(big9Set), other };
}

// Human-readable labels for prompt text and user-facing failure copy.
export const BIG9_DISPLAY_NAMES: Record<Big9Id, string> = {
  egg: "egg",
  milk: "milk",
  fish: "fish",
  shellfish: "shellfish",
  tree_nut: "tree nuts",
  peanut: "peanut",
  wheat: "wheat",
  soy: "soy",
  sesame: "sesame",
};

// Scans an arbitrary block of text (not a single comma-split item) for any
// Big-9 synonym, including the hidden-carrier dish names above. Client-side
// sibling of compute-slice/index.ts's scanTextForBig9Ids — duplicated, not
// imported, same cross-boundary convention as this file's other exports
// (compute-slice is Deno/Edge Function code, a different runtime and build
// system from this client bundle).
export function scanTextForBig9Ids(text: string): Big9Id[] {
  const normalized = text.toLowerCase();
  const found = new Set<Big9Id>();
  for (const key of SORTED_KEYS) {
    const pattern = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(normalized)) found.add(ALLERGEN_SYNONYM_MAP[key]);
  }
  return Array.from(found);
}

// Extracts the raw failed-answer text from an unparsed allergies record
// ({big9:[], other:[rawAnswer], unparsed:true} — see
// composeConstraintsAndAllergies in data.ts). Returns '' for any record that
// isn't unparsed:true or has no usable `other` strings. Mirrors
// compute-slice/index.ts's getUnparsedRawText exactly.
export function getUnparsedRawText(allergies: StructuredAllergies | null | undefined): string {
  if (!allergies || allergies.unparsed !== true) return "";
  if (!Array.isArray(allergies.other)) return "";
  return allergies.other.filter((x): x is string => typeof x === "string").join(" ").trim();
}

// The allergen id set to actually gate/scan against for a given profile,
// merging the same two deterministic sources compute-slice's
// deriveBig9Gates/deriveUnparsedBackstopGates merge, in the same priority:
// a successfully-parsed big9 list wins; an unparsed record falls back to a
// deterministic scan of its raw failed-answer text.
//
// A NULL profile (never asked) is fail-closed HERE, deliberately diverging
// from compute-slice's documented null-is-unprotected boundary: this is the
// live Build/cook-chat generation path, not the offline suggestion pool, and
// an adversarial test proved that resolving null to an empty scan set let
// the deterministic backstop scan for nothing — silently relying only on the
// (non-deterministic) system-prompt instruction. A never-asked user is now
// treated as at-risk for all nine allergens (ALL_BIG9_IDS), same posture as
// buildSystemPrompt's own null-profile prompt block. This does NOT change
// compute-slice — that null-user gap is separate and out of scope here.
//
// This must stay distinct from a CONFIRMED-no-allergies profile
// ({big9: [], other: []}, no unparsed flag): that is a real, asked-and-empty
// answer and correctly resolves to an empty scan set (no blocking) below —
// only the null/undefined case flips to the full set.
//
// Intentionally Big-9-only: it does not replicate deriveDietaryGates' prose
// scanning (vegan/vegetarian/pork have no Big-9 concept and are out of scope
// for allergen enforcement).
export function effectiveAllergensForScan(allergies: StructuredAllergies | null | undefined): Big9Id[] {
  if (!allergies) return ALL_BIG9_IDS;
  if (Array.isArray(allergies.big9) && allergies.big9.length > 0) return allergies.big9;
  const rawText = getUnparsedRawText(allergies);
  if (!rawText) return [];
  return scanTextForBig9Ids(rawText);
}

export interface Big9Hit {
  allergen: Big9Id;
  ingredient: string;
  matchedTerm: string;
}

// Scans a generated recipe's ingredient list for any of the user's own
// Big-9 allergens (targetIds), including hidden-carrier dish names. Each
// ingredient's name + qty text is scanned independently (mirrors
// matrix-pipeline.mjs's ingredientItemTexts pattern) so a hit can be
// attributed to the specific offending ingredient, not just the recipe as a
// whole. Only checks terms whose mapped id is in targetIds — this is a
// per-user check, not a full Big-9 sweep. Returns [] when clean or when
// targetIds is empty (nothing to check against).
export function scanIngredientsForBig9(
  ingredients: { name: string; qty: string }[],
  targetIds: Big9Id[],
): Big9Hit[] {
  if (targetIds.length === 0) return [];
  const targetSet = new Set(targetIds);
  const hits: Big9Hit[] = [];

  for (const ing of ingredients) {
    const text = `${ing.name} ${ing.qty}`.toLowerCase();
    for (const key of SORTED_KEYS) {
      const allergen = ALLERGEN_SYNONYM_MAP[key];
      if (!targetSet.has(allergen)) continue;
      const pattern = new RegExp(`\\b${key.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (pattern.test(text)) {
        hits.push({ allergen, ingredient: ing.name, matchedTerm: key });
      }
    }
  }

  return hits;
}

// Scans a single block of user-visible free text (a recipe's title,
// description, or a step's title/instruction — NOT the comma-split
// ingredient list, which scanIngredientsForBig9 handles) for the user's own
// Big-9 allergens. Reuses scanTextForBig9Ids as the detection engine — same
// synonym/carrier map, no second detection path — and reshapes its output
// into the same Big9Hit shape scanIngredientsForBig9 returns, so a caller can
// treat an ingredient-list hit and a prose hit identically. `source` labels
// where the hit was found (e.g. "title", "description", "step 2") since
// there is no ingredient name to attribute a prose hit to. Fixes a real
// fail-open: an ingredient list can be clean while the recipe's own
// description narrates the allergen in prose (e.g. "egg yolk emulsified into
// a silky sauce") — text the user actually reads.
export function scanFreeTextForBig9(text: string, targetIds: Big9Id[], source: string): Big9Hit[] {
  if (targetIds.length === 0 || !text) return [];
  const targetSet = new Set(targetIds);
  return scanTextForBig9Ids(text)
    .filter((allergen) => targetSet.has(allergen))
    .map((allergen) => ({ allergen, ingredient: source, matchedTerm: `(mentioned in ${source})` }));
}
