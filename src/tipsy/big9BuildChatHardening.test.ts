// Re-proof of Build 4's allergy-hardening path (see "Build/Cook-Chat Allergy
// Hardening" in FEATURE_SPECS.md) for the 2026-09-23 gate-fingerprint
// session's merge gate. The original 40-case adversarial suite that proved
// this path was NEVER COMMITTED to the repo — flagged for full
// reconstruction as a follow-up (see end-of-session log). This file is a
// focused re-proof, not that suite: it covers only the allergies shapes THIS
// session's new write paths (Profile edit add/forced-edit/box-failure/clear)
// actually produce, plus the historical fail-open cases from Build 4's own
// FEATURE_SPECS section, run against the REAL functions — no reimplementation.
//
// scanRecipeDraftForBig9 lives in App.tsx and was not exported (App.tsx had
// no test file, since it's a page-level component module, not previously a
// test target). Confirmed importable as-is under Bun (App.tsx already
// exports buildSystemPrompt/parseRecipeFromAIResponse/recipeToXML for this
// same reason) — the only change made was adding `export` to
// scanRecipeDraftForBig9's existing declaration, zero behavior change.
//
// Run with: bun run src/tipsy/big9BuildChatHardening.test.ts

import { scanRecipeDraftForBig9 } from "./App";
import { effectiveAllergensForScan, type StructuredAllergies, type Big9Hit } from "./allergyMap";

let pass = 0;
let fail = 0;

function check(description: string, condition: boolean) {
  console.log(`${condition ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (condition) pass += 1;
  else fail += 1;
}

type Ing = { name: string; qty: string };
function ing(name: string, qty = ""): Ing {
  return { name, qty };
}

function draft(overrides: {
  title?: string;
  description?: string;
  ingredients?: Ing[];
  steps?: string[];
}) {
  return {
    title: overrides.title ?? "Clean Roast Chicken",
    description: overrides.description ?? "A simple weeknight roast chicken with lemon and herbs.",
    ingredients: overrides.ingredients ?? [ing("chicken"), ing("lemon"), ing("olive oil"), ing("thyme")],
    steps: (overrides.steps ?? ["Preheat oven.", "Roast chicken with lemon and thyme until done."]).map(
      (instruction) => ({ title: "Step", instruction })
    ),
  };
}

function scan(allergies: StructuredAllergies | null | undefined, recipe: ReturnType<typeof draft>): Big9Hit[] {
  const targetIds = effectiveAllergensForScan(allergies);
  return scanRecipeDraftForBig9(recipe, targetIds);
}

function main() {
  console.log("=".repeat(80));
  console.log("BUILD/COOK-CHAT ALLERGY HARDENING RE-PROOF (real functions)");
  console.log("=".repeat(80));
  console.log();

  // --- (1) THIS SESSION'S NEW WRITE-PATH SHAPES -----------------------------

  {
    const allergies: StructuredAllergies = { big9: ["peanut", "shellfish", "sesame"], other: ["rabbit"] };
    const hits = scan(allergies, draft({ ingredients: [ing("chicken"), ing("tahini sauce")] }));
    check(
      "Profile edit add {peanut,shellfish,sesame}/{rabbit} — sesame (tahini) in ingredients caught",
      hits.some((h) => h.allergen === "sesame")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: ["peanut", "shellfish", "sesame"], other: ["rabbit"] };
    const hits = scan(
      allergies,
      draft({ description: "A coastal stew finished with a handful of shrimp for brininess." })
    );
    check(
      "Profile edit add {peanut,shellfish,sesame}/{rabbit} — shrimp only in description caught",
      hits.some((h) => h.allergen === "shellfish" && h.ingredient === "description")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: ["peanut", "shellfish", "sesame"], other: ["rabbit"] };
    const hits = scan(allergies, draft({}));
    check("Profile edit add {peanut,shellfish,sesame}/{rabbit} — clean draft passes", hits.length === 0);
  }

  {
    const allergies: StructuredAllergies = { big9: ["shellfish"], other: [] };
    const hits = scan(allergies, draft({ ingredients: [ing("crab meat"), ing("butter")] }));
    check(
      'Forced-allergy edit {shellfish}/{} (from "shellfish doesn\'t really agree with me") — shellfish draft caught',
      hits.some((h) => h.allergen === "shellfish")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: [], other: ["peanuts and shrimp"], unparsed: true };
    const hits = scan(allergies, draft({ ingredients: [ing("peanut butter"), ing("bread")] }));
    check(
      'Allergy box edit failure {big9:[],other:["peanuts and shrimp"],unparsed:true} — peanut draft caught via unparsed backstop',
      hits.some((h) => h.allergen === "peanut")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: [], other: ["peanuts and shrimp"], unparsed: true };
    const hits = scan(allergies, draft({ ingredients: [ing("shrimp"), ing("garlic")] }));
    check(
      'Allergy box edit failure {big9:[],other:["peanuts and shrimp"],unparsed:true} — shellfish draft ALSO caught via unparsed backstop',
      hits.some((h) => h.allergen === "shellfish")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: [], other: [] };
    const hits = scan(allergies, draft({ ingredients: [ing("peanut butter"), ing("bread")] }));
    check("Allergy box cleared {big9:[],other:[]} — peanut draft passes (confirmed-empty, no gating)", hits.length === 0);
  }

  // --- (2) HISTORICAL FAIL-OPEN RE-PROOFS ------------------------------------

  {
    const hits = scan(null, draft({ ingredients: [ing("egg"), ing("flour")] }));
    check("NULL allergies -> all nine scanned: egg draft caught", hits.some((h) => h.allergen === "egg"));
  }

  {
    const allergies: StructuredAllergies = { big9: ["egg"], other: [] };
    const hits = scan(
      allergies,
      draft({
        ingredients: [ing("pasta"), ing("bacon"), ing("black pepper")],
        description: "A carbonara finished with egg yolk emulsified into a silky sauce.",
      })
    );
    check(
      "egg-allergic user, clean ingredients, but description says 'egg yolk' -> caught",
      hits.some((h) => h.allergen === "egg" && h.ingredient === "description")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: ["egg"], other: [] };
    const hits = scan(
      allergies,
      draft({
        title: "Classic Egg Salad Sandwich",
        description: "A simple lunch sandwich.",
        ingredients: [ing("bread"), ing("mayonnaise-free spread")],
      })
    );
    check(
      "allergen only in title -> caught",
      hits.some((h) => h.allergen === "egg" && h.ingredient === "title")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: ["egg"], other: [] };
    const hits = scan(
      allergies,
      draft({
        ingredients: [ing("bread"), ing("butter")],
        steps: ["Toast the bread.", "Brush with a beaten egg wash before the final bake."],
      })
    );
    check(
      "allergen only in step text -> caught",
      hits.some((h) => h.allergen === "egg" && h.ingredient === "step 2")
    );
  }

  {
    const allergies: StructuredAllergies = { big9: ["egg"], other: [] };
    const hits = scan(allergies, draft({ ingredients: [ing("mayo"), ing("celery"), ing("chicken")] }));
    check(
      "hidden carrier (mayo -> egg) caught",
      hits.some((h) => h.allergen === "egg" && h.matchedTerm === "mayo")
    );
  }

  console.log();
  console.log("=".repeat(80));
  console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail}`);
  console.log("=".repeat(80));

  if (fail > 0) process.exit(1);
}

main();
