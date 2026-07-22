# Tipsy Dinner — CLAUDE.md

Operational/technical truth for the codebase. Strategic status, roadmap, and
what-shipped-when live in the current-state doc — do NOT duplicate them here.
Detailed per-screen visual spec lives in DESIGN_SPEC.md — consult it when building
or restyling a screen.

Last updated: July 2026

---

## What This App Is

Tipsy Dinner is a personal digital cookbook + AI recipe assistant. Two modes: a
personal recipe library (saved, browsable, organized) and an AI recipe builder
(Build) that crafts recipes through conversation. Target user: an elevated home
cook, cooking for two and for crowds.

---

## Load-Bearing Contracts

One line per invariant. Full detail is stated in full exactly once, at the
pointer named — do not duplicate it here.

- **`normalizeStep()`** — every step reader routes through it (five readers); legacy plain-string steps stay supported forever. Full detail: Recipe Step Titles in FEATURE_SPECS.md.
- **`sourceId`/`sourceTitle` always move together** — set, carried, cleared, and re-anchored together; never independently. Full detail: Update vs Save-as-New below.
- **Anchor severs on title mismatch** — case-insensitive, trimmed, exact-match only; deliberately biased toward severing, not fuzzy matching. Full detail: Update vs Save-as-New below.
- **`CropRect` is fractional (0–1), not absolute pixels** — never convert it to absolute pixel coordinates. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Photo path separation** — live photo `{userId}/{recipeId}.jpg` vs. share copy `{userId}/share-{token}.jpg`; no mutating function may ever construct a `share-`-prefixed filename. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **`photo_version` is a persisted cache-buster** — never replace with a render-time value like `Date.now()`. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Cook History reads from local `cookEvents` state**, not the `recipe` prop — otherwise live updates regress to stale data. Full detail: Cook History in FEATURE_SPECS.md.
- **Public bucket ≠ SDK access permitted** — a public CDN fetch bypasses RLS; the storage SDK always enforces it regardless of the bucket's public flag. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **`updateSavedRecipe` is a known trouble function** — shared by the chat-edit Update path and AddYourOwn; test both whenever it changes. Full detail: Update vs Save-as-New below.
- **`paddingBottom: 64` is hard-coded nav-bar clearance** — any new full-height bottom sheet must use `position: fixed; bottom: 64`, not `absolute; inset: 0`. Full detail: Architecture / SSR below.
- **Decode a downscaled preview for display, not the raw file** — `createImageBitmap({ resizeWidth: 1200 })`; a raw-file decode cost ~4.9s. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Tailwind Preflight's `img { max-width: 100% }` clamps rendered width** — fix with inline `maxWidth: "none"` on that element only. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Public share route is snapshot-first with a live fallback, and must stay chrome-free.** Full detail: Architecture / SSR below.
- **Ingredients are free-text strings, not structured `{amount, unit}`** — the AI normalizes on demand where structure is needed. Full detail: Data Layer below.

---

## Tech Stack

- React + TanStack Start + Vite
- Bun (package manager, dev server)
- Supabase — auth, database, storage, edge functions. Client at `src/lib/supabase.ts`
- Nitro — Vercel deployment adapter
- Anthropic API — server-side via Supabase Edge Function `ai-chat` (key never in browser)
- Tabler Icons
- Fonts: Lazydog (display), Fraunces italic, Inter, Playwrite US Modern (logo assets only)

**Local dev:** `bun dev` from `~/Developer/tipsy-dinner-app` → localhost:8080 or 8081
**GitHub:** github.com/benjaminhiggins15-byte/tipsy-dinner-app
**Deployment:** Vercel, live at tipsydinner.com. Every push to main auto-deploys.

---

## Design System

Full per-screen detail in DESIGN_SPEC.md. The core:

**Fonts**
- **Lazydog** — `src/fonts/lazydog.ttf`, `@font-face` as `'Lazydog'`. All recipe titles, screen/section headings. Always `text-transform: uppercase`. Display font for the whole app.
- **Fraunces italic** (Google) — AI responses, recipe descriptions, taglines, margin notes, empty-state copy, form description fields.
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
Rules: cream on green for text directly on background; user bubbles cream bg + green text; AI text cream Fraunces italic on green (no bubble); CTAs cream bg + green text; no decorative red/orange/coral/terracotta — `#B85C5C` is the sole exception, reserved for error and destructive states (delete/remove actions, inline error text) and used in ~19 locations across 4 files (App.tsx, Occasions.tsx, NewCategory.tsx, Menus.tsx); never repurpose it for anything decorative. Bottom sheets (delete-confirm modals, the Cook History log/edit sheet) are light `#FAF7F2`, not a green — confirmed by grep, zero `#182800` bottom sheets exist anywhere in the codebase.

**Universal gradient** — behind every screen except splash:
```css
background: linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%);
height: 420–480px; position: absolute; top:0; left:0; right:0;
z-index: 0; pointer-events: none;
```
Content sits above at z-index 1. Gradient fades into base green — no hard edges.

**Logo assets** (`src/Logos/`) — path is case-sensitive on Linux/Vercel:
- `Full_logo.png` — full "tipsy DINNER" wordmark. Splash screen only.
- `watermark_square.png` — square tD monogram. Build top-left + mini player.
- `watermark_circle.png` — circular tD monogram. Available if needed.
```js
import tDSquare from '../Logos/watermark_square.png'
import fullLogo from '../Logos/Full_logo.png'
```

**Navigation** — four tabs, always visible, bottom of every screen: Build, Recipes,
Menus, Profile. Active = cream icon + label + small cream dot below; inactive = cream
25%. Nav bg #182800. Back arrows icon-only. All transitions slide left/right.
(Grocery list is NOT a nav tab — reached via a cart icon on the Recipes header. The
5th nav slot is deliberately reserved for a future social feature.)

---

## Data Layer

**Supabase tables** (RLS enabled on all; owner-only unless noted):
- `profiles` — display_name, palate, inspiration, constraints, onboarding_complete
- `recipes` — saved recipes; `is_public` bool + `share_token` for public links
- `ingredients` — one row per ingredient, with `sort_order` (separate table to enable ingredient search later)
- `categories`, `recipe_categories` (join — a recipe can be in many categories)
- `occasions`, `menus`, `menu_recipes` (join, has `section` field)
- `grocery_items` — grocery list rows (raw + AI-enriched fields), owner-only
- `grocery_list_shares` — frozen snapshots for public grocery share links; owner-write + anon-read
- `recipe_shares` — frozen snapshots for public recipe share links; owner-write + anon-read (same pattern as `grocery_list_shares`; see Recipe Sharing in FEATURE_SPECS.md)

**Key schema decisions:**
- Ingredients stored as **free-text strings**, NOT structured `{amount, unit}`. Deliberate and load-bearing: fits the free-text nature of AI cooking ("a good glug of olive oil"); AI normalizes on demand where structure is needed. The AI is the bridge between free-text recipes and any feature that computes over ingredients (grocery, future pantry/nutrition/scaling). Full structured-storage migration is a trigger-gated option — revisit ONLY if a feature must compute across the whole library's quantities in *stored* form.
- `steps` is a JSONB array inside `recipes` (never searched independently). Each
  element is a `RecipeStep` (`string | { title, instruction }`) — see "Recipe Step
  Titles" in FEATURE_SPECS.md.
- Menu section canonical order (enforced in app code, not DB): apps → mains → sides → desserts → drinks.
- `recipes.photo_url` (text, nullable) predates the Recipe Photos feature and sat
  unused; `photo_version` (int4, not null, default 0) was added for that feature. See
  "Recipe Photos" in FEATURE_SPECS.md.

**Schema lives ONLY in the Supabase dashboard** — no in-repo migration files. Known
logged risk; follow the existing hand-applied-SQL convention when adding tables, but
flag it. (Grocery tables were added dashboard-only this way.)

**Legacy localStorage keys still in use:** `tipsyDinnerName`, `tipsyDinnerEmail`,
`tipsyDinnerTable`. (All recipe/menu/profile data is on Supabase — localStorage is no
longer used for app data.)

---

## AI Layer

- Model: `claude-sonnet-4-5` via Supabase Edge Function `ai-chat` (`/functions/v1/ai-chat`)
- API key server-side only (`ANTHROPIC_API_KEY` in Edge Function env). Client uses Supabase anon key. Swapping LLM = one-line change in the edge function.
- Streaming implemented (SSE, word-by-word) via `parseSSEStream` in App.tsx
- `max_tokens` = 4096 (raised from 2048 to give the grocery enrichment call headroom; Anthropic bills only generated tokens, so no cost/behavior change for normal turns)
- Two modes: Brainstorm and Recipe. Never enter Recipe mode except on explicit user choice. Recipe card is never updated for technique/wine/tangent questions.

**System prompt is consolidated.** A single module-level
`buildSystemPrompt(profile, currentRecipe)` (App.tsx, immediately after
`recipeToXML`) builds the conversational system prompt. All three call sites in the
Cook component — `fireAICall`, `sendMessage`, `handleChipClick` — call this one
function; future prompt edits happen in one place. User profile (palate,
inspiration, constraints) is interpolated inside it.

**Recipe parsing is consolidated.** A single module-level
`parseRecipeFromAIResponse(fullText, sourceId?, sourceTitle?)` (App.tsx, immediately
after `buildSystemPrompt`) parses the `<recipe>` XML out of the AI's raw response
(title/description/ingredients/steps) and carries `sourceId`/`sourceTitle` forward
onto the result. All three call sites — `fireAICall`, `sendMessage`,
`handleChipClick` — route through it; this was consolidated separately from (and
later than) the prompt-building consolidation above. There is now exactly one place
where recipe-parse and anchor carry-forward logic lives — any future change to
either goes there. See "Update vs Save-as-New" for the carry-forward/severing
behavior itself.

**Recipe context injection.** When a saved recipe is in scope (`currentRecipe !==
null`), it is serialized via `recipeToXML` (module-level in App.tsx) and appended to
the **system prompt as reference material** — framed "The user is asking about this
saved recipe; use it as reference: …". It is NOT seeded as a fake assistant message
(that made the model believe it authored the recipe and drift into recipe-prose
register). Travels every turn; token-neutral; scale-safe. Blank Build leaves the
prompt unchanged. Invariants: recipe never enters the visible `messages` array;
`<recipe>` tags stripped from AI output; XML schema unchanged; a Build-from-scratch
AI-authored recipe legitimately stays an assistant message in history.

**Formatting house style** (content-aware, all modes, recipe loaded or not): named
dishes/items → bold-name — em-dash — description, one per line; broader clustered
options → short framing line + bold theme labels, specifics in prose; single
thought/judgment/yes-no → flowing prose. No headers, no bullets; asterisks only for
bolding names/labels. Guard against both over-structuring (invented groupings) and
under-structuring (dense paragraphs).

**Grocery enrichment is a SEPARATE AI island.** `enrichGroceryItems` (data.ts) is a
structured JSON-in/JSON-out utility with its own prompt
(`GROCERY_ENRICHMENT_SYSTEM_PROMPT`, defined just above it). **Never merge, adapt
from, or share code with the conversational system prompt (`buildSystemPrompt`)** —
different purposes (structured utility vs. conversational voice); mixing risks both
contracts.

**Microcopy voice:** "pour a glass — what are we cooking?" (placeholder); "building
the recipe…" / "uncorking…" / "tasting…" (loading); "filed away." (save); "nothing
here yet — pour something open." (empty); "Looking good." (preview); "what's on the
menu?" (Build hero).

---

## Authentication

- Supabase Auth (`@supabase/supabase-js`). Client `src/lib/supabase.ts`. Screens `src/tipsy/SignUp.tsx`, `src/tipsy/SignIn.tsx`; slide transitions via `src/tipsy/AuthFlow.tsx`.
- Email/password + Google OAuth, both working. Email confirmation disabled (intentional). Profile auto-created on signup via Postgres trigger.
- Routing: no session → SignUp; session + `onboarding_complete` false → Onboarding; session + true → Build.
- Onboarding: three questions (palate, inspiration, constraints), each writes to `profiles`; loader sets `onboarding_complete` true.

**Duplicate SIGNED_IN event.** `onAuthStateChange` fires a duplicate SIGNED_IN when
the browser tab regains focus. A `profileInitialized` ref prevents re-running
profile/migration logic on subsequent events; it resets to false on logout so
re-auth works. (This was the root cause of the old tab-refocus state-reset bug.)

---

## Architecture / SSR

**SSR + Supabase.** TanStack Start with SSR via Nitro. Supabase client is SSR-safe:
- Browser: localStorage, `persistSession: true`, `detectSessionInUrl: true`
- Server: no-op storage, `persistSession: false`, `detectSessionInUrl: false`
- `getCurrentUserId()` uses `supabase.auth.getUser()` (not `getSession()`) for reliable production session retrieval.

**Recipe List cache (Option 2).** Recipe data lives in App.tsx, not the list
component: `recipesByCategory` state (keyed by category); `ensureRecipesLoaded()`
fetches/caches before nav and on list mount when empty; `clearRecipeCache()`
invalidates on save/edit/delete; the list re-fetches via a useEffect dependency on
`recipesByCategory[categoryKey]`.

**ScreenStage tree.** Unified structure: the current screen always renders in the
same base-layer position; the outgoing screen renders as an overlay only during a
transition. (Previously alternated between two JSX shapes, causing unmount/remount on
every navigation.) NOTE: `paddingBottom: 64` (App.tsx ~lines 1218 & 1231) is
hard-coded nav-bar clearance — content-box sizing, so the screen layer's actual box is
64px taller than the true viewport. This already bit a real bottom sheet (Cook
History's log-cook sheet): a `position: absolute; inset: 0` backdrop inherited the
oversized containing block and pushed its Save button 64px below the visible screen.
Fixed there via `position: fixed; bottom: 64` (matching the existing chat-input-bar
pattern) instead of `absolute + inset: 0`. `PhotoCropOverlay` (see "Recipe Photos" in FEATURE_SPECS.md)
uses this same `fixed; bottom: 64` pattern rather than `ExpandedRecipeOverlay`'s
`absolute` + explicit-offset approach — `fixed` escapes the padded ScreenStage
containing block, which is the actual protection against this trap. Nothing in the
app renders over the nav bar; the crop overlay respects it like everything else. Any
new full-height bottom sheet or overlay should use the same `fixed` pattern from the
start. Someday cleanup: make the nav-bar clearance not hard-coded so this class of
bug can't recur.

**Lovable double-mount.** Built in Lovable → components mount twice in dev
(StrictMode-equivalent). All async fetches use the ignore-flag pattern:
```javascript
useEffect(() => {
  let ignore = false;
  async function load() {
    const data = await fetchSomething();
    if (ignore) return;
    setState(data);
  }
  load();
  return () => { ignore = true; };
}, [deps]);
```

**Public sharing route.** `src/routes/r.$token.tsx` — standalone, outside the auth
flow and outside the app frame. Shared recipe links are frozen snapshots, not live
views — see "Recipe Sharing" in FEATURE_SPECS.md for the full model. Loader tries
`getRecipeSnapshotByToken(token)` (reads `recipe_shares`) first; on null, falls back
to the legacy `getPublicRecipeByToken(token)` (fetches recipe + ingredients live, no
`user_id` filter, relies on RLS — two anon-read policies,
`recipes_select_public`/`ingredients_select_public`, gated to `is_public = true`,
OR'd with owner-only policies) so tokens minted before the frozen-snapshot model keep
resolving. Component body is unchanged either way — both paths produce compatible
field shapes. **Must stay chrome-free** (no in-app UI like the chat icon).

**Vercel quirks.** Nitro generates `.vercel/output` during build (gitignored).
`config.json` and `.vc-config.json` are written manually via a Nitro compiled hook in
`vite.config.ts`; `tslib.es6.mjs` copied in the same hook. Output dir set to
`.vercel/output` in Vercel settings.

---

## Build Conversation Persistence

Build state is lifted to App-level so it survives tab switches, navigation, and save
flows (it previously lived in Cook and was destroyed on unmount). App-level state:
`buildMessages`, `buildConversationHistory`, `buildCurrentRecipe`,
`buildMessageIdRef`, `buildAutoFireAI`. Cook receives these as props, renders/updates
them, does NOT own them.

Clear functions: `clearBuildStateOnly()` resets state, no transition (used when
seeding must atomically replace state); `clearBuildConversation()` calls it then runs
a 300ms slide to a fresh Cook (new `resetKey`) — this is what the refresh button
uses. Refresh button: top-right of Build active state, hidden when empty; confirm
modal reuses the delete-confirm pattern.

---

## Chat from Recipe Card

A floating chat icon on the user's own saved Recipe Card (gated on `recipe.savedId`;
NOT on the public route) opens a slide-up input bar; the user's question transfers
them into Build with the full recipe loaded as the in-progress recipe, AI auto-fires
on arrival. Single transfer path for empty and active Build (no collision warning —
starting a new chat silently replaces any active one; the refresh button is the
deliberate reset).

**RecipeCard is a module-level component with NO closure access to App scope.**
Seeding/navigation must go through props (e.g. `transferToRecipeChat`). Never call
App-level setters (`setBuildMessages`, `switchToTab`, etc.) directly from RecipeCard —
they're undefined there and crash silently. `transferToRecipeChat` atomically seeds
the mini-player recipe, the user's question as the first message, and a one-entry
conversation history, then navigates to Build. Auto-fire keys off a seeded
single-user-message history **with `currentRecipe !== null`** (that check
distinguishes a recipe-loaded chat from empty Build); guarded by `autoFireRef`.

Full recipe (not mini-player-only) is injected so the AI can answer surgical
questions ("can I sub X?", "how long is step 2?") correctly. See AI Layer for the
system-prompt-reference mechanism.

---

## Update vs Save-as-New (Recipe Origin Tracking)

`RecipeDraft` carries an optional `sourceId?: string` AND an optional
`sourceTitle?: string`. `sourceId` is set in `transferToRecipeChat` from the source
recipe's id when a saved recipe is loaded via chat-from-recipe; `sourceTitle` is set
alongside it, snapshotting the origin recipe's title at chat launch. Both are
internal state only — NOT in `recipeToXML`, NOT sent to the AI.

**Binding invariant: `sourceId` and `sourceTitle` always move together** — set
together, carried together, cleared together, re-anchored together. They are written
in exactly three places: `transferToRecipeChat` (initial set), `parseRecipeFromAIResponse`
(carry-forward or clear — see below), and `onUpdateRecipe`'s re-anchor step (after a
successful write). There is no path where one survives without the other; do not
introduce one.

**Anchor severs on dish drift (data-loss fix).** Every AI turn wholesale-replaces
`title`/`description`/`ingredients`/`steps` with no field-level merge. Inside
`parseRecipeFromAIResponse`, the newly-parsed title is compared against `sourceTitle`
— case-insensitive, trimmed, **exact match only** (deliberately no fuzzy matching, no
ingredient-overlap heuristic, no AI call). On a match, `sourceId`/`sourceTitle` carry
forward unchanged. On a mismatch, both are dropped together, so the save sheet falls
back to the standard save flow instead of offering an overwrite. This is the fix for
a production bug where building an unrelated dish mid-chat (e.g. asking about a saved
"Spanish Pork" recipe, having the AI build a "Broccolini" dish instead) let the user
tap "Overwrite" and destroy the original recipe — the button named one dish, the
write target was a different row. **Design bias, do not "improve": intentionally
biased toward severing.** A false "new dish" (anchor lost when it was really the same
dish) is a harmless inconvenience — the user sees "save as new" instead of "update."
A false "evolution" (anchor kept for a genuinely different dish) is permanent data
loss. The exact-match rule is deliberate, not lazy.

At save: if `sourceId` is present, the save sheet shows a two-button choice (Update
[name] / Save as new) instead of the category picker; absent → normal flow. The
**Update** button label reads `sourceTitle` (the recipe that would be destroyed), not
`currentRecipe.title` (the recipe being written) — label and write target now always
name the same row. Tapping Update opens a confirmation modal (built on the existing
centered-card confirm pattern used by delete/refresh) before anything is written:
different names → "Replace X with Y? X will be permanently overwritten. This can't be
undone."; same name → "Overwrite X? Your saved X will be permanently replaced with
this version. This can't be undone." Confirm proceeds with the existing
`onUpdateRecipe` write; Cancel/backdrop returns to the choice sheet, writing nothing.
`onUpdateRecipe` overwrites in place via `updateSavedRecipe`, keeps categories, and
re-anchors `sourceId`/`sourceTitle` to the recipe as just written. `sourceTitle` is
kept strict DB-truth — it is intentionally NOT synced when a save-as-new sibling is
renamed, so the confirm modal can never claim a false title match. **Save-as-new**
inserts via `saveRecipe` and deliberately leaves `sourceId`/`sourceTitle` on the
original base, untouched by this fix, so multiple siblings can be spun off one base in
a single chat (swappable F&F bet). Edge case: origin deleted mid-chat → silent
fallback to save-as-new.

**`updateSavedRecipe` is a KNOWN TROUBLE FUNCTION — shared by BOTH the chat-edit
Update path AND AddYourOwn (Write Your Own) edit. Any change to it touches both flows
— always test both.** It produced multiple bugs, including two live production
data-loss bugs now fixed: (a) ingredient INSERT was missing `user_id` → RLS wipe of
ingredients on any Write-Your-Own edit; (b) a stale `isEdit` numeric-type check in
AddYourOwn routed edits to INSERT, duplicating the recipe instead of updating.
Current guards in `updateSavedRecipe`: `user_id` on ingredient writes; best-effort
restore on partial insert failure (NOT ACID — Supabase client has no transaction
control); empty-array gate (`&& length > 0`) so a delete never fires without an
insert; post-update fetch reads category via the `recipe_categories` join (there is
no `recipes.category` column). `onUpdateRecipe` lives inside Cook — use only Cook
props there, never App-level setters (that scope error caused a duplicate-on-save).

---

## Session Rules for Claude Code

- Design decisions are made in Claude.ai first — never figure out design in Claude Code. Claude Code executes precise prompts and makes no decisions.
- Read CLAUDE.md at the start of every session. Ask for a plan before writing code.
- One clearly-scoped screen/task per session. Preserve existing functionality and data flow exactly unless explicitly told to change it.
- **Diagnose before fixing (hard rule).** Always a read-pass that changes nothing before concluding anything is broken. This is a Lovable-built, incrementally-extended codebase whose failure modes don't announce themselves — first-guess causes have repeatedly been wrong, and bugs have hidden behind bugs. Confirm before fixing.

**Branch workflow for risky/structural changes** (tipsydinner.com is live): work on a
branch → push → Vercel builds a preview → test on a real phone → merge to main only
once verified. **Gotcha:** Google OAuth redirects to PRODUCTION, so logging into a
branch preview needs a separate test account (real accounts bounce to production).
Keep one test account around — but be deliberate about which account you're in when
diagnosing: stray test accounts have twice caused identity-mismatch confusion (a
"delete bug" and a menu-save failure that were both session-identity artifacts, not
code defects).

- Auto-approve edits: `/permissions`. Git checkpoint before risky changes: `git commit --allow-empty -m "checkpoint" && git push`. Rollback: `git reset --hard <hash> && git push origin main --force`.

---

## Standing Cleanup / Watch Items

- **`updateSavedRecipe` shared by two flows** — test both the chat Update path and AddYourOwn whenever it changes (see Update vs Save-as-New).
- **Schema is dashboard-only** — no in-repo migrations. Cheap to fix now (export to a migration file), expensive to reconstruct later.
- A standing baseline of pre-existing TypeScript errors unrelated to feature work. Re-count with `bunx tsc --noEmit` before ever claiming a change introduced zero new errors — do not trust a documented figure; this count has drifted (31 → 40) and will again.
- Reusable loading-spinner / "Updating…" pattern from the grocery work is a good candidate to reuse wherever async waits show poor feedback (e.g. Occasions/Menus load flash).
- **`deleteSavedRecipe` swallows errors.** On failure it logs to `console.error` and returns — it never throws or returns a status. Its one caller (`AddYourOwn.tsx`) doesn't check a return value either, so a failed delete still closes the confirm modal and navigates away as if it had succeeded. Known, deliberately not fixed; out of scope if encountered incidentally — only fix it as its own deliberate task.
