# Tipsy Dinner — CLAUDE.md
Last updated: May 2026

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
**Deployment:** Vercel (planned)

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

Three versions in `src/assets/`:
- `Full_Logo.png` — full "tipsy DINNER" wordmark lockup. Used on splash screen only.
- `watermark_square.png` — square tD monogram on green background. Used in Build screen top-left and mini player.
- `watermark_circle.png` — circular tD monogram. Available if needed.

**Import example:**
```js
import tDSquare from '../assets/watermark_square.png'
import fullLogo from '../assets/Full_Logo.png'
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
- Tone: warm, confident, restrained. No asterisks, no markdown, no bullet points. Plain conversational prose only.

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

**Known issues (refinement pass later):**
- Slight flash on screen transitions during async category/recipe loads
- + button position shifts after category creation
- Brief flash on Menu Interior load
- RecipePicker category cards still showing legacy gradient color

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
- Streaming responses
- Search
