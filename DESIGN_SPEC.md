# Tipsy Dinner — DESIGN_SPEC.md

Detailed visual spec for each screen. Not loaded every session — consult this when
building or restyling a specific screen. The design system (fonts, colors, gradient,
logos) lives in CLAUDE.md; this file is the per-screen application of it.

---

## Design System Reference (see CLAUDE.md for full detail)

- **Display font:** Lazydog, always uppercase — recipe titles, screen/section headings
- **Serif italic:** Fraunces italic — AI responses, descriptions, taglines, margin notes, empty states
- **Body:** Inter (400 / 500) — body copy, ingredients, steps, nav, buttons, meta, quantities
- **Colors:** `--green #233C00` (bg), `--green-deep #182800` (nav/sheets), `--green-mid #2E4E08` (cards), `--blue #1E3A42` (CTAs/active), `--blue-mid #2A4E5A` (borders/accents), `--cream #FEE7C0` (text), `--cream-dim rgba(254,231,192,0.55)`
- **Gradient:** full-bleed `linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%)` behind every screen except splash, content above at z-index 1

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
- Divider 1px cream 6%. "Add to a menu" button: cream 4% bg, cream 12% border, radius 12px, Inter 500 cream 70%, chevron. "save recipe for now" CTA: full-width cream bg, green text, radius 14px, Inter 500 uppercase
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
  - **Five render states:** a 3-tile skeleton shimmer with "finding today's
    recipes…" (Georgia italic, muted) while the slice is computing; the populated
    carousel (above) once picks resolve; "your suggestions are refreshing — check
    back soon" when a slice row exists but predates the `pick_details` backfill (no
    backfill, by design); "still learning your taste — check back soon" when
    compute ran but produced no slice at all; and nothing rendered on no-session or
    an unexpected client error (both collapse to the same silent null case).
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
- The "finding today's recipes…" loading line is the carousel's only by-feel
  personalization signal today — there's no other visible cue that the slice is
  user-specific rather than generic; it's meant to read as a quiet "we're thinking
  about you" moment rather than a plain spinner.

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
- Support section: Sign Out, Contact us.
- Field-edit sheets (opened by tapping a row): back arrow + field label (Inter 700 uppercase) centered header, single input or textarea (cream-on-light input treatment: `rgba(35,60,0,0.05)` bg, `rgba(35,60,0,0.12)` border, radius 12px), full-width dark-green Save pill at the bottom.
