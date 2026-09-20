// Display-only mapping for suggested_recipe_pool.effort values ("quick" |
// "moderate" | "project"). Collapses moderate/project into one label —
// investigation showed the moderate/project boundary is a soft, unguided AI
// judgment call at generation time (no time/step/technique rule backs it),
// so surfacing it as two distinct user-facing tiers would imply a precision
// that doesn't exist. This is a DISPLAY mapping only; the underlying pool
// value is untouched.
const EFFORT_LABELS: Record<string, string> = {
  quick: "Weeknight",
  moderate: "Worth the time",
  project: "Worth the time",
};

// Safety-net: an unexpected value (null, empty, or an unmapped string) must
// never leak a raw key onto the tile — render nothing instead.
export function getEffortLabel(effort: string | null | undefined): string {
  if (!effort) return "";
  return EFFORT_LABELS[effort] ?? "";
}
