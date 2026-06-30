// Chip timing shapes
type SeasonalTiming = {
  kind: "seasonal";
  start: string; // MM-DD
  end: string; // MM-DD
};

type FixedHolidayTiming = {
  kind: "fixedHoliday";
  monthDay: string; // MM-DD
  leadInDays: number;
};

type FloatingHolidayTiming = {
  kind: "floatingHoliday";
  dates: string[]; // YYYY-MM-DD
  leadInDays: number;
};

type RecurringWeeklyTiming = {
  kind: "recurringWeekly";
  weekdays: number[]; // 0=Sun, 6=Sat
  seasonStart: string; // MM-DD
  seasonEnd: string; // MM-DD
};

type OneOffTiming = {
  kind: "oneOff";
  date: string; // YYYY-MM-DD
  leadInDays: number;
};

type ChipTiming =
  | SeasonalTiming
  | FixedHolidayTiming
  | FloatingHolidayTiming
  | RecurringWeeklyTiming
  | OneOffTiming;

// Chip data structure
export type SuggestionChip = {
  header: string;
  body: string;
  prompt: string;
  type: "build" | "brainstorm" | "help";
  timing?: ChipTiming;
};

// Evergreen chips (no timing — always available)
const evergreenChips: SuggestionChip[] = [
  {
    header: "Help",
    body: "me decide on dinner",
    prompt: "Help me decide what to make for dinner tonight",
    type: "help",
  },
  {
    header: "Brainstorm",
    body: "sides for grilled steak",
    prompt: "Brainstorm some sides to go with a grilled steak",
    type: "brainstorm",
  },
  {
    header: "Build",
    body: "a fun Sunday dinner",
    prompt: "Help me build a fun Sunday dinner",
    type: "build",
  },
  {
    header: "Help",
    body: "me use up leftovers",
    prompt: "Help me figure out dinner using up leftovers I have",
    type: "help",
  },
  {
    header: "Brainstorm",
    body: "a quick weeknight meal",
    prompt: "Brainstorm a quick and easy weeknight dinner",
    type: "brainstorm",
  },
  {
    header: "Build",
    body: "a cozy dinner for two",
    prompt: "Help me build a cozy dinner for two",
    type: "build",
  },
  {
    header: "Help",
    body: "me cook what's in season",
    prompt: "Help me cook something that's in season right now",
    type: "help",
  },
  {
    header: "Brainstorm",
    body: "dinner from my fridge",
    prompt: "Brainstorm what I can make for dinner from what's in my fridge",
    type: "brainstorm",
  },
];

// Time-aware chips
const timeAwareChips: SuggestionChip[] = [
  {
    header: "Brainstorm",
    body: "an easy summer dinner",
    prompt: "Brainstorm an easy summer dinner I can make outside",
    type: "brainstorm",
    timing: {
      kind: "seasonal",
      start: "06-16",
      end: "08-31",
    },
  },
  {
    header: "Build",
    body: "a cozy fall dinner",
    prompt: "Help me build a cozy fall comfort dinner",
    type: "build",
    timing: {
      kind: "seasonal",
      start: "09-01",
      end: "10-31",
    },
  },
  {
    header: "Build",
    body: "a July 4th cookout",
    prompt: "Help me build a menu for a July 4th cookout",
    type: "build",
    timing: {
      kind: "fixedHoliday",
      monthDay: "07-04",
      leadInDays: 10,
    },
  },
  {
    header: "Help",
    body: "me plan Thanksgiving dinner",
    prompt: "Help me plan the menu for Thanksgiving dinner",
    type: "help",
    timing: {
      kind: "floatingHoliday",
      dates: ["2026-11-26", "2027-11-25"],
      leadInDays: 16,
    },
  },
  {
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
  },
  {
    header: "Brainstorm",
    body: "an awards-night menu",
    prompt: "Brainstorm a fun menu for an awards-show watch night",
    type: "brainstorm",
    timing: {
      kind: "oneOff",
      date: "2026-02-01",
      leadInDays: 4,
    },
  },
];

// Helper: parse MM-DD string to month/day numbers
function parseMonthDay(monthDay: string): { month: number; day: number } {
  const [month, day] = monthDay.split("-").map(Number);
  return { month, day };
}

// Helper: check if a date falls within a seasonal range (handles wrap-around)
function isInSeasonalRange(
  today: Date,
  startMD: string,
  endMD: string
): boolean {
  const { month: startMonth, day: startDay } = parseMonthDay(startMD);
  const { month: endMonth, day: endDay } = parseMonthDay(endMD);

  const todayMonth = today.getMonth() + 1; // getMonth is 0-indexed
  const todayDay = today.getDate();

  // Convert to comparable numbers: MMDD as integer
  const todayValue = todayMonth * 100 + todayDay;
  const startValue = startMonth * 100 + startDay;
  const endValue = endMonth * 100 + endDay;

  if (startValue <= endValue) {
    // Normal range (doesn't wrap)
    return todayValue >= startValue && todayValue <= endValue;
  } else {
    // Wraps across new year (e.g. 09-05 to 02-09)
    return todayValue >= startValue || todayValue <= endValue;
  }
}

// Helper: get date N days before a target date
function getDaysBeforeDate(targetDate: Date, days: number): Date {
  const result = new Date(targetDate);
  result.setDate(result.getDate() - days);
  return result;
}

// Helper: check if today is within lead-in window (leadInStart <= today <= target)
function isInLeadInWindow(
  today: Date,
  targetDate: Date,
  leadInDays: number
): boolean {
  const leadInStart = getDaysBeforeDate(targetDate, leadInDays);
  const todayTime = today.getTime();
  const startTime = leadInStart.getTime();
  const endTime = targetDate.getTime();

  // Normalize to start of day for comparison
  const todayStartOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const startStartOfDay = new Date(
    leadInStart.getFullYear(),
    leadInStart.getMonth(),
    leadInStart.getDate()
  ).getTime();
  const endStartOfDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  ).getTime();

  return todayStartOfDay >= startStartOfDay && todayStartOfDay <= endStartOfDay;
}

// Check if a time-aware chip is active on a given date
export function isChipActive(chip: SuggestionChip, today: Date): boolean {
  if (!chip.timing) return true; // Evergreen chips are always active

  const timing = chip.timing;

  switch (timing.kind) {
    case "seasonal": {
      return isInSeasonalRange(today, timing.start, timing.end);
    }

    case "fixedHoliday": {
      const { month, day } = parseMonthDay(timing.monthDay);
      const thisYearDate = new Date(today.getFullYear(), month - 1, day);
      return isInLeadInWindow(today, thisYearDate, timing.leadInDays);
    }

    case "floatingHoliday": {
      // Check if today falls within lead-in window of any listed date
      for (const dateStr of timing.dates) {
        const targetDate = new Date(dateStr);
        if (isInLeadInWindow(today, targetDate, timing.leadInDays)) {
          return true;
        }
      }
      return false;
    }

    case "recurringWeekly": {
      const todayWeekday = today.getDay();
      // First check if today's weekday matches
      if (!timing.weekdays.includes(todayWeekday)) {
        return false;
      }
      // Then check if today is within the season window
      return isInSeasonalRange(today, timing.seasonStart, timing.seasonEnd);
    }

    case "oneOff": {
      const targetDate = new Date(timing.date);
      return isInLeadInWindow(today, targetDate, timing.leadInDays);
    }

    default:
      return false;
  }
}

// Pick exactly 3 chips for display
export function pickChips(today: Date): [SuggestionChip, SuggestionChip, SuggestionChip] {
  // Find active time-aware chips
  const activeTimeAware = timeAwareChips.filter((chip) =>
    isChipActive(chip, today)
  );

  const selected: SuggestionChip[] = [];

  // Add active time-aware chips first (up to 3)
  for (const chip of activeTimeAware) {
    if (selected.length >= 3) break;
    selected.push(chip);
  }

  // Fill remaining slots from evergreen pool
  if (selected.length < 3) {
    // Try to vary types where possible
    const usedTypes = new Set(selected.map((c) => c.type));
    const remainingSlots = 3 - selected.length;

    // First pass: add evergreen chips with unused types
    for (const chip of evergreenChips) {
      if (selected.length >= 3) break;
      if (!usedTypes.has(chip.type)) {
        selected.push(chip);
        usedTypes.add(chip.type);
      }
    }

    // Second pass: fill any remaining slots (if types are exhausted)
    for (const chip of evergreenChips) {
      if (selected.length >= 3) break;
      if (!selected.includes(chip)) {
        selected.push(chip);
      }
    }
  }

  // Safety check: ensure we have exactly 3
  if (selected.length !== 3) {
    throw new Error(`pickChips returned ${selected.length} chips instead of 3`);
  }

  return [selected[0], selected[1], selected[2]];
}
