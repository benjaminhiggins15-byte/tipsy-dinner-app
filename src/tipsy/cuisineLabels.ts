// Slug -> display-label map for suggested_recipe_pool.cuisine values.
//
// Slugs are sourced from the CUISINES array in scripts/matrix-pipeline.mjs
// (~lines 67-93) — that script is a Node-only ops CLI (reads
// process.env/argv, throws if service-role env vars are missing, imports the
// service-role Supabase client) — it cannot be imported into browser client
// code. Labels here are curated display names derived from that list, not a
// byte-for-byte copy: some are intentionally cleaned/collapsed for user
// display (e.g. "British Isles", "Caribbean", "Mediterranean") and will NOT
// match the pipeline's label verbatim. If a cuisine is added to the pipeline,
// add a display label here too.
const CUISINES: { label: string; slug: string }[] = [
  { label: "Italian", slug: "italian" },
  { label: "American Comfort", slug: "american_comfort" },
  { label: "Mexican", slug: "mexican" },
  { label: "American Southern", slug: "american_southern" },
  { label: "BBQ", slug: "bbq" },
  { label: "Chinese", slug: "chinese" },
  { label: "Japanese", slug: "japanese" },
  { label: "Indian", slug: "indian" },
  { label: "Modern California", slug: "modern_california" },
  { label: "Mediterranean", slug: "greek" },

  { label: "Thai", slug: "thai" },
  { label: "French", slug: "french" },
  { label: "Spanish", slug: "spanish" },
  { label: "Korean", slug: "korean" },
  { label: "Vietnamese", slug: "vietnamese" },
  { label: "Middle Eastern", slug: "middle_eastern" },

  { label: "Hawaiian", slug: "hawaiian" },
  { label: "German", slug: "german" },
  { label: "Scandinavian", slug: "scandinavian" },
  { label: "British Isles", slug: "british_scottish_irish" },
  { label: "Caribbean", slug: "jamaican_caribbean" },
  { label: "South American", slug: "south_american" },
  { label: "African", slug: "african" },
  { label: "Portuguese", slug: "portuguese" },
];

export const CUISINE_LABELS: Record<string, string> = Object.fromEntries(
  CUISINES.map((c) => [c.slug, c.label])
);

// Safety-net only, never the primary path: an unmapped slug (e.g. a cuisine
// added to the pipeline but not yet copied here) still renders as a
// readable label instead of a raw key.
function titleCaseFallback(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function getCuisineLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return CUISINE_LABELS[slug] ?? titleCaseFallback(slug);
}
