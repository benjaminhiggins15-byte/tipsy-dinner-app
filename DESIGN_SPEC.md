# Tipsy Dinner — DESIGN_SPEC.md

Detailed visual spec for each screen. Not loaded every session — consult this when
building or restyling a specific screen. The design system (fonts, colors, gradient,
logos) lives in this file (relocated from CLAUDE.md, 2026-09-21) alongside the
per-screen application of it.

---

## Design System Reference (see Design System section below for full detail)

- **Display font:** Lazydog, always uppercase — recipe titles, screen/section headings
- **Serif italic:** Fraunces italic — AI responses, descriptions, taglines, margin notes, empty states
- **Body:** Inter (400 / 500) — body copy, ingredients, steps, nav, buttons, meta, quantities
- **Colors:** `--green #233C00` (bg), `--green-deep #182800` (nav/sheets), `--green-mid #2E4E08` (cards), `--blue #1E3A42` (CTAs/active), `--blue-mid #2A4E5A` (borders/accents), `--cream #FEE7C0` (text), `--cream-dim rgba(254,231,192,0.55)`
- **Gradient:** full-bleed `linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%)` behind every screen except splash, content above at z-index 1

---

## Design System

Full per-screen detail in DESIGN_SPEC.md. The core:

**Fonts**
- **Lazydog** — intended as the display font for recipe titles/screen headings
  (always `text-transform: uppercase`), but there is no `@font-face` for it anywhere
  in the codebase. `src/fonts/lazydog.ttf` exists on disk but is never loaded; every
  `fontFamily: "Lazydog, ..."` reference (a handful, in `Home.tsx` only — several
  other screens that should be using it per this doc use `Inter` instead) silently
  falls back to its fallback family. **Closed by decision, 2026-09-20** — logged and
  intentionally not fixed this session; see the Standing Cleanup bullet in CLAUDE.md
  for the known fix path.
- **Fraunces italic** (Google) — AI responses, recipe descriptions, taglines, margin notes, empty-state copy, form description fields. Same non-loading problem as Lazydog: `src/routes/__root.tsx` only preconnects/loads the Inter Google Fonts stylesheet, never Fraunces, so every `fontFamily: "Fraunces, ..."` reference app-wide falls back to a generic serif. **Closed by decision, 2026-09-20** — logged, not fixed; see Standing Cleanup in CLAUDE.md.
- **Inter** (Google, 400/500) — body copy, ingredient names, steps, nav labels, buttons, metadata, quantities.
- **Playwrite US Modern** (Google) — logo assets ONLY, never in app UI.

**Color palette**
```css
--green:       #233C00   /* app background — all screens */
--green-deep:  #182800   /* nav bar, input bar */
--green-mid:   #2E4E08   /* cards, recipe rows, section headers */
--blue:        #1E3A42   /* CTA buttons, active states */
--blue-mid:    #2A4E5A   /* borders, accents, secondary elements */
--cream:       #FEE7C0   /* all text on green, hero moments */
--cream-dim:   rgba(254,231,192,0.55)  /* secondary text, placeholders, muted labels */
```
Rules: cream on green for text directly on background; user bubbles cream bg + green text; AI text cream Fraunces italic on green (no bubble); CTAs cream bg + green text; no decorative red/orange/coral/terracotta — `#B85C5C` is the sole exception, reserved for error and destructive states (delete/remove actions, inline error text) and used in ~19 locations across 4 files (App.tsx, Occasions.tsx, NewCategory.tsx, Menus.tsx); never repurpose it for anything decorative. Bottom sheets (delete-confirm modals, the Cook History log/edit sheet) are light `#FAF7F2`, not a green — confirmed by grep, zero `#182800` bottom sheets exist anywhere in the codebase. Same doc-hygiene family, re-confirmed 2026-07-26: `#182800` doesn't appear anywhere in `src/` at all, not just in bottom sheets, and the "Universal gradient" block immediately below is likewise absent from every file — zero grep matches for its `#3a6010`/`180deg` string. Large parts of the app (`BottomTabBar`, `Occasions.tsx`, and others) now render on a light `#FAF7F2` background instead of the green gradient this doc describes. Treat color/background claims in this doc as unverified until grepped, not just the two flagged here.

**Universal gradient** — behind every screen except splash:
```css
background: linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%);
height: 420–480px; position: absolute; top:0; left:0; right:0;
z-index: 0; pointer-events: none;
```
Content sits above at z-index 1. Gradient fades into base green — no hard edges.
**STALE, confirmed by grep 2026-07-26: this exact CSS string does not appear anywhere
in `src/`.** Treat as historical intent, not current fact, until a screen-by-screen
re-audit replaces it — see the doc-hygiene note in the Color palette section above.

**Logo assets** (`src/Logos/`) — path is case-sensitive on Linux/Vercel:
- `Full_logo.png` — full "tipsy DINNER" wordmark. Splash screen only.
- `watermark_square.png` — square tD monogram. Mini player only (Build removed it this session).
- `watermark_circle.png` — circular tD monogram. Home header, top-right of greeting (moved off Build this session).
```js
import tDSquare from '../Logos/watermark_square.png'
import fullLogo from '../Logos/Full_logo.png'
```

**Navigation** — four tabs, always visible, bottom of every screen: Build, Recipes,
Grocery, Profile (`TAB_ORDER`, App.tsx ~line 570; icons `IconChefHat`/`IconBook`/
`IconShoppingCart`/`IconUser` in `BottomTabBar`, App.tsx ~1694–1698). Nav bg
`#FAF7F2` (this doc previously and incorrectly said `#182800`). Active = dark green
`#233C00` icon + label + small `#233C00` dot below; inactive = `#233C00` at 25%
opacity (previously and incorrectly documented here as cream/cream-25% — the nav bar
sits on a light background, not green). All transitions slide left/right. Back
arrows are icon-only but there is no systematic/stack-depth-driven mechanism behind
them — every screen hardcodes its own; `Profile.tsx` is the sole screen that actually
branches on the `isTabRoot` prop to decide whether to render one, even though
`isTabRoot` is threaded to several other screens unused.

Menus is NOT a nav tab — reached via an `IconLayoutList` icon on the
Recipes/Categories header (App.tsx ~1847–1869) that pushes to Occasions. Grocery
*was* reached via a cart icon in that same header slot; as of 2026-07-26 the two were
swapped — Grocery moved onto the bottom nav (replacing Menus' old tab slot) and Menus
took over the header icon slot (commit `254e0b5`). There is no reserved 5th slot in
the current tab bar layout; a fifth tab remains a product idea for a future social
feature, not a structural placeholder.

**Superseded 2026-08-09**: that fifth tab now exists — `Home` (`IconHome`), added for
the account-to-account sharing receiving surface, appended LAST in `TAB_ORDER`
deliberately (inserting it elsewhere in the array disturbs `ScreenStage`). Moving it
to a more prominent position in the bar is a future-session product decision, not a
structural blocker. Full detail: Account-to-Account Sharing — Receiving in
FEATURE_SPECS.md.

**Superseded 2026-08-11**: `Home` moved from last to FIRST — `TAB_ORDER` is now
`home, build, recipes, grocery, profile`; app launches on Home (`activeTab` inits
`"home"`). `BottomTabBar`'s hardcoded icon array was reordered to match by hand. TD
circle logo moved off Build's header onto Home's (top-right of greeting); Build's
header now shows only its right-side action button.

*(Relocated from CLAUDE.md, 2026-09-21 doc-reorg pass.)*

---

## Build — Empty State
- Gradient behind all content
- Top bar: logo removed this session (moved to Home header, see Home — Greeting section) — row is now `flex-end`, holding only the "Write a recipe" ghost pill on the right (Inter 500, cream 60%, border cream 20%, radius 20px)
- Hero: "what's on the menu?" centered — Lazydog uppercase, cream, ~48–52px
- Bottom stack (above input): three suggestion chips (data-driven — see CLAUDE.md Build Chips), "or just type" divider, input bar
- Chips: Fraunces italic, cream 85%, bg cream 6%, border cream 14%, radius 12px, padding 13px 18px
- "or just type" divider: Inter, cream 28%, uppercase, letter-spacing
- Input bar: on #182800 footer, cream placeholder, send circle in #1E3A42

## Build — Active State
- Same gradient, same top bar as Empty State — no logo (removed this session); shows the refresh icon button alone, right-aligned (`flex-end`), once a conversation starts
- Conversation thread on green, justified to bottom
- User messages: cream (#FEE7C0) bubble, radius 18px 18px 4px 18px, green (#233C00) Inter text
- AI messages: no bubble, Fraunces italic cream text directly on green, max-width 88%
- Mini player: on #182800, border-top cream 8%, tD square PNG left, "Recipe ready" label (Inter 10px uppercase cream 35%), title (Inter 500 cream), chevron right
- Mini player fades to 50% while generating, back on completion; pulses soft blue (#2A4E5A) once when recipe finishes
- Expanded recipe card auto-collapses to mini player on message send
- Input bar: send button filled #1E3A42 with cream arrow

## Recipes — Categories
- Header: "Recipes" (Inter 500 uppercase cream) left; "View all" pill (rounded rect, cream border 25%, Inter 500 12px cream) + `IconLayoutList` icon (Menus entry, pushes to Occasions — this slot previously held the grocery-list cart icon before Grocery moved onto the bottom nav) right, in that order. The top-bar + add-category button is gone — the embedded dashed add-category card is now the only add affordance.
- 2×4 grid, gap 12px, padding 0 20px
- Cards: bg #2E4E08, radius 16px, padding 16px. Tabler icon top-left (cream 20%, 32px), count bottom (Inter 11px cream 40%), title bottom (Inter 700 uppercase cream, letter-spacing 0.08em, 15px)
- Empty dashed card sits first in the grid (top-left), not last: cream 4% bg, dashed border cream 15%, centered plus — moved forward so it doesn't drift below the fold as the library grows
- **Received-pending pill** (added 2026-08-20, part of the Home-shelf relocation — see "Home — Greeting + Received Shelf" above): sits below the header, above the category grid, `padding: 0 20px 12px`, shown only when there are pending items. Pill button: flex row, `gap: 6`, `padding: 8px 14px`, `borderRadius: 20`, `border: 1px solid rgba(35,60,0,0.15)`, `background: rgba(35,60,0,0.04)` — quiet/outline treatment, not a filled CTA. Label "Received (N)", Inter 500 12px `#233C00`. Tapping pushes the existing `ReceivedPending` list screen (same screen Home's card also opens, via a different navigation path — see FEATURE_SPECS.md).

## Recipes — Recipe List
- Header: back arrow left, category name (Inter 500 uppercase cream) + count (Inter cream 35%) stacked, no right action; search icon top right (alongside the delete-category trash icon)
- 80px rows, gap 10px, padding 0 20px, bg #2E4E08, radius 14px, padding 0 18px
- Row: placeholder icon (44×44 rounded, cream 7% bg, cream 25% stroke) left; title (Inter 700 uppercase cream 14px) + Fraunces italic description (cream 50% 12px) + meta (Inter 500 uppercase cream 25% 10px) center; chevron right (cream 20%)
- Search icon: inline stroked SVG, transparent bg, no border, ~20px — matches the existing header icon convention (back arrow, trash)
- Search bar (open state): inline, a new sibling between the header and the scrolling list, aligned to the same 20px inset as the row cards below it. Underline only, not a box: transparent background, no border-radius, single bottom border — `rgba(35,60,0,0.12)` resting, `rgba(35,60,0,0.3)` on focus. Padding `8px 0 10px`. Input `fontSize: 16` (iOS zoom prevention — do not change). Placeholder "search recipes" at `rgba(35,60,0,0.3)`. Rationale: a filled, bordered input competed visually with the recipe rows, which are themselves filled rounded cards — the underline lets the rows own the card language and lets the search bar read as a threshold into the list. Changed to this after seeing the boxed version on a real phone.

## Recipes — View All
- Header: back arrow + "All Recipes (N)" (Inter 500 uppercase cream) left; search icon and sort control (label + chevron) right, in that order
- Rows: same rendering as Recipes — Recipe List above (independently duplicated JSX, not a shared component)
- Search icon + search bar: same treatment as Recipes — Recipe List above, positioned alongside the sort control instead of the trash icon

## Recipes — Recipe Card
- Background: light `#FAF7F2` (not the green gradient) — text and icon strokes are dark `#233C00` / `rgba(35,60,0,…)` throughout the screen.
- Header row: back arrow left; share, edit, camera, cart icons right, in that order (all `rgba(35,60,0,0.5)` stroke, 20px). Camera opens the file picker directly when there's no photo, or a Replace/Remove dropdown when there is; cart shown only when the recipe has ingredients.
- Hero photo: renders only when the recipe has a photo (or an in-flight upload/remove/error) — no placeholder or gap when it doesn't. 4:3, radius 30px.
- Category label (Inter 500 uppercase 35% 11px) → title (Inter 700 capitalize — not Lazydog/uppercase — 28px `#233C00`) → Fraunces italic description (55% 15px).
- Headline rating: "Rating" label (uppercase 35% 11px) + `#233C00` number, one decimal, inline — renders only when a scored cook exists.
- Meta row is "Yield" only (label + value), shown only when the recipe has one set; no Time/Serves/Added row.
- Tab bar: three tabs, Ingredients / Steps / History, left-aligned, sticky on scroll. Active `#233C00` + 1.5px underline; inactive 30%; border-bottom 8%.
- Ingredients tab: name left (Inter 15px `#233C00`), quantity right (Inter 500 tabular-nums 40% 14px), 1px dotted divider (10%) between rows.
- Steps tab: untitled steps render flat and numbered; titled steps render as collapsible accordion rows (tap to expand, chevron rotates), collapsed by default. A "Tap each step for details" hint (Fraunces italic 55%) shows only when ≥1 step has a title.
- History tab: "Log cook" button (filled `#233C00`/cream) at the top of the tab content, not the header. Rows: date left, score + edit-pencil right, dotted divider; a row with a note becomes the same expand/collapse pattern as Steps, note text in Fraunces italic 60%. Newly logged or edited cooks sort most-recent-first for the rest of the session; the order on first load reflects the raw query result, not a guaranteed date sort.

## Recipes — Send Sheet (bottom sheet)
- Opened from the Recipe Card header's existing share icon (owned recipes only). Same sheet conventions as the Log sheet / Save sheet: bg `#FAF7F2`, radius 24px top, centered drag handle, `position: fixed; bottom: 64` (not `absolute; inset: 0`), slide-up + backdrop-fade on open.
- Title "SEND RECIPE" (Lazydog, uppercase) + recipe name subtitle beneath it (`#233C00`).
- Search input: underline style (no filled box), placeholder "search by name or @handle".
- Selected recipients render as dark-green (`#233C00`) chips — initial circle + first name in cream, small cream x to remove — in a row under the search input, above the results/connections list.
- Results/connections rows: initial-circle avatar, name + `@handle` (Fraunces italic, muted), checkmark circle at right when selected.
- Optional note field: recessed style matching other optional-field treatments elsewhere in the app (not the primary CTA weight).
- Primary button: dark-green `#233C00` bg, cream text, "Send to N people" — **hidden entirely in the resting state** (no recipient selected). Resting state shows only: search → note → share-as-link, no Send button, no hint line.
- "OR" divider (muted, centered) below the Send button once it's visible.
- "Share as link instead" — quiet text button (not a filled CTA), routes to the existing external gift-link flow; visually and functionally distinct from the primary Send button above it.

## Write Your Own — Basics (Step 1 of 5)
- Top bar: back arrow left, "Step 1 of 5" centered (Inter 500 uppercase cream 35%), cream "Next" pill (green text) right
- Progress: 2px cream line, 20% filled, cream 10% track
- Fields: bg cream 5%, border cream 12%, radius 10px, padding 14px 16px, cream text
- Labels: Inter 500 uppercase cream 35% 10px, letter-spacing 0.1em
- Description field: Fraunces italic 15px. Cook time + Serves side by side, centered, Inter 500 18px

## Write Your Own — Ingredients (Step 2 of 5)
- Same top bar, "Step 2 of 5", progress 40%
- Quantity input: 80px wide, centered, Inter 500 tabular-nums cream 50%
- Name input: flex 1, Inter 400 cream. X remove: cream 20% stroke, right of row
- "add ingredient" row first (primary); "add section" centered divider below (secondary)

## Write Your Own — Steps (Step 3 of 5)
- Same top bar, "Step 3 of 5", progress 60%
- Step number: circle (cream 8% bg, cream 12% border, 28px), Inter 500 cream 45% inside
- Step input: flex 1, Inter 400 cream 14px, border cream 12%, radius 10px. X remove top-right. "add step" at bottom

## Write Your Own — Preview (Step 4 — no counter)
- Top bar: back arrow only, no counter/progress
- "Looking good." muted tag (Inter 500 uppercase cream 35%)
- Full recipe-card preview (same layout as Recipe Card). Cream "Save" pill centered above nav, green text

## Write Your Own — Save Sheet (bottom sheet)
- Slides over preview, preview dims to 25%
- Sheet: bg #182800, radius 24px top. Handle: 36×4px, cream 15%, centered
- "Pick a category" label: Inter 500 uppercase cream 35%
- Category chips: 3-col grid, cream 6% bg, cream 12% border, radius 10px, Inter 500 12px cream 60%. Selected: cream 12% bg, cream 40% border, full cream text
- Divider 1px cream 6%. "Add to a menu" button: cream 4% bg, cream 12% border, radius 12px, Inter 500 cream 70%, chevron. "Save" CTA: full-width cream bg, green text, radius 14px, Inter 500 uppercase
- NOTE: when a recipe was loaded via chat-from-recipe (has `sourceId`), this sheet instead shows the two-button Update / Save-as-new choice (see CLAUDE.md Update vs Save-as-New).

## Menus — Occasions
- Header: back arrow (added when Menus moved off a header-icon-only entry point onto a full screen push) + "Menus" left, + right. Full-width rows separated by cream 6% dividers
- Row: Tabler icon (22px cream 45%) left, name (Inter 500 cream 16px) + menu count (Inter cream 35% 12px) center, edit + delete (cream 20%) right, chevron

## Menus — Menu List
- Header: back arrow + occasion name + count stacked, + right
- Full-width cards, gap 12px, padding 0 20px, bg #2E4E08, radius 16px
- Photo zone: 130px, gradient placeholder (#2E4E08 → #1a3205), "add a photo" (Inter 500 uppercase cream 20%), bottom gradient overlay
- Body: menu name (Inter 500 cream 15px) + Fraunces italic description (cream 45% 13px) left, edit + delete right

## Menus — Menu Interior
- Header: back arrow + menu name + occasion name stacked, edit pencil right
- Collapsible sections (canonical order): Apps, Mains, Sides, Desserts, Drinks(optional)
- Section header: #2E4E08 5% bg, cream 8% border, radius 14px (14px 14px 0 0 when open); name Inter 500 uppercase cream 70% 12px, count cream 30% 11px, chevron
- Expanded body: cream 3% bg, cream 8% border, border-top none, radius 0 0 14px 14px
- Recipe rows: name (Inter 500 cream 14px) + meta (Inter cream 30% 11px), X remove right (cream 15%). "add a recipe" row at bottom. Tapping a recipe opens the card; back returns here

## Home — Greeting + Received Shelf
- Background: light `#FAF7F2` (not the green gradient) — same treatment as Recipe Card / Profile / Send Sheet. Home is the bottom nav's 1st tab (`IconHome`) — moved from last to first this session — and is now the app's launch screen (opens on load).
- Header is a space-between flex row: Greeting (Fraunces italic, ~22px, `#233C00` — "Good morning/afternoon/evening" by local hour + the user's first name) on the left; TD circle logo (`watermark_circle.png`, height 36) on the right, opposite the greeting — moved here from Build's header this session.
- Section label "RECEIVED RECIPES": Inter 500 uppercase 13px `#233C00`, letter-spacing 0.1em. "View all (N)" (Inter 500 12px, `rgba(35,60,0,0.6)`) sits at the right of the same row, shown only once there are more than 4 pending items.
- Tiles: 190×142, radius 20px, horizontal scroll, gap 12px, up to 4 shown. Photo tiles: cover photo blurred (6px) and scaled up 1.1×, with a bottom-to-top scrim (`rgba(24,40,0,0.85)` → transparent) carrying the title (Lazydog uppercase, cream `#FEE7C0`, 2-line clamp) and "from {senderName}" (Inter 500 11px, cream 75%). Photoless tiles: flat `#2E4E08` panel with the app's watermark monogram centered at 50% opacity — currently reads as a visibly distinct-shade box against the shelf rather than blending in; open aesthetic item, not yet resolved.
- Zero pending items: bare greeting only, no dedicated empty-state illustration/copy yet.

**Superseded 2026-08-20** — the tile shelf above (section label, "View all (N)", 190×142
tiles) was relocated off Home entirely this session (see "Account-to-Account
Sharing — Receiving" in FEATURE_SPECS.md for the full relocation writeup). Home's
current composition, top to bottom: greeting header (unchanged, as above) → a row of
data-driven prompt chips (same chip visual treatment as Build — Empty State: Fraunces
italic, cream-on-green tokens re-mapped to this light-bg screen — see CLAUDE.md /
FEATURE_SPECS.md "Build Home-Screen Suggestion Chips") → a carousel slot reserved
below the chips for the Thread 3 suggestions feature, not yet built → a compact
received-recipe card, conditional on pending items existing, sitting last/lowest in
the stack.
- Received card (replaces the old shelf): single card, NOT a horizontal scroll.
  `margin: 14px {EDGE}px 0`, `padding: 10px 14px`, `borderRadius: 14`, `background:
  #2E4E08` (dark green) — deliberately reusing the tile shelf's old color identity so
  a received recipe still visually says "someone sent you this" wherever it appears
  in the app. Flex row, `justify-content: space-between`, `gap: 10`. Left side
  (stacked, `gap: 2`, single-line ellipsis both rows): title in Lazydog uppercase,
  cream `#FEE7C0`, 13px; "from {senderName}" in Inter 500 11px `rgba(254,231,192,0.75)`,
  with a trailing "· +{N-1} more" in `rgba(254,231,192,0.5)` when more than one item is
  pending. Right side: a small 14×14 chevron-right stroke icon, `rgba(254,231,192,0.6)`.
  Tapping the card navigates directly to the received list (not a shelf/tile
  intermediate step).
- Deliberate sizing decision: the card is sized SMALL and deferential — it must not
  outweigh the chip row above it. This is a one-line summary of the most recent/first
  pending item plus a count, not a multi-item shelf.
- Deliberate distinctness decision: the received card and the future suggestions
  carousel are NOT the same visual language on purpose. A received recipe is a
  person-to-person event (someone sent you this) and stays dark-green/cream/card-shaped;
  the coming carousel (app-generated suggestions) must look different from this card
  when it's built — do not reuse this card's exact treatment for it.
- The Recipes tab (`Categories` screen) also gained a small received-recipe entry
  point this session — see "Recipes — Categories" below for its pill styling. Home's
  card and the Categories pill are two independent, separately-fetched summaries of
  the same underlying pending list (see FEATURE_SPECS.md for why the fetches were
  deliberately not shared/lifted).

**Superseded 2026-08-23** — the "carousel slot reserved … not yet built" placeholder
above is filled in; the suggestions carousel (Thread 3) shipped and merged to `main`
on `home-screen-layer-4`. **Final Home composition, top to bottom: greeting header →
prompt chips (unchanged) → suggestions carousel (below) → received card (unchanged,
as above).**
- **Suggestions carousel.** A horizontally-scrolling row of up to 3 tiles (display is
  capped at 3 even though `compute-slice` mints 3-4 picks per slice), matched to the
  app's existing category-tile presence rather than the received shelf's photo-tile
  look: flat `rgba(35,60,0,0.06)` panel, `rgba(35,60,0,0.1)` border, radius 16px,
  fixed ~42%-width/120px-tall tiles, `scroll-snap-type: x mandatory` with matching
  scroll-padding so the first tile aligns to the same 20px edge as everything else on
  Home. Title-forward, no photo/description/icon: recipe title in Lazydog uppercase,
  24px, 2-line clamp, bottom-anchored in the tile, with a small uppercase meta line
  below it ("{cuisine} · {effort}", Inter 500 10px, `rgba(35,60,0,0.45)`). Section
  label above the row: "Today's suggestions" (Inter 500 uppercase 13px).

  **Superseded 2026-09-20** — the meta line is now cuisine-only, not
  "{cuisine} · {effort}". Two client-side display maps were added: `cuisineLabels.ts`
  (raw pool slug → curated label, e.g. `british_scottish_irish` → "British Isles";
  unmapped slugs fall back to a title-cased render, never a raw slug) and
  `effortLabels.ts` (quick → "Weeknight", moderate/project → "Worth the time" — the
  moderate/project boundary turned out to be an unguided AI judgment call at
  generation time, not a real rule, so collapsing it was deliberate). The effort tag
  was relabeled first, then dropped entirely from both the tile and
  `SuggestionDetailView` for being low-signal (most slices showed the same label on
  every tile). `effortLabels.ts` is kept in the repo, unused, for possible future
  reuse — see "First-Impression Polish" in FEATURE_SPECS.md.
  - **Five render states:** a 3-tile skeleton shimmer with "finding today's
    recipes…" (Georgia italic, muted) while the slice is computing; the populated
    carousel (above) once picks resolve; "your suggestions are refreshing — check
    back soon" when a slice row exists but predates the `pick_details` backfill (no
    backfill, by design); the section label plus "Your suggestions will appear here
    soon." (**Superseded 2026-09-20**, was "still learning your taste — check back
    soon" with no section label) when compute ran but produced no slice at all; and
    nothing rendered on no-session or an unexpected client error (both collapse to
    the same silent null case).
  - **Tapping a tile** fetches the full recipe via the `get_suggested_recipe` RPC
    (loading + a gentle inline error on that tile only, no crash) and opens a detail
    view that mirrors the received-recipe view's presentation — full writeup in
    "Suggested Recipes — Layer 4" in FEATURE_SPECS.md; this doc covers display only.
- **Deliberate three-tier visual distinction, now fully in place across Home:** text
  prompt chips (no card chrome) → light, photoless recipe tiles (the suggestions
  carousel, above — the app's idea) → dark-green/cream received card (a
  person-to-person event). The carousel deliberately does NOT reuse the received
  card's dark-green treatment, and deliberately does NOT use a photo-tile look
  either — reinforcing that a suggestion reads as the app's idea, not dressed up to
  look like a person sent it.
- The "Loading thought starters" loading line (renamed from "finding today's
  recipes…", see below) is the carousel's only by-feel personalization signal
  today — there's no other visible cue that the slice is user-specific rather
  than generic; it's meant to read as a quiet "we're thinking about you" moment
  rather than a plain spinner.

**Superseded 2026-08-27** — Home is now a single continuous vertical scroll and
gained a fourth section; final current state:
- Suggestion tile titles are proper-case, not uppercased: Lazydog 20px, line-height
  1.15, 3-line clamp (raised from 2, to fix long-title clipping), `#233C00`; title and
  descriptor both use `flexShrink: 0` so the clamp's ellipsis renders cleanly instead
  of a mid-word chop. Tile height 126px (raised from 100px for the 3-line clamp),
  with the loading skeleton matched to the same 126px so there's no height shift on
  load. Container uses `justifyContent: space-between` (title top-anchored, descriptor
  bottom-anchored) so titles share a common top baseline across the row regardless of
  line count.
- Only the greeting header stays pinned; the chips row (previously fixed below it)
  now lives inside the scroll column as its first element, directly above the
  suggestions carousel — the whole rest of the screen scrolls as one column.
- Four section titles now organize the column as labeled shelves, all sharing one
  style (Inter 500, uppercase, 13px, letter-spacing 0.1em, `#233C00`): "Jump in"
  (above chips), "Thought starters" (renamed from "Today's suggestions", above the
  carousel — its loading copy is now "Loading thought starters"), "Sent to you"
  (above the received card, same conditional as the card), and "Explore" (last in
  the column). Each carries the same section-break rhythm: 36px margin above
  (separation from the section before) / 8px margin below (a tight hug to its own
  cards) — small-below/large-above throughout, so each title reads as attached to
  what's under it, not what's above it.
- **Explore** (new): three plain tappable rows below the received card — "Cook up
  something new" / "Browse your recipes" / "Check your grocery list" — 14px Inter,
  muted green (`rgba(35,60,0,0.6)`), each with a 14px chevron-right
  (`rgba(35,60,0,0.25)` stroke) and hairline `0.5px` dividers above the block and
  between rows. Deliberately the quietest tier on the screen: no card chrome, no
  fill. Tapping a row navigates via `switchToTab` to `build`/`recipes`/`grocery`
  respectively — plain navigation only, no seeding, no data change.

## Home — Received Recipe View
- Hand-matches the Recipe Card's layout (hero photo, title, Fraunces italic description, Ingredients/Steps tabs, step-row expansion) so a received recipe looks indistinguishable from one already saved — built as its own sibling view, not by reusing `RecipeCard`.
- Read-only: no History tab, no edit/delete/camera controls. Description area shows "inspired by {senderName}" in place of any owner-only meta.
- Bottom action bar: Save / Dismiss, fixed to the screen (`position: fixed; bottom: 64`), same nav-bar-clearance convention as every other full-height sheet in the app.
- Tapping Save opens the same category-picker sheet used everywhere else in the app (see Write Your Own — Save Sheet above) — no separate received-specific picker UI.

## Home — Note Overlay
- Full-screen scrim, `rgba(35,60,0,0.08)`, fixed and clearance-respecting (`bottom: 64`), centering a card.
- Card: `#FAF7F2` bg, radius 24px, max-width 320px, soft drop shadow (`0 16px 40px rgba(24,40,0,0.25)`).
- Content: "{senderName} sent you this" (Inter 500 uppercase 13px, `rgba(35,60,0,0.6)`) → note text (Fraunces italic 17px, `#233C00`) → full-width "View recipe" button (`#233C00` bg, cream `#FEE7C0` text, radius 14px).
- Recipe content beneath is blurred while the overlay shows — blur currently judged slightly too intense; open aesthetic item, not yet resolved. Shown once per recipe per viewing session; skipped entirely when the send has no note.

## Profile
- Background: light `#FAF7F2` (not the green gradient) — same treatment as the Recipe Card, dark text/icon strokes throughout.
- Header: back arrow left (only when not the tab root — see CLAUDE.md Navigation), avatar right (initials on `#233C00` circle, sourced from `display_name`). Center is a single tappable name-forward block, not a page-title label: `display_name` prominent (Inter 700, ~22px, `#233C00`) with `@handle` directly beneath, small/muted/italic (Fraunces italic, ~12px, `rgba(35,60,0,0.45)`), and a trailing chevron (`rgba(35,60,0,0.25)`) indicating it opens an editor. Empty-state fallbacks: "Add your name" for the title, "add a handle" for the handle line — both still tappable.
- Tapping the header opens one edit sheet (same chrome as the Account/Kitchen field-edit sheets below) with two labeled inputs, Name and Username, and a single Save button — see "Account Identity" in FEATURE_SPECS.md for the save/validation behavior.
- Account section: starts at Email (the old separate Name and handle rows live in the header now, not here).
- Your Kitchen section: Your palate / Inspiration / Constraints rows, each row's subtitle truncated to 30 chars with an ellipsis.
- Support section: Sign Out, Contact us. **Superseded 2026-09-20** — "Contact us"
  was previously a dead row with no `onClick`; it now opens
  `mailto:info@tipsydinner.com` with a prefilled subject. Stopgap, not an in-app
  form — see "First-Impression Polish" in FEATURE_SPECS.md.
- Field-edit sheets (opened by tapping a row): back arrow + field label (Inter 700 uppercase) centered header, single input or textarea (cream-on-light input treatment: `rgba(35,60,0,0.05)` bg, `rgba(35,60,0,0.12)` border, radius 12px), full-width dark-green Save pill at the bottom.

## Onboarding — Conversational Flow
- Replaces the old three-blank-textbox step with a scripted chat thread, visually identical to Build's Active State conversation (see "Build — Active State" above) rather than a new look of its own: same `ChatBubble` treatment (user messages cream bubble/green text radius `18px 18px 4px 18px`; AI lines no-bubble Fraunces italic cream text directly on background, max-width 88%), same `TypingBubble` three-dot pacing indicator between script lines, same `CookInputBar` input row and send button — all three now shared from `ChatUI.tsx` rather than living only in Build.
- Every scripted friend-message (opener included) presents with the same perceived cadence as Build's real AI streaming: a deliberate `TypingBubble` pause, then the line reveals progressively rather than snapping in as a block. Since the lines are hard-coded (no real token stream to drive it), two named constants in `OnboardingChat` control the two halves of that beat: `SCRIPTED_TYPING_INDICATOR_MS` (default 2000ms) for the dots before a line starts, tuned deliberately longer than a real network-wait pause so a message clearly reads as "on its way" rather than a rushed flash; and `SCRIPTED_REVEAL_MS_PER_WORD` (default 40ms/word) for the reveal itself once it starts. Purely presentational — never affects when profile fields are written or when the handoff fires.
- No photo-attach affordance on this input bar — `CookInputBar`'s attach button only renders when an `onAttachClick` handler is passed in, and onboarding doesn't pass one.
- No chips, no "or just type" divider, no mini player — this is a single linear thread with no branching UI, unlike Build's Empty/Active states.
- Handoff screen ("Setting up your kitchen…") is visually unchanged: pulsing kitchen icon centered on the gradient background, Inter label beneath. Underneath, this screen now holds until a real `taste_profile` poll succeeds or a 6s ceiling elapses (whichever comes first) rather than racing a flat timer — see FEATURE_SPECS.md's "Onboarding — Conversational Flow" section; no visual change from that swap.
- Slide transitions between the chat step and the handoff step reuse the same `DURATION`/easing already used elsewhere in `Onboarding.tsx` — untouched by this build.
- The reactive reflection line shown after each answer (replacing the old flat "Got it.") renders in the exact same `ChatBubble` treatment as every other scripted AI line — no visual distinction, no separate styling. **Updated (Step 3c):** it no longer uses the word-by-word synthetic reveal — it streams live, token-by-token, straight from the `ai-chat` response (the same felt cadence as Build's real streaming, since it now literally is a real stream) rather than a re-reveal of an already-complete string. Typing-indicator dots run for however long it takes the first token to arrive (bounded, not fixed), then the bubble takes over and fills in live. See FEATURE_SPECS.md's "Onboarding — Conversational Flow" section for the streaming/timeout mechanics.
- Closing handoff line, after the constraints reflection: a single scripted line, "Perfect — that's everything I need. Setting up your kitchen around this now." — same `ChatBubble`/`sayAI()` presentation as any other line, no profile recap (the per-answer reflections already covered that). **Updated (Step 3c):** the slide transition into the "Setting up your kitchen…" loading screen now waits an additional fixed `HANDOFF_DWELL_MS` (default 1400ms) after this line fully reveals before starting — a fix for the line otherwise being visually swept away with no time to read it, since a same-tick reveal-then-transition gave the reader effectively zero dwell time even though the line was technically complete, not truncated. The loading screen's own poll timing (`waitForTasteProfile`/`HANDOFF_MAX_WAIT_MS`) is unaffected — the dwell is purely an on-screen pause before the `Loader` mounts.
