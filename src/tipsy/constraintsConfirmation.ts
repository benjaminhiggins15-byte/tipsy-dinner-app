// Deterministic confirmation message for the onboarding constraints stage
// (Piece 2). Replaces generateOnboardingReflection for this stage only —
// the message is built directly from composeConstraintsAndAllergies's own
// output, never a separate AI call, so it can never say something the
// safety gate (profiles.allergies) doesn't actually enforce.
//
// Templates are founder-locked — do not reword without going back to
// Claude.ai design first (see CLAUDE.md Session Rules).

function joinNaturalList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function buildConstraintsConfirmation({
  allergyItems,
  dislikeItems,
  unparsed,
}: {
  allergyItems: string[];
  dislikeItems: string[];
  unparsed: boolean;
}): string {
  if (unparsed) {
    return "Noted — I'll steer clear of those in what I suggest. Worth a glance at ingredients yourself too, just to double check.";
  }

  const hasAllergy = allergyItems.length > 0;
  const hasDislike = dislikeItems.length > 0;

  if (hasAllergy && hasDislike) {
    return `Noted — I'll steer clear of ${joinNaturalList(allergyItems)} in what I suggest. Worth a glance at ingredients yourself too, just to double check. Will avoid ${joinNaturalList(dislikeItems)} as well.`;
  }
  if (hasAllergy) {
    return `Noted — I'll steer clear of ${joinNaturalList(allergyItems)} in what I suggest. Worth a glance at ingredients yourself too, just to double check.`;
  }
  if (hasDislike) {
    return `Noted — I'll avoid ${joinNaturalList(dislikeItems)} in what I suggest.`;
  }
  return "Great — nothing's off limits, then.";
}
