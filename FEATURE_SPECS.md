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
