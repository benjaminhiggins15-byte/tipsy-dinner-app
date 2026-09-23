// Permanent test for the onboarding constraints confirmation-message builder.
// Run with: bun run src/tipsy/constraintsConfirmation.test.ts

import { buildConstraintsConfirmation } from "./constraintsConfirmation";

let pass = 0;
let fail = 0;

function check(description: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (!ok) {
    console.log(`   expected: ${expected}`);
    console.log(`   actual:   ${actual}`);
  }
  if (ok) pass += 1;
  else fail += 1;
}

console.log("=".repeat(80));
console.log("CONSTRAINTS CONFIRMATION BUILDER TEST");
console.log("=".repeat(80));
console.log();

// Both allergy + dislike, 1 item each
check(
  "both, 1 item each",
  buildConstraintsConfirmation({ allergyItems: ["peanuts"], dislikeItems: ["cilantro"], unparsed: false }),
  "Noted — I'll steer clear of peanuts in what I suggest. Worth a glance at ingredients yourself too, just to double check. Will avoid cilantro as well."
);

// Both, 2 allergy items, 3+ dislike items
check(
  "both, 2 allergy items + 3 dislike items",
  buildConstraintsConfirmation({
    allergyItems: ["peanuts", "shrimp"],
    dislikeItems: ["cilantro", "olives", "mushrooms"],
    unparsed: false,
  }),
  "Noted — I'll steer clear of peanuts and shrimp in what I suggest. Worth a glance at ingredients yourself too, just to double check. Will avoid cilantro, olives, and mushrooms as well."
);

// Allergy only, 1 item
check(
  "allergy only, 1 item",
  buildConstraintsConfirmation({ allergyItems: ["shrimp"], dislikeItems: [], unparsed: false }),
  "Noted — I'll steer clear of shrimp in what I suggest. Worth a glance at ingredients yourself too, just to double check."
);

// Allergy only, 3+ items
check(
  "allergy only, 3 items",
  buildConstraintsConfirmation({ allergyItems: ["peanuts", "shrimp", "mustard"], dislikeItems: [], unparsed: false }),
  "Noted — I'll steer clear of peanuts, shrimp, and mustard in what I suggest. Worth a glance at ingredients yourself too, just to double check."
);

// Allergy only, non-Big-9 allergen (mustard) reads identically to a Big-9 one
check(
  "allergy only, non-Big-9 allergen (mustard) reads identically",
  buildConstraintsConfirmation({ allergyItems: ["mustard"], dislikeItems: [], unparsed: false }),
  "Noted — I'll steer clear of mustard in what I suggest. Worth a glance at ingredients yourself too, just to double check."
);

// Dislike only, 1 item
check(
  "dislike only, 1 item",
  buildConstraintsConfirmation({ allergyItems: [], dislikeItems: ["mushrooms"], unparsed: false }),
  "Noted — I'll avoid mushrooms in what I suggest."
);

// Dislike only, 2 items
check(
  "dislike only, 2 items",
  buildConstraintsConfirmation({ allergyItems: [], dislikeItems: ["mushrooms", "olives"], unparsed: false }),
  "Noted — I'll avoid mushrooms and olives in what I suggest."
);

// Dislike only, 3+ items
check(
  "dislike only, 3 items",
  buildConstraintsConfirmation({ allergyItems: [], dislikeItems: ["mushrooms", "olives", "beets"], unparsed: false }),
  "Noted — I'll avoid mushrooms, olives, and beets in what I suggest."
);

// Neither
check(
  "neither allergy nor dislike",
  buildConstraintsConfirmation({ allergyItems: [], dislikeItems: [], unparsed: false }),
  "Great — nothing's off limits, then."
);

// Unparsed fallback — takes priority even if allergyItems/dislikeItems happen to be non-empty
check(
  "unparsed fallback",
  buildConstraintsConfirmation({ allergyItems: [], dislikeItems: [], unparsed: true }),
  "Noted — I'll steer clear of those in what I suggest. Worth a glance at ingredients yourself too, just to double check."
);
check(
  "unparsed fallback takes priority over populated item lists",
  buildConstraintsConfirmation({ allergyItems: ["peanuts"], dislikeItems: ["cilantro"], unparsed: true }),
  "Noted — I'll steer clear of those in what I suggest. Worth a glance at ingredients yourself too, just to double check."
);

console.log();
console.log("=".repeat(80));
console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log("=".repeat(80));

if (fail > 0) {
  process.exit(1);
}
