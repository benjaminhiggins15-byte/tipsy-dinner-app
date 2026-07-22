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
- Top bar: tD square PNG left, "Write your own" ghost pill right (Inter 500, cream 60%, border cream 20%, radius 20px)
- Hero: "what's on the menu?" centered — Lazydog uppercase, cream, ~48–52px
- Bottom stack (above input): three suggestion chips (data-driven — see CLAUDE.md Build Chips), "or just type" divider, input bar
- Chips: Fraunces italic, cream 85%, bg cream 6%, border cream 14%, radius 12px, padding 13px 18px
- "or just type" divider: Inter, cream 28%, uppercase, letter-spacing
- Input bar: on #182800 footer, cream placeholder, send circle in #1E3A42

## Build — Active State
- Same gradient, same top bar (tD PNG left only once conversation starts)
- Conversation thread on green, justified to bottom
- User messages: cream (#FEE7C0) bubble, radius 18px 18px 4px 18px, green (#233C00) Inter text
- AI messages: no bubble, Fraunces italic cream text directly on green, max-width 88%
- Mini player: on #182800, border-top cream 8%, tD square PNG left, "Recipe ready" label (Inter 10px uppercase cream 35%), title (Inter 500 cream), chevron right
- Mini player fades to 50% while generating, back on completion; pulses soft blue (#2A4E5A) once when recipe finishes
- Expanded recipe card auto-collapses to mini player on message send
- Input bar: send button filled #1E3A42 with cream arrow

## Recipes — Categories
- Header: "Recipes" (Inter 500 uppercase cream) left; "View all" pill (rounded rect, cream border 25%, Inter 500 12px cream) + cart icon (grocery list entry) right, in that order. The top-bar + add-category button is gone — the embedded dashed add-category card is now the only add affordance.
- 2×4 grid, gap 12px, padding 0 20px
- Cards: bg #2E4E08, radius 16px, padding 16px. Tabler icon top-left (cream 20%, 32px), count bottom (Inter 11px cream 40%), title bottom (Inter 700 uppercase cream, letter-spacing 0.08em, 15px)
- Empty dashed card sits first in the grid (top-left), not last: cream 4% bg, dashed border cream 15%, centered plus — moved forward so it doesn't drift below the fold as the library grows

## Recipes — Recipe List
- Header: back arrow left, category name (Inter 500 uppercase cream) + count (Inter cream 35%) stacked, no right action
- 80px rows, gap 10px, padding 0 20px, bg #2E4E08, radius 14px, padding 0 18px
- Row: placeholder icon (44×44 rounded, cream 7% bg, cream 25% stroke) left; title (Inter 700 uppercase cream 14px) + Fraunces italic description (cream 50% 12px) + meta (Inter 500 uppercase cream 25% 10px) center; chevron right (cream 20%)

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
- Header: "Menus" left, + right. Full-width rows separated by cream 6% dividers
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
