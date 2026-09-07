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

  // milk
  milk: "milk",
  dairy: "milk",
  lactose: "milk",
  cheese: "milk",
  butter: "milk",
  cream: "milk",
  yogurt: "milk",
  yoghurt: "milk",

  // egg
  egg: "egg",
  eggs: "egg",
  albumen: "egg",
  mayonnaise: "egg",
  mayo: "egg",

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

  // soy
  soy: "soy",
  soya: "soy",
  soybean: "soy",
  soybeans: "soy",
  edamame: "soy",
  tofu: "soy",

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
