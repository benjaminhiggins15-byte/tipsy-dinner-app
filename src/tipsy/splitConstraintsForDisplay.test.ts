// Permanent test for the Profile allergies/dislikes display-splitter.
// Run with: bun run src/tipsy/splitConstraintsForDisplay.test.ts

import { splitConstraintsForDisplay } from "./data";

let pass = 0;
let fail = 0;

function check(description: string, actual: { allergyText: string; dislikeText: string }, expected: { allergyText: string; dislikeText: string }) {
  const ok = actual.allergyText === expected.allergyText && actual.dislikeText === expected.dislikeText;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (!ok) {
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
  if (ok) pass += 1;
  else fail += 1;
}

console.log("=".repeat(80));
console.log("SPLIT CONSTRAINTS FOR DISPLAY TEST");
console.log("=".repeat(80));
console.log();

// Standard two-line string, both populated
check(
  "standard two-line string, both populated",
  splitConstraintsForDisplay("ALLERGY (hard, never serve): peanuts, shrimp\nDISLIKES (prefer to avoid): cilantro"),
  { allergyText: "peanuts, shrimp", dislikeText: "cilantro" }
);

// "None" in the allergy line
check(
  "\"None\" in allergy line",
  splitConstraintsForDisplay("ALLERGY (hard, never serve): None\nDISLIKES (prefer to avoid): mushrooms"),
  { allergyText: "", dislikeText: "mushrooms" }
);

// "None" in the dislikes line
check(
  "\"None\" in dislikes line",
  splitConstraintsForDisplay("ALLERGY (hard, never serve): peanuts\nDISLIKES (prefer to avoid): None"),
  { allergyText: "peanuts", dislikeText: "" }
);

// "None" in both lines
check(
  "\"None\" in both lines",
  splitConstraintsForDisplay("ALLERGY (hard, never serve): None\nDISLIKES (prefer to avoid): None"),
  { allergyText: "", dislikeText: "" }
);

// Legacy free text (doesn't match the two-line format at all)
check(
  "legacy free text (\"parsely\")",
  splitConstraintsForDisplay("parsely"),
  { allergyText: "parsely", dislikeText: "" }
);

// Raw text preserved verbatim from an earlier composer-failure write
// (composeConstraintsAndAllergies's fail-closed path writes constraintsToWrite = rawAnswer,
// which is just the user's own sentence — no ALLERGY/DISLIKES prefixes at all).
check(
  "raw failure text (no prefixes)",
  splitConstraintsForDisplay("I have some issues with a few different foods but I'm not sure which"),
  { allergyText: "I have some issues with a few different foods but I'm not sure which", dislikeText: "" }
);

// Empty string
check(
  "empty string",
  splitConstraintsForDisplay(""),
  { allergyText: "", dislikeText: "" }
);

// NULL
check(
  "null",
  splitConstraintsForDisplay(null),
  { allergyText: "", dislikeText: "" }
);

// undefined
check(
  "undefined",
  splitConstraintsForDisplay(undefined),
  { allergyText: "", dislikeText: "" }
);

console.log();
console.log("=".repeat(80));
console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log("=".repeat(80));

if (fail > 0) {
  process.exit(1);
}
