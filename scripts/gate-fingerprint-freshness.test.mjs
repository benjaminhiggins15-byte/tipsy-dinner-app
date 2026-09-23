// One-off (not committed to run in CI) test for the gate-fingerprint
// freshness fix in supabase/functions/compute-slice/index.ts (Session
// 2026-09-23). Mirrors the EXACT new logic (canonicalizeAllergiesForFingerprint,
// computeGateFingerprint, and the cacheIsFresh freshness decision) by direct
// copy, same convention this file already uses everywhere for duplicating
// small pieces across the Deno import boundary — never imports the live
// index.ts (it registers Deno.serve at module scope, which isn't meaningful
// to run from a bun/node test).
//
// Cases (b)/(g) additionally hit the REAL suggested_recipe_pool (read-only,
// service role) to confirm the fingerprint's real-world consequence: a
// changed gate list actually changes which real pool rows survive Stage 1.
// No writes anywhere. No deploy. Run with: bun run gateFingerprint.test.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing env vars");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---- Verbatim copy of the new compute-slice logic ----

function canonicalizeAllergiesForFingerprint(allergies) {
  if (allergies === null || allergies === undefined) return null;
  if (typeof allergies !== "object") return allergies;
  const big9 = Array.isArray(allergies.big9) ? [...allergies.big9].map(String).sort() : [];
  const other = Array.isArray(allergies.other) ? [...allergies.other].map(String).sort() : [];
  return { big9, other, unparsed: allergies.unparsed === true };
}

function computeGateFingerprint(allergies, tasteProfile) {
  return JSON.stringify({
    allergies: canonicalizeAllergiesForFingerprint(allergies),
    tasteProfile: tasteProfile ?? "",
  });
}

// Mirrors the exact freshness decision block added to index.ts.
function isCacheFresh(existingSlice, currentGateFingerprint) {
  if (!existingSlice) return false;
  try {
    return (
      typeof existingSlice.gate_fingerprint === "string" &&
      existingSlice.gate_fingerprint === currentGateFingerprint
    );
  } catch {
    return false;
  }
}

// Mirrors fallbackToPriorSliceOrError's query exactly (Session 2026-09-23
// fix): status='ready' AND gate_fingerprint = current, ordered by
// slice_date desc, take the top one. `rows` stands in for what a real
// `.select('*').eq('user_id',...).eq('status','ready').eq('gate_fingerprint',
// currentGateFingerprint).order('slice_date',{ascending:false}).limit(1)`
// query would return — filtering + sort done here in JS since this is a
// pure decision-logic mirror, not a live DB call.
function simulateFallbackQuery(rows, userId, currentGateFingerprint) {
  const matches = rows
    .filter((r) => r.user_id === userId && r.status === "ready" && r.gate_fingerprint === currentGateFingerprint)
    .sort((a, b) => (a.slice_date < b.slice_date ? 1 : a.slice_date > b.slice_date ? -1 : 0));
  return matches[0] ?? null;
}

// Verbatim copy of BIG9_TO_POOL_GATE + deriveBig9Gates (index.ts:117-161),
// used only for the no-regression re-run of the Piece 1 cases (g).
const BIG9_TO_POOL_GATE = {
  egg: { column: "contains_egg", value: false },
  milk: { column: "is_dairy_free", value: true },
  fish: { column: "contains_fish", value: false },
  shellfish: { column: "contains_shellfish", value: false },
  tree_nut: { column: "contains_treenut", value: false },
  peanut: { column: "contains_peanut", value: false },
  wheat: { column: "is_gluten_free", value: true },
  soy: { column: "contains_soy", value: false },
  sesame: { column: "contains_sesame", value: false },
};

function deriveBig9Gates(allergies) {
  if (allergies === null || allergies === undefined) return Object.values(BIG9_TO_POOL_GATE);
  if (typeof allergies !== "object") return [];
  const big9 = allergies.big9;
  if (!Array.isArray(big9)) return [];
  const gates = [];
  for (const id of big9) {
    const gate = BIG9_TO_POOL_GATE[id];
    if (gate) gates.push(gate);
  }
  return gates;
}

let pass = 0;
let fail = 0;
function check(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} | ${desc}`);
  if (!ok) {
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
  ok ? pass++ : fail++;
}

console.log("=".repeat(80));
console.log("GATE FINGERPRINT FRESHNESS TEST");
console.log("=".repeat(80), "\n");

// (a) Cached row with matching fingerprint -> served from cache.
{
  const allergies = { big9: ["peanut", "shellfish"], other: [] };
  const tasteProfile = "Leans Italian, cooks for two.";
  const fp = computeGateFingerprint(allergies, tasteProfile);
  const existingSlice = { recipe_ids: ["x", "y", "z"], gate_fingerprint: fp };
  check("(a) matching fingerprint -> cache fresh", isCacheFresh(existingSlice, fp), true);
}

// (b) Allergies changed after caching (add sesame) -> mismatch -> recompute,
// AND the new gate list actually changes what the real pool would allow.
{
  const before = { big9: ["peanut"], other: [] };
  const after = { big9: ["peanut", "sesame"], other: [] };
  const tasteProfile = "Leans Italian.";
  const fpBefore = computeGateFingerprint(before, tasteProfile);
  const fpAfter = computeGateFingerprint(after, tasteProfile);
  const existingSlice = { recipe_ids: ["x"], gate_fingerprint: fpBefore };
  check("(b) fingerprint changes when sesame added", fpBefore === fpAfter, false);
  check("(b) stale cache after allergy change -> NOT fresh", isCacheFresh(existingSlice, fpAfter), false);

  const gatesBefore = deriveBig9Gates(before);
  const gatesAfter = deriveBig9Gates(after);
  const afterHasSesameGate = gatesAfter.some((g) => g.column === "contains_sesame" && g.value === false);
  check("(b) derived gates gain contains_sesame:false after edit", afterHasSesameGate, true);

  // Real pool consequence: rows with contains_sesame=true must be excluded
  // once the sesame gate is added, and must NOT be excluded before.
  const { data: sesameRows, error } = await admin
    .from("suggested_recipe_pool")
    .select("id")
    .eq("meal_type", "dinner")
    .eq("contains_sesame", true)
    .limit(1);
  if (error) throw error;
  const sesameContainingRowExists = (sesameRows ?? []).length > 0;
  console.log(
    `   (info) a real contains_sesame=true dinner row exists in the pool: ${sesameContainingRowExists}`
  );
  if (sesameContainingRowExists) {
    const rowId = sesameRows[0].id;
    const { data: passesBefore } = await admin
      .from("suggested_recipe_pool")
      .select("id")
      .eq("id", rowId)
      .eq(gatesBefore.find((g) => g.column === "contains_peanut")?.column ?? "contains_peanut", false)
      .maybeSingle();
    const { data: passesAfter } = await admin
      .from("suggested_recipe_pool")
      .select("id")
      .eq("id", rowId)
      .eq("contains_sesame", false)
      .maybeSingle();
    check("(b) known sesame-containing row passes the BEFORE gate set", !!passesBefore, true);
    check("(b) same row is excluded by the AFTER (sesame) gate", !!passesAfter, false);
  }
}

// (c) taste_profile changed -> recompute.
{
  const allergies = { big9: [], other: [] };
  const fpBefore = computeGateFingerprint(allergies, "Leans Italian.");
  const fpAfter = computeGateFingerprint(allergies, "Leans Italian. Hard allergy to shellfish.");
  const existingSlice = { gate_fingerprint: fpBefore };
  check("(c) taste_profile edit changes fingerprint", fpBefore === fpAfter, false);
  check("(c) stale cache after taste_profile edit -> NOT fresh", isCacheFresh(existingSlice, fpAfter), false);
}

// (d) Existing row with no fingerprint (every row today) -> recompute.
{
  const currentFp = computeGateFingerprint({ big9: ["peanut"], other: [] }, "");
  const existingSlice = { recipe_ids: ["x"], gate_fingerprint: undefined };
  check("(d) row with no stored fingerprint -> NOT fresh", isCacheFresh(existingSlice, currentFp), false);
  const existingSliceNullCol = { recipe_ids: ["x"], gate_fingerprint: null };
  check("(d) row with NULL fingerprint column -> NOT fresh", isCacheFresh(existingSliceNullCol, currentFp), false);
}

// (e) NULL allergies vs confirmed-empty {big9:[],other:[]} -> different fingerprints.
{
  const fpNull = computeGateFingerprint(null, "");
  const fpConfirmedEmpty = computeGateFingerprint({ big9: [], other: [] }, "");
  check("(e) NULL vs confirmed-empty produce different fingerprints", fpNull === fpConfirmedEmpty, false);
  check("(e) NULL allergies canonicalizes to null", canonicalizeAllergiesForFingerprint(null), null);
  check(
    "(e) confirmed-empty canonicalizes to explicit empty-arrays object",
    canonicalizeAllergiesForFingerprint({ big9: [], other: [] }),
    { big9: [], other: [], unparsed: false }
  );
}

// (e2) Determinism: array order must not matter (sorted before serializing).
{
  const a = computeGateFingerprint({ big9: ["shellfish", "peanut"], other: ["mustard", "kiwi"] }, "x");
  const b = computeGateFingerprint({ big9: ["peanut", "shellfish"], other: ["kiwi", "mustard"] }, "x");
  check("(e2) big9/other array order does not affect fingerprint", a === b, true);
}

// (f) Malformed stored fingerprint -> recompute, no crash.
{
  const currentFp = computeGateFingerprint({ big9: [], other: [] }, "");
  for (const malformed of [123, {}, [], true, ""]) {
    let threw = false;
    let fresh;
    try {
      fresh = isCacheFresh({ gate_fingerprint: malformed }, currentFp);
    } catch {
      threw = true;
    }
    check(`(f) malformed gate_fingerprint (${JSON.stringify(malformed)}) -> no crash`, threw, false);
    check(`(f) malformed gate_fingerprint (${JSON.stringify(malformed)}) -> NOT fresh`, fresh, false);
  }
}

// (g) Piece 1 regression re-run — unchanged by this session's edit, since
// deriveBig9Gates itself was not touched, only where/when it's called.
{
  check("(g) NULL allergies -> all nine Big9 gates", deriveBig9Gates(null).length, Object.keys(BIG9_TO_POOL_GATE).length);
  check("(g) confirmed-empty -> no gates", deriveBig9Gates({ big9: [], other: [] }), []);
  check(
    "(g) shellfish-only -> exactly the shellfish gate, unchanged",
    deriveBig9Gates({ big9: ["shellfish"], other: [] }),
    [{ column: "contains_shellfish", value: false }]
  );
}

// (i) Allergy edit + forced Stage-2 failure -> user is NOT served the
// pre-edit slice. This is the exact fail-open the prior version of
// fallbackToPriorSliceOrError had: today's freshness check correctly
// rejects the stale row (mismatch), recompute is attempted, but the AI call
// fails (Stage 2 error) before the row is overwritten — the stale row is
// still sitting there with status='ready' and TODAY's date, which used to
// make it the unconditional top pick of "most recent ready row."
{
  const userId = "u1";
  const today = "2026-09-23";
  const fpPreEdit = computeGateFingerprint({ big9: ["peanut"], other: [] }, "");
  const fpPostEdit = computeGateFingerprint({ big9: ["peanut", "sesame"], other: [] }, "");
  const rows = [
    { user_id: userId, slice_date: today, status: "ready", gate_fingerprint: fpPreEdit, recipe_ids: ["stale-sesame-dish"] },
  ];
  const fallback = simulateFallbackQuery(rows, userId, fpPostEdit);
  check("(i) forced Stage-2 failure after allergy edit -> no fallback slice served", fallback, null);
}

// (ii) Fallback with a matching fingerprint still works as before — a prior
// day's row computed under allergies/taste_profile that HAVEN'T changed
// since is still a legitimate degrade-gracefully candidate.
{
  const userId = "u1";
  const fpCurrent = computeGateFingerprint({ big9: ["peanut"], other: [] }, "Leans Italian.");
  const rows = [
    { user_id: userId, slice_date: "2026-09-20", status: "ready", gate_fingerprint: fpCurrent, recipe_ids: ["still-good-dish"] },
    { user_id: "other-user", slice_date: "2026-09-23", status: "ready", gate_fingerprint: fpCurrent, recipe_ids: ["not-this-users-row"] },
  ];
  const fallback = simulateFallbackQuery(rows, userId, fpCurrent);
  check("(ii) matching-fingerprint prior-day fallback still served", fallback?.recipe_ids, ["still-good-dish"]);
}

// (iii) Profile-read failure -> must fail closed (NULL -> all nine gates)
// and the freshness check must treat it as a mismatch, never a cache hit,
// against any OTHER real profile state.
{
  // profileRow undefined (as if the read failed) collapses to the same
  // fingerprint as a genuinely-null allergies profile — both feed
  // deriveBig9Gates(undefined/null) -> ALL_BIG9_IDS, so this IS the
  // fail-closed path, not a silent skip.
  const fpOnReadFailure = computeGateFingerprint(undefined, "");
  const fpGenuineNull = computeGateFingerprint(null, "");
  check("(iii) profile-read failure fingerprints identically to genuine NULL allergies", fpOnReadFailure === fpGenuineNull, true);
  check(
    "(iii) read-failure gate set is the fail-closed ALL_BIG9 set",
    deriveBig9Gates(undefined).length,
    Object.keys(BIG9_TO_POOL_GATE).length
  );

  // It must NOT spuriously match a real, non-null profile's stored
  // fingerprint (no false "cache is fresh" off a read failure).
  const fpRealPeanutProfile = computeGateFingerprint({ big9: ["peanut"], other: [] }, "");
  const existingSlice = { gate_fingerprint: fpRealPeanutProfile };
  check(
    "(iii) read-failure fingerprint does NOT match a real allergy profile's cached row -> NOT fresh",
    isCacheFresh(existingSlice, fpOnReadFailure),
    false
  );

  // Safety proof for the one case where a collision COULD occur: if the
  // matching cached row was itself genuinely computed under null allergies
  // (also all-nine-gated), serving it is still safe on a read failure,
  // because the read-failure fallback gate set (all nine) is always a
  // superset of any real, narrower allergy gate set — it can only be MORE
  // restrictive, never less.
  const allNineColumns = new Set(deriveBig9Gates(null).map((g) => g.column));
  const narrowerColumns = new Set(deriveBig9Gates({ big9: ["peanut", "sesame"], other: [] }).map((g) => g.column));
  const isSuperset = [...narrowerColumns].every((c) => allNineColumns.has(c));
  check("(iii) fail-closed ALL_BIG9 gate set is a superset of any narrower real gate set", isSuperset, true);
}

console.log("\n" + "=".repeat(80));
console.log(`SUMMARY: ${pass} passed, ${fail} failed out of ${pass + fail}`);
console.log("=".repeat(80));
if (fail > 0) process.exit(1);
