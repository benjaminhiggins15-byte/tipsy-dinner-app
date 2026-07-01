# Tipsy Dinner — CLAUDE.md
Last updated: June 2026

---

## What This App Is

Tipsy Dinner is a personal digital cookbook and AI recipe assistant. Named after the tradition of cooking with wine with my wife. The app has two modes: a personal recipe library (saved, browsable, organized) and an AI-powered recipe builder that helps craft new recipes through conversation.

Target user: myself first. Elevated home cook. Cooks for two (wife) and for crowds (hosts Christmas, dinner parties, etc). No central recipe hub currently — this solves that.

---

## Tech Stack

- React + Vite
- Bun (package manager, dev server)
- Supabase — auth provider, client at `src/lib/supabase.ts`
- Anthropic SDK (AI layer, direct browser call, moving server-side with Supabase later)
- localStorage (data layer, migrating to Supabase later)
- Tabler Icons
- Google Fonts: Fraunces (italic), Inter

**Local dev:** `bun dev` from `~/Developer/tipsy-dinner-app`
**Runs at:** localhost:8080 or 8081
**GitHub:** github.com/benjaminhiggins15-byte/tipsy-dinner-app
**Deployment:** Vercel (live at tipsydinner.com)

---

## Fonts

- **Lazydog** — `src/fonts/lazydog.ttf`, registered via `@font-face` as `'Lazydog'`. Used for all recipe titles, screen headings, section headings. Always `text-transform: uppercase`. This is the display font for the entire app.
- **Fraunces italic** — Google Font. Used for AI responses, recipe descriptions, taglines, margin notes, empty state copy, form description fields.
- **Inter** — Google Font, weights 400 and 500. Used for all body copy, ingredient names, steps, nav labels, buttons, metadata, quantities.
- **Playwrite US Modern** — Google Font. Used ONLY in the logo assets. Never used anywhere in the app UI.

---

## Color Palette

```css
--green:       #233C00   /* App background — primary surface, all screens */
--green-deep:  #182800   /* Nav bar, input bar, bottom sheets */
--green-mid:   #2E4E08   /* Cards, recipe rows, section headers */
--blue:        #1E3A42   /* CTA buttons, active states */
--blue-mid:    #2A4E5A   /* Borders, accents, secondary elements */
--cream:       #FEE7C0   /* All text on green, hero moments */
--cream-dim:   rgba(254,231,192,0.55)  /* Secondary text, placeholders, muted labels */
```

**Rules:**
- Cream on green always for text directly on the background
- User message bubbles: cream (#FEE7C0) background with green (#233C00) text
- AI message text: cream (#FEE7C0), Fraunces italic, directly on green background (no bubble)
- CTA buttons (Next, Save, etc): cream background, green text
- No red, orange, coral, or terracotta

---

## Universal Gradient

Every screen (except splash) gets a full-bleed gradient behind all content:

```css
background: linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%);
height: 420–480px;
position: absolute;
top: 0; left: 0; right: 0;
z-index: 0;
pointer-events: none;
```

All content sits above this at `z-index: 1`. The gradient fades naturally into the base green — no hard edges anywhere on screen.

---

## Logo Assets

Three versions in `src/Logos/`:
- `Full_Logo.png` — full "tipsy DINNER" wordmark lockup. Used on splash screen only.
- `watermark_square.png` — square tD monogram on green background. Used in Build screen top-left and mini player.
- `watermark_circle.png` — circular tD monogram. Available if needed.

**Import example:**
```js
import tDSquare from '../Logos/watermark_square.png'
import fullLogo from '../Logos/Full_Logo.png'
```

**Logo usage rules:**
- Splash screen: `Full_Logo.png`, centered, green background
- Build screen top-left: `watermark_square.png`, imported as asset, rendered as `<img>` tag
- Mini player: `watermark_square.png`
- All other screens: no logo

---

## Navigation

Four tabs, always visible, always at the bottom of every screen:

| Tab | Icon (Tabler) | Active state |
|-----|--------------|--------------|
| Build | chef hat / bulb | cream icon + cream label + cream dot |
| Recipes | open book | same |
| Menus | grid/squares | same |
| Profile | person | same |

- Active tab: cream icon, cream label, small cream dot below
- Inactive tabs: cream at 25% opacity
- Nav bar background: `#182800`
- Back arrows: icon only, no text labels
- All screen transitions: slide left/right

---

## Screen-by-Screen Design Spec

### Build — Empty State
- Gradient behind all content
- Top bar: tD square PNG left, "Write your own" ghost pill right (Inter 500, cream 60%, border cream 20%, border-radius 20px)
- Hero: "what's on the menu?" centered in the green space — Lazydog uppercase, cream, large (~48–52px)
- Bottom stack (just above input): three Fraunces italic prompt chips, stacked vertically, "or just type" divider, then input bar
- Prompt chips: Fraunces italic, cream 85%, background cream 6%, border cream 14%, border-radius 12px, padding 13px 18px
- "or just type" divider: Inter, cream 28%, uppercase, letter-spacing
- Input bar: on #182800 footer, cream placeholder text, send button circle in #1E3A42

**Chip copy (personalized later, for now):**
1. "something impressive for a dinner party"
2. "a weeknight dinner, nothing too fussy"
3. "we've got a bottle open — build around it"

### Build — Active State
- Same gradient, same top bar (tD PNG left only, no "Write your own" once conversation starts)
- Conversation thread sits on green, justified to bottom
- User messages: cream (#FEE7C0) bubble, border-radius 18px 18px 4px 18px, green (#233C00) Inter text
- AI messages: no bubble, Fraunces italic cream text, directly on green, max-width 88%
- Mini player: on #182800, border-top cream 8%, tD square PNG left, "Recipe ready" label (Inter 10px uppercase cream 35%), recipe title (Inter 500 cream), chevron right
- Mini player fades to 50% opacity while recipe generating, fades back on completion
- Mini player pulses soft blue glow (#2A4E5A) once when recipe finishes
- When recipe card is expanded, auto-collapses to mini player on message send
- Input bar: same as empty state but send button filled #1E3A42 with cream arrow

### Recipes — Categories
- Gradient behind header
- Header: "Recipes" in Inter 500 uppercase cream left, + button (circle, cream border 25%, plus icon) right
- 2x4 grid of cards, gap 12px, padding 0 20px
- Cards: background #2E4E08, border-radius 16px, padding 16px
- Card layout: Tabler icon top-left (cream 20% opacity, 32px), recipe count bottom (Inter 11px cream 40%), category title bottom (Inter 700 uppercase cream, letter-spacing 0.08em, 15px)
- Empty dashed card bottom-right: cream 4% bg, dashed border cream 15%, plus icon centered
- Recipes tab active in nav

### Recipes — Recipe List
- Gradient behind header
- Header: back arrow left, category name (Inter 500 uppercase cream) + recipe count (Inter cream 35%) stacked, no right action
- List of 80px rows, gap 10px, padding 0 20px
- Row: background #2E4E08, border-radius 14px, padding 0 18px
- Row layout: placeholder icon (44x44 rounded, cream 7% bg, cream 25% stroke) left, title (Inter 700 uppercase cream 14px) + Fraunces italic description (cream 50% 12px) + meta (Inter 500 uppercase cream 25% 10px) center, chevron right (cream 20%)

### Recipes — Recipe Card
- Full-bleed gradient (taller, ~480px) behind everything — fades through hero, tabs, into ingredient rows seamlessly
- No hard background change between sections
- Top bar: back arrow left, share + edit icons right (cream 60%)
- Hero: category label (Inter 500 uppercase cream 40% 11px), recipe title (Lazydog uppercase cream 28px), Fraunces italic description (cream 60% 15px), meta row (Time / Serves / Added)
- Tab bar: left-aligned, "Ingredients" and "Steps" only, underline active tab (cream 1.5px), inactive cream 30%, border-bottom cream 8%
- Ingredients: name left (Inter cream 15px), quantity right (Inter 500 tabular-nums cream 45% 14px), dotted divider between rows (cream 8%)
- Section labels: Inter 500 uppercase cream 30% 10px

### Write Your Own — Basics (Step 1 of 5)
- Gradient behind all content
- Top bar: back arrow left, "Step 1 of 5" centered (Inter 500 uppercase cream 35%), cream pill button "Next" right (green text)
- Progress bar: thin 2px cream line, 20% filled, cream 10% track
- Form fields: background cream 5%, border cream 12%, border-radius 10px, padding 14px 16px, cream text
- Field labels: Inter 500 uppercase cream 35% 10px, letter-spacing 0.1em
- Description field: Fraunces italic 15px
- Cook time + Serves: side by side, centered text, Inter 500 18px

### Write Your Own — Ingredients (Step 2 of 5)
- Gradient behind all content
- Same top bar pattern, "Step 2 of 5", progress 40%
- Quantity input: 80px wide, centered, Inter 500 tabular-nums cream 50%
- Name input: flex 1, Inter 400 cream
- X remove: cream 20% stroke, right of each row
- "add ingredient" row first (primary action)
- "add section" as centered divider with lines (secondary action, below)

### Write Your Own — Steps (Step 3 of 5)
- Gradient behind all content
- Same top bar pattern, "Step 3 of 5", progress 60%
- Step number: small circle (cream 8% bg, cream 12% border, 28px), Inter 500 cream 45% inside
- Step input: flex 1, Inter 400 cream 14px, border cream 12%, border-radius 10px
- X remove: right of each row, aligned to top
- "add step" at bottom

### Write Your Own — Preview (Step 4 — no counter shown)
- Gradient behind all content
- Top bar: back arrow left only, no step counter, no progress bar
- "Looking good." as muted tag (Inter 500 uppercase cream 35%)
- Full recipe card preview — same layout as recipe card screen
- Small cream pill "Save" button centered in the green zone above nav, green text

### Write Your Own — Save Sheet (bottom sheet)
- Slides up over preview screen, preview dims to 25% opacity behind
- Sheet: background #182800, border-radius 24px 24px at top
- Handle: 36px wide, 4px tall, cream 15%, centered
- "Pick a category" label: Inter 500 uppercase cream 35%
- Category chips: 3-column grid, cream 6% bg, cream 12% border, border-radius 10px, Inter 500 12px cream 60%. Selected: cream 12% bg, cream 40% border, full cream text
- Divider: 1px cream 6%
- "Add to a menu" button: cream 4% bg, cream 12% border, border-radius 12px, Inter 500 cream 70%, chevron right
- "save recipe for now" CTA: full-width, cream bg, green text, border-radius 14px, Inter 500 uppercase

### Menus — Occasions
- Gradient behind header
- Header: "Menus" left, + button right
- Full-width rows separated by cream 6% dividers
- Each row: Tabler icon (22px, cream 45%) left, occasion name (Inter 500 cream 16px) + menu count (Inter cream 35% 12px) center, edit + delete icons (cream 20%) right, chevron right
- Menus tab active in nav

### Menus — Menu List
- Gradient behind header
- Header: back arrow + occasion name + menu count stacked, + button right
- Full-width cards, gap 12px, padding 0 20px
- Card: background #2E4E08, border-radius 16px
- Photo zone: 130px tall, gradient placeholder (#2E4E08 → #1a3205), "add a photo" label (Inter 500 uppercase cream 20%), gradient overlay at bottom
- Card body: menu name (Inter 500 cream 15px) + Fraunces italic description (cream 45% 13px) left, edit + delete icons right

### Menus — Menu Interior
- Gradient behind header
- Header: back arrow + menu name + occasion name stacked, edit pencil right
- Collapsible sections: Apps, Mains, Sides, Desserts (Drinks optional)
- Section header: #2E4E08 5% bg, cream 8% border, border-radius 14px (14px 14px 0 0 when open)
- Section name: Inter 500 uppercase cream 70% 12px, recipe count cream 30% 11px, chevron right
- Expanded section body: cream 3% bg, cream 8% border, border-top none, border-radius 0 0 14px 14px
- Recipe rows inside: name (Inter 500 cream 14px) + meta (Inter cream 30% 11px), X remove right (cream 15%)
- "add a recipe" row at bottom of each expanded section
- Tapping a recipe opens the recipe card; back returns to this screen

---

## Data Layer

**Supabase tables:**
- `profiles` — user profile data (display_name, palate, inspiration, constraints, onboarding_complete)
- `recipes` — saved recipes
- `ingredients` — recipe ingredients with sort_order
- `categories` — custom recipe categories
- `recipe_categories` — join table for recipes ↔ categories
- `occasions` — menu occasions
- `menus` — saved menus
- `menu_recipes` — join table for menus ↔ recipes

**Legacy localStorage keys (still in use):**
```
tipsyDinnerName
tipsyDinnerEmail
tipsyDinnerTable
```

---

## AI Layer

- Model: claude-sonnet-4-5
- Supabase Edge Function at `/functions/v1/ai-chat` handles all AI calls
- API key stored server-side in Edge Function environment (`ANTHROPIC_API_KEY`)
- Client authenticates with Supabase anon key (`VITE_SUPABASE_ANON_KEY`)
- Streaming: fully implemented — responses appear word by word via Server-Sent Events
- Two modes: Brainstorm and Recipe
- Never enter Recipe mode early — only on explicit user choice
- Recipe card never updated for technique, wine, or tangent questions

**System prompt:**
- The system prompt is duplicated across three AI-call sites in the Cook component (`fireAICall`, `sendMessage`, `handleChipClick`). All three copies must be kept in sync.
- User profile (palate, inspiration, constraints) is interpolated into the prompt at all call sites.
- When a pre-existing saved recipe is in scope (`currentRecipe !== null`), the recipe is serialized via `recipeToXML` and appended to the system prompt as reference context. If no recipe is in scope, the system prompt is unchanged.
- Formatting guidance (General rules section): instructs the model to format for readability. Named-dish/item lists use bold-name — em-dash — description format (one per line). Broader clustered options use a short framing line plus bold theme labels with specifics in prose (only where grouping is natural). Single-thought / judgment / yes-no answers stay in flowing conversational prose. No headers, no bullet points; asterisks only for bolding names or theme labels. This guidance applies in all modes and whether or not a recipe is loaded in context.

**Microcopy voice:**
- "pour a glass — what are we cooking?" (input placeholder)
- "building the recipe…" / "uncorking…" / "tasting…" (loading states)
- "filed away." (save confirmation)
- "nothing here yet — pour something open." (empty states)
- "Looking good." (preview screen tag)
- "save recipe for now" (save sheet CTA)
- "what's on the menu?" (Build empty state hero)

---

## Authentication

**Stack:**
- Supabase Auth — `@supabase/supabase-js` installed
- Client: `src/lib/supabase.ts`
- Auth screens: `src/tipsy/SignUp.tsx` and `src/tipsy/SignIn.tsx`
- Transition wrapper: `src/tipsy/AuthFlow.tsx` handles slide animations between auth screens

**Session handling:**
- `App.tsx` manages session state using `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`
- Real-time listener reacts to login/logout
- Sign out button in Profile page Support section

**Routing logic:**
1. No active session → show SignUp screen (can navigate to SignIn via pill button)
2. Active session + `onboarding_complete` = false in profiles table → show Onboarding flow
3. Active session + `onboarding_complete` = true → show Build screen (main app)

**Auth methods:**
- Email/password sign up and sign in
- Google OAuth (wired and working)
- Email confirmation currently disabled in Supabase (intentional for development)

**Onboarding:**
- Legacy Welcome screen (name/email/password) removed — auth happens before onboarding
- Onboarding now starts directly at first question ("Your palate")
- Three questions total: palate, inspiration, constraints
- Each question writes to Supabase profiles table (palate, inspiration, constraints columns)
- Loader screen sets `onboarding_complete` = true in profiles table on completion

**Transitions:**
- SignUp ↔ SignIn: slide left/right via AuthFlow component
- Sign out: slides right from main app to auth screens (same as back navigation throughout app)
- Uses same DURATION (300ms) and easing as all other screen transitions

---

## Build Conversation Persistence

**Why**: Previously, Build's conversation state lived in the Cook component and was destroyed on unmount (e.g., when switching tabs or saving a recipe). Users lost their conversation mid-flow.

**Solution**: Build conversation state is lifted to App-level (lines 314-319 in `App.tsx`):
- `buildMessages` — visible chat messages
- `buildConversationHistory` — full history sent to AI (includes system messages not shown as bubbles)
- `buildCurrentRecipe` — in-progress recipe shown in mini player
- `buildMessageIdRef` — message ID counter
- `buildAutoFireAI` — flag to trigger AI on Build mount (used by recipe chat transfer)

These survive tab switches, navigation, and save flows. Cook receives them as props and renders/updates them, but doesn't own them.

**Clear functions**:
- `clearBuildStateOnly()` (line 818) — resets the four state pieces above, no transition or navigation. Used when seeding needs to atomically replace state.
- `clearBuildConversation()` (line 826) — calls `clearBuildStateOnly()`, then triggers a 300ms slide-back transition to a fresh Cook screen (with new `resetKey`). This is what the refresh button uses.

**Refresh button**:
- Top-right of Build's active state, hidden when `isEmpty` (line 3122: `{!isEmpty && (...)}`).
- Tapping opens a confirmation modal (lines 3415-3502) reusing the delete-confirm pattern.
- On confirm, calls `onClearConversation` prop (wired to `clearBuildConversation`), which runs the animated clear.

---

## Build Home-Screen Suggestion Chips

**Overview**: The three chips on the Build empty-state home screen are data-driven, selected at mount, and vary based on date/time. Defined in `src/tipsy/chips.ts`, rendered via `.map()` in App.tsx (lines 3267+).

**Chip data shape**:
- `header` (string) — bold Inter lead word displayed at top of chip (e.g., "Build", "Brainstorm", "Help")
- `body` (string) — italic Fraunces body text displayed below header (e.g., "a fun Sunday dinner")
- `prompt` (string) — full text fired into `handleChipClick` when tapped. This is what the AI receives. Tapping a chip is functionally identical to typing that text and sending it.
- `type` ("build" | "brainstorm" | "help") — used by picker for variety across the 3 selected chips
- `timing?` (object, optional) — if present, chip is time-aware and active only during specific windows. If absent, chip is evergreen (always available).

**Five timing shapes**:
1. `seasonal` — active every year between MM-DD start and end dates (e.g., summer: 06-16 → 08-31)
2. `fixedHoliday` — active from N days before a recurring MM-DD date through the date (e.g., July 4th: 07-04, leadIn 10 → window 06-24 through 07-04)
3. `floatingHoliday` — active from N days before explicit YYYY-MM-DD dates through each date (e.g., Thanksgiving 2026-11-26, 2027-11-25, leadIn 16)
4. `recurringWeekly` — active on specified weekdays (0=Sun, 6=Sat) but only within a seasonal window. **Supports season wrap across New Year** (e.g., gameday: Sat/Sun, season 09-05 → 02-09 wraps into January-February)
5. `oneOff` — active from N days before a single YYYY-MM-DD date through the date (e.g., awards night 2026-02-01, leadIn 4)

`isChipActive(chip, today)` resolves whether a time-aware chip is live on a given date.

**Picker behavior** (`pickChips(today)`):
- Returns exactly 3 chips
- Time-aware chips that are active today fill slots first (up to all 3 if genuinely active — e.g., a fall Sunday could show both "cozy fall dinner" and "gameday spread")
- Remaining slots fill from the evergreen pool
- Picker aims for variety of `type` across the 3 chips where possible (don't return three "Build" chips if the pool allows otherwise)
- No duplicates, always exactly 3
- Chips are picked **once per mount** via `useMemo` (stable within a session, varied across sessions)

**CRITICAL date-handling convention**:
- All date construction in `chips.ts` is **LOCAL-midnight**. Production calls `pickChips(new Date())`, which is local time, and users think in local days.
- **Never use `new Date("YYYY-MM-DD")`** — it parses as UTC midnight and shifts windows by a day in timezones west of UTC. This was a real bug (July 4th chip opened/closed one day late), root-caused and fixed.
- Use the local-parse helpers: `parseLocalDate(dateStr)`, `parseMonthDayWithYear(monthDay, year)`, `toLocalStartOfDay(date)`.
- Do NOT reintroduce UTC string-parsing. The normalization logic in `isChipActive` assumes local dates.

**Permanent test**: `src/tipsy/chips.test.ts`
- Run with `bun run src/tipsy/chips.test.ts`
- 29 test cases covering all timing shapes at their tight window edges
- Imports the real chip definitions from `chips.ts` (not redefined, so test stays valid as chip data evolves)
- Re-run whenever chip timing logic or calendar entries change

**Adding new chips**:
- The chip pool is currently a small starter set designed to grow into a large cultural calendar
- Adding entries is **data-only** — define the chip in `evergreenChips` or `timeAwareChips` arrays
- Does NOT require touching `isChipActive`, `pickChips`, or any logic functions

**Guardrails** (chips do NOT touch):
- System prompt (still triplicated across `fireAICall`, `sendMessage`, `handleChipClick` in App.tsx)
- Recipe XML format or `recipeToXML`
- Persistence/refresh logic
- Public sharing route

---

## Chat from Recipe Card

**Entry point**: Floating chat icon on saved recipes in the in-app Recipe Card (line 2160: `{editable && transferToRecipeChat && (...)}` — gated on `recipe.savedId`). NOT present on the public route `r.$token.tsx` (separate component, must stay chrome-free).

**Interaction flow**:
1. User taps chat icon → slides up a `CookInputBar` docked flush above nav bar (bottom: 64px, line 2209)
2. User types question and taps send
3. `handleChatSend` (line 1760 in RecipeCard) builds `SavedRecipe` object, calls `transferToRecipeChat` prop
4. Slide-up bar closes, user lands in Build with seeded conversation, AI auto-fires

**Dismiss**: Tap-outside-to-close via backdrop (lines 2188-2198, covers content area only, not nav). Tapping inside the bar stops propagation so it doesn't close.

**Transfer path** (`transferToRecipeChat`, line 773):
- **IMPORTANT**: RecipeCard is a module-level component with NO closure access to App scope. Seeding/navigation logic must go through props like `transferToRecipeChat`. Never call App-level functions (`setBuildMessages`, `switchToTab`, etc.) directly from RecipeCard — they're undefined there and will crash silently.
- Single transfer path for both empty and active Build (no collision warning).
- Atomically seeds:
  - In-progress recipe (mini player): `setBuildCurrentRecipe(recipeDraft)` (line 789)
  - User's question as first message: `setBuildMessages([userMessage])` (line 797)
  - Conversation history with just the user question: `setBuildConversationHistory([{ role: "user", content: question.trim() }])` (line 805)
- Navigates to Build: `switchToTab("build")` (line 814)

**Recipe-to-AI context injection**:
- `recipeToXML()` helper (App.tsx line 90) is a module-level function that converts a recipe to structured XML matching the system prompt's `<recipe>` format. It was moved to module level to be accessible from both the App component (`transferToRecipeChat`) and the Cook component (AI-call sites: `fireAICall`, `sendMessage`, `handleChipClick`).
- When a pre-existing saved recipe is pulled into chat, the recipe is supplied to the model as **system-prompt reference context**, NOT as a seeded assistant-role message in `conversationHistory`.
- At each AI-call site in Cook, the system prompt is conditionally extended: if `currentRecipe` exists, the recipe is serialized via `recipeToXML` and appended to the system prompt string with the framing `"The user is asking about this saved recipe; use it as reference:\n\n${recipeXML}"`. If no recipe is in scope, the system prompt is unchanged (blank Build is unaffected).
- Preserved invariants: recipe invisibility (recipe never enters the `messages`/display array), recipe XML stripping logic (strips `<recipe>` tags from AI response text), the `<recipe>` XML schema, and the Build-from-scratch flow where an AI-authored recipe legitimately remains an assistant message in `conversationHistory`.

**Auto-fire on arrival**:
- Cook's `useEffect` (lines 2360-2376) detects seeded conversation on mount.
- Triggers when: `messages.length === 1`, `messages[0].role === "user"`, `conversationHistory.length === 1`, `conversationHistory[0].role === "user"`, and `currentRecipe !== null`. The `currentRecipe` check is critical — it distinguishes a recipe-loaded chat from an empty Build.
- Guarded by `autoFireRef` to prevent double-firing.
- `currentRecipe` is included in the `useEffect` dependency array.
- Immediately fires AI call with the seeded history (line 2374: `fireAICall(conversationHistory)`).

**Why inject full recipe**: Users ask recipe-specific questions ("can I substitute X?", "how long does step 2 take?"). The AI needs ingredients and steps in context to answer accurately. Recipe context is transparent to the user (not shown as a chat bubble), but present in the system prompt on every turn of that conversation.

---

## Update vs Save-as-New (Recipe Origin Tracking)

**Recipe origin tracking**: `RecipeDraft` (App.tsx line 67) now carries an optional `sourceId?: string` field. Set in `transferToRecipeChat` (line 787) from the source recipe's `id` when a saved recipe is loaded into Build via chat-from-recipe. Preserved across AI turns: all three AI call sites (`fireAICall`, `sendMessage`, `handleChipClick`) copy `sourceId` from the previous `buildCurrentRecipe` onto the newly-parsed recipe (lines 2560, 2801, 3155), so it survives repeated AI edits. `sourceId` is internal state only — NOT included in `recipeToXML`, NOT sent to the AI, must stay out of the recipe XML.

**Save-flow branching**: When saving from Build, if `buildCurrentRecipe.sourceId` is present, the save sheet shows a two-button choice (Update [name] / Save as new) instead of the normal category picker. Absent → normal save flow unchanged. **Update path** calls `onUpdateRecipe` (line 2854) → `updateSavedRecipe` with in-place overwrite, re-anchors `sourceId` to the same saved recipe (line 2883). **Save-as-new path** uses normal `saveRecipe` insert and deliberately leaves `sourceId` pointing at the original base (line 2936–2939, commented as "base stays anchored" — enables spinning off multiple sibling recipes from one base in a single chat, marked as swappable F&F bet).

**updateSavedRecipe fixes** (data.ts lines 323–468): Three bugs corrected. (a) Ingredient INSERT now includes `user_id: userId` (line 381) — was missing → RLS 42501 → silent ingredient wipe. (b) Ingredient replacement is now safe against partial failure: old ingredients fetched as backup (line 360), best-effort restore on insert failure (lines 395–421). Note: not ACID-atomic — Supabase client exposes no transaction control; documented limitation. (c) Empty-array gate changed from `!== undefined` to `&& length > 0` (line 355) to prevent destructive delete-with-no-insert. (d) Post-update FETCH no longer selects non-existent `recipes.category` column (line 427, was 42703); category read separately via `recipe_categories` join, returned as `category: ''` matching `loadSavedRecipes`.

**onUpdateRecipe scope fix** (App.tsx line 2854): Previously referenced App-level setters (`setRecipesByCategory`, `setTabStacks`, `setActiveTab`) that aren't in Cook's scope → ReferenceError → error-fallback → duplicate. Now delegates to `finishSaveRecipe` (a Cook prop, line 2914) for cache-clear + nav. **Note for future work**: `onUpdateRecipe` lives inside Cook (child component) — only use Cook props, not App-level setters.

**AddYourOwn edit-duplicates fix** (AddYourOwn.tsx line 86): `isEdit` was `typeof editRecipe?.savedId === "number"`, always false for Supabase UUID strings, routing edit-saves to INSERT (duplicate) instead of UPDATE. Changed to presence/truthy check `!!(editRecipe && editRecipe.savedId)` matching the working pattern at line 707. Edit-via-pencil now updates in place.

**Shared-function risk**: `updateSavedRecipe` is used by BOTH the new Update path and AddYourOwn's edit flow. The `user_id` and ordering fixes above also closed a live production data-loss bug in AddYourOwn (editing ingredients was wiping them). Any future change to `updateSavedRecipe` affects both call sites.

**Known technical debt**: The three AI call sites still duplicate both the system prompt AND the recipe-parsing logic (the `sourceId`-preservation fix had to be applied in all three). Future consolidation pass should centralize both. Also: AddYourOwn edit-screen delete-button rendering may now work as a side effect of the `isEdit` fix — unverified, worth a quick check.

---

## Session Rules for Claude Code

- Design decisions are made in Claude.ai first — never figure out design in Claude Code
- One screen per Claude Code session, clearly scoped
- Ask Claude Code for a plan before it writes any code
- Visual changes only unless explicitly told otherwise — never change functionality or data flow
- Functionality and existing behavior is preserved exactly unless explicitly instructed to change it
- Always read CLAUDE.md at the start of every session
- When implementing a screen, reference the spec above for that screen exactly

---

## Current Build Status

**Complete and functional:**
- Authentication — Supabase Auth with email/password and Google OAuth
- Sign Up and Sign In screens with slide transitions
- Session handling and protected routes
- Onboarding flow (starts at first question, no legacy Welcome screen)
- Profile page with sign out button
- Recipes — Categories, Recipes, Recipe Card
- Write Your Own flow
- Screen transitions (slide left/right, including auth transitions)
- Build AI — wired and functional, full conversation loop including save
- Menus — full three-level hierarchy
- RecipePicker
- Universal save flow
- Recipe card freeze pane — tab bar sticks, scroll position preserved
- Build system prompt v2
- Mini player fade and pulse animations
- Recipe card auto-collapse on message send
- Lazydog font registered (`src/fonts/lazydog.ttf`, `@font-face` as `'Lazydog'`)
- Recipes migrated to Supabase ✓
- Ingredients migrated to Supabase as separate table with sort_order ✓
- localStorage key tipsyDinnerRecipes removed ✓
- Categories migrated to Supabase ✓
- recipe_categories join table wired ✓
- getSavedRecipesForCategory now filters correctly by category ✓
- localStorage key tipsyDinnerCategories removed ✓
- Occasions migrated to Supabase ✓
- Menus migrated to Supabase ✓
- menu_recipes join table wired ✓
- localStorage keys tipsyDinnerOccasions and tipsyDinnerMenus removed ✓
- Profile data (display_name, palate, inspiration, constraints) migrated to Supabase ✓
- onboarding_complete column added to profiles table ✓
- Onboarding flow writes to Supabase on each question ✓
- App.tsx session handling reads onboarding_complete from Supabase ✓
- Profile page reads and writes to Supabase ✓
- One-time localStorage migration wired and working ✓
- localStorage keys tipsyDinnerPalate, tipsyDinnerInspiration, tipsyDinnerConstraints, tipsyDinnerOnboardingComplete removed ✓
- Sign out working correctly ✓
- Anthropic API key moved to Supabase Edge Function ✓
- Edge Function ai-chat deployed to Supabase ✓
- VITE_ANTHROPIC_API_KEY removed from .env and codebase ✓
- AI calls now route through Supabase, key never exposed to browser ✓
- Streaming preserved — responses still appear word by word ✓
- RESET ONBOARDING button hidden in production (dev-only) ✓
- Mobile viewport fixes — full-screen meta tag, height: 100% ✓
- Delete functionality for recipes and categories with confirmation modals ✓
- Recipe Card editable check fixed to handle UUID recipe IDs ✓
- ScreenStage tree structure stabilized — transitions no longer cause unnecessary remounts ✓
- Tab-return data loss bug FIXED — Supabase fires duplicate SIGNED_IN events on tab refocus; profileInitialized ref in onAuthStateChange ignores subsequent events after initial sign-in ✓
- Full-screen layout — fixed 320×640 mockup frame removed; app now renders full-screen on real device viewport. S.page and S.phone in App.tsx use shared CSS class `td-fullscreen-height` (height:100vh with height:100dvh override). S.phone: width:100%, maxWidth:480, safe-area insets at container level via paddingTop/paddingBottom env(safe-area-inset-*). Verified on real phone via Vercel branch preview ✓
- iOS input auto-zoom prevented — all input/textarea fields raised to fontSize:16 (TextInput, TextArea, EditInput, NameInput, inputStyleBase, Build chat textarea). Stops Safari auto-zoom-on-focus while preserving pinch-zoom ✓
- Build conversation persistence — Build state (messages, history, current recipe) lifted to App scope, survives tab switches and save flows. Refresh button with animated clear (300ms slide transition). clearBuildConversation + clearBuildStateOnly helpers ✓
- Chat from recipe card — floating chat icon on saved recipes, slide-up input bar, transfers to Build with full recipe context injected as XML, auto-fires AI on arrival. Single transfer path (no collision warning). RecipeCard → transferToRecipeChat prop pattern (module-level component, no App-scope closure) ✓
- Update vs save-as-new — recipe origin tracking via sourceId, two-button choice on save (Update [name] / Save as new), Update path in-place overwrites with re-anchoring, Save-as-new spins off siblings from same base. Fixed updateSavedRecipe (user_id RLS, safe ingredient replace, empty-array gate, phantom column). Fixed AddYourOwn edit-duplicates bug (isEdit UUID check). Both paths verified end-to-end ✓
- Build home-screen suggestion chips — curated, time-aware chip system (src/tipsy/chips.ts). Three chips selected at mount via pickChips(new Date()), stable within session, varied across sessions. 8 evergreen + 6 time-aware chips with 5 timing shapes (seasonal, fixedHoliday, floatingHoliday, recurringWeekly, oneOff). Fixed UTC-vs-local date bug (all dates now local-midnight). 29/29 unit tests pass (chips.test.ts). Verified on-device ✓

**Known issues (next session priorities, in order):**
- Saving a menu fails — data/logic bug, deferred from layout pass, needs dedicated session
- Recipe List doesn't refresh after a recipe is deleted — cache clear works but list doesn't re-fetch on re-mount
- AddYourOwn edit flow: delete button rendering unverified (may work now as side effect of isEdit fix), worth quick check
- Add an "All Recipes" default category — design decision pending (real Supabase row vs virtual view)
- Slight flash on screen transitions during async category/recipe loads
- + button position shifts after category creation
- Brief flash on Menu Interior load
- RecipePicker category cards still showing legacy gradient color
- ScreenStage paddingBottom:64 (App.tsx ~lines 1094 & 1107) is hard-coded nav-bar clearance — tested fine in production, low priority, revisit only if content crowds behind nav bar on any device

**Visual redesign order (follow this sequence):**
1. Build — empty state
2. Build — active state
3. Recipes — categories
4. Recipes — recipe list
5. Recipes — recipe card
6. Write Your Own — all steps
7. Menus — occasions
8. Menus — menu list
9. Menus — menu interior
10. Profile
11. Splash screen (last — dependent on logo assets)

**Not yet built:**
- Splash screen
- Search
