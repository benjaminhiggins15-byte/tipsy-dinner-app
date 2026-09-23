// One-off (not committed to run in CI) end-to-end check for Piece 3+4's
// Profile allergies/dislikes edit logic — exercises the REAL composer (real
// AI call) and the REAL save-branching logic against in-memory scratch
// profile objects. Never touches a real account/row.
// Run with: bun run src/tipsy/constraintsEditE2E.test.ts

import { buildConstraintsString, composeAllergyBoxEdit, splitConstraintsForDisplay, type StructuredAllergies } from "./data";

type ScratchProfile = { constraints: string | null; allergies: StructuredAllergies | null };

// Mirrors exactly what ProfileEditConstraints.handleSave does, minus the
// React state and the actual onUpdate() network call — returns what WOULD
// be written.
async function simulateSave(
  profile: ScratchProfile,
  newAllergyVal: string,
  newDislikeVal: string,
  allergyTimeoutMs?: number
): Promise<{ constraints?: string; allergies?: StructuredAllergies }> {
  const initial = splitConstraintsForDisplay(profile.constraints);
  const allergyChanged = newAllergyVal !== initial.allergyText;
  const dislikeChanged = newDislikeVal !== initial.dislikeText;
  if (!allergyChanged && !dislikeChanged) return {};

  const constraintsToWrite = buildConstraintsString(newAllergyVal, newDislikeVal);
  const updates: { constraints?: string; allergies?: StructuredAllergies } = { constraints: constraintsToWrite };
  if (allergyChanged) {
    updates.allergies =
      allergyTimeoutMs !== undefined
        ? await composeAllergyBoxEdit(newAllergyVal, allergyTimeoutMs)
        : await composeAllergyBoxEdit(newAllergyVal);
  }
  return updates;
}

function report(label: string, result: { constraints?: string; allergies?: StructuredAllergies }) {
  console.log(`--- ${label} ---`);
  console.log(`constraints: ${result.constraints !== undefined ? JSON.stringify(result.constraints) : "(omitted — untouched)"}`);
  console.log(`allergies:   ${result.allergies !== undefined ? JSON.stringify(result.allergies) : "(omitted — untouched)"}`);
  console.log();
}

async function main() {
  console.log("=".repeat(80));
  console.log("CONSTRAINTS EDIT E2E (real composer, scratch profiles only)");
  console.log("=".repeat(80));
  console.log();

  // (a) Allergies "peanuts, shrimp" -> add "sesame"
  {
    const profile: ScratchProfile = {
      constraints: "ALLERGY (hard, never serve): peanuts, shrimp\nDISLIKES (prefer to avoid): cilantro",
      allergies: { big9: ["peanut", "shellfish"], other: [] },
    };
    const result = await simulateSave(profile, "peanuts, shrimp, sesame", "cilantro");
    report("(a) allergy add sesame", result);
  }

  // (b) Allergies box typed "shellfish doesn't really agree with me"
  {
    const profile: ScratchProfile = { constraints: null, allergies: null };
    const result = await simulateSave(profile, "shellfish doesn't really agree with me", "");
    report("(b) soft-wording must still land as allergy", result);
  }

  // (c) Allergies "mustard"
  {
    const profile: ScratchProfile = { constraints: null, allergies: null };
    const result = await simulateSave(profile, "mustard", "");
    report("(c) non-Big9 allergen (mustard)", result);
  }

  // (d) Allergies box cleared
  {
    const profile: ScratchProfile = {
      constraints: "ALLERGY (hard, never serve): peanuts\nDISLIKES (prefer to avoid): None",
      allergies: { big9: ["peanut"], other: [] },
    };
    const result = await simulateSave(profile, "", "");
    report("(d) allergy box cleared", result);
  }

  // (e) Forced composer failure -> unparsed:true with raw text.
  // A 1ms ceiling deterministically loses the race against the real network
  // call every time (withTimeout resolves null on timeout), reproducing the
  // real fail-closed path without mocking anything.
  {
    const profile: ScratchProfile = { constraints: null, allergies: null };
    const result = await simulateSave(profile, "peanuts and shrimp", "", 1);
    report("(e) forced composer timeout (1ms ceiling)", result);
  }

  // (f) Dislikes-only edit on a confirmed-allergy profile
  {
    const profile: ScratchProfile = {
      constraints: "ALLERGY (hard, never serve): peanuts, shrimp\nDISLIKES (prefer to avoid): cilantro",
      allergies: { big9: ["peanut", "shellfish"], other: [] },
    };
    const result = await simulateSave(profile, "peanuts, shrimp", "cilantro, olives");
    report("(f) dislikes-only edit, confirmed-allergy profile", result);
  }

  // (g) Dislikes-only edit on a NULL-allergy profile
  {
    const profile: ScratchProfile = {
      constraints: "ALLERGY (hard, never serve): None\nDISLIKES (prefer to avoid): mushrooms",
      allergies: null,
    };
    const result = await simulateSave(profile, "", "mushrooms, olives");
    report("(g) dislikes-only edit, NULL-allergy profile", result);
  }

  console.log("=".repeat(80));
  console.log("Done. Read the printed constraints/allergies above against the 4 full-stop conditions:");
  console.log("1. Any allergy item landing in dislikes");
  console.log("2. Any NULL becoming non-NULL from a dislikes-only edit");
  console.log("3. Any failure reading as confirmed-empty ({big9:[],other:[]} with no unparsed flag)");
  console.log("4. Any machine text (ALLERGY/DISLIKES/hard, never serve/prefer to avoid) visible");
  console.log("=".repeat(80));
}

main();
