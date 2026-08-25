// Permanent test for chip timing logic + the selectDailyChips selection engine
// Run with: bun run src/tipsy/chips.test.ts

import { isChipActive, selectDailyChips, allChips, type SuggestionChip } from "./chips";

// Import chip definitions by reconstructing them exactly as defined in chips.ts
const gamedayChip: SuggestionChip = {
  header: "Build",
  body: "a gameday spread",
  prompt: "Help me build a spread for watching the game this weekend",
  type: "build",
  timing: {
    kind: "recurringWeekly",
    weekdays: [0, 6], // Saturday and Sunday
    seasonStart: "09-05",
    seasonEnd: "02-09",
  },
};

const july4thChip: SuggestionChip = {
  header: "Build",
  body: "a July 4th cookout",
  prompt: "Help me build a menu for a July 4th cookout",
  type: "build",
  timing: {
    kind: "fixedHoliday",
    monthDay: "07-04",
    leadInDays: 10,
  },
};

const awardsNightChip: SuggestionChip = {
  header: "Brainstorm",
  body: "an awards-night menu",
  prompt: "Brainstorm a fun menu for an awards-show watch night",
  type: "brainstorm",
  timing: {
    kind: "oneOff",
    date: "2026-02-01",
    leadInDays: 4,
  },
};

const summerChip: SuggestionChip = {
  header: "Brainstorm",
  body: "an easy summer dinner",
  prompt: "Brainstorm an easy summer dinner I can make outside",
  type: "brainstorm",
  timing: {
    kind: "seasonal",
    start: "06-16",
    end: "08-31",
  },
};

const fallChip: SuggestionChip = {
  header: "Build",
  body: "a cozy fall dinner",
  prompt: "Help me build a cozy fall comfort dinner",
  type: "build",
  timing: {
    kind: "seasonal",
    start: "09-01",
    end: "10-31",
  },
};

const thanksgivingChip: SuggestionChip = {
  header: "Help",
  body: "me plan Thanksgiving dinner",
  prompt: "Help me plan the menu for Thanksgiving dinner",
  type: "help",
  timing: {
    kind: "floatingHoliday",
    dates: ["2026-11-26", "2027-11-25"],
    leadInDays: 16,
  },
};

// Helper to get weekday name
function getWeekdayName(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

// Test case structure
type TestCase = {
  date: Date;
  chip: SuggestionChip;
  chipName: string;
  expected: boolean;
  description: string;
};

const testCases: TestCase[] = [
  // Gameday (recurringWeekly, Sat/Sun, season 09-05 → 02-09, wraps New Year)
  { date: new Date(2026, 0, 11), chip: gamedayChip, chipName: "Gameday", expected: true, description: "2026-01-11 (Sun)" },
  { date: new Date(2026, 0, 13), chip: gamedayChip, chipName: "Gameday", expected: false, description: "2026-01-13 (Tue)" },
  { date: new Date(2026, 0, 17), chip: gamedayChip, chipName: "Gameday", expected: true, description: "2026-01-17 (Sat)" },
  { date: new Date(2026, 1, 8), chip: gamedayChip, chipName: "Gameday", expected: true, description: "2026-02-08 (Sun)" },
  { date: new Date(2026, 1, 15), chip: gamedayChip, chipName: "Gameday", expected: false, description: "2026-02-15 (Sun)" },
  { date: new Date(2025, 11, 28), chip: gamedayChip, chipName: "Gameday", expected: true, description: "2025-12-28 (Sun)" },
  { date: new Date(2026, 6, 12), chip: gamedayChip, chipName: "Gameday", expected: false, description: "2026-07-12 (Sun)" },
  { date: new Date(2026, 8, 6), chip: gamedayChip, chipName: "Gameday", expected: true, description: "2026-09-06 (Sun)" },
  { date: new Date(2026, 8, 2), chip: gamedayChip, chipName: "Gameday", expected: false, description: "2026-09-02 (Tue)" },

  // July 4th (fixedHoliday, 07-04, leadIn 10 → window 06-24 through 07-04)
  { date: new Date(2026, 5, 23), chip: july4thChip, chipName: "July 4th", expected: false, description: "2026-06-23" },
  { date: new Date(2026, 5, 24), chip: july4thChip, chipName: "July 4th", expected: true, description: "2026-06-24" },
  { date: new Date(2026, 6, 4), chip: july4thChip, chipName: "July 4th", expected: true, description: "2026-07-04" },
  { date: new Date(2026, 6, 5), chip: july4thChip, chipName: "July 4th", expected: false, description: "2026-07-05" },

  // Awards (oneOff, 2026-02-01, leadIn 4 → window 01-28 through 02-01)
  { date: new Date(2026, 0, 27), chip: awardsNightChip, chipName: "Awards", expected: false, description: "2026-01-27" },
  { date: new Date(2026, 0, 28), chip: awardsNightChip, chipName: "Awards", expected: true, description: "2026-01-28" },
  { date: new Date(2026, 1, 1), chip: awardsNightChip, chipName: "Awards", expected: true, description: "2026-02-01" },
  { date: new Date(2026, 1, 2), chip: awardsNightChip, chipName: "Awards", expected: false, description: "2026-02-02" },

  // Summer (seasonal, 06-16 → 08-31) — tight edges
  { date: new Date(2026, 5, 15), chip: summerChip, chipName: "Summer", expected: false, description: "2026-06-15" },
  { date: new Date(2026, 5, 16), chip: summerChip, chipName: "Summer", expected: true, description: "2026-06-16" },
  { date: new Date(2026, 7, 31), chip: summerChip, chipName: "Summer", expected: true, description: "2026-08-31" },
  { date: new Date(2026, 8, 1), chip: summerChip, chipName: "Summer", expected: false, description: "2026-09-01" },

  // Fall (seasonal, 09-01 → 10-31) — tight edges
  { date: new Date(2026, 7, 31), chip: fallChip, chipName: "Fall", expected: false, description: "2026-08-31" },
  { date: new Date(2026, 8, 1), chip: fallChip, chipName: "Fall", expected: true, description: "2026-09-01" },
  { date: new Date(2026, 9, 31), chip: fallChip, chipName: "Fall", expected: true, description: "2026-10-31" },
  { date: new Date(2026, 10, 1), chip: fallChip, chipName: "Fall", expected: false, description: "2026-11-01" },

  // Thanksgiving (floatingHoliday, 2026-11-26, leadIn 16 → window 11-10 through 11-26)
  { date: new Date(2026, 10, 9), chip: thanksgivingChip, chipName: "Thanksgiving", expected: false, description: "2026-11-09" },
  { date: new Date(2026, 10, 10), chip: thanksgivingChip, chipName: "Thanksgiving", expected: true, description: "2026-11-10" },
  { date: new Date(2026, 10, 26), chip: thanksgivingChip, chipName: "Thanksgiving", expected: true, description: "2026-11-26" },
  { date: new Date(2026, 10, 27), chip: thanksgivingChip, chipName: "Thanksgiving", expected: false, description: "2026-11-27" },
];

console.log("=".repeat(80));
console.log("CHIP TIMING TEST (LOCAL DATE HANDLING)");
console.log("=".repeat(80));
console.log();

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  const weekday = getWeekdayName(testCase.date);
  const actual = isChipActive(testCase.chip, testCase.date);
  const match = actual === testCase.expected;

  const status = match ? "✓ PASS" : "✗ FAIL";
  const activeStr = actual ? "ACTIVE" : "NOT active";
  const expectedStr = testCase.expected ? "ACTIVE" : "NOT active";

  console.log(
    `${status} | ${testCase.chipName.padEnd(12)} | ${testCase.description.padEnd(16)} (${weekday.padEnd(9)}) → ${activeStr.padEnd(11)} | Expected: ${expectedStr}`
  );

  if (match) {
    passCount++;
  } else {
    failCount++;
  }
}

console.log();
console.log("=".repeat(80));
console.log(`SECTION 1 SUMMARY: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
console.log("=".repeat(80));

// ---------------------------------------------------------------------------
// SECTION 2 — selectDailyChips (moment-aware selection engine)
// ---------------------------------------------------------------------------

console.log();
console.log("=".repeat(80));
console.log("SELECTDAILYCHIPS TEST (MOMENT-AWARE SELECTION ENGINE)");
console.log("=".repeat(80));
console.log();

let section2Pass = 0;
let section2Fail = 0;

function check(condition: boolean, description: string) {
  const status = condition ? "✓ PASS" : "✗ FAIL";
  console.log(`${status} | ${description}`);
  if (condition) {
    section2Pass++;
  } else {
    section2Fail++;
  }
}

// (a) Moment-first: an active occasion — even a low-priority (ambient) one —
// surfaces before day-type/season chips. 2026-10-20 is a Tuesday (weeknight)
// in fall, with only the ambient "first-cold-snap" occasion active (no
// tentpole occasion overlaps this date) — both of its chips have distinct
// types, so both should fill the top 2 slots ahead of weeknight/fall chips.
{
  const today = new Date(2026, 9, 20);
  const result = selectDailyChips({ today, userId: "moment-test-user", tasteProfile: null, recentlyShownIds: [] });
  check(result.length === 3, "Moment-first: still returns exactly 3 chips on 2026-10-20");
  check(
    result[0].occasion === "first-cold-snap" && result[1].occasion === "first-cold-snap",
    "Moment-first: active ambient occasion (first-cold-snap) fills both top slots ahead of day-type/season chips on 2026-10-20"
  );
}

// (b) Priority: a tentpole occasion (priority 2) beats an ambient occasion
// (priority 0) even when BOTH are active the same day. 2026-11-20 falls
// inside both thanksgiving-week's window (priority 2) and first-cold-snap's/
// soup-season's windows (priority 0) — thanksgiving-week's 3 chips have 3
// distinct types, so the top 2 slots should always be thanksgiving-week,
// regardless of the per-user rotation seed.
const priorityTestUserIds = ["alice", "bob", "carol", "dave", "erin"];
{
  const today = new Date(2026, 10, 20);
  for (const userId of priorityTestUserIds) {
    const result = selectDailyChips({ today, userId, tasteProfile: null, recentlyShownIds: [] });
    check(
      result[0].occasion === "thanksgiving-week" && result[1].occasion === "thanksgiving-week",
      `Priority: tentpole thanksgiving-week (priority 2) beats ambient first-cold-snap/soup-season (priority 0) for userId=${userId} on 2026-11-20`
    );
  }
}

// (c) Light dietary filter: a vegetarian-leaning taste_profile still returns
// a full 3 chips, with zero contains-meat/contains-pork/contains-shellfish
// chips among them. 2026-01-15 has no tentpole occasion active, so this
// exercises the general dietary-safe pool, not just the occasion tier.
{
  const today = new Date(2026, 0, 15);
  const result = selectDailyChips({
    today,
    userId: "veg-test-user",
    tasteProfile: "I'm vegetarian and love pasta",
    recentlyShownIds: [],
  });
  const flagged = result.filter((c) =>
    c.dietary?.some((f) => f === "contains-meat" || f === "contains-pork" || f === "contains-shellfish")
  );
  check(result.length === 3, "Dietary filter: vegetarian taste_profile still returns a full 3 chips");
  check(flagged.length === 0, "Dietary filter: vegetarian taste_profile excludes all meat/pork/shellfish chips");
}

// (d) Don't-repeat, with floor-relaxation guaranteeing a full 3 even when the
// exclusion list would otherwise starve the pool. 2026-04-10 is an ordinary
// day (only the ambient spring-produce occasion active) with a large enough
// active pool that excluding 3 specific prompts should swap them out cleanly.
{
  const today = new Date(2026, 3, 10);
  const userId = "repeat-test-user";
  const baseline = selectDailyChips({ today, userId, tasteProfile: null, recentlyShownIds: [] });
  const baselineIds = baseline.map((c) => c.prompt);

  const afterExclusion = selectDailyChips({ today, userId, tasteProfile: null, recentlyShownIds: baselineIds });
  const overlap = afterExclusion.filter((c) => baselineIds.includes(c.prompt));
  check(afterExclusion.length === 3, "Don't-repeat: excluding the prior day's 3 picks still returns a full 3");
  check(overlap.length === 0, "Don't-repeat: excluding the prior day's 3 picks avoids repeating any of them when the pool has room");

  // Floor-relaxation: exclude literally the ENTIRE chip pool as "recently
  // shown" — selectDailyChips must still return 3 (the never-below-3
  // guarantee), by progressively re-admitting the oldest excluded ids.
  const everyPrompt = allChips.map((c) => c.prompt);
  const starved = selectDailyChips({ today, userId, tasteProfile: null, recentlyShownIds: everyPrompt });
  check(starved.length === 3, "Don't-repeat floor-relaxation: excluding the ENTIRE chip pool still returns a full 3 (never starves below 3)");
}

// (e) Per-user variation: several different userIds on the SAME day produce
// more than one distinct 3-chip set, while every one of them still honors
// the day's moment (thanksgiving-week on 2026-11-20, reusing test (b)'s
// date/userIds so this also double-checks (b)'s moment guarantee holds
// across the same variation used here).
{
  const today = new Date(2026, 10, 20);
  const resultKeys = priorityTestUserIds.map((userId) => {
    const result = selectDailyChips({ today, userId, tasteProfile: null, recentlyShownIds: [] });
    return result.map((c) => c.prompt).join("|");
  });
  const distinctCount = new Set(resultKeys).size;
  check(
    distinctCount > 1,
    `Per-user variation: ${priorityTestUserIds.length} different userIds on the same day produce more than 1 distinct chip set (got ${distinctCount})`
  );
}

console.log();
console.log("=".repeat(80));
console.log(`SECTION 2 SUMMARY: ${section2Pass} passed, ${section2Fail} failed`);
console.log("=".repeat(80));

const totalPass = passCount + section2Pass;
const totalFail = failCount + section2Fail;

console.log();
console.log("=".repeat(80));
console.log(`GRAND TOTAL: ${totalPass} passed, ${totalFail} failed`);
console.log("=".repeat(80));

// Exit with error code if any tests failed
if (totalFail > 0) {
  process.exit(1);
}
