// Permanent unit test for the Pairings feature's drink-preference parser and
// save path (parseDrinkPreference / saveDrinkPreference in data.ts). The AI
// call is fully mocked via a global fetch substitution — no real network or
// DB calls. Mirrors enrichGroceryItems' defensive-parsing posture, not
// parseNoGosAnswer's real-AI E2E test style (constraintsEditE2E.test.ts).
// Run with: bun run src/tipsy/drinkPreference.test.ts

import {
  parseDrinkPreference,
  saveDrinkPreference,
  type AlcoholOkConditionalWriter,
} from "./data";

let pass = 0;
let fail = 0;

function check(description: string, condition: boolean) {
  console.log(`${condition ? "✓ PASS" : "✗ FAIL"} | ${description}`);
  if (condition) pass += 1;
  else fail += 1;
}

// ---- fetch mocking helpers ----

function sseResponseFor(fullText: string): Response {
  const encoder = new TextEncoder();
  const payload = JSON.stringify({
    type: "content_block_delta",
    delta: { type: "text_delta", text: fullText },
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function neverSettlingResponse(): Promise<Response> {
  return new Promise<Response>(() => {
    /* intentionally never resolves — exercises the withTimeout ceiling */
  });
}

let originalFetch: typeof fetch;
let fetchCallCount = 0;

function installFetchMock(impl: () => Promise<Response>) {
  fetchCallCount = 0;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCallCount += 1;
    return impl();
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

async function main() {
  console.log("=".repeat(80));
  console.log("DRINK PREFERENCE PARSE + SAVE PATH TEST");
  console.log("=".repeat(80));
  console.log();

  // ---- blank input: false, no AI call ----
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true}'));
    const result = await parseDrinkPreference("");
    check("blank text -> false", result === false);
    check("blank text -> no AI call", fetchCallCount === 0);
    restoreFetch();
  }
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true}'));
    const result = await parseDrinkPreference("   ");
    check("whitespace-only text -> false", result === false);
    check("whitespace-only text -> no AI call", fetchCallCount === 0);
    restoreFetch();
  }

  // ---- deterministic no-alcohol override phrases: false, no AI call ----
  const overridePhrases = [
    "I'm sober",
    "no alcohol for me",
    "I only want non-alcoholic options",
    "I only want non alcoholic options",
    "nonalcoholic only, please",
    "please keep it alcohol-free",
    "please keep it alcohol free",
    "zero alcohol please",
    "I'm not drinking these days",
    "I quit drinking",
    "I stopped drinking",
    "I used to drink, not anymore",
    "no booze for me",
    "nothing alcoholic please",
    "please, without alcohol",
    "I'm in recovery",
    "I'm pregnant",
    "I'm a teetotaler",
    // general "don't drink" phrasing — narrowed to refer to drinking in general
    "I don't drink.",
    "I don’t drink", // curly apostrophe
    "dont drink",
    "I don't drink alcohol",
    "I do not drink anymore",
    "I don't drink at all",
  ];
  for (const phrase of overridePhrases) {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true}'));
    const result = await parseDrinkPreference(phrase);
    check(`override phrase "${phrase}" -> false`, result === false);
    check(`override phrase "${phrase}" -> no AI call`, fetchCallCount === 0);
    restoreFetch();
  }

  // ---- narrowed "don't drink X" phrasing: specific drink, NOT a general
  // refusal -> must go to the AI, not the deterministic override ----
  const nonOverridingPhrases = [
    "I love wine, but only red. No white please",
    "I don't drink white wine",
    "I don't drink beer but love wine",
    "I like wine and mocktails",
  ];
  for (const phrase of nonOverridingPhrases) {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true}'));
    const result = await parseDrinkPreference(phrase);
    check(`"${phrase}" -> goes to the AI, not the override`, fetchCallCount === 1);
    check(`"${phrase}" -> mocked AI result passes through`, result === true);
    restoreFetch();
  }

  // ---- mocked true/false pass through ----
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true}'));
    const result = await parseDrinkPreference("I love a good cabernet");
    check("mocked {alcohol_ok: true} passes through as true", result === true);
    check("exactly one AI call made", fetchCallCount === 1);
    restoreFetch();
  }
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": false}'));
    const result = await parseDrinkPreference("just sparkling water for me");
    check("mocked {alcohol_ok: false} passes through as false", result === false);
    restoreFetch();
  }

  // ---- malformed / extra fields / wrong type -> null ----
  {
    installFetchMock(async () => sseResponseFor("not json at all"));
    const result = await parseDrinkPreference("something ambiguous");
    check("malformed JSON -> null", result === null);
    restoreFetch();
  }
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": true, "confidence": "high"}'));
    const result = await parseDrinkPreference("something ambiguous");
    check("extra fields in JSON -> null", result === null);
    restoreFetch();
  }
  {
    installFetchMock(async () => sseResponseFor('{"alcohol_ok": "true"}'));
    const result = await parseDrinkPreference("something ambiguous");
    check('string "true" instead of boolean -> null', result === null);
    restoreFetch();
  }

  // ---- timeout -> null ----
  {
    installFetchMock(() => neverSettlingResponse());
    const start = Date.now();
    const result = await parseDrinkPreference("something ambiguous", 50);
    const elapsed = Date.now() - start;
    check("timeout -> null", result === null);
    check("timeout resolved near the given ceiling, not hung", elapsed < 1000);
    restoreFetch();
  }

  // ---- saveDrinkPreference: first write always sets alcohol_ok null with the text ----
  {
    const writes: { drink_preference: string; alcohol_ok: null }[] = [];
    const fakeOnUpdate = async (fields: { drink_preference: string; alcohol_ok: null }) => {
      writes.push(fields);
    };
    await saveDrinkPreference("I like red wine", fakeOnUpdate, "user-1", {
      parse: async () => null,
      writeAlcoholOk: async () => {},
    });
    check("first write happens exactly once", writes.length === 1);
    check(
      "first write sets drink_preference and alcohol_ok:null together",
      writes[0]?.drink_preference === "I like red wine" && writes[0]?.alcohol_ok === null
    );
  }
  {
    // The first write must not depend on the parse in any way — prove it
    // resolves even while the parse is still pending (never resolved here).
    const fakeOnUpdate = async () => {};
    const start = Date.now();
    await saveDrinkPreference("whatever's open", fakeOnUpdate, "user-1", {
      parse: () => new Promise<boolean | null>(() => {}), // never resolves
      writeAlcoholOk: async () => {},
    });
    const elapsed = Date.now() - start;
    check("saveDrinkPreference resolves without waiting on the parse", elapsed < 200);
  }

  // ---- saveDrinkPreference: conditional write skipped when drink_preference changed ----
  {
    // Fake in-memory row + a conditional writer that mimics Postgres'
    // `WHERE id = ? AND drink_preference = ?` semantics exactly.
    const fakeRow: { id: string; drink_preference: string; alcohol_ok: boolean | null } = {
      id: "user-1",
      drink_preference: "I like red wine",
      alcohol_ok: null,
    };
    const conditionalWriter: AlcoholOkConditionalWriter = async (userId, expectedText, alcoholOk) => {
      if (fakeRow.id === userId && fakeRow.drink_preference === expectedText) {
        fakeRow.alcohol_ok = alcoholOk;
      }
    };

    let resolveParse!: (value: boolean | null) => void;
    const parsePromise = new Promise<boolean | null>((resolve) => {
      resolveParse = resolve;
    });

    await saveDrinkPreference("I like red wine", async () => {}, "user-1", {
      parse: async () => parsePromise,
      writeAlcoholOk: conditionalWriter,
    });

    // Simulate the race: drink_preference changes before the stale parse resolves.
    fakeRow.drink_preference = "actually just tea";
    resolveParse(true); // the stale parse for the OLD text finally resolves
    await new Promise((r) => setTimeout(r, 10)); // flush the .then() chain

    check(
      "conditional write skipped when drink_preference changed before parse resolved",
      fakeRow.alcohol_ok === null
    );
  }
  {
    // Sanity counterpart: unchanged drink_preference -> the conditional write DOES apply.
    const fakeRow: { id: string; drink_preference: string; alcohol_ok: boolean | null } = {
      id: "user-1",
      drink_preference: "I like red wine",
      alcohol_ok: null,
    };
    const conditionalWriter: AlcoholOkConditionalWriter = async (userId, expectedText, alcoholOk) => {
      if (fakeRow.id === userId && fakeRow.drink_preference === expectedText) {
        fakeRow.alcohol_ok = alcoholOk;
      }
    };
    await saveDrinkPreference("I like red wine", async () => {}, "user-1", {
      parse: async () => true,
      writeAlcoholOk: conditionalWriter,
    });
    await new Promise((r) => setTimeout(r, 10));
    check("conditional write applies when drink_preference is unchanged", fakeRow.alcohol_ok === true);
  }
  {
    // null parse result -> conditional writer never called at all.
    let writerCalled = false;
    const conditionalWriter: AlcoholOkConditionalWriter = async () => {
      writerCalled = true;
    };
    await saveDrinkPreference("I like red wine", async () => {}, "user-1", {
      parse: async () => null,
      writeAlcoholOk: conditionalWriter,
    });
    await new Promise((r) => setTimeout(r, 10));
    check("null parse result never invokes the conditional writer", writerCalled === false);
  }

  console.log();
  console.log("=".repeat(80));
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  console.log("=".repeat(80));
  if (fail > 0) process.exit(1);
}

main();
