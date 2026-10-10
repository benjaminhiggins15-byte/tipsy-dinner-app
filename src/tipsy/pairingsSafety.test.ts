// Permanent unit test for the pairings safety filter (filterPairings /
// resolveAllergenSet in pairingsSafety.ts). Pure functions, no AI/DB calls.
// Run with: bun run src/tipsy/pairingsSafety.test.ts

import { filterPairings, resolveAllergenSet, type FilterPairingsOptions } from "./pairingsSafety";
import { ALL_BIG9_IDS } from "./allergyMap";

let pass = 0;
let fail = 0;

function check(description: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (!ok) {
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
  if (ok) pass += 1;
  else fail += 1;
}

function names(result: { items: { name: string }[] }): string[] {
  return result.items.map((i) => i.name);
}

console.log("=".repeat(80));
console.log("PAIRINGS SAFETY FILTER TEST");
console.log("=".repeat(80));
console.log();

// --- Alcohol gate: false and null both treated as not-alcohol-ok ---
for (const alcoholOk of [false, null] as const) {
  const opts: FilterPairingsOptions = { alcoholOk, allergySet: [] };
  const items = [
    { name: "Pinot Noir", why: "A classic red wine pairing for the dish", is_alcoholic: false },
    { name: "Ginger Beer", why: "A spicy, bottled soft drink", is_alcoholic: false },
    { name: "Sparkling Water with Lime", why: "A refreshing, zero-proof palate cleanser", is_alcoholic: false },
  ];
  const result = filterPairings(items, opts);
  check(
    `alcoholOk=${alcoholOk}: mislabeled wine + ginger beer dropped, sparkling water survives`,
    names(result),
    ["Sparkling Water with Lime"]
  );
}

// --- False-positive guards: substring matches must NOT trigger ---
check(
  '"ginger" does not match "gin"',
  names(filterPairings(
    [{ name: "Ginger Mule", why: "A ginger-forward non-alcoholic mocktail", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  ["Ginger Mule"]
);
check(
  '"fizzy water" does not match "fizz" (egg carrier)',
  names(filterPairings(
    [{ name: "Fizzy Lemonade", why: "A fizzy, fruity non-alcoholic cooler", is_alcoholic: false }],
    { alcoholOk: true, allergySet: ["egg"] }
  )),
  ["Fizzy Lemonade"]
);
check(
  '"kale" does not match "ale"',
  names(filterPairings(
    [{ name: "Kale Smoothie", why: "A vibrant green smoothie, no alcohol", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  ["Kale Smoothie"]
);

// --- Per-allergen carrier drops ---
check(
  "wheat allergy drops IPA",
  names(filterPairings(
    [{ name: "IPA", why: "A hoppy India Pale Ale to match the spice", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["wheat"] }
  )),
  []
);
check(
  "wheat allergy drops malt",
  names(filterPairings(
    [{ name: "Chocolate Malt", why: "A classic malt beverage, nostalgic and sweet", is_alcoholic: false }],
    { alcoholOk: true, allergySet: ["wheat"] }
  )),
  []
);
check(
  "egg allergy drops Whiskey Sour",
  names(filterPairings(
    [{ name: "Whiskey Sour", why: "A tart whiskey cocktail with fresh lemon", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["egg"] }
  )),
  []
);
check(
  "fish allergy drops Bloody Mary",
  names(filterPairings(
    [{ name: "Bloody Mary", why: "A savory vodka cocktail with tomato juice", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["fish"] }
  )),
  []
);
check(
  "milk allergy drops Chai Latte",
  names(filterPairings(
    [{ name: "Chai Latte", why: "A spiced, creamy tea drink", is_alcoholic: false }],
    { alcoholOk: true, allergySet: ["milk"] }
  )),
  []
);
check(
  "tree-nut allergy drops Amaretto Sour",
  names(filterPairings(
    [{ name: "Amaretto Sour", why: "A sweet almond-liqueur cocktail", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["tree_nut"] }
  )),
  []
);

// --- Allergen resolution (reused resolver) ---
check("resolveAllergenSet(null) -> all nine Big-9 ids", [...resolveAllergenSet(null)].sort(), [...ALL_BIG9_IDS].sort());
check(
  "NULL allergies -> Chai Latte and IPA both dropped",
  names(filterPairings(
    [
      { name: "Chai Latte", why: "A spiced, creamy tea drink", is_alcoholic: false },
      { name: "IPA", why: "A hoppy India Pale Ale", is_alcoholic: true },
    ],
    { alcoholOk: true, allergySet: resolveAllergenSet(null) }
  )),
  []
);
check(
  "confirmed-none allergies -> empty allergen set",
  resolveAllergenSet({ big9: [], other: [] }),
  []
);

// --- Full pipeline: 4 valid items pass untouched ---
{
  const items = [
    { name: "Sparkling Water with Lime", why: "A refreshing, zero-proof palate cleanser", is_alcoholic: false },
    { name: "Pinot Noir", why: "A classic red wine pairing", is_alcoholic: true },
    { name: "Old Fashioned", why: "A stirred whiskey cocktail", is_alcoholic: true },
    { name: "Margarita", why: "A tangy tequila cocktail", is_alcoholic: true },
  ];
  const result = filterPairings(items, { alcoholOk: true, allergySet: resolveAllergenSet({ big9: [], other: [] }) });
  check("confirmed-none + alcoholOk true: all 4 items survive untouched", names(result), [
    "Sparkling Water with Lime", "Pinot Noir", "Old Fashioned", "Margarita",
  ]);
  check("confirmed-none + alcoholOk true: complete is true", result.complete, true);
}

// --- alcoholOk true with no non-alcoholic survivor -> complete false ---
{
  const items = [
    { name: "Margarita", why: "A tangy tequila cocktail", is_alcoholic: true },
    { name: "Old Fashioned", why: "A stirred whiskey cocktail", is_alcoholic: true },
    { name: "Negroni", why: "A bitter campari cocktail", is_alcoholic: true },
    { name: "Martini", why: "A classic gin cocktail", is_alcoholic: true },
  ];
  const result = filterPairings(items, { alcoholOk: true, allergySet: [] });
  check("4 alcoholic survivors, all alcoholic: items.length is 4", result.items.length, 4);
  check("4 alcoholic survivors, all alcoholic: complete is false", result.complete, false);
}

// --- Malformed items are dropped, never thrown ---
{
  const items: unknown[] = [
    { name: "Margarita", why: "A tangy tequila cocktail", is_alcoholic: true },
    { name: "No Why Field", is_alcoholic: true },
    { name: "Bad Boolean", why: "Something", is_alcoholic: "false" },
    { name: "", why: "Empty name", is_alcoholic: false },
    { name: "Empty Why", why: "", is_alcoholic: false },
    null,
    42,
    "just a string",
  ];
  const result = filterPairings(items, { alcoholOk: true, allergySet: [] });
  check("malformed items dropped, only the valid one survives", names(result), ["Margarita"]);
}

// --- other[] free-text allergy term ---
{
  const items = [
    { name: "Bloody Mary", why: "A savory cocktail with a mustard-spiced rim", is_alcoholic: true },
    { name: "Margarita", why: "A tangy tequila cocktail", is_alcoholic: true },
  ];
  const result = filterPairings(items, { alcoholOk: true, allergySet: [], otherAllergyTerms: ["mustard"] });
  check('other[] term "mustard" drops the matching item, keeps the rest', names(result), ["Margarita"]);
}

// --- Witbier: new wheat-carrier + alcohol-term entries ---
check(
  "witbier dropped for a wheat allergy",
  names(filterPairings(
    [{ name: "A crisp Witbier", why: "A Belgian wheat beer with citrus notes", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["wheat"] }
  )),
  []
);
check(
  "witbier dropped for a non-drinker (mislabeled is_alcoholic:false, caught by name text)",
  names(filterPairings(
    [{ name: "A Belgian-style Witbier", why: "Citrusy and light, a classic wheat beer style", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  []
);

// --- Plurals ---
check(
  '"IPAs" caught (plural) for a non-drinker',
  names(filterPairings(
    [{ name: "Flight of IPAs", why: "Hoppy and citrus-forward", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  []
);
check(
  '"red wines" caught (plural) for a non-drinker',
  names(filterPairings(
    [{ name: "A Few Red Wines", why: "Robust and fruit-forward", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  []
);

// --- New bare alcohol term: kombucha ---
check(
  '"kombucha" dropped for a non-drinker',
  names(filterPairings(
    [{ name: "Ginger Kombucha", why: "Tangy and fizzy", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  []
);

// --- False-positive guard still holds after pluralization change ---
check(
  '"Rosemary" not matched as "rum"',
  names(filterPairings(
    [{ name: "Rosemary Lemonade", why: "A fresh, herbal, non-alcoholic cooler", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  ["Rosemary Lemonade"]
);

// --- Accent normalization ---
check(
  '"Kölsch" matches "kolsch" wheat carrier (accent-stripped)',
  names(filterPairings(
    [{ name: "A crisp Kölsch", why: "Light and bready", is_alcoholic: true }],
    { alcoholOk: true, allergySet: ["wheat"] }
  )),
  []
);
check(
  '"Cachaça" matches "cachaca" alcohol term (accent-stripped, mislabeled is_alcoholic:false)',
  names(filterPairings(
    [{ name: "Sparkling Cachaça Spritz", why: "Light and citrusy", is_alcoholic: false }],
    { alcoholOk: false, allergySet: [] }
  )),
  []
);

// --- Recipe-text scan scope: WHY is exempted for a hit the recipe's own
// text already triggers; NAME never is ---
{
  const shrimpTacoText =
    "Spicy Shrimp Tacos with Lime Slaw. Charred chili-lime shrimp with a bright lime-cabbage slaw. " +
    "1 lb large shrimp, peeled and deveined. Season and sear the shrimp until charred.";
  const nullAllergyAllergens = resolveAllergenSet(null); // fail-closed to all nine, includes shellfish

  check(
    'shrimp-taco why mentioning "shrimp" survives for a NULL-allergy user',
    names(filterPairings(
      [{
        name: "Pineapple Agua Fresca",
        why: "Its tropical sweetness complements the charred shrimp and bright lime slaw",
        is_alcoholic: false,
      }],
      { alcoholOk: false, allergySet: nullAllergyAllergens, recipeText: shrimpTacoText }
    )),
    ["Pineapple Agua Fresca"]
  );
  check(
    'a drink NAMED "Clamato Cooler" is still dropped for a NULL-allergy user on the same recipe',
    names(filterPairings(
      [{ name: "Clamato Cooler", why: "A savory tomato-based refresher", is_alcoholic: false }],
      { alcoholOk: false, allergySet: nullAllergyAllergens, recipeText: shrimpTacoText }
    )),
    []
  );
}

{
  const shortRibText =
    "Braised Short Rib with Red Wine. Bone-in short ribs braised in red wine and beef stock. " +
    "2 cups dry red wine. Deglaze with the red wine and simmer until reduced.";

  check(
    'red-wine-braise why mentioning "wine" survives for a non-drinker',
    names(filterPairings(
      [{
        name: "Tart Cherry Shrub",
        why: "Its deep berry notes echo the red wine in the braising liquid",
        is_alcoholic: false,
      }],
      { alcoholOk: false, allergySet: [], recipeText: shortRibText }
    )),
    ["Tart Cherry Shrub"]
  );
  check(
    'a drink NAMED "Mulled Wine" is still dropped for a non-drinker on the same recipe',
    names(filterPairings(
      [{ name: "Mulled Wine", why: "Warm spices mirror the braise's long-cooked depth", is_alcoholic: false }],
      { alcoholOk: false, allergySet: [], recipeText: shortRibText }
    )),
    []
  );
}

console.log();
console.log("=".repeat(80));
console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
console.log("=".repeat(80));

if (fail > 0) {
  process.exit(1);
}
