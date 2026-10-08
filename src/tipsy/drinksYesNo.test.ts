// Permanent unit test for the onboarding drinks question's deterministic
// yes/no/other classifier (classifyDrinksAnswer in drinksYesNo.ts).
// Run with: bun run src/tipsy/drinksYesNo.test.ts

import { classifyDrinksAnswer } from "./drinksYesNo";

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
console.log("DRINKS YES/NO/OTHER CLASSIFIER TEST");
console.log("=".repeat(80));
console.log();

const noAnswers = [
  "no",
  "nope",
  "nah",
  "no thanks",
  "no thank you",
  "no, thanks",
  "not really",
  "not for me",
  "pass",
  "skip",
  "i'm good",
  "im good",
  "nah i'm good",
  "i don't drink",
  "i dont drink",
  "no i don't drink",
  "no, i don't drink",
  "i don't drink alcohol",
];
for (const answer of noAnswers) {
  check(`"${answer}" -> no`, classifyDrinksAnswer(answer), "no");
}

const yesAnswers = [
  "yes",
  "yeah",
  "yep",
  "yup",
  "sure",
  "ok",
  "okay",
  "absolutely",
  "definitely",
  "of course",
  "please",
  "yes please",
  "sure thing",
  "why not",
];
for (const answer of yesAnswers) {
  check(`"${answer}" -> yes`, classifyDrinksAnswer(answer), "yes");
}

const otherAnswers = [
  "no beer, but i love wine",
  "yes, mostly red wine",
  "I don’t drink much but love a good IPA",
  "tea and fizzy water",
];
for (const answer of otherAnswers) {
  check(`"${answer}" -> other`, classifyDrinksAnswer(answer), "other");
}

console.log();
console.log("=".repeat(80));
console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log("=".repeat(80));

if (fail > 0) {
  process.exit(1);
}
