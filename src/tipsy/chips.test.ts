// Permanent test for chip timing logic
// Run with: bun run src/tipsy/chips.test.ts

import { isChipActive, type SuggestionChip } from "./chips";

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
console.log(`SUMMARY: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
console.log("=".repeat(80));

// Exit with error code if any tests failed
if (failCount > 0) {
  process.exit(1);
}
