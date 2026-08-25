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

// Moment-aware taxonomy used by selectDailyChips' moment-first selection.
export type DayType = "weeknight" | "friday" | "weekend" | "sunday";
export type Season = "spring" | "summer" | "fall" | "winter";
export type DietaryFlag =
  | "contains-meat"
  | "contains-pork"
  | "contains-shellfish"
  | "vegetarian-friendly";

// Recognized occasion ids (informational — `occasion` stays a plain string so
// Stage 2/3 can extend the set without a type change):
// gameday-football, super-bowl, thanksgiving-week, christmas-baking, christmas,
// new-years-eve, fourth-of-july, summer-grilling, first-cold-snap, cinco-de-mayo,
// valentines, mothers-day, fathers-day, halloween, easter, st-patricks-day,
// spring-produce, tomato-season, stone-fruit-season, citrus-winter, soup-season

// Chip data structure
export type SuggestionChip = {
  header: string;
  body: string;
  prompt: string;
  type: "build" | "brainstorm" | "help";
  timing?: ChipTiming;
  dayType?: DayType[];
  season?: Season[];
  occasion?: string;
  dietary?: DietaryFlag[];
  priority?: number;
};

// Evergreen chips (no timing — always available). Three of the original eight
// carry light retagging (dayType/dietary) added this session; five stay fully
// untagged on purpose as the always-eligible baseline. header/body/prompt/type
// values are unchanged from the original set.
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
    dietary: ["contains-meat"],
  },
  {
    header: "Build",
    body: "a fun Sunday dinner",
    prompt: "Help me build a fun Sunday dinner",
    type: "build",
    dayType: ["sunday"],
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
    dayType: ["weeknight"],
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

// Time-aware chips (original six — timing/header/body/prompt/type values
// unchanged; occasion/season/dayType/dietary tags added this session).
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
    season: ["summer"],
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
    season: ["fall"],
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
    occasion: "fourth-of-july",
    priority: 2,
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
    occasion: "thanksgiving-week",
    priority: 2,
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
    occasion: "gameday-football",
    priority: 1,
    dayType: ["weekend"],
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

// ---------------------------------------------------------------------------
// Moment-aware starter pool additions (occasions, day-types, seasons, dietary
// flags), selected against by selectDailyChips. Occasion timing below reuses
// the five existing timing shapes only — no new timing kinds.
// ---------------------------------------------------------------------------

// Occasion timing windows — lead-in long, ends on/just after the occasion.
const THANKSGIVING_WEEK_TIMING: ChipTiming = {
  kind: "floatingHoliday",
  dates: ["2026-11-26", "2027-11-25"],
  leadInDays: 18,
};
const CHRISTMAS_BAKING_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "12-01",
  end: "12-20",
};
const CHRISTMAS_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "12-25",
  leadInDays: 10,
};
const NEW_YEARS_EVE_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "12-31",
  leadInDays: 7,
};
const SUPER_BOWL_TIMING: ChipTiming = {
  kind: "floatingHoliday",
  dates: ["2026-02-08", "2027-02-14"],
  leadInDays: 7,
};
const FOURTH_OF_JULY_OCCASION_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "07-04",
  leadInDays: 7,
};
const HALLOWEEN_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "10-31",
  leadInDays: 7,
};
const EASTER_TIMING: ChipTiming = {
  kind: "floatingHoliday",
  dates: ["2026-04-05", "2027-03-28"],
  leadInDays: 6,
};
const CINCO_DE_MAYO_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "05-05",
  leadInDays: 6,
};
const VALENTINES_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "02-14",
  leadInDays: 6,
};
const ST_PATRICKS_DAY_TIMING: ChipTiming = {
  kind: "fixedHoliday",
  monthDay: "03-17",
  leadInDays: 5,
};
const MOTHERS_DAY_TIMING: ChipTiming = {
  kind: "floatingHoliday",
  dates: ["2026-05-10", "2027-05-09"],
  leadInDays: 7,
};
const FATHERS_DAY_TIMING: ChipTiming = {
  kind: "floatingHoliday",
  dates: ["2026-06-21", "2027-06-20"],
  leadInDays: 7,
};
const SUMMER_GRILLING_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "06-01",
  end: "08-31",
};
const FIRST_COLD_SNAP_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "10-15",
  end: "11-30",
};
const SOUP_SEASON_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "11-01",
  end: "02-28",
};
const SPRING_PRODUCE_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "03-15",
  end: "05-31",
};
const TOMATO_SEASON_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "07-01",
  end: "09-15",
};
const STONE_FRUIT_SEASON_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "06-01",
  end: "08-15",
};
const CITRUS_WINTER_TIMING: ChipTiming = {
  kind: "seasonal",
  start: "12-01",
  end: "02-28",
};

// Day-type rhythm chips — no occasion/timing, just dayType.
export const dayTypeChips: SuggestionChip[] = [
  {
    header: "Help",
    body: "me build a fast dinner",
    prompt: "Help me build a dinner that's ready in under 30 minutes",
    type: "help",
    dayType: ["weeknight"],
  },
  {
    header: "Brainstorm",
    body: "a one-pan weeknight dinner",
    prompt: "Brainstorm a one-pan dinner I can clean up in five minutes",
    type: "brainstorm",
    dayType: ["weeknight"],
  },
  {
    header: "Help",
    body: "me stretch dinner into lunch",
    prompt: "Help me plan a dinner I can stretch into tomorrow's lunch",
    type: "help",
    dayType: ["weeknight"],
  },
  {
    header: "Build",
    body: "a fast weeknight pasta",
    prompt: "Help me build a pasta dinner I can have on the table fast",
    type: "build",
    dayType: ["weeknight"],
  },
  {
    header: "Build",
    body: "a Friday night upgrade",
    prompt: "Help me build a dinner that beats delivery on a Friday night",
    type: "build",
    dayType: ["friday"],
  },
  {
    header: "Brainstorm",
    body: "a Friday pizza night",
    prompt: "Brainstorm a homemade pizza night to kick off the weekend",
    type: "brainstorm",
    dayType: ["friday"],
  },
  {
    header: "Help",
    body: "me plan an easy Friday splurge",
    prompt: "Help me plan a low-effort Friday dinner that still feels special",
    type: "help",
    dayType: ["friday"],
  },
  {
    header: "Build",
    body: "a weekend cooking project",
    prompt: "Help me build a weekend recipe worth spending a few hours on",
    type: "build",
    dayType: ["weekend"],
  },
  {
    header: "Brainstorm",
    body: "a lazy weekend brunch",
    prompt: "Brainstorm a slow weekend brunch I can make with coffee in hand",
    type: "brainstorm",
    dayType: ["weekend"],
  },
  {
    header: "Help",
    body: "me plan a weekend dinner party",
    prompt: "Help me plan a dinner party menu for this weekend",
    type: "help",
    dayType: ["weekend"],
  },
  {
    header: "Build",
    body: "a Sunday roast",
    prompt: "Help me build a Sunday roast dinner for the whole table",
    type: "build",
    dayType: ["sunday"],
    dietary: ["contains-meat"],
  },
  {
    header: "Brainstorm",
    body: "Sunday meal prep for the week",
    prompt: "Brainstorm a Sunday meal prep that covers me through Wednesday",
    type: "brainstorm",
    dayType: ["sunday"],
  },
  {
    header: "Build",
    body: "a cozy Sunday supper",
    prompt: "Help me build a cozy Sunday supper to end the weekend",
    type: "build",
    dayType: ["sunday"],
  },
  {
    header: "Build",
    body: "a Friday dinner that kicks off the weekend",
    prompt: "Help me build a dinner that feels like the weekend has started",
    type: "build",
    dayType: ["friday"],
  },
  {
    header: "Brainstorm",
    body: "a Friday movie-night dinner",
    prompt: "Brainstorm a Friday night dinner I can eat in front of a movie",
    type: "brainstorm",
    dayType: ["friday"],
  },
  {
    header: "Build",
    body: "a one-skillet weeknight dinner",
    prompt: "Help me build a dinner I can cook in one skillet",
    type: "build",
    dayType: ["weeknight"],
  },
  {
    header: "Brainstorm",
    body: "a fast weeknight stir-fry",
    prompt: "Brainstorm a weeknight stir-fry I can get on the table fast",
    type: "brainstorm",
    dayType: ["weeknight"],
  },
];

// Season-only chips (no specific occasion) — one per season plus a produce lean.
export const seasonalMomentChips: SuggestionChip[] = [
  {
    header: "Brainstorm",
    body: "a bright spring dinner",
    prompt: "Brainstorm a bright spring dinner built around what's fresh right now",
    type: "brainstorm",
    season: ["spring"],
  },
  {
    header: "Help",
    body: "me cook the first spring vegetables",
    prompt: "Help me build a dinner around the first spring vegetables",
    type: "help",
    season: ["spring"],
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Brainstorm",
    body: "a no-cook summer dinner",
    prompt: "Brainstorm a no-cook dinner for the hottest night of summer",
    type: "brainstorm",
    season: ["summer"],
  },
  {
    header: "Help",
    body: "me build a light summer dinner",
    prompt: "Help me build a light dinner for a hot summer night",
    type: "help",
    season: ["summer"],
  },
  {
    header: "Build",
    body: "a hearty fall dinner",
    prompt: "Help me build a hearty dinner for the first cool night of fall",
    type: "build",
    season: ["fall"],
  },
  {
    header: "Brainstorm",
    body: "fall baking with apples",
    prompt: "Brainstorm a fall dessert built around apples or pears",
    type: "brainstorm",
    season: ["fall"],
  },
  {
    header: "Build",
    body: "a warming winter dinner",
    prompt: "Help me build a warming dinner for the coldest night of winter",
    type: "build",
    season: ["winter"],
  },
  {
    header: "Brainstorm",
    body: "a slow winter braise",
    prompt: "Brainstorm a slow braise for a long winter weekend",
    type: "brainstorm",
    season: ["winter"],
    dietary: ["contains-meat"],
  },
  {
    header: "Brainstorm",
    body: "a spring pasta with peas and asparagus",
    prompt: "Brainstorm a light spring pasta with peas and asparagus",
    type: "brainstorm",
    season: ["spring"],
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Build",
    body: "a dinner celebrating spring ramps",
    prompt: "Help me build a dinner that celebrates the first ramps of spring",
    type: "build",
    season: ["spring"],
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Brainstorm",
    body: "a spring lamb dinner",
    prompt: "Brainstorm a dinner built around spring lamb and fresh herbs",
    type: "brainstorm",
    season: ["spring"],
    dietary: ["contains-meat"],
  },
  {
    header: "Brainstorm",
    body: "a chilled soup for summer",
    prompt: "Brainstorm a chilled soup for a scorching summer afternoon",
    type: "brainstorm",
    season: ["summer"],
  },
  {
    header: "Build",
    body: "a cool dinner for a hot night",
    prompt: "Help me build a dinner that won't heat up the kitchen",
    type: "build",
    season: ["summer"],
  },
  {
    header: "Build",
    body: "roasted squash and root vegetables",
    prompt: "Help me build a dinner around roasted squash and root vegetables",
    type: "build",
    season: ["fall"],
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Brainstorm",
    body: "the last mushrooms of fall",
    prompt: "Brainstorm a dinner that uses the last mushrooms of fall",
    type: "brainstorm",
    season: ["fall"],
  },
  {
    header: "Build",
    body: "a slow-braised winter dinner",
    prompt: "Help me build a slow-braised dinner for a cold winter night",
    type: "build",
    season: ["winter"],
    dietary: ["contains-meat"],
  },
  {
    header: "Brainstorm",
    body: "a hearty winter stew",
    prompt: "Brainstorm a hearty winter stew to simmer all afternoon",
    type: "brainstorm",
    season: ["winter"],
  },
  {
    header: "Build",
    body: "caramelized winter root vegetables",
    prompt: "Help me build a dinner around root vegetables roasted until deeply caramelized",
    type: "build",
    season: ["winter"],
    dietary: ["vegetarian-friendly"],
  },
];

// Occasion-tagged chips — two-to-three per occasion, referencing the shared
// timing consts above so every chip for an occasion shares the exact window.
export const occasionChips: SuggestionChip[] = [
  // gameday-football
  {
    header: "Build",
    body: "a gameday snack spread",
    prompt: "Help me build a spread of gameday comfort food for the big game",
    type: "build",
    timing: {
      kind: "recurringWeekly",
      weekdays: [0, 6],
      seasonStart: "09-05",
      seasonEnd: "02-09",
    },
    occasion: "gameday-football",
    priority: 1,
    dayType: ["weekend"],
  },
  {
    header: "Brainstorm",
    body: "wings and dips for gameday",
    prompt: "Brainstorm a lineup of wings and dips for watching the game",
    type: "brainstorm",
    timing: {
      kind: "recurringWeekly",
      weekdays: [0, 6],
      seasonStart: "09-05",
      seasonEnd: "02-09",
    },
    occasion: "gameday-football",
    priority: 1,
    dietary: ["contains-meat"],
  },
  // super-bowl
  {
    header: "Help",
    body: "me plan a Super Bowl spread",
    prompt: "Help me plan a full spread for Super Bowl Sunday",
    type: "help",
    timing: SUPER_BOWL_TIMING,
    occasion: "super-bowl",
    priority: 2,
  },
  {
    header: "Brainstorm",
    body: "Super Bowl party snacks",
    prompt: "Brainstorm a few make-ahead snacks for a Super Bowl party",
    type: "brainstorm",
    timing: SUPER_BOWL_TIMING,
    occasion: "super-bowl",
    priority: 2,
  },
  // thanksgiving-week
  {
    header: "Help",
    body: "me round out Thanksgiving dinner",
    prompt: "Help me plan side dishes to round out Thanksgiving dinner",
    type: "help",
    timing: THANKSGIVING_WEEK_TIMING,
    occasion: "thanksgiving-week",
    priority: 2,
  },
  {
    header: "Brainstorm",
    body: "a Thanksgiving leftovers dinner",
    prompt: "Brainstorm a dinner built entirely from Thanksgiving leftovers",
    type: "brainstorm",
    timing: THANKSGIVING_WEEK_TIMING,
    occasion: "thanksgiving-week",
    priority: 2,
  },
  {
    header: "Build",
    body: "a make-ahead Thanksgiving side",
    prompt: "Help me build a make-ahead side for Thanksgiving dinner",
    type: "build",
    timing: THANKSGIVING_WEEK_TIMING,
    occasion: "thanksgiving-week",
    priority: 2,
  },
  // christmas-baking
  {
    header: "Brainstorm",
    body: "a batch of holiday cookies",
    prompt: "Brainstorm a batch of cookies to bake for the holidays",
    type: "brainstorm",
    timing: CHRISTMAS_BAKING_TIMING,
    occasion: "christmas-baking",
    priority: 2,
  },
  {
    header: "Build",
    body: "a Christmas cookie box",
    prompt: "Help me build a box of cookies to give as gifts",
    type: "build",
    timing: CHRISTMAS_BAKING_TIMING,
    occasion: "christmas-baking",
    priority: 2,
  },
  // christmas
  {
    header: "Help",
    body: "me plan Christmas dinner",
    prompt: "Help me plan the menu for Christmas dinner",
    type: "help",
    timing: CHRISTMAS_TIMING,
    occasion: "christmas",
    priority: 2,
  },
  {
    header: "Build",
    body: "a Christmas Eve feast",
    prompt: "Help me build a menu for a Christmas Eve feast",
    type: "build",
    timing: CHRISTMAS_TIMING,
    occasion: "christmas",
    priority: 2,
  },
  // new-years-eve
  {
    header: "Brainstorm",
    body: "a New Year's Eve spread",
    prompt: "Brainstorm a spread of small bites for New Year's Eve",
    type: "brainstorm",
    timing: NEW_YEARS_EVE_TIMING,
    occasion: "new-years-eve",
    priority: 2,
  },
  {
    header: "Build",
    body: "a midnight New Year's dinner",
    prompt: "Help me build a menu to see in the New Year",
    type: "build",
    timing: NEW_YEARS_EVE_TIMING,
    occasion: "new-years-eve",
    priority: 2,
  },
  // fourth-of-july
  {
    header: "Build",
    body: "a Fourth of July cookout",
    prompt: "Help me build a cookout menu for the Fourth of July",
    type: "build",
    timing: FOURTH_OF_JULY_OCCASION_TIMING,
    occasion: "fourth-of-july",
    priority: 2,
  },
  {
    header: "Brainstorm",
    body: "Fourth of July sides",
    prompt: "Brainstorm a few sides for a Fourth of July cookout",
    type: "brainstorm",
    timing: FOURTH_OF_JULY_OCCASION_TIMING,
    occasion: "fourth-of-july",
    priority: 2,
  },
  // summer-grilling
  {
    header: "Help",
    body: "me plan a backyard grilling night",
    prompt: "Help me plan a backyard grilling night for the whole family",
    type: "help",
    timing: SUMMER_GRILLING_TIMING,
    occasion: "summer-grilling",
    priority: 0,
  },
  {
    header: "Brainstorm",
    body: "grilled vegetables for summer",
    prompt: "Brainstorm a grilled vegetable spread for a summer cookout",
    type: "brainstorm",
    timing: SUMMER_GRILLING_TIMING,
    occasion: "summer-grilling",
    priority: 0,
    dietary: ["vegetarian-friendly"],
  },
  // first-cold-snap
  {
    header: "Build",
    body: "a dinner for the first cold night",
    prompt: "Help me build a dinner for the first cold night of the year",
    type: "build",
    timing: FIRST_COLD_SNAP_TIMING,
    occasion: "first-cold-snap",
    priority: 0,
  },
  {
    header: "Brainstorm",
    body: "comfort food for the first frost",
    prompt: "Brainstorm a comfort food dinner for the first frost of the season",
    type: "brainstorm",
    timing: FIRST_COLD_SNAP_TIMING,
    occasion: "first-cold-snap",
    priority: 0,
  },
  // cinco-de-mayo
  {
    header: "Build",
    body: "a Cinco de Mayo spread",
    prompt: "Help me build a menu for a Cinco de Mayo party",
    type: "build",
    timing: CINCO_DE_MAYO_TIMING,
    occasion: "cinco-de-mayo",
    priority: 1,
  },
  {
    header: "Brainstorm",
    body: "tacos for Cinco de Mayo",
    prompt: "Brainstorm a taco bar for a Cinco de Mayo dinner",
    type: "brainstorm",
    timing: CINCO_DE_MAYO_TIMING,
    occasion: "cinco-de-mayo",
    priority: 1,
  },
  // valentines
  {
    header: "Build",
    body: "a Valentine's dinner for two",
    prompt: "Help me build a Valentine's dinner for two at home",
    type: "build",
    timing: VALENTINES_TIMING,
    occasion: "valentines",
    priority: 1,
  },
  {
    header: "Brainstorm",
    body: "a romantic dessert for Valentine's",
    prompt: "Brainstorm a dessert to finish a Valentine's dinner at home",
    type: "brainstorm",
    timing: VALENTINES_TIMING,
    occasion: "valentines",
    priority: 1,
  },
  // mothers-day
  {
    header: "Help",
    body: "me plan a Mother's Day brunch",
    prompt: "Help me plan a brunch menu for Mother's Day",
    type: "help",
    timing: MOTHERS_DAY_TIMING,
    occasion: "mothers-day",
    priority: 1,
  },
  {
    header: "Build",
    body: "a Mother's Day dinner",
    prompt: "Help me build a special dinner to cook for Mother's Day",
    type: "build",
    timing: MOTHERS_DAY_TIMING,
    occasion: "mothers-day",
    priority: 1,
  },
  // fathers-day
  {
    header: "Build",
    body: "a Father's Day cookout",
    prompt: "Help me build a cookout menu to grill for Father's Day",
    type: "build",
    timing: FATHERS_DAY_TIMING,
    occasion: "fathers-day",
    priority: 1,
  },
  {
    header: "Brainstorm",
    body: "a Father's Day steak dinner",
    prompt: "Brainstorm a steak dinner to cook for Father's Day",
    type: "brainstorm",
    timing: FATHERS_DAY_TIMING,
    occasion: "fathers-day",
    priority: 1,
    dietary: ["contains-meat"],
  },
  // halloween
  {
    header: "Brainstorm",
    body: "dinner before trick-or-treating",
    prompt: "Brainstorm a quick dinner to eat before trick-or-treating",
    type: "brainstorm",
    timing: HALLOWEEN_TIMING,
    occasion: "halloween",
    priority: 1,
  },
  {
    header: "Build",
    body: "Halloween party snacks",
    prompt: "Help me build a spread of snacks for a Halloween party",
    type: "build",
    timing: HALLOWEEN_TIMING,
    occasion: "halloween",
    priority: 1,
  },
  // easter
  {
    header: "Help",
    body: "me plan Easter dinner",
    prompt: "Help me plan a spring menu for Easter dinner",
    type: "help",
    timing: EASTER_TIMING,
    occasion: "easter",
    priority: 1,
  },
  {
    header: "Build",
    body: "an Easter brunch spread",
    prompt: "Help me build a brunch spread for Easter morning",
    type: "build",
    timing: EASTER_TIMING,
    occasion: "easter",
    priority: 1,
  },
  {
    header: "Build",
    body: "an Easter ham dinner",
    prompt: "Help me build a glazed ham dinner for Easter",
    type: "build",
    timing: EASTER_TIMING,
    occasion: "easter",
    priority: 1,
    dietary: ["contains-pork"],
  },
  // st-patricks-day
  {
    header: "Build",
    body: "a St. Patrick's Day dinner",
    prompt: "Help me build a menu for a St. Patrick's Day dinner",
    type: "build",
    timing: ST_PATRICKS_DAY_TIMING,
    occasion: "st-patricks-day",
    priority: 1,
  },
  {
    header: "Brainstorm",
    body: "Irish-inspired comfort food",
    prompt: "Brainstorm an Irish-inspired dinner for St. Patrick's Day",
    type: "brainstorm",
    timing: ST_PATRICKS_DAY_TIMING,
    occasion: "st-patricks-day",
    priority: 1,
  },
  // spring-produce
  {
    header: "Brainstorm",
    body: "a dinner built on asparagus and peas",
    prompt: "Brainstorm a dinner built around asparagus and spring peas",
    type: "brainstorm",
    timing: SPRING_PRODUCE_TIMING,
    occasion: "spring-produce",
    priority: 0,
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Help",
    body: "me cook the first spring produce",
    prompt: "Help me build a dinner around the season's first produce",
    type: "help",
    timing: SPRING_PRODUCE_TIMING,
    occasion: "spring-produce",
    priority: 0,
  },
  // tomato-season
  {
    header: "Build",
    body: "a peak-tomato summer dinner",
    prompt: "Help me build a dinner around tomatoes at their peak",
    type: "build",
    timing: TOMATO_SEASON_TIMING,
    occasion: "tomato-season",
    priority: 0,
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Brainstorm",
    body: "uses for a glut of tomatoes",
    prompt: "Brainstorm ways to use a counter full of ripe tomatoes",
    type: "brainstorm",
    timing: TOMATO_SEASON_TIMING,
    occasion: "tomato-season",
    priority: 0,
    dietary: ["vegetarian-friendly"],
  },
  // stone-fruit-season
  {
    header: "Brainstorm",
    body: "a dessert with peaches or plums",
    prompt: "Brainstorm a dessert built around peaches or other stone fruit",
    type: "brainstorm",
    timing: STONE_FRUIT_SEASON_TIMING,
    occasion: "stone-fruit-season",
    priority: 0,
  },
  {
    header: "Build",
    body: "a stone fruit summer salad",
    prompt: "Help me build a salad around ripe stone fruit",
    type: "build",
    timing: STONE_FRUIT_SEASON_TIMING,
    occasion: "stone-fruit-season",
    priority: 0,
    dietary: ["vegetarian-friendly"],
  },
  // citrus-winter
  {
    header: "Brainstorm",
    body: "a winter dinner with citrus",
    prompt: "Brainstorm a winter dinner brightened up with citrus",
    type: "brainstorm",
    timing: CITRUS_WINTER_TIMING,
    occasion: "citrus-winter",
    priority: 0,
  },
  {
    header: "Build",
    body: "a citrus dessert for winter",
    prompt: "Help me build a dessert around winter citrus",
    type: "build",
    timing: CITRUS_WINTER_TIMING,
    occasion: "citrus-winter",
    priority: 0,
  },
  // soup-season
  {
    header: "Build",
    body: "a big pot of soup",
    prompt: "Help me build a soup big enough to eat all week",
    type: "build",
    timing: SOUP_SEASON_TIMING,
    occasion: "soup-season",
    priority: 0,
  },
  {
    header: "Brainstorm",
    body: "a soup for a cold week",
    prompt: "Brainstorm a soup that gets better the longer it sits",
    type: "brainstorm",
    timing: SOUP_SEASON_TIMING,
    occasion: "soup-season",
    priority: 0,
  },
];

// Dietary-focused chips tagged on a dayType axis (dietary alone doesn't
// satisfy the "at least one axis" rule, so these pair it with a day-type).
export const dietaryFocusChips: SuggestionChip[] = [
  {
    header: "Help",
    body: "me build a vegetarian weeknight dinner",
    prompt: "Help me build a vegetarian dinner that works on a weeknight",
    type: "help",
    dayType: ["weeknight"],
    dietary: ["vegetarian-friendly"],
  },
  {
    header: "Brainstorm",
    body: "a shellfish dinner for the weekend",
    prompt: "Brainstorm a shellfish dinner to cook this weekend",
    type: "brainstorm",
    dayType: ["weekend"],
    dietary: ["contains-shellfish"],
  },
];

// Full chip pool — selectDailyChips selects from this.
export const allChips: SuggestionChip[] = [
  ...evergreenChips,
  ...timeAwareChips,
  ...dayTypeChips,
  ...seasonalMomentChips,
  ...occasionChips,
  ...dietaryFocusChips,
];

// Helper: parse MM-DD string to month/day numbers
function parseMonthDay(monthDay: string): { month: number; day: number } {
  const [month, day] = monthDay.split("-").map(Number);
  return { month, day };
}

// Helper: parse "YYYY-MM-DD" string to LOCAL midnight Date
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

// Helper: parse "MM-DD" with a specific year to LOCAL midnight Date
function parseMonthDayWithYear(monthDay: string, year: number): Date {
  const { month, day } = parseMonthDay(monthDay);
  return new Date(year, month - 1, day); // month is 0-indexed
}

// Helper: normalize any Date to LOCAL start-of-day (midnight)
function toLocalStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
// Assumes today and targetDate are already normalized to local start-of-day
function isInLeadInWindow(
  todayNormalized: Date,
  targetDate: Date,
  leadInDays: number
): boolean {
  const leadInStart = getDaysBeforeDate(targetDate, leadInDays);
  const todayTime = todayNormalized.getTime();
  const startTime = leadInStart.getTime();
  const endTime = targetDate.getTime();

  return todayTime >= startTime && todayTime <= endTime;
}

// Check if a time-aware chip is active on a given date
export function isChipActive(chip: SuggestionChip, today: Date): boolean {
  if (!chip.timing) return true; // Evergreen chips are always active

  // Normalize today to local start-of-day once for all comparisons
  const todayNormalized = toLocalStartOfDay(today);

  const timing = chip.timing;

  switch (timing.kind) {
    case "seasonal": {
      return isInSeasonalRange(todayNormalized, timing.start, timing.end);
    }

    case "fixedHoliday": {
      const thisYearDate = parseMonthDayWithYear(timing.monthDay, todayNormalized.getFullYear());
      return isInLeadInWindow(todayNormalized, thisYearDate, timing.leadInDays);
    }

    case "floatingHoliday": {
      // Check if today falls within lead-in window of any listed date
      for (const dateStr of timing.dates) {
        const targetDate = parseLocalDate(dateStr);
        if (isInLeadInWindow(todayNormalized, targetDate, timing.leadInDays)) {
          return true;
        }
      }
      return false;
    }

    case "recurringWeekly": {
      const todayWeekday = todayNormalized.getDay();
      // First check if today's weekday matches
      if (!timing.weekdays.includes(todayWeekday)) {
        return false;
      }
      // Then check if today is within the season window
      return isInSeasonalRange(todayNormalized, timing.seasonStart, timing.seasonEnd);
    }

    case "oneOff": {
      const targetDate = parseLocalDate(timing.date);
      return isInLeadInWindow(todayNormalized, targetDate, timing.leadInDays);
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Moment-aware selection engine (selectDailyChips) — the sole chip-picking
// entry point. Home.tsx and Build's empty state both call this.
// ---------------------------------------------------------------------------

// A chip's identity for don't-repeat/localStorage purposes. Every chip's
// `prompt` is unique across the whole pool (verified in the Stage 2 proof
// script), so it doubles as a stable id without adding an `id` field to the
// data shape.
function chipId(chip: SuggestionChip): string {
  return chip.prompt;
}

// Helper: format a Date as a LOCAL "YYYY-MM-DD" string (inverse of parseLocalDate)
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Small, deterministic string hash (not cryptographic) — used only to derive
// a stable per-(user, day) seed for rotating among otherwise-equal candidates.
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Rotate an array by `seed % length` — a deterministic "shuffle" that varies
// by seed while being stable for a given seed. Used so different users see
// different specific chips within the same moment-tier on the same day.
function seededRotate<T>(list: T[], seed: number): T[] {
  if (list.length === 0) return list;
  const offset = seed % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

// Rotate the active-occasion tier for per-user variety WITHOUT letting that
// rotation cross priority boundaries. A flat `seededRotate` over the whole
// tier can spin a lower-priority chip (e.g. an ambient priority-0 occasion)
// ahead of a higher-priority tentpole (e.g. Thanksgiving, priority 2) — that
// was Stage 2's bug. Fix: group by priority, rotate each group
// independently (so per-user variety still exists WITHIN a priority level),
// then concatenate groups strictly high-to-low so priority order can never
// be crossed by rotation.
function rotateOccasionTierPreservingPriority(
  tier: SuggestionChip[],
  seed: number
): SuggestionChip[] {
  const groupsByPriority = new Map<number, SuggestionChip[]>();
  for (const chip of tier) {
    const priority = chip.priority ?? 0;
    const group = groupsByPriority.get(priority);
    if (group) {
      group.push(chip);
    } else {
      groupsByPriority.set(priority, [chip]);
    }
  }

  const prioritiesHighToLow = [...groupsByPriority.keys()].sort((a, b) => b - a);
  const result: SuggestionChip[] = [];
  for (const priority of prioritiesHighToLow) {
    result.push(...seededRotate(groupsByPriority.get(priority)!, seed));
  }
  return result;
}

// Today's day-of-week bucket, matching the DayType taxonomy.
function computeDayType(todayNormalized: Date): DayType {
  const weekday = todayNormalized.getDay(); // 0=Sun..6=Sat
  if (weekday === 0) return "sunday";
  if (weekday === 5) return "friday";
  if (weekday === 6) return "weekend";
  return "weeknight";
}

// Today's meteorological season, matching the Season taxonomy.
function computeSeason(todayNormalized: Date): Season {
  const month = todayNormalized.getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

// Light, conservative dietary-exclusion mapping from freeform taste_profile
// prose. Deliberately a small keyword/pattern check, not an inference engine
// — errs toward NOT excluding when the text is ambiguous, since this filter
// must stay light (drop-only, never narrow the pool toward blandness).
function deriveDietaryExclusions(tasteProfile: string | null): Set<DietaryFlag> {
  const exclusions = new Set<DietaryFlag>();
  if (!tasteProfile) return exclusions;
  const text = tasteProfile.toLowerCase();

  const isVegetarianOrVegan = /\bvegetarian\b|\bvegan\b/.test(text);
  if (isVegetarianOrVegan) {
    exclusions.add("contains-meat");
    exclusions.add("contains-pork");
    exclusions.add("contains-shellfish");
  }
  if (/\bno pork\b|\bavoids? pork\b|\bdoesn'?t eat pork\b|\bpork-free\b/.test(text)) {
    exclusions.add("contains-pork");
  }
  if (/shellfish allerg|allergic to shellfish|shellfish-free|avoids? shellfish/.test(text)) {
    exclusions.add("contains-shellfish");
  }

  return exclusions;
}

// Take up to `needed` chips from a tier's candidate list, preferring chips
// whose `type` hasn't been used yet in this selection (variety pass), then
// filling any remainder regardless of type. Mutates usedTypes/chosenIds.
function takeFromTier(
  tierChips: SuggestionChip[],
  needed: number,
  usedTypes: Set<SuggestionChip["type"]>,
  chosenIds: Set<string>
): SuggestionChip[] {
  if (needed <= 0) return [];
  const picked: SuggestionChip[] = [];

  for (const chip of tierChips) {
    if (picked.length >= needed) break;
    const id = chipId(chip);
    if (chosenIds.has(id) || usedTypes.has(chip.type)) continue;
    picked.push(chip);
    chosenIds.add(id);
    usedTypes.add(chip.type);
  }
  for (const chip of tierChips) {
    if (picked.length >= needed) break;
    const id = chipId(chip);
    if (chosenIds.has(id)) continue;
    picked.push(chip);
    chosenIds.add(id);
    usedTypes.add(chip.type);
  }

  return picked;
}

// Don't-repeat with a floor: drop anything in recentlyShownIds, but if that
// would starve the ordered candidate list below 3, progressively re-admit
// the OLDEST excluded ids first (recentlyShownIds is oldest-to-newest) until
// 3 can be filled. Mirrors the recipe pool's exclusion-with-a-floor pattern.
function applyDontRepeat(
  orderedCandidates: SuggestionChip[],
  recentlyShownIds: string[]
): SuggestionChip[] {
  for (let reAdmitCount = 0; reAdmitCount <= recentlyShownIds.length; reAdmitCount++) {
    const stillExcluded = new Set(recentlyShownIds.slice(reAdmitCount));
    const filtered = orderedCandidates.filter((c) => !stillExcluded.has(chipId(c)));
    if (filtered.length >= 3 || reAdmitCount === recentlyShownIds.length) {
      return filtered;
    }
  }
  return orderedCandidates;
}

export type SelectDailyChipsParams = {
  today: Date;
  userId: string;
  tasteProfile: string | null;
  recentlyShownIds: string[];
};

// Moment-aware selection engine. Returns exactly 3 chips. Priority order:
// active occasion > day-type > season > untagged evergreen baseline, with a
// light dietary filter and a per-user daily-deterministic, don't-repeat-recent
// rotation layered on top.
export function selectDailyChips({
  today,
  userId,
  tasteProfile,
  recentlyShownIds,
}: SelectDailyChipsParams): [SuggestionChip, SuggestionChip, SuggestionChip] {
  const todayNormalized = toLocalStartOfDay(today);
  const todayDayType = computeDayType(todayNormalized);
  const todaySeason = computeSeason(todayNormalized);
  const exclusions = deriveDietaryExclusions(tasteProfile);

  // Step 1: chips active today (respects `timing` windows), with the light
  // dietary filter applied. Guarantee: never let dietary filtering starve
  // the pool below 3 candidates — fall back to the unfiltered active pool
  // if it would (this is the "always a full 3, never fewer" guarantee).
  const activeToday = allChips.filter((chip) => isChipActive(chip, todayNormalized));
  const dietarySafe = activeToday.filter(
    (chip) => !chip.dietary || !chip.dietary.some((flag) => exclusions.has(flag))
  );
  const pool = dietarySafe.length >= 3 ? dietarySafe : activeToday;

  // Step 2: classify into moment-first tiers. A chip lands in exactly one
  // tier: active occasion first, then day-type match, then season match,
  // then fully untagged baseline. A chip tagged for a DIFFERENT day-type or
  // season than today (e.g. a winter-only chip in July) is not a candidate.
  const tier1Occasion: SuggestionChip[] = [];
  const tier2DayType: SuggestionChip[] = [];
  const tier3Season: SuggestionChip[] = [];
  const tier4Baseline: SuggestionChip[] = [];

  for (const chip of pool) {
    if (chip.occasion) {
      tier1Occasion.push(chip);
    } else if (chip.dayType?.includes(todayDayType)) {
      tier2DayType.push(chip);
    } else if (chip.season?.includes(todaySeason)) {
      tier3Season.push(chip);
    } else if (!chip.dayType && !chip.season) {
      tier4Baseline.push(chip);
    }
  }

  // Step 3: per-(user, day) deterministic seed — stable all day for this
  // user, varies across users and across days. Rotate each tier by it so
  // ties within a tier resolve differently per user without breaking the
  // moment-first tier ORDER itself. The occasion tier uses the
  // priority-preserving rotation (see above) — priority order can never be
  // crossed by the per-user rotation; only chips WITHIN the same priority
  // level get reordered.
  const seed = hashString(`${userId}:${formatLocalDate(todayNormalized)}`);
  const tiersInOrder = [
    rotateOccasionTierPreservingPriority(tier1Occasion, seed),
    seededRotate(tier2DayType, seed),
    seededRotate(tier3Season, seed),
    seededRotate(tier4Baseline, seed),
  ];

  // Step 4: don't-repeat-recent, with the same never-below-3 floor.
  const flatOrdered = tiersInOrder.flat();
  const dontRepeatSafeIds = new Set(
    applyDontRepeat(flatOrdered, recentlyShownIds).map(chipId)
  );
  const safeTiers = tiersInOrder.map((tier) =>
    tier.filter((chip) => dontRepeatSafeIds.has(chipId(chip)))
  );

  // Step 5: moment-first fill with a spark of variety. Take up to 2 from the
  // highest non-empty tier (the "moment"), then pull the remaining slot(s)
  // from the next lower tiers first (the "spark of variety" — e.g. 2 moment
  // chips + 1 baseline), falling back to the top tier only if every lower
  // tier is empty.
  const usedTypes = new Set<SuggestionChip["type"]>();
  const chosenIds = new Set<string>();
  const selected: SuggestionChip[] = [];

  const topTierIndex = safeTiers.findIndex((tier) => tier.length > 0);
  if (topTierIndex !== -1) {
    const topTierTake = Math.min(2, safeTiers[topTierIndex].length);
    selected.push(
      ...takeFromTier(safeTiers[topTierIndex], topTierTake, usedTypes, chosenIds)
    );
  }

  const lowerTiers = safeTiers.filter((_, i) => i !== topTierIndex);
  for (const tier of lowerTiers) {
    if (selected.length >= 3) break;
    selected.push(...takeFromTier(tier, 3 - selected.length, usedTypes, chosenIds));
  }
  if (selected.length < 3 && topTierIndex !== -1) {
    selected.push(
      ...takeFromTier(safeTiers[topTierIndex], 3 - selected.length, usedTypes, chosenIds)
    );
  }

  // Final safety net (should be unreachable — tier4Baseline is always
  // non-empty — but guarantees the 3-chip contract unconditionally).
  if (selected.length < 3) {
    for (const chip of allChips) {
      if (selected.length >= 3) break;
      const id = chipId(chip);
      if (chosenIds.has(id)) continue;
      if (chip.dietary?.some((flag) => exclusions.has(flag))) continue;
      selected.push(chip);
      chosenIds.add(id);
    }
  }

  if (selected.length !== 3) {
    throw new Error(`selectDailyChips produced ${selected.length} chips instead of 3`);
  }

  return [selected[0], selected[1], selected[2]];
}

// ---------------------------------------------------------------------------
// Client-side "recently shown" memory. Mirrors the recipe pool's exclusion
// pattern's shape, but lives in localStorage, not a DB table. Keyed per user;
// each entry is one calendar day's shown chip ids; entries older than the
// retention window are pruned on read and on write.
// ---------------------------------------------------------------------------

const RECENTLY_SHOWN_STORAGE_KEY_PREFIX = "tipsyDinnerRecentChips";
const RECENTLY_SHOWN_RETENTION_DAYS = 14;

type RecentlyShownDayEntry = { date: string; ids: string[] };

function recentlyShownStorageKey(userId: string): string {
  return `${RECENTLY_SHOWN_STORAGE_KEY_PREFIX}:${userId}`;
}

function pruneOldEntries(
  entries: RecentlyShownDayEntry[],
  today: Date
): RecentlyShownDayEntry[] {
  const cutoff = toLocalStartOfDay(getDaysBeforeDate(today, RECENTLY_SHOWN_RETENTION_DAYS));
  return entries.filter((e) => parseLocalDate(e.date).getTime() >= cutoff.getTime());
}

// Returns the last ~14 days of shown chip ids for a user, oldest-first — the
// order applyDontRepeat's re-admit logic expects. Deliberately excludes
// TODAY's own entry: today's picks are still being decided when this is read
// (before selectDailyChips runs), so including them would make a same-day
// remount treat today's own selection as "recently shown" and exclude it,
// producing a different set of chips mid-day and breaking the
// stable-all-day guarantee.
export function getRecentlyShownChipIds(userId: string, today: Date = new Date()): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(recentlyShownStorageKey(userId));
    if (!raw) return [];
    const entries: RecentlyShownDayEntry[] = JSON.parse(raw);
    const todayStr = formatLocalDate(today);
    return pruneOldEntries(entries, today)
      .filter((e) => e.date !== todayStr)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .flatMap((e) => e.ids);
  } catch {
    return [];
  }
}

// Records today's shown chip ids for a user (overwriting any prior record
// for the same local day, so re-calling within the same day doesn't stack).
export function recordShownChipIds(
  userId: string,
  chipIds: string[],
  today: Date = new Date()
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const key = recentlyShownStorageKey(userId);
    const raw = localStorage.getItem(key);
    const existing: RecentlyShownDayEntry[] = raw ? JSON.parse(raw) : [];
    const dateStr = formatLocalDate(today);
    const withoutToday = pruneOldEntries(existing, today).filter((e) => e.date !== dateStr);
    withoutToday.push({ date: dateStr, ids: chipIds });
    localStorage.setItem(key, JSON.stringify(withoutToday));
  } catch {
    // Best-effort — a localStorage failure should never break chip selection.
  }
}
