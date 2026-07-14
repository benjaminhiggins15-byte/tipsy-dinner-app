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
Rules: cream on green for text directly on background; user bubbles cream bg + green text; AI text cream Fraunces italic on green (no bubble); CTAs cream bg + green text; no red/orange/coral/terracotta. Bottom sheets (delete-confirm modals, the Cook History log/edit sheet) are light `#FAF7F2`, not a green — confirmed by grep, zero `#182800` bottom sheets exist anywhere in the codebase.

**Universal gradient** — behind every screen except splash:
```css
background: linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%);
height: 420–480px; position: absolute; top:0; left:0; right:0;
z-index: 0; pointer-events: none;
```
Content sits above at z-index 1. Gradient fades into base green — no hard edges.

**Logo assets** (`src/Logos/`) — path is case-sensitive on Linux/Vercel:
- `Full_Logo.png` — full "tipsy DINNER" wordmark. Splash screen only.
- `watermark_square.png` — square tD monogram. Build top-left + mini player.
- `watermark_circle.png` — circular tD monogram. Available if needed.
```js
import tDSquare from '../Logos/watermark_square.png'
import fullLogo from '../Logos/Full_Logo.png'
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

**Key schema decisions:**
- Ingredients stored as **free-text strings**, NOT structured `{amount, unit}`. Deliberate and load-bearing: fits the free-text nature of AI cooking ("a good glug of olive oil"); AI normalizes on demand where structure is needed. The AI is the bridge between free-text recipes and any feature that computes over ingredients (grocery, future pantry/nutrition/scaling). Full structured-storage migration is a trigger-gated option — revisit ONLY if a feature must compute across the whole library's quantities in *stored* form.
- `steps` is a JSONB array inside `recipes` (never searched independently). Each
  element is a `RecipeStep` (`string | { title, instruction }`) — see "Recipe Step
  Titles" below.
- Menu section canonical order (enforced in app code, not DB): apps → mains → sides → desserts → drinks.

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
pattern) instead of `absolute + inset: 0`. Any new full-height bottom sheet should use
the same `fixed` pattern from the start. Someday cleanup: make the nav-bar clearance
not hard-coded so this class of bug can't recur.

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
flow and outside the app frame. Server loader + `getPublicRecipeByToken(token)`
(fetches recipe + ingredients, no `user_id` filter, relies on RLS). Two anon-read
policies (`recipes_select_public`, `ingredients_select_public`) gated to `is_public =
true`, OR'd with owner-only policies. Tokens minted via `crypto.randomUUID()`, reused
for stable links. **Must stay chrome-free** (no in-app UI like the chat icon).

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

`RecipeDraft` carries an optional `sourceId?: string`, set in `transferToRecipeChat`
from the source recipe's id when a saved recipe is loaded via chat-from-recipe. All
three AI call sites copy `sourceId` forward onto each newly-parsed recipe so it
survives repeated AI edits. `sourceId` is internal state only — NOT in `recipeToXML`,
NOT sent to the AI.

At save: if `sourceId` is present, the save sheet shows a two-button choice (Update
[name] / Save as new) instead of the category picker; absent → normal flow. **Update**
overwrites in place via `updateSavedRecipe`, keeps categories, re-anchors `sourceId`
to the same recipe. **Save-as-new** inserts via `saveRecipe` and deliberately leaves
`sourceId` on the original base, so multiple siblings can be spun off one base in a
single chat (swappable F&F bet). Edge case: origin deleted mid-chat → silent fallback
to save-as-new.

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

## Grocery List

Live in production (three phases: surface + data + dumb combining; AI enrichment;
snapshot sharing). No 5th nav tab — entry is a cart icon on the Recipes/Categories
header plus an "add to grocery list" button on RecipeCard. All schema hand-applied
via the Supabase dashboard (no migration files).

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
'checked')`, `enrichGroceryItems` (isolated AI island — see AI Layer),
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
skips it will render `[object Object]`. Five readers exist today, all compliant:
Recipe Card STEPS tab (App.tsx — collapsible accordion rows); `ExpandedRecipeOverlay`
(App.tsx — the Recipe Preview sheet from the Build mini-player, flat, title
prepended); `AddYourOwn.tsx` and its `PreviewCard` (Write Your Own editor); `src/routes/r.$token.tsx` (public shared route — flat, title prepended, deliberately
not collapsible); `recipeToXML` (App.tsx — serializes steps for the AI).

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
when absent). This parsing logic is duplicated across the three former
system-prompt call sites (see AI Layer) — parsing was not part of that
consolidation, only the prompt-building was.

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
- ~31 pre-existing TypeScript errors across app files (unrelated to recent work) — batch into one cleanup pass someday.
- Reusable loading-spinner / "Updating…" pattern from the grocery work is a good candidate to reuse wherever async waits show poor feedback (e.g. Occasions/Menus load flash).
