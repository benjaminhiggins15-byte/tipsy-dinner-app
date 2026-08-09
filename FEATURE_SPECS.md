# Tipsy Dinner — FEATURE_SPECS.md

Deep per-feature technical reference. Split out of CLAUDE.md (July 2026) to keep
that file under Claude Code's performance threshold.

Read the section for the feature you are touching. CLAUDE.md holds the
always-relevant material (design system, data layer, AI layer, architecture,
session rules) plus a Load-Bearing Contracts index that points here.

Pointer discipline: every contract is summarized once in CLAUDE.md's contracts
index and stated in full exactly once — here. Do not duplicate full detail
across both files.

---

## Recipe Photos

Live in production. Each recipe carries a single user-uploaded hero image.
Schema: `recipes.photo_url` (text, nullable — pre-existing column, previously unused)
and `recipes.photo_version` (int4, not null, default 0, added for this feature).

**Storage path conventions (`recipe-photos` bucket) — load-bearing:**
- Live recipe photo: `{userId}/{recipeId}.jpg` — overwritten in place on replace
  (`upsert: true`).
- Frozen share copy: `{userId}/share-{token}.jpg` — an immutable byte-copy made at
  share time, one per share. See "Recipe Sharing" in FEATURE_SPECS.md for how it's produced.

**BINDING INVARIANT: the share copy's immutability rests entirely on path
separation.** `uploadRecipePhoto` and `removeRecipePhoto` may ONLY ever construct
`{userId}/{recipeId}.jpg` (bare UUID filename); `deleteSavedRecipe` touches no
storage at all. No mutating function may ever construct a `share-`-prefixed
filename. Violating this breaks the guarantee that a shared recipe's photo never
changes or disappears.

**`photo_version` exists solely for cache-busting** and is appended to displayed
image `src`s as `?v={photo_version}`. It is incremented on every upload and every
remove, from a freshly-read DB value (not a client-held one, to avoid racing a
concurrent tab). **Never replace this with a render-time value like `Date.now()`**
— that would change the URL on every render, defeat browser caching, and burn
egress for no benefit.

**Public bucket ≠ SDK access permitted (general Supabase Storage truth, not just
photos).** A bucket's "public" flag only affects anonymous `GET` requests to the
`/object/public/...` CDN URL, which bypass RLS entirely. It does **not** exempt the
storage SDK's `.download()` / `.upload()` / `.remove()` / `.list()` calls, which
always enforce `storage.objects` RLS regardless of the bucket's public flag. Proving
a public URL loads anonymously does not prove an authenticated SDK call will
succeed. The `recipe-photos` bucket's write policies are owner-scoped (the object
path must start with the caller's own user-id folder) — this is why the share copy
lives at `{userId}/share-{token}.jpg` rather than a bucket-root `shares/` prefix; a
top-level prefix silently violates the INSERT policy and fails with no visible
error unless the caller checks for one.

**Crop step precedes compression.** Every photo upload — first upload AND
replace — routes through a full-screen crop step before compression/upload; this is
unconditional, not a picker-time option. Flow: `handlePhotoFileInputChange` holds
the chosen `File` and opens `PhotoCropOverlay` → user repositions/zooms → Confirm
calls `handlePhotoSelected(file, cropRect)` → `uploadRecipePhoto` →
`compressImageFile(file, cropRect)`. Cancel discards everything and leaves the
recipe completely unchanged. The crop is baked in — applied client-side inside the
existing single-pass canvas draw in `compressImageFile`; no originals are retained,
no crop coordinates are persisted, no schema change. Re-cropping means
re-uploading (replace already supports this). `PhotoCropOverlay` renders a fixed
4:3 frame at the same corner radius the hero renders at (see below) — the frame IS
the preview: what the user confirms is exactly what renders on the card and the
share. Because the stored image is already 4:3, `object-fit: cover` on the render
surfaces is effectively a no-op. Zoom is a slider, not pinch. Pan/zoom clamping
guarantees the frame is never under-covered: minimum zoom is the "image fully
covers frame" floor (`max(frameW/naturalW, frameH/naturalH)`), and pan bounds are
re-clamped on every pan AND zoom change. Pinch could be added later without
touching the pan/zoom → `cropRect` plumbing.

**`CropRect` is fractional, not absolute pixels.** `{ fx, fy, fWidth, fHeight }` are
fractions (0–1) of the image they're applied to, not absolute source pixels. This is
load-bearing: the crop overlay computes the fraction against a downscaled preview,
while `compressImageFile` applies it against the original full-resolution bitmap.
Because each axis's fraction is multiplied by that same axis's real dimension, the
mapping is correct at any resolution and requires no scale factor. **Do not convert
`CropRect` back to absolute pixel coordinates** — that would reintroduce a
preview-vs-original dependency. Only three files touch it: `image.ts`
(defines/consumes), `App.tsx` (produces), `data.ts` (opaque passthrough).

**Crop preview decodes a downscaled bitmap, not the raw file.** The crop overlay's
`<img>` does not point at the raw `File` object-URL — it decodes a resized preview
via `createImageBitmap(file, { resizeWidth: CROP_PREVIEW_MAX_EDGE })` (1200,
matching `image.ts`'s `MAX_EDGE`) and displays that instead. Pointing the `<img>` at
a raw multi-megapixel file caused a ~4.9 second decode before the crop screen
appeared; the downscaled decode cut this to ~168ms (measured on-device, same
3.41MB file). `compressImageFile` at Confirm still decodes the original at full
resolution, so crop fidelity and output quality are unaffected. Do not "simplify"
the preview back to the raw file — the decode cost is the reason this exists.

**Gotcha: Tailwind Preflight clamps `<img>` width.** Tailwind v4's Preflight
(pulled in via `@import "tailwindcss"` in `src/styles.css`) includes a global
`img, video { max-width: 100%; height: auto; }`. Per the CSS spec, `max-width`
clamps the used width regardless of an inline `width` declaration — inline styles
only win property-vs-property, they cannot unset a stylesheet's `max-width`. Every
other `<img>` in the app is sized `width: 100%` inside a fixed container and never
requests more than its box, so this rule had never had anything to clip. The crop
preview is the first image in the app that intentionally renders wider than its
container (that's what zooming in means), and the cap silently limited its rendered
width while the JS offset math positioned it as though uncapped — producing a
growing gap on the right as zoom increased. Fixed with `maxWidth: "none"` inline on
that element only. Note the asymmetry: Preflight has no `max-height` rule, so the
bug was width-only — which is what identified it. Any future UI that needs an
element to exceed its container (pan/zoom viewers, feed image work) must account
for this.

**Client-side compression (`src/tipsy/image.ts`).** `compressImageFile()` caps the
longest edge at 1200px (never upscales smaller images), re-encodes as JPEG at 0.8
quality, single-pass with no iterative size targeting. Uses the native
`createImageBitmap` — no external compression dependency. Takes an optional
`cropRect` (see above), applied in the same single-pass canvas draw as the resize.
Throws a typed `UnsupportedImageError` when the browser can't decode the file,
naming HEIC specifically when the failure looks HEIC-shaped (by MIME type or
`.heic`/`.heif` extension).

**Hero corner radius is 30** (was 16) in exactly two places: the RecipeCard hero
and the public share route (`r.$token.tsx`). The recipe-list row thumbnail remains
`borderRadius: 10` — a deliberately distinct, icon-sized treatment, intentionally
out of scope. There is no shared radius constant; all three are independent inline
values.

**RecipeCard header row is share / edit / camera / cart** (in that order; cart only
when the recipe has ingredients). The trash icon was removed from this row — delete
is reachable only via card → Edit (pencil) → "Delete recipe" → confirm, inside
`AddYourOwn.tsx`. `RecipeCard`'s own `confirmDelete` state and modal were removed as
dead code, and `App.tsx` no longer imports `deleteSavedRecipe`; `deleteSavedRecipe`
itself is unchanged in `data.ts`, with its one remaining caller in
`AddYourOwn.tsx`. The camera control is context-aware: no photo → tapping it opens
the file picker directly; photo present → tapping it opens a small dropdown
(Replace / Remove), with Remove behind a confirm. Either path (direct pick or
Replace) opens the crop overlay next, before anything uploads — see "Crop step
precedes compression" above.

---

## Recipe Sharing

Live in production. Shared recipe links are frozen snapshots — captured at share
time, unaffected by later edits or deletion of the live recipe — following the
`grocery_list_shares` model (see Grocery List in FEATURE_SPECS.md) rather than the old live-pointer
model. Rationale: shared artifacts are gifts, not growth mechanics; a gift that can
be silently swapped or retracted isn't a gift.

**`recipe_shares`** (dashboard-only, no in-repo migration, per existing convention):
`id`, `user_id`, `share_token` (unique), `recipe` (JSONB snapshot), `created_at`. RLS:
owner select/insert + a permissive anon select — mirrors `grocery_list_shares`
exactly.

**Key functions (`src/tipsy/data.ts`):** `shareRecipeSnapshot(recipeId)` reads the
live recipe + ingredients, runs every step through `normalizeStep()` **at capture
time** (so the frozen blob always holds `{title, instruction}` objects, never a mix
of legacy plain-string and object steps), mints a fresh `crypto.randomUUID()` token
per call — no reuse, unlike the legacy `shareRecipe` — and writes one `recipe_shares`
row. `getRecipeSnapshotByToken(token)` is the anon read for the public route, gated
entirely by RLS (no `user_id` filter).

**Snapshot shape:** `title`, `description`, `ingredients: {name, qty}[]`,
`steps: {title, instruction}[]` (normalized), `cookTime`, `serves`,
`photoUrl: string | null`. No cook history / `cook_events` — deliberate; cook data is
owner-only and was never shown on the public route, and stays that way.

**Photo is a byte-copy, not a URL reference (Recipe Photos build).**
`shareRecipeSnapshot` mints the token first, then — only if the recipe has a photo —
downloads the live photo bytes via the storage SDK and re-uploads them to
`{userId}/share-{token}.jpg` (see "Recipe Photos" in FEATURE_SPECS.md for why this path shape,
not a bucket-root prefix), storing that path's public URL as `photoUrl` in the
snapshot. Each share gets its own independent copy — sharing the same recipe twice
produces two separate photo files, not two references to one. This is what makes
the guarantee hold: the owner can later delete the recipe, remove the photo, or
replace it with a different one, and every previously-shared link keeps showing the
exact photo that existed at the moment it was shared. The public route
(`r.$token.tsx`) renders the hero photo before the title, gated on
`photoUrl && !photoFailed`, with an `onError` handler that sets `photoFailed` and
collapses the hero block entirely — no broken-image icon — on load failure. The
legacy live-share path (`shareRecipe` / `getPublicRecipeByToken`) does not carry
photos and was deliberately left untouched.

**Two token namespaces, one resolution order.** `shareRecipeSnapshot` never reads or
reuses a `recipes.share_token` — it only ever mints a fresh UUID into `recipe_shares`.
This means a given token can only ever resolve in one table in practice (independent
UUID v4 draws), which is what makes the public route's try-snapshot-then-fall-back
ordering (see Architecture / SSR in CLAUDE.md) safe: it can't accidentally serve the wrong table's
row for a given token.

**Migration path is a fallback, not a backfill.** No existing share links were
migrated into `recipe_shares`. `RecipeCard`'s share button (`handleShare`) now calls
`shareRecipeSnapshot` instead of the legacy `shareRecipe`, so every *new* share from
this point on is a frozen snapshot. Pre-existing tokens (e.g. founder/wife/brother
links minted before this change) keep resolving via the untouched legacy
`shareRecipe`/`getPublicRecipeByToken` path — those live-pointer links still mutate
if the underlying recipe is edited or deleted; only shares minted after this change
are frozen. There is no plan to backfill old tokens into snapshots.

---

## Grocery List

Live in production (three phases: surface + data + dumb combining; AI enrichment;
snapshot sharing). Entry point: as of 2026-07-26, Grocery is a bottom-nav tab
(`TAB_ORDER`, App.tsx ~433 — see Navigation in CLAUDE.md), swapped in from its
previous spot as a cart icon on the Recipes/Categories header (commit `254e0b5`);
that header icon slot now belongs to Menus (see below). The RecipeCard "add to
grocery list" button is unrelated to this navigation swap and untouched by it — it's
a data-write action (adds items to the list), not a navigation entry point. All
schema hand-applied via the Supabase dashboard (no migration files).

**Menus entry point**: reached via an `IconLayoutList` icon in the same
Recipes/Categories header slot Grocery's cart icon used to occupy (App.tsx
~1541–1553), pushing to the Occasions screen.

**Back-arrow mechanism finding (surfaced while auditing the nav swap above)**: there
is no shared, stack-depth- or `isTabRoot`-driven back-arrow system anywhere in the
app — every screen hardcodes its own back arrow independently. This is *why* the
2026-07-26 swap needed a same-day follow-up fix (commit `20dfee5`): moving Occasions
off a header-icon-only entry point onto a full screen push meant it needed its own
back arrow added, and Grocery losing its old header-adjacent position meant its
now-unused `back` prop/arrow had to be removed to avoid a dead affordance. Two latent
items logged, not fixed: (1) `Occasions.tsx` defines a `BackArrow()` helper component
that is never referenced — the file renders an inline SVG instead; (2) `isTabRoot` is
threaded as a prop to several screens (`Categories`, `Occasions`, `Cook`) that never
branch on it — `Profile.tsx` is the only screen that actually uses the value.

**`grocery_items`** (owner-only RLS on all ops): base cols `id`, `user_id`,
`display_name`, `quantity` (free-text), `checked`, `source_recipe_id` (provenance
only, never re-read live), `sort_order`; enrichment cols `normalized_name`, `amount`,
`unit`, `aisle` (produce/dairy/meat/pantry/frozen/other), `enrichment_status`
(pending | enriched | raw | failed). **Raw `display_name`/`quantity` are never
overwritten** by enrichment — normalized fields are added in parallel, so there is
always a safe raw fallback to render.

**`grocery_list_shares`**: `user_id`, `share_token` (a fresh `crypto.randomUUID()`
minted on *every* share — unlike `shareRecipe`, which reuses one token per recipe),
`items` (JSONB snapshot). RLS: owner select/insert + a permissive anon select (`using
(true)`); the unguessable token is the real access boundary. No revoke path (deleting
the row is the only invalidation) — accepted, parity with recipe sharing.

**Key functions (`src/tipsy/data.ts`, GROCERY LIST section):** `loadGroceryItems`,
`addGroceryItems` (bulk insert, `sort_order` from current max, status pending),
`addManualGroceryItem`, `toggleGroceryItemChecked`, `clearGroceryItems('all' |
'checked')`, `enrichGroceryItems` (isolated AI island — see AI Layer in CLAUDE.md),
`groupGroceryItems`, `shareGroceryList` (reads live items, never writes; mints a fresh
snapshot row — later edits/clears don't affect an existing snapshot),
`getPublicGroceryListByToken` (anon read for the public route).

**`groupGroceryItems`** lives in `data.ts` (not App.tsx) so the public route can
import it without pulling the client bundle into SSR — pure function of
`GroceryItem[]`, buckets by aisle then name, combines additively only when both rows
are enriched and share a unit, else falls back to exact-string quantity match.

**Hold-until-ready UX**: new items are held out of the rendered list (generic
"Updating…" indicator) up to `GROCERY_ENRICHMENT_HOLD_MS` (18000ms) while enrichment
resolves, so text/grouping doesn't visibly jump. `shareGroceryList` polls for pending
enrichment up to the same ~18s cap before minting, then falls back to whatever's there
— a share must never block forever.

**Public route**: `src/routes/list.$token.tsx`, modeled on `r.$token.tsx` (same
not-found styling, footer, no-login structure). Any login wall on a Vercel *preview*
link is Vercel's deployment-protection SSO gate, unrelated to the app; production has
no such gate.

---

## Cook History

Live in production. Lets a user log real cook attempts (date, optional score, optional
note) against a saved recipe and see them in a third HISTORY tab on the Recipe Card.

**`cook_events`** (owner-only RLS, four separate per-op policies — matches the
`grocery_items` convention; schema is dashboard-only, no in-repo migration, per
existing convention): `id uuid` PK, `user_id uuid` FK→`auth.users` (on delete
cascade), `recipe_id uuid` FK→`recipes` (on delete cascade — intentional: cook history
is deleted along with its recipe), `cooked_on date`, `score numeric(3,1)` nullable,
`note text` nullable, `created_at timestamptz`.

**Key functions (`src/tipsy/data.ts`, COOK HISTORY section):**
`loadCookEventsForRecipe`, `addCookEvent`, `updateCookEvent`, `deleteCookEvent`, plus
two pure helpers: `headlineRatingFromEvents` (score of the most-recent scored cook, or
null; ties broken by `created_at`) and `todayLocalDateString` (local-date, not UTC —
same convention as `chips.ts`).

Cook events ride along on the existing bulk category load — added as a nested
relation in `getSavedRecipesForCategory` alongside `ingredients`; no per-recipe fetch
exists or was introduced. `Recipe` gained optional `cookEvents?: CookEvent[]` and
derived `headlineRating?: number | null`.

**Live-refresh pattern (load-bearing).** The "Log cook" write UI is self-contained in
`RecipeCard`. There is no other "write-and-stay-on-card" refresh pattern in the
codebase — this one is new. `RecipeCard` holds local `cookEvents` state, seeded once
from `recipe.cookEvents`; after any add/edit/delete it updates that local state, and
both the HISTORY tab and the headline rating read from local state (headline
recomputed via `headlineRatingFromEvents`), NOT from the `recipe` prop — otherwise the
card shows stale data until re-navigation. `clearRecipeCache?.(categoryKey)` is also
called after each write so the category list re-fetches truth on next visit. Any
future change to the HISTORY tab or headline must preserve this local-state read, or
live updates regress.

**UI.** Third tab, HISTORY, is hardcoded (matching the existing Ingredients/Steps
copy-paste style, not data-driven). "Log cook" button lives at the top of the HISTORY
tab (not the header). Logging portal is a light `#FAF7F2` bottom sheet: editable date
(pre-filled today), a net-new on-screen decimal keypad for score (0–9, `.`, backspace;
one decimal; clamped 1.0–10.0; empty = no score), optional note; single Save. Tapping
a cook row's pencil icon opens the same portal in edit mode (the row tap itself is
reserved for the existing note-expand/collapse behavior); delete lives inside the edit
portal and reuses the existing delete-confirm modal. Headline shows as "RATING 7.5"
under the description (label styled like the category label; number 13px/weight 500,
one decimal via `.toFixed(1)`); renders nothing when no scored cook exists.

---

## Recipe Step Titles

Live in production (merged to main 2026-07-13, commit `4e5a394`). Steps carry an
optional per-step title, rendered as collapsible rows on the Recipe Card.

**`RecipeStep` is `string | { title: string; instruction: string }` (data.ts).**
Legacy plain-string steps and new object steps both exist in the database and are
both valid — string support must never be removed.

**`normalizeStep()` (data.ts) is a load-bearing contract.** Takes a `RecipeStep`,
returns `{ title, instruction }`, coercing a plain string to `{ title: '',
instruction: step }`. Every step reader MUST route through it — a new reader that
skips it will render `[object Object]`. The docs previously said "five readers";
that count was wrong even at the time (it collapsed two components into one
bullet) and had drifted further since. As of Recipe Search, there are seven
call-site functions/components, all compliant: Recipe Card STEPS tab (App.tsx —
collapsible accordion rows); `ExpandedRecipeOverlay` (App.tsx — the Recipe
Preview sheet from the Build mini-player, flat, title prepended); `AddYourOwn.tsx`'s
`startEditStep` and its inline step-list render, plus its separate `PreviewCard`
component (Write Your Own editor — two components); `src/routes/r.$token.tsx`
(public shared route — flat, title prepended, deliberately not collapsible);
`recipeToXML` (App.tsx — serializes steps for the AI); `shareRecipe` (data.ts —
the legacy recipe-share snapshot builder; present since Recipe Sharing shipped
but never previously listed here); and now `searchRecipes` (App.tsx — the Recipe
Search matcher, see below), which makes this contract more load-bearing than
before, not less. **Do not trust this count as fixed — re-grep for
`normalizeStep(` if a change needs precision**, the same discipline CLAUDE.md
now applies to the TypeScript error count.

**Two surfaces diverge deliberately.** In-app STEPS tab: collapsible, collapsed by
default, with a Fraunces-italic hint line ("Tap each step for details") shown only
when ≥1 step has a title. Public shared route and `ExpandedRecipeOverlay`: always
expanded, title prepended, nothing to tap — do not add collapsing there. Expanded
step bodies use Inter, not Fraunces italic (Fraunces is reserved for
personal/journal content like cook notes; step instructions are body copy).

**AI step XML contract.** Steps are emitted as `<step title="Short
title">Full instruction</step>`; the `title` attribute is omitted entirely when a
step has no title (not `title=""`). Title escapes `&` → `&amp;` then `"` →
`&quot;`, in that order; the parser reverses both (`&quot;` → `"` then `&amp;` →
`&`). Parser regex: `/<step(?:\s+title="([^"]*)")?>(.*?)<\/step>/g` — matches both
titled and untitled steps, always producing `{ title, instruction }` (title `''`
when absent). This step-parsing regex lives inside `parseRecipeFromAIResponse` (see
AI Layer in CLAUDE.md) — the single consolidated recipe-parse function used by all three former
per-call-site parse blocks.

**Step-title backfill.** `backfillStepTitles()` (data.ts) is a one-time, idempotent
backfill that titles existing plain-string steps via an isolated JSON-in/JSON-out
call to the `ai-chat` edge function (own prompt, `STEP_TITLE_BACKFILL_SYSTEM_PROMPT`
— modeled on `enrichGroceryItems`, never merged with the conversational prompt).
Sends only `{index, instruction}` / receives `{index, title}` — instructions are
preserved verbatim, never regenerated. Writes via `updateSavedRecipe(id, { steps
})` (steps-only patch; the ingredient code path is untouched). The function stays
in the codebase permanently but is deliberately unwired — no UI, no persistent
hook. Run pattern: temporarily attach to `window`, run once from the browser
console while logged into the target account, then remove the hook. Used twice so
far (production, and a preview test account).

**`AddYourOwn.tsx` step-write paths must write objects, never strings.** `addStep`
and `confirmEditStep` both previously wrote plain strings unconditionally, silently
discarding any existing title — a live data-loss bug, now fixed. `startEditStep`
seeds the title into edit state so it round-trips through an edit. Any future
step-write path must preserve the `{ title, instruction }` shape.

---

## Build Home-Screen Suggestion Chips

Home-screen chips are data + a deterministic picker, not hardcoded JSX. Defined in
`src/tipsy/chips.ts`, rendered via `.map()` in App.tsx. `pickChips(new Date())`
returns exactly 3 (active time-aware chips fill first, rest from an evergreen pool,
varied by type), picked once per mount via `useMemo` — stable within a session,
varied across. Chips route through the unchanged `handleChipClick` (functionally
identical to a typed message).

Each chip: `header`, `body`, `prompt` (fired text), `type` (build/brainstorm/help),
optional `timing`. Five timing shapes: `seasonal`, `fixedHoliday`, `floatingHoliday`,
`recurringWeekly` (supports a season wrapping the New Year, e.g. football Sep–Feb),
`oneOff`. `isChipActive(chip, today)` resolves liveness. At least one time-aware chip
is present every session (seasons act as an always-on baseline).

**Adding chips is data-only** — add to `evergreenChips` / `timeAwareChips`; no need to
touch `isChipActive`, `pickChips`, or any logic. Schema was designed for the full
future cultural calendar, so expanding it is data-entry, not engineering.

**CRITICAL date convention: LOCAL-midnight throughout `chips.ts`.** Production calls
`pickChips(new Date())` (local), and users think in local days. **Never use `new
Date("YYYY-MM-DD")`** — it parses as UTC midnight and shifts windows a day west of UTC
(this was a real bug: July 4th opened/closed a day late). Use the local-parse helpers
`parseLocalDate`, `parseMonthDayWithYear`, `toLocalStartOfDay`. Do not reintroduce
UTC string-parsing.

**Standing test: `src/tipsy/chips.test.ts`** (`bun run src/tipsy/chips.test.ts`) — 29
cases across all timing shapes at their tight window edges; imports the real chip
defs. Re-run whenever timing logic or calendar entries change.

---

## View All Recipes

Unfiltered recipe list reached via a "View all" pill in the Recipes header (next to
the grocery cart). Reuses the category recipe-row rendering verbatim; rows navigate
by each recipe's own `categoryKey`, so no category context is needed at the list
level. Screen title shows a live count: "All Recipes (N)".

**Data.** `getSavedRecipesAll()` in `data.ts`, sibling of
`getSavedRecipesForCategory`, unfiltered (`user_id` scope only), same nested
`cook_events` join. Cached as `recipesByCategory['__all__']` via
`ensureRecipesLoaded`. **`clearRecipeCache` always deletes `'__all__'`** — inside the
function, not at call sites, so no mutation can leave the all-view stale
(load-bearing).

**Sort** (quiet header text button → reused slide-up sheet, `bottom:64` /
`24px 24px 0 0` / `tipsy-slideup`): Recently added (default), Recently cooked,
Alphabetical. Recently-cooked computes `max(cooked_on)` per recipe client-side from
the nested events; recipes with no cook events fall to the bottom, ordered by
recently-added among themselves. Sort does not persist — resets to recently-added
each visit.

**Search is built** — see "Recipe Search" below (it landed after this section was
first written; the header layout this section left repeatable for it is what
search's header icon now occupies).

**Not built (logged):** a per-row category label (deferred — a
shared-row-height / list-density decision to be mocked and judged by eye).

**Known ambiguity (logged, not fixed):** a recipe in multiple categories is de-duped
by id in the all-view, keeping whichever join row returns first, so its displayed
category label / back-target is non-deterministic. Display-only; `editCategoryLabel`
has a fallback. Revisit only if it reads oddly in real use.

**Header change:** the duplicate top-bar "add category" button was removed; the
embedded dashed card is now the only add affordance and was moved to first position
in the category grid so it doesn't drift below the fold as the library grows.

---

## Recipe Search

Live in production (merged to main 2026-07-23). Client-side, type-as-you-go
search on the two screens that list recipes — `Recipes` (inside a category) and
`AllRecipes` (View All). Both components live in `App.tsx`; there is no shared
list component between them, so search was hand-added to each.

**Scope follows the page (closed decision).** Inside a category, search is
scoped to that category's recipes only. On View All, it covers the whole
library. There is no mode switch and no scope toggle. To search everything, the
user searches from View All.

**Deliberately NOT on the categories screen (closed decision).** ~10 category
cards is nothing to sift through, and the use case imagined there ("mexican,"
"chinese") is browse-by-attribute, not search — a tags problem, not a search
one. Do not add search there.

**Searchable fields are deliberately broad:** title, description, ingredient
names, steps (both the step title and the instruction, via `normalizeStep()`),
and cook-event notes. Titles-only was rejected as too narrow — e.g. searching
"grill" should surface a recipe that involves grilling even if no recipe is
titled "grill." Cook notes are included so a user can find "that time I noted
it was too salty."

**Steps must route through `normalizeStep()`.** Steps are cached raw as the
`RecipeStep` union — the one array field not pre-normalized at cache-build time
(unlike ingredients and cook events, which are already flattened/camelCased in
the cache). The matcher iterates `recipe.steps ?? []` and calls
`normalizeStep()` per element, checking both the returned `title` and
`instruction`. **Never `JSON.stringify` the steps array to search it** — that
matches on JSON punctuation and key names, not recipe content.

**No new queries, no data-layer changes.** All data comes from the existing
`recipesByCategory` cache, populated by `getSavedRecipesForCategory` /
`getSavedRecipesAll` (unchanged). That cache already holds `title`,
`description`, flattened `ingredients`, raw `steps`, and `cookEvents` including
`note` text — everything search needs was already there.

**Matching.** Case-insensitive substring match on the whole query as typed
against each field above. No token splitting, no fuzzy matching, no ranking.

**`matchedFields` — computed but not surfaced.** The shared matcher,
`searchRecipes(recipes, query)` (App.tsx, module-level, directly above the
`Recipes` component), returns `{ recipe, matchedFields: Set<RecipeSearchField>
}[]`, where `RecipeSearchField` is `"title" | "description" | "ingredients" |
"steps" | "notes"`. Both screens currently discard `matchedFields` and use only
`.recipe`. This exists so that ranking (e.g. a title match outranking a
passing mention buried in step 7) is a later addition rather than a rebuild.
**Do not remove `matchedFields` as dead code** — it is deliberately unused
today, not unused forever.

**Ordering.** On View All, filter first, then sort: search is folded into the
input of the existing `sortedRecipes` `useMemo` (a new `filteredRecipes`
`useMemo` sits upstream of it), so the sort control operates on the filtered
set and the user's sort choice persists through typing and through clearing —
search and sort are independent state. `Recipes` has no sort control and
previously had no memoization at all (`recipesByCategory[categoryKey] ?? []`
was used directly); a `filteredRecipes` `useMemo` was introduced there for
search, net-new for that component.

**Interaction.** A search icon sits in the header, top right — alongside the
existing delete-category trash icon on `Recipes`, alongside the existing sort
control on `AllRecipes`. Tapping it expands an inline bar as a new sibling
between the header and the scrolling list div, autofocusing on open. The bar's
X button does double duty: with text present, it clears the text and keeps
focus in the input; when the bar is already empty, it closes the bar entirely.
Query text and the open/closed state do not persist across screen visits —
same as `AllRecipes`'s sort mode, which already resets to "Recently added" on
every visit for the same reason (both are local `useState`, reset on remount).

**Empty state.** Renders only when a search query is active and yields zero
results — not for a genuinely empty category or an empty library (neither
screen has an empty-state render for that today, and none was added as part of
this feature).

**Accepted v1 weak spot — do not pre-solve.** Broad substring matching means
common words match widely: "oil" will hit nearly every recipe, "chicken" will
match anything that merely lists chicken stock as an ingredient. Recipe text is
expected to be signal-dense enough that this is tolerable in practice.
Refinement — ranking (using the already-computed `matchedFields`), tags, or
filters — is deliberately later work, contingent on how this reads in real use.
Do not add ranking, highlighting, token splitting, or fuzzy matching
preemptively.

---

## Conversational System Prompt — Elevation & Discovery (buildSystemPrompt)

Merged to main 2026-07-25. Three additions to `buildSystemPrompt()`, all edits to
the single non-triplicated definition, verified on-device before merge.

**Culinary posture block.** Placed immediately after the persona framing so it
colors both brainstorm and recipe output. Instruction: default to the best version
of the dish actually asked for — elevate within the request, never substitute
something fancier (a grilled cheese stays a grilled cheese, lifted by a small smart
touch). Always on, calibrated to a user who takes cooking seriously. Keep it
achievable — a couple of high-leverage moves over one fussy step; method
demystified like a friend showing you, not a chef performing. Felt goal: the cook
is proud of what they made, especially cooking for others. Why it's about the food,
not the voice: the elevation axis was deliberately kept off tone/formatting
(protected, separately-owned territory — see the formatting house style in AI
Layer in CLAUDE.md); if it ever reads sappy, the emotional closing line is the
first cut.

**Cuisine-direction discovery.** Replaces the brainstorm question rule. When the
ask is broad, establish the cuisine / culinary world first — it narrows
ingredients, technique, the whole idea space. A named protein does NOT settle this
("something with chicken" spans every cuisine → ask which world). Exceptions: the
ask already implies a direction, or the palate profile clearly points one way →
don't ask, just go. Once there's a direction, it anchors the whole set — five ideas
that cohere within one world, not five unrelated cuisines stapled to one protein
(this anchoring rule is what fixed the "random-feeling options" symptom; the
question-aim alone didn't). Question budget: usually one, a soft second when
genuinely warranted, never an interview; specific asks skip straight to ideas.

**Design decisions worth not re-litigating:**
- Cuisine-first is soft-priority calibrated to the founder's estimate that cuisine
  comes first roughly 80% of the time — a firm default, with a real out for the
  occasion/effort-led minority.
- The earlier "lead with cuisine unless effort/occasion" wording was removed
  because the model hid behind the effort-led out; firmness came from deleting the
  hatch, not adding force.
- Named-cuisine examples were removed from the prompt text — they're attractors
  that bias which cuisines get suggested, the same reason the grilled-cheese
  example was cut from the posture block.
- Protein examples were kept because a protein can't bias the cuisine reached for —
  it only clarifies which input pattern triggers the rule.
- Rule of thumb recorded for future edits: an example that points at the answer is
  an attractor (cut); one that points at the trigger is a definition (keep).
- The model still sometimes offers its own example cuisines in the question it asks
  the user ("Italian, Mexican, Mediterranean, Asian?") — this is fine and helpful,
  it's the model being a good friend in the moment, not the prompt attractor. Watch
  only for the *suggestions* clustering toward named cuisines, which nothing
  currently does.

**No-superlatives voice rule.** Lives in General rules, its own line after the
formatting run-on and before the anti-pestering rule — touching neither. Don't name
or describe its own recipes in absolutes ("perfect," "best," "ultimate") — in title
or handoff; let the food speak for itself. Has a deliberate anti-hedge clause ("a
solid attempt at" is as wrong as "the perfect") — the failure mode of a
no-superlative rule is over-correcting into false modesty, which damages the
confident voice more than the superlative did. Target is neutral-confident. This is
voice-adjacent (flagged during the session as the one edit touching
formatting-house-style-protected territory) and was scoped as tightly as possible
for that reason.

---

## Account Identity (Build 1 of account-to-account sharing)

Merged to main 2026-08-02. This is **Build 1** of a multi-build
account-to-account sharing sequence — it establishes user identity (a display
name + a unique handle) with no sharing surface yet. See the current-state
doc's ACCOUNT-TO-ACCOUNT SHARING section for the full phase design and what
later builds add on top of this foundation.

**Schema.** `profiles.handle` (text, nullable). Uniqueness is enforced
case-insensitively at the DB layer via `profiles_handle_lower_idx`, a unique
index on `lower(handle)` — this is a hard Postgres guarantee, not something the
app layer checks proactively. Dashboard-only, like every other table in this
project — no in-repo migration file (see Data Layer in CLAUDE.md).

**The deriver and its rules.** `deriveHandleFromName(name, isHandleTaken)` and
`isValidHandleFormat(handle)` (both in `data.ts`) own the format contract:
lowercase, `a`–`z`/`0`–`9`/`_` only, 3–20 characters, no leading or trailing
underscore. A name that reduces to fewer than 3 usable characters (empty,
all-emoji, all-symbols) falls back to a human-legible `user`-prefixed base
rather than padding with digits. On a collision, a numeric suffix is appended
(truncating the base if needed to stay within the 20-character cap) and tried
again. Treat this paragraph as a summary, not a spec — re-derive the exact
rules from `deriveHandleFromName`/`isValidHandleFormat` before relying on
specifics, the same caution as `normalizeStep`'s caller count in CLAUDE.md.

**Signup persistence (both paths).** Previously a user's name landed only in
`auth.users.raw_user_meta_data` (`full_name` for Google OAuth, `name` for
email/password — set explicitly in `SignUp.tsx`) and was never copied
anywhere the app actually read from. Signup now backfills `profiles.display_name`
from that metadata the first time a session sees it empty. `display_name` is
now the single source of truth for a user's name — handles are derived
silently from it, never prompted; there is no handle-capture screen anywhere
in signup or onboarding.

**Silent handle derivation.** For a genuinely new profile (`handle` still
null), a handle is derived from `display_name` (or the raw metadata name, if
display_name backfill hasn't landed yet) and claimed via write-then-catch: the
client attempts a real `UPDATE ... SET handle = candidate`, and a Postgres
`23505` on that write means the candidate is taken (uniqueness constraints
apply regardless of RLS, even though the `profiles` SELECT policy is
owner-only and would otherwise block checking what handles other users hold).
A successful write both confirms availability and persists the value in one
step — no separate save call follows. Existing accounts skip this path
entirely; they already have a handle from the one-time migration below.

**Signup persistence and derivation are both wired inside the existing
`profileInitialized`-gated block in `onAuthStateChange`** (`App.tsx`) — not a
second listener. This means they inherit the tab-refocus duplicate-SIGNED_IN
guard for free (see Authentication in CLAUDE.md); any future identity/signup
logic belongs in this same block.

**Migration (already applied, not a code artifact).** The 6 pre-existing
accounts were backfilled by a one-time script run directly against the DB —
names copied from `auth.users` metadata into `profiles.display_name`, handles
derived the same way new signups get one. Consistent with this project's
existing hand-applied-SQL convention (no in-repo migration files); nothing in
the shipped code re-runs or depends on this script.

**Profile screen: name-forward header, single edit sheet.** The old "PROFILE"
page-title label was replaced with a tappable header: `display_name` renders
prominent and large, `@handle` sits beneath it small/muted/italic, with a
chevron indicating it opens an editor. The separate Name and handle rows that
used to live in the Account section are gone — Account now starts at Email.
Tapping the header opens one sheet, `ProfileEditIdentity`, that edits both
fields together and writes them in a **single upsert** — a handle collision
fails that whole write, so a display-name change can never silently persist
while the handle half of the save is rejected. The handle field in that sheet
reuses the exact same format check and `lower(handle)`-collision handling
described above (inline "That handle is already taken" on a `23505`); it is
not a second implementation of the uniqueness logic. Re-saving your own
unchanged handle does not false-trip the check — a row updating itself to a
value it already holds never conflicts with itself under Postgres's
constraint semantics.

Loose end, deliberately not resolved here: `Profile.tsx` still has a
`KEYS.name` constant pointing at the legacy `tipsyDinnerName` localStorage
key, read only inside `Avatar`'s fallback branch (used when `Avatar` is
called without a `name` prop). No current call site omits that prop, so the
branch is dead in practice, but the constant and the fallback read were not
deleted.

**Verification method.** A fixed set of representative openers (vague → specific),
run on the live preview under the real account, judged by eye — elevation by
building out dishes (including a deliberately humble one), discovery by watching
whether it asks the world on broad/protein-only asks and coheres the set, plus
confirming already-implied-cuisine asks skip the question. Discovery is the
behavior that needs conversation volume to trust, not a couple of screenshots.
Founder's close: this class of tuning is discovered through real use, never
"done" — good and improvable is the right state for a prompt surface.

**Guardrails held.** Recipe XML schema / `recipeToXML`, the `normalizeStep`
contract, `sourceId`/`sourceTitle`, photo paths/`photo_version`, Cook History local
state, the grocery normalization call, and the chips system — all untouched.
Recipe-context-injection architecture (system-prompt reference material, not a
fake assistant message) untouched. Temperature left at default 1.0 deliberately.
The AI naming call for save-as-new remains a separate logged item, not folded into
this work.

---

## Account-to-Account Sharing — Build 2 (Data Model Foundation)

Applied 2026-08-02, on branch `account-sharing-schema-build2`, directly against the
linked Supabase project. **This build is schema only — no app code reads or writes
any of it yet.** It exists to prove the data model and the RLS design in isolation,
verified by direct row manipulation and violation testing, before any client code is
written against it. See the current-state doc's ACCOUNT-TO-ACCOUNT SHARING section
for the full phase design and where this sits relative to Build 1 (identity) and
later sending/save builds.

**Supabase (dashboard-only, no in-repo migration, per existing convention — three new
tables, two new columns):**

- **`connections`** — `id`, `user_a`/`user_b` (both FK→`profiles.id`), `created_at`,
  `created_via` (FK→`recipe_sends.id`, `ON DELETE SET NULL`). `UNIQUE (user_a,
  user_b)`. Canonical ordering — `user_a` always holds the lexicographically smaller
  of the two profile ids — is an **app-code invariant, not DB-enforced**; no trigger
  builds or checks it, it's recorded only as a column comment in the schema itself.
  One row per pair; a pair can only ever connect once.
- **`recipe_sends`** — `id`, `sender_id`/`recipient_id` (both FK→`profiles.id`),
  `recipe` (jsonb, not null), `photo_url`, `note`, `status` (`text`, default
  `'pending'`, `CHECK` restricts it to `pending`/`saved`/`dismissed`), `created_at`.
  The `recipe` column is a **complete-recipe snapshot** — title, description,
  ingredients as `{name, quantity, sort_order}`, steps as `{title, instruction}`,
  cook_time, serves — deliberately a different, richer shape than the
  `recipe_shares` snapshot documented above. `recipe_shares` only captures what a
  read-only public page renders; `recipe_sends.recipe` is designed to be
  reconstituted into a full, editable, re-shareable library recipe once a later
  build adds the save step. Photo travels via the same download→re-upload
  byte-copy pattern `recipe_shares` uses, into a new path segment under the
  *sender's* own storage folder (the bucket's INSERT policy is owner-folder-scoped,
  so the copy can only happen from the sender's authenticated client, at send time —
  a recipient's client has no write access to the sender's folder to perform this
  copy itself).
- **`notifications`** — `id`, `recipient_id` (FK→`profiles.id`), `type` (`text`,
  `'recipe_received'` for now), `ref_id` (FK→`recipe_sends.id`, `ON DELETE CASCADE`),
  `read` (boolean, default `false`), `created_at`.
- **`recipes.inspired_by_name`** (text, nullable) and **`recipes.inspired_by_id`**
  (uuid, FK→`profiles.id`, `ON DELETE SET NULL`, nullable) — both unused until the
  save-from-share build. These carry the permanent "inspired by [name]"
  attribution as a **stored value captured at save time**, not a live join to the
  sender's profile — so it survives the sender later renaming themselves, deleting
  their account, or the recipe being edited/re-shared, and never breaks or goes
  blank because of a join failing. All 28 pre-existing `recipes` rows have both
  columns null, confirmed after the `ALTER TABLE`.

**RLS — the app's first two-party data.** Every existing owner-scoped table (see
Data Layer in CLAUDE.md) grants access to exactly one `user_id`/`id`. These three
tables are the first case where a row must be legible to two specific, different,
authenticated users with different rights — a genuinely new RLS shape, not an
extension of the existing owner-only or owner-write-plus-anon-read (`recipe_shares`,
`grocery_list_shares`) patterns, since neither of those distinguishes between two
named parties.

- **`recipe_sends`**: sender gets INSERT (`WITH CHECK (sender_id = auth.uid())`,
  blocking a sender from inserting a row claiming to be sent by someone else) +
  SELECT of their own sends. Recipient gets SELECT of sends addressed to them, plus
  UPDATE — but Postgres RLS `USING`/`WITH CHECK` can only gate *which rows* a policy
  applies to, not *which columns* change within an allowed row. **The status-only
  restriction is therefore enforced by a separate `BEFORE UPDATE` trigger**
  (`enforce_recipe_sends_status_only_update`, attached as
  `recipe_sends_lock_immutable_fields`), which raises if the incoming row differs
  from the stored row in `sender_id`, `recipient_id`, `recipe`, `photo_url`, `note`,
  or `created_at` — leaving `status` as the only column a recipient's update can
  ever actually change. No anon access, no third-party access, no policy at all for
  either.
- **`connections`**: `connections_select_party` lets either `user_a` or `user_b`
  read a row they're part of. **No INSERT policy exists — inserts are deny-all for
  every role, by design.** A row can only be created by a trusted server-side path
  later (Edge Function or a `security definer` function), never a raw client insert
  — a naive `WITH CHECK (user_a = auth.uid() OR user_b = auth.uid())` would let any
  authenticated user unilaterally fabricate a "connection" naming themselves and an
  arbitrary other user with no consent from that other party, which is why this was
  deferred rather than shipped alongside the SELECT policy.
- **`notifications`**: recipient-only SELECT + UPDATE (`recipient_id = auth.uid()`
  on both). No client INSERT policy either, for the same reason as `connections` —
  notifications get created server-side as part of the send flow, not by the
  recipient or sender's own client.

**Load-bearing note for the next build.** Because `connections` and `notifications`
are both insert-deny-all from the client, the eventual send flow cannot be built as
a sequence of ordinary client-side `.insert()` calls the way virtually everything
else in `data.ts` is. It needs one elevated, trusted execution path (Edge Function or
`security definer` Postgres function) that atomically creates the `recipe_sends` row
and its `notifications` row together at send time, and — on save — the `connections`
row as well. Designing that path, and whatever narrow surface the client is allowed
to call to trigger it, is explicitly out of scope for this build and belongs to
whichever build implements the send flow itself.

**Verified by violation testing, not just the happy path.** Every RLS/trigger
boundary above was proven by seeding real rows (via a bypass-RLS connection, since no
client insert path exists yet) and then querying/mutating as each simulated
authenticated party — sender, recipient, an unrelated third user, and anon — rather
than only confirming the intended-success cases. Confirmed: sender sees their own
send and cannot forge a different `sender_id` on insert; recipient sees the send
addressed to them and can flip `status`, but every attempt to alter the snapshot,
`sender_id`, `recipient_id`, `photo_url`, or `note` was rejected by the trigger with
the row provably unchanged afterward; a third party and anon both get zero rows;
either connection party can read a shared `connections` row and a third party
cannot; no authenticated client can insert a `connections` row at all. All seeded
test rows were deleted afterward — the three new tables hold zero rows in production
as of this write-up.

---

## Account-to-Account Sharing — Build 3: Sending (invisible half shipped; UI deferred)

Two pieces shipped this build, both proven end-to-end at the DB layer: the trusted
server-side write path (a Postgres function) and the client-side snapshot-builder
that calls it. **The send UI was explicitly NOT built this session** — there is no
screen or control anywhere in the app yet that lets a user pick recipients and
trigger a send. That's a future session's work; this build is the plumbing beneath
where that UI will eventually sit.

**Piece 1 — `send_recipe_to_friend` (the trusted write path).**

`public.send_recipe_to_friend(p_recipe_id uuid, p_snapshot jsonb, p_note text,
p_photo_url text, p_recipient_ids uuid[])`, `returns table (recipient_id uuid,
send_id uuid)` — one row per recipient, not a bare count, so the client can pair
each recipient with the specific `recipe_sends.id` created for them. `language
plpgsql`, `security definer`, `set search_path = public`, `grant execute ... to
authenticated`.

Five guards, in this order, every one violation-tested live with real authenticated
client sessions (not just seeded rows) — all six cases passed: (1) unauthenticated
caller (`auth.uid()` null) rejected; (2) sending a recipe the caller doesn't own
rejected; (3) self-send (any recipient id equal to the sender) rejected; (4) every
recipient id must resolve to an existing `profiles` row, checked all-or-nothing
*before* any writes — a mixed batch of one valid and one invalid recipient writes
nothing at all, proven by row-count; (5) happy path — multiple valid recipients each
get their own `recipe_sends` + `notifications` row, and the sixth test independently
confirmed the two-party read visibility from Build 2 (sender sees their sends,
recipient sees sends addressed to them) still holds for rows created through this
function.

Atomicity: the entire function body is Postgres's implicit per-call transaction:
any uncaught `raise exception` — from a guard or from an insert itself — rolls back
every write already made in that call. There is no partial send; a batch of N
recipients either produces N complete `recipe_sends`+`notifications` pairs or zero
rows.

Identity: called via `supabase.rpc(...)`, which forwards the calling client's real
JWT — `security definer` changes the function's *execution* privileges (letting it
write past RLS), not `auth.uid()`, which still reads the real caller's session. This
is what makes guard (1) meaningful rather than trivially satisfiable.

**Closed decisions — do not re-litigate:**
- **Security-definer function chosen over an Edge Function.** Reasons: `auth.uid()`
  is correct by construction via the RPC's forwarded JWT (no manual token-forwarding
  needed); native Postgres transaction atomicity for the multi-table, multi-recipient
  write, instead of hand-rolled compensation logic; fits the existing dashboard-SQL
  convention Builds 1 & 2 already established; and `ai-chat` (see AI Layer in
  CLAUDE.md) was confirmed unusable as an auth template — it's an anonymous proxy
  with no caller-identity mechanism at all.
- **Self-send is blocked**, checked before ownership/recipient validation.
- **Duplicate sends are explicitly ALLOWED** — no dedup check anywhere in the
  function. Re-sending the same recipe to the same person is a legitimate case (the
  recipe was edited since the last send, not merely re-sent unchanged), so no
  uniqueness constraint or lookup guards against it.
- **The photo does NOT live inside the `recipe` jsonb.** It travels only as its own
  value — the RPC's `p_photo_url` parameter, landing in `recipe_sends.photo_url`, a
  column separate from `recipe_sends.recipe`. The `recipe` jsonb has no photo key at
  all, by design (see Piece 2 below for why).
- **Return shape is per-send `{recipient_id, send_id}` rows, not a bare success
  count** — deliberate, so a multi-recipient call can be matched back up
  one-to-one on the client if needed later (e.g. per-recipient error surfacing, see
  the forward-looking note below).

**Piece 2 — `sendRecipeToFriends(recipeId, recipientIds, note)` (the
snapshot-builder, in `data.ts`, alongside `shareRecipeSnapshot`).**

Re-queries the recipe fresh from the DB, scoped to the current user — the in-memory
`SavedRecipe`/`Recipe` shape already in scope on a recipe card is NOT reused,
because it lacks `cook_time`/`serves`, which the snapshot needs and which only a
fresh `recipes` select carries.

Builds a **reconstitution** snapshot, not a display snapshot — this is the
load-bearing shape difference from `shareRecipeSnapshot`'s `RecipeShareSnapshot`:
- Ingredients as `{name, quantity, sort_order}` — the same shape `saveRecipe`/
  `updateSavedRecipe` write to the `ingredients` table, NOT the share flow's
  display-oriented `{name, qty}`. This is what makes the jsonb something a future
  save step can insert directly into `recipes`+`ingredients` rather than needing a
  translation step.
- Steps routed through `normalizeStep()` (untouched, per its standing contract in
  CLAUDE.md) — always `{title, instruction}` objects in the frozen snapshot, never a
  raw legacy string, even if the source recipe still has legacy plain-string steps.
- `title`, `description`, `cook_time`, `serves` carried at the top level.
- **No photo key, no category/categoryId, no cook-history/ratings data** — the
  snapshot is deliberately minimal to exactly what a recipe row + its ingredients +
  its steps need to be reconstituted; nothing display-only or owner-only rides
  along.

Photo copy is **Option A**: a single `crypto.randomUUID()` token is minted
client-side once per call, before the photo block — mirroring
`shareRecipeSnapshot`'s sequencing exactly. If the recipe has a photo, one
download→upload→`getPublicUrl` byte-copy runs (sender's own authenticated client,
owner-folder path, SDK — never the public CDN), landing at
`{userId}/send-{token}.jpg`. This single copy is then reused as `p_photo_url` for
every recipient in the call — one physical file serves an entire multi-recipient
send, not one copy per recipient. If the recipe has no photo, the copy is skipped
entirely and `photoUrl` stays `null` — no placeholder, no error.

Calls `supabase.rpc('send_recipe_to_friend', { p_recipe_id, p_snapshot, p_note,
p_photo_url, p_recipient_ids })` and returns whatever the RPC returns.

Verified live end-to-end (not just unit-level): authenticated as a real test
account, sent an existing photographed recipe to two real recipient accounts through
the actual function. Confirmed by direct inspection: both `recipe_sends` rows
correct (sender, recipient, note, status, photo_url); the photo genuinely
byte-copied to the `send-{token}.jpg` path (confirmed via storage SDK list, not a
CDN guess) and byte-size-identical to the live photo, with the live photo
untouched; both `notifications` rows correct and paired to the right send; both
send rows share the identical `photo_url` (proving the one-copy-fans-out-to-all-
recipients mechanic); the `recipe` jsonb's shape matched the reconstitution spec
exactly (ingredients in order, steps all normalized objects, no photo/category
keys). All test rows, the storage copy, and the throwaway test account used for the
multi-recipient case were deleted afterward; the two tables and the storage folder
were confirmed back to their exact pre-test state.

**Forward-looking note for whoever builds the send UI (piece 3):** today, the RPC
returns `null` on *any* failure — `sendRecipeToFriends` doesn't distinguish "not
authenticated" from "invalid recipient" from "recipe not owned by caller" once it
catches the RPC's error; that's fine with no UI consuming it. The distinction
exists internally (five separately-worded `raise exception` messages inside
`send_recipe_to_friend`) and must not be flattened once a UI needs to show the user
something more specific than a generic failure toast — piece 3 should surface the
RPC's distinct named errors rather than re-collapsing them.

## Account-to-Account Sharing — Build 4 (Session a): Receiving — the save engine

This session shipped the receive-side counterpart to Build 3's send-side plumbing:
turning a `recipe_sends` row into a real, owned, attributed recipe. Like Build 3,
**this is plumbing only — there is still no receive UI anywhere in the app.** The
three console-only test hooks described below exist purely to exercise this engine
before Session (b) builds the screen that will call it for real.

**Three-actor sequence, deliberately non-atomic.** Saving a received recipe runs as
three separate actors, in this fixed order, each with a different privilege level:

1. **Client** — `saveRecipe()` (existing function, unchanged) reconstitutes the
   frozen `RecipeSendSnapshot` into a normal owned recipe row + ingredients, exactly
   as if the user had typed it in themselves.
2. **SQL** — `finish_received_recipe_save` (`security definer`) stamps attribution,
   forms the connection, sets `saved_recipe_id`, and flips the send's status to
   `saved` — all in one atomic statement-group.
3. **Service role** — the `copy-received-recipe-photo` Edge Function byte-copies the
   sender's send-photo into the recipient's own photo path and patches the new
   recipe's `photo_url`/`photo_version`.

This is intentionally NOT one atomic transaction across DB + storage — Supabase
gives no cross-system transaction, and object storage has no rollback semantics
worth relying on. Instead, the photo step is placed last and designed as the one
seam that's allowed to fail softly and be retried, while steps 1–2 are the ones
that must succeed for the recipe to "count" as saved.

**`saveReceivedRecipe(sendId, snapshot, existingRecipeId?)`** (`data.ts`, immediately
after `sendRecipeToFriends`) is the single client entry point that runs the sequence
and returns `{ recipeId, photoCopied }`. `photoCopied` collapses two cases that look
identical from the caller's side ("send had no photo" and "copy failed") — call
`findReceivedRecipesWithPhotoOwed()` if the distinction matters.

**Failure choreography, seam by seam:**
- **Step 1 fails** (recipe insert/ingredient insert throws) — nothing durable was
  created; the send is still `pending`. Thrown as `ReceivedRecipeSaveError` with no
  `recipeId` attached. Safe to retry from scratch by calling
  `saveReceivedRecipe` again with no `existingRecipeId`.
- **Step 2 fails** (`finish_received_recipe_save` RPC returns an error — e.g. a
  concurrent double-finish loses the row lock, or the send isn't actually `pending`
  anymore) — by this point a real, owned, photoless, unattributed recipe already
  exists and the send is still `pending`. This is the worst partial state the
  sequence can leave behind, and it's accepted deliberately: `ReceivedRecipeSaveError`
  is thrown carrying that `recipeId`, so a retry can pass it back in as
  `existingRecipeId` and skip straight to Step 2 instead of creating a duplicate
  recipe. **No compensating delete of the Step-1 recipe is performed on this path —
  confirmed deliberate, not an oversight.** Rationale: a compensating delete adds its
  own failure mode (what if the delete itself fails?) for a case that's already
  resumable without one; leaving an orphaned-but-real recipe behind is a strictly
  better failure mode than risking a doubly-broken state.
- **Step 3 fails or is skipped** (copy error, or the send legitimately had no photo)
  — never thrown, never rolled back. The recipe is already fully saved and attributed
  by this point; only `photo_url` is left `null`. `photoCopied` comes back `false`
  either way. This is the by-design soft-failure seam — see retry path below.
- **No-photo send** — Step 3 is attempted, the Edge Function's own no-op branch
  returns `{ copied: false, reason: 'send has no photo' }`, and `saveReceivedRecipe`
  reports `photoCopied: false`. Indistinguishable from a real copy failure from this
  function's return value alone — this is intentional; see `findReceivedRecipesWithPhotoOwed`
  below for how to tell them apart when it matters.

**Retry path (Step 3 only).** `retryReceivedRecipePhoto(sendId, recipeId)` re-invokes
just the Edge Function. It never re-runs `saveRecipe` or `finish_received_recipe_save`
— `finish_received_recipe_save` would reject a non-`pending` send outright (the send
is already `saved` by this point), and the Edge Function's copy+patch is naturally
idempotent (retry-on-conflict already built into its own copy logic), so calling only
this last step again is always safe.

`findReceivedRecipesWithPhotoOwed()` is the detection query behind that retry path —
it finds every `saved` send belonging to the caller where `saved_recipe_id` is set,
the *send's own* `photo_url` is non-null (the send genuinely had a photo attached),
but the resulting recipe's `photo_url` is still null (the copy never landed). A
no-photo send never appears in this list, because its own `photo_url` is null to
begin with — only a send that legitimately owes a photo shows up.

**Source-path-parsed-from-immutable-`photo_url` finding.** `copy-received-recipe-photo`
has no independent record of the original send-photo's storage path — it recovers it
by parsing `recipe_sends.photo_url` (the public URL) back into an object path. This
only works because that column is trigger-immutable once set (the Build 2 recipient-
write-restriction trigger, extended in this session — see below): the recipient can
never have overwritten it with something unparseable, so parsing the exact
`send-{token}.jpg` path the sender's own client uploaded is reliable, not a guess.

**`saved_recipe_id` column + trigger extension (Gate 1 of this session).**
`recipe_sends.saved_recipe_id` (uuid, nullable, FK → `recipes.id` `on delete set
null`) is settable exactly once: null → a recipient-owned recipe id, never
reassignable afterward. Enforced by extending the existing
`enforce_recipe_sends_status_only_update` trigger (Build 2) rather than adding a
second trigger — the same function now also rejects any UPDATE that would change
`saved_recipe_id` once it is non-null. This matters because the Edge Function acts
through the service-role client: **service role bypasses RLS but does NOT bypass
triggers**, so this guarantee holds even for the elevated actor in step 3.

**`finish_received_recipe_save(p_send_id, p_recipe_id)`** (`security definer`,
mirrors `send_recipe_to_friend`'s privilege pattern) is the only path that performs
this step. Guards, checked in order: caller authenticated; send exists and is
row-locked (`for update`, closing a concurrent-double-finish race — a deliberate
addition beyond the send-side function's skeleton, not a copy-paste); caller is the
send's recipient; send status is `pending`; the target recipe exists and is owned by
the caller. On success, in effectively one statement-group: stamps
`recipes.inspired_by_id`/`inspired_by_name` from the send's sender; forms a
`connections` row using canonical `least`/`greatest` ordering of the two profile ids
— **the table's UNIQUE constraint alone would NOT catch a reversed-pair duplicate;
the ordering discipline is what makes the constraint effective**, `on conflict do
nothing` so an already-existing connection is a silent no-op; and sets
`saved_recipe_id` + flips `status` to `saved` in the same UPDATE, so the two can never
drift apart mid-failure.

**`copy-received-recipe-photo`** is the app's first Edge Function to use the service
role at all — see the new CLAUDE.md Load-Bearing Contracts bullet for the
authorize-with-caller/act-with-admin pattern it establishes. Config: `verify_jwt =
true` (unlike `ai-chat`'s `verify_jwt = false` anonymous-proxy pattern).

**Session (b) decision, carried forward and now settled — categoryless-recipe
invisibility.** During this session's verification it was confirmed that
`getSavedRecipesAll`/`getSavedRecipesForCategory` both select through
`recipes!inner` joined to `recipe_categories`, so a recipe with zero category rows —
which is exactly what `saveReceivedRecipe` currently produces, since it calls
`saveRecipe(..., category: '')` — is invisible to the Recipes tab even though it
fully exists and is fully owned. This was deliberately NOT fixed in this session
(Session (a) is save-engine plumbing only, no UI). **Settled resolution for Session
(b):** the receive UI will reuse the EXISTING save sheet + its standard category
picker (the same one used when saving a self-built AI/manual recipe), and the
category the user picks there will flow into `saveReceivedRecipe`'s call to
`saveRecipe` as a real `categoryId` — not a new/different category mechanism. This
also means Session (b)'s call site will look more like `saveRecipe`'s other callers
than the current `category: ''` placeholder above.

**TEMPORARY test scaffolding — remove before Session (b).** `App.tsx` currently
attaches three console-only hooks to `window` —
`window.__tdSaveReceived`, `window.__tdRetryReceivedPhoto`, and
`window.__tdFindPhotoOwed` — wrapping `saveReceivedRecipe`, `retryReceivedRecipePhoto`,
and `findReceivedRecipesWithPhotoOwed` respectively, so the save engine could be
exercised from a browser console before any receive UI exists. Same throwaway
pattern as the one-time step-title backfill hook. Never wired into a render path.
**Must be deleted at the start of Session (b)**, once the real receive UI calls
these functions directly.

**Verification.** All three SQL/Edge-Function gates were violation-tested
individually as they were built; the full client-wired engine was then verified
end-to-end against the live Supabase project using a real seeded send (created
through the actual `sendRecipeToFriends`, not a reimplementation) across five
scenarios: happy path; forced Step 1 failure; forced Step 2 failure with successful
retry-resume via `existingRecipeId`; forced Step 3 failure with successful retry via
`retryReceivedRecipePhoto`/detected via `findReceivedRecipesWithPhotoOwed`; and a
no-photo send. All scenarios behaved as specified above. Teardown was verified
exact-object-count with zero residue; `test2@test2.com` and all real accounts were
confirmed untouched throughout.

## Account-to-Account Sharing — Send UI (Build 3, piece 3)

**Doc-size flag, not a task:** this file has grown past ~68k characters (`wc -m`),
driven mostly by the account-to-account sharing builds. Once that whole phase
completes (receive UI still to come), the account-sharing sections here are a good
candidate to split into their own file. Do not split mid-phase — flagged only.

This build fulfills the send UI that Build 3 deliberately deferred ("piece 3" in
that section's forward-looking note). It is a pure client build: no schema change,
no new SQL — it's a new caller of the already-verified `send_recipe_to_friend` /
`sendRecipeToFriends` engine (Build 3) plus two new read-only lookup functions,
`search_profiles`/`get_my_connections` (contract summarized in CLAUDE.md's
Load-Bearing Contracts index; this is their full statement).

**`search_profiles(query text)`** — `security definer`, `set search_path = public`,
granted to `authenticated` only. Identity comes from `auth.uid()` (the real caller,
not the function owner). An empty/whitespace query returns nothing — never the
whole table. Matching is deliberately tight for launch: exact match on `handle`
(case-insensitive) OR prefix match on `display_name` (case-insensitive); no
substring/fuzzy matching. LIKE metacharacters (`%`, `_`, `\`) in the query are
escaped so a literal `%` or `_` typed by a user is matched literally, not treated as
a wildcard. Excludes the caller's own row. Capped at 10 results. Returns only `{id,
display_name, handle}` — never a full `profiles` row, never `palate`/`inspiration`/
`constraints`/`onboarding_complete`. **This tight exact/prefix match is a deliberate
launch-scope decision, not a limitation** — the expectation is it loosens (e.g. to a
substring or trigram match) if search feels too strict at scale, and that's a
one-operator change to the `where` clause, not a shape change to the function or its
callers.

**`get_my_connections()`** — same `security definer`/`authenticated`-only shape.
Returns the *other* party of each of the caller's `connections` rows. Because
`connections` stores the pair canonically (`LEAST`/`GREATEST` of the two profile ids,
per Build 4's ordering discipline) rather than as a fixed sender/recipient pair, the
function resolves "the other party" with a case-join (`case when user_a_id =
auth.uid() then user_b_id else user_a_id end`, joined to `profiles`) rather than
assuming the caller is always in a fixed column — a function that instead always
read `user_b_id` as "the other party" would silently return the caller's own profile
half the time.

**The Send sheet itself** (`RecipeCard` in `App.tsx`). Opened from the Recipe Card's
existing top-row share icon — unchanged trigger, gated on `editable` (owned recipes
only) same as before. That icon is now the primary share surface: it opens the send
sheet instead of calling `handleShare` directly. The external gift-link flow
(`shareRecipeSnapshot`/`handleShare`) is completely unchanged and untouched — it now
lives one level deeper, behind the sheet's "Share as link instead" button, which
simply closes the sheet and calls the existing `handleShare()`. The two share
surfaces are deliberately kept distinct (in-app send vs. public link) rather than
merged into one control.

Sheet contents/behavior:
- A search input, debounced 280ms, backed by `search_profiles` via the
  `searchProfiles` wrapper in `data.ts`. Standard debounce + ignore-flag pattern
  (matches the Lovable-double-mount convention elsewhere in the app) protects
  against an out-of-order stale response overwriting a newer one.
- **2-character minimum** before a search fires at all — below 2 trimmed
  characters, no request is made and the sheet sits in the same calm resting state
  as an empty query (no "searching…", no "no one found"; both would be false
  claims at that point). At 2+ characters, the state machine is: pending
  ("searching…", quiet/muted styling) → settled with results, or settled with
  "no one found" if the debounced query genuinely matched nobody.
  - **Timing lesson worth keeping:** the pending flag is set synchronously inside
    the search input's `onChange`, not inside the debounce `useEffect`. Setting it
    in the effect left a one-paint gap — the keystroke's render committed before
    the effect ran — during which the UI would briefly show a stale "no one found"
    from the *previous* query before the effect flipped it back to pending. Any
    future "is a fetch pending" indicator tied to a debounced effect should set the
    pending flag in the same synchronous handler that changes the query, not in the
    debounced effect itself.
- With the search box empty, the sheet shows the caller's existing connections
  (`get_my_connections`, via the `getMyConnections` wrapper) under a "Your
  connections" label, instead of an empty state.
- Selecting a person (from either search results or the connections list) turns
  them into a **persistent chip** — dark-green pill, initial circle, first name, a
  small x to remove — in a row between the search input and the results/connections
  area. Chips survive query changes (typing a new search does not clear existing
  selections); a selected person is filtered out of both the search-results list and
  the connections list while selected, so they don't appear twice; the only way to
  deselect is the chip's own x. This reuses the existing `selectedRecipients`
  selection state (a `Map<string, ProfileSearchResult>`) unchanged — no new data
  model was introduced for the chip row, only a new render of the same state plus a
  filter on the two list renders.
- An optional one-way note (plain textarea, no formatting).
- The Send button is hidden entirely until at least one recipient is selected, then
  reads "Send to N people" (singular/plural aware). It calls the existing, unmodified
  `sendRecipeToFriends(recipe.savedId, recipientIds, note)` engine from Build 3 — no
  changes to that function or to `send_recipe_to_friend` were needed or made. Success
  shows a quiet "Sent" toast (same toast pattern as the existing share-link
  confirmation) and closes the sheet; failure keeps the sheet open and shows an
  inline error. (`sendRecipeToFriends` still collapses every RPC failure mode to a
  generic `null` — Build 3's forward-looking note about surfacing the RPC's five
  distinct named errors instead of a generic failure remains open; this build did
  not address it.)

- **Second timing lesson worth keeping, unrelated to search:** the sheet's search
  input originally had `autoFocus`. On mobile, `autoFocus` summons the keyboard
  immediately, which triggers the browser's native scroll-into-view/viewport-resize
  — and that raced the sheet's CSS-transform slide-up animation, reading as the
  background recipe screen visibly "jumping" before the sheet finished animating in.
  No other sheet in the app (Log sheet, Update-vs-Save-as-New sheet) autofocuses an
  input, which is why they don't show this. Fix was simply removing `autoFocus`, not
  changing the animation or backdrop. **Do not autoFocus an input inside a
  slide-up/fade sheet.**

Verified live end-to-end via the actual UI (not a re-run of Build 3's direct-RPC
test): sent a real photographed recipe from a real account to two real recipient
accounts through the sheet. Confirmed by direct DB/storage inspection: both
`recipe_sends` rows correct and complete (sender, distinct recipients, `pending`
status, note, full reconstitution-shaped snapshot); both `notifications` rows
correct; the `send-{token}.jpg` photo byte-identical (etag + size) between the two
recipients' shared copy and the untouched live original; sender identity resolvable
via `sender_id` → `profiles` for a future "inspired by" stamp. Test rows deliberately
left in place (not torn down) to seed the still-unbuilt receive UI's first real test
data.

## Account-to-Account Sharing — Receiving (the Home screen cornerstone)

This is the receive-side UI that Build 4 (Session a)'s save engine was built for —
a new `Home` tab (`src/tipsy/Home.tsx`) that turns the plumbing above into an actual
screen. Shipped across several sessions on branch `account-sharing-receive-plumbing`,
which stays **intentionally unmerged** until the Home screen is shelf-complete (see
the branch note in CLAUDE.md's Standing Cleanup / Watch Items — do not read
"unmerged" as "unfinished" or "broken"). This section will fold into a proper
account-sharing-wide split of FEATURE_SPECS.md once that phase completes; it is not
split out on its own yet.

**Home tab and shell.** `Home` is `TAB_ORDER`'s 5th, last entry — a deliberate
append, not an insert elsewhere in the array (inserting mid-array disturbs
`ScreenStage`'s screen-key/stack bookkeeping). The shell is a light `#FAF7F2`
background with an italic Fraunces greeting ("Good morning/afternoon/evening" by
local hour, plus the user's first name from `profile.display_name`) — no chrome
beyond that; the bottom nav is the only other persistent element.

**Received shelf + tiles.** Below the greeting, a horizontally-scrolling shelf of up
to 4 tiles, one per `pending`-status received recipe (`getPendingReceivedRecipes`,
existing from Build 4 Session a). Each tile: a blurred, scaled-up cover photo behind
a bottom scrim gradient carrying the recipe title and "from {senderName}" — or, when
the send had no photo, a flat card-green (`#2E4E08`) panel with the app's watermark
monogram centered at reduced opacity as a photoless fallback. A "View all (N)" link
appears only once there are more than 4 pending items, pushing to the full list.
Zero pending items renders just the bare greeting — no dedicated empty-state copy yet.

**View-all pending list.** A separate full list screen (`ReceivedPending` in the same
file) takes a static `items` snapshot as a prop rather than its own live query —
**known minor staleness**: saving or dismissing a recipe from inside this list can
leave a momentarily-stale row until the user backs out and re-enters (logged in
CLAUDE.md's Standing Cleanup, not fixed).

**Received recipe view.** Opening a tile pushes `ReceivedRecipeView`, which
deliberately hand-matches `RecipeCard`'s presentation (hero photo, title, tabs for
ingredients/steps, step-row expansion) so a received recipe is visually
indistinguishable from one already in the library — built as a byte-for-byte
presentational match, not by importing or extending `RecipeCard` itself (`RecipeCard`
is a known-trouble file per CLAUDE.md; this view is a sibling, never fused in). It is
strictly read-only: no Cook History, no edit, no delete, none of the owner-only
controls a saved `RecipeCard` has. Where a saved recipe's card would show nothing
special, this view's description area carries "inspired by {senderName}" instead —
the pre-save equivalent of the `inspired_by_name` stamp that lands on the recipe row
itself once saved (see Build 4 Session a above).

**Note overlay.** When the send included a note, a centered card overlay ("{sender}
sent you this" + the note text + a "View recipe" button) shows over a blurred version
of the recipe content beneath, and is skipped entirely when there's no note. It is
meant to show **once per recipe, ever, for the rest of that viewing session** — not
re-arm on every re-entry. This required a specific fix: `ScreenStage` renders the
outgoing screen in a separate overlay-layer JSX position during transitions (see
CLAUDE.md's Architecture / SSR section on the ScreenStage tree), which mounts a
*fresh* `ReceivedRecipeView` instance to animate the slide-out whenever the user
leaves this screen (e.g. right after tapping Save) — a fresh instance re-derives its
"note revealed" state from `item.note` and re-shows the note mid-transition. Fixed
with a module-level `Set<sendId>` in `Home.tsx` (`revealedReceivedNoteSendIds`) that
records "seen" outside component state, so the remount doesn't re-arm it. This is a
per-session (page-lifetime) memory, not persisted — acceptable, since the underlying
send is no longer pending after save/dismiss anyway and won't be re-opened this way.

**Save.** Tapping Save opens `SaveRecipeFlow` — the exact same category-picker sheet
used by the normal AI/manual save flow — reused verbatim, unmodified. Because that
sheet's "add to menu" step and "create new category" affordance are both unconditional
(not caller-configurable), reusing it correctly required wiring both round-trips, not
just category selection:
- **Category pick** → `saveReceivedRecipe(sendId, snapshot, undefined, categoryId)`
  (the settled Session (a) resolution: the category the user picks now flows through
  as a real `categoryId`, resolving the categoryless-recipe invisibility gap flagged
  in Build 4 Session a — a received recipe now gets a real `recipe_categories` row
  and is visible in the Recipes tab like any other saved recipe).
- **Add to menu** (if chosen in the sheet) → `addRecipeToMenuSection` afterward, same
  as the normal flow.
- **New category** → a dedicated `newcategoryforreceived` screen +
  `finishCreateCategoryForReceived` App-root function, built as an additive parallel
  path rather than reusing the existing `newcategoryforrecipe`/`RecipeDraft`/
  `returnTo` machinery — `PendingReceivedRecipe`'s shape doesn't fit `RecipeDraft`
  cleanly, and that machinery is Cook/AddYourOwn-coupled, both known-trouble-adjacent.
  Returns to `ReceivedRecipeView` with the newly created category pre-selected,
  un-animated (mirrors the existing `finishCreateCategoryForRecipe` "cook" branch,
  which is likewise un-animated).

After a successful save: `clearRecipeCache(categoryId)` is called directly (not
through `finishSaveRecipe`'s own inline cache-clear, which has a pre-existing bug —
see CLAUDE.md — of never dropping the `'__all__'` cache entry); the user lands on the
saved recipe exactly like a normal save, via the existing `finishSaveRecipe`; and the
Home tab's stack is reset to root (mirroring the existing Build-tab reset already in
`finishSaveRecipe`) so the now-resolved received recipe can't linger as a stale
screen in the Home stack.

**Photo on first paint.** The copied photo is available in the same round trip:
`copy-received-recipe-photo`'s response already includes `photo_url`/`photo_version`
on success, so `SaveReceivedRecipeResult` was extended with optional `photoUrl`/
`photoVersion` fields (populated only when `photoCopied` is true) and the landed
`Recipe` object is built with them set. Fixes what would otherwise be a first-paint
photo-missing flash (fixed before ever shipping to `main`, not a shipped regression) —
without this, the recipe would paint photoless until a navigate-away-and-back forced
a refetch. The soft-fail contract from Build 4 Session a is unchanged: a failed or
skipped copy simply leaves these fields unset, painting photoless exactly as before.

**Dismiss.** Quiet, no confirmation modal: `dismissReceivedRecipe(sendId)` (existing,
trivial status-only update) then back to Home. Confirmed at the data layer that this
is genuinely soft and silent — the `recipe_sends` row survives with `status =
'dismissed'` (never deleted), and dismissing creates **no** new `notifications` row
for the sender; the only notification that ever exists for a send is the single
`recipe_received` one created at send time.

**Temporary test scaffolding removed.** The `window.__tdSaveReceived` /
`__tdRetryReceivedPhoto` / `__tdFindPhotoOwed` console-only hooks from Build 4 Session
a were deleted from `App.tsx` once this real Save/Dismiss UI existed to exercise the
engine instead, per that session's own note to do so.

**Data-layer verification (live Supabase, read-only queries via service role, no
teardown needed since no throwaway data was created this pass):**
- **Connection formed, first-class and deduped.** A single `connections` row exists
  between the two test accounts used, correctly ordered via canonical `least`/
  `greatest`, with `created_via` pointing at the send whose save actually triggered
  formation (confirmed by matching timestamps against the underlying recipe's
  `created_at`). A second save between the same pair did not create a duplicate row —
  the `on conflict do nothing` guard holds in practice, not just in the function body.
- **Attribution is a stored value, not just rendered text.** Both recipes saved from
  received sends carry `inspired_by_id`/`inspired_by_name` as real column values
  matching the sender.
- **Dismiss and Save notification behavior confirmed identical to spec:** exactly one
  `notifications` row per send exists in all cases (saved or dismissed), timestamped
  at send time; zero rows ever appear for the original sender as a result of a
  recipient's save or dismiss action.
- **Photo copy is a real, independent object.** The recipient's copy lives at their
  own `{recipientId}/{recipeId}.jpg` path (never a `send-`-prefixed name), with a
  storage object id distinct from the sender's original `send-{token}.jpg` object —
  genuinely two objects, byte-identical (matching etag and size) rather than a
  reference, confirming the copy is real and independently deletable.
