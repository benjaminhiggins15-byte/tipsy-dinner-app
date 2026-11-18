# Tipsy Dinner — CLAUDE.md

Operational/technical truth for the codebase. Strategic status, roadmap, and
what-shipped-when live in the current-state doc — do NOT duplicate them here.
Per-screen visual spec: DESIGN_SPEC.md. Dishes & Menus detail:
docs/features/dishes-and-menus.md.

Last updated: November 2026

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

- **`normalizeStep()`** — every step reader routes through it (re-count callers if precision matters; do not trust a documented number — it has drifted before); legacy plain-string steps stay supported forever. Full detail: Recipe Step Titles in FEATURE_SPECS.md.
- **`sourceId`/`sourceTitle` always move together** — set, carried, cleared, and re-anchored together; never independently. Full detail: Update vs Save-as-New in FEATURE_SPECS.md.
- **Anchor severs on title mismatch** — case-insensitive, trimmed, exact-match only; deliberately biased toward severing, not fuzzy matching. Full detail: Update vs Save-as-New in FEATURE_SPECS.md.
- **`CropRect` is fractional (0–1), not absolute pixels** — never convert it to absolute pixel coordinates. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Photo path separation** — live photo `{userId}/{recipeId}.jpg` vs. share copy `{userId}/share-{token}.jpg`; no mutating function may ever construct a `share-`-prefixed filename. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **`photo_version` is a persisted cache-buster** — never replace with a render-time value like `Date.now()`. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Cook History reads from local `cookEvents` state**, not the `recipe` prop — otherwise live updates regress to stale data. Full detail: Cook History in FEATURE_SPECS.md.
- **Public bucket ≠ SDK access permitted** — a public CDN fetch bypasses RLS; the storage SDK always enforces it regardless of the bucket's public flag. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **`updateSavedRecipe` is a known trouble function** — shared by the chat-edit Update path and AddYourOwn; test both whenever it changes. Full detail: Update vs Save-as-New in FEATURE_SPECS.md.
- **`deleteSavedRecipe` returns `boolean`, not `void`** — callers MUST check it; a Postgres `DELETE` whose `WHERE` clause matches 0 rows returns success with no thrown error, so an unchecked call cannot distinguish a real delete from a silent no-op. Full detail: Menus & Recipe-Delete Hardening (Session, 2026-09-19) in FEATURE_SPECS.md.
- **`paddingBottom: 64` is hard-coded nav-bar clearance** — any new full-height bottom sheet must use `position: fixed; bottom: 64`, not `absolute; inset: 0`. Full detail: Architecture / SSR in CLAUDE.md (below).
- **Decode a downscaled preview for display, not the raw file** — `createImageBitmap({ resizeWidth: 1200 })`; a raw-file decode cost ~4.9s. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Tailwind Preflight's `img { max-width: 100% }` clamps rendered width** — fix with inline `maxWidth: "none"` on that element only. Full detail: Recipe Photos in FEATURE_SPECS.md.
- **Public share route is snapshot-first with a live fallback, and must stay chrome-free.** Full detail: Architecture / SSR in CLAUDE.md (below).
- **Ingredients are free-text strings, not structured `{amount, unit}`** — the AI normalizes on demand where structure is needed. Full detail: Data Layer in CLAUDE.md (below).
- **`clearRecipeCache` always drops `'__all__'`** — the View-all cache entry is invalidated on every mutation alongside the per-category key; never wire all-view invalidation at call sites. Full detail: View All Recipes in FEATURE_SPECS.md.
- **`buildSystemPrompt()` conversational-prompt behaviors are settled and hard-won** — culinary posture, cuisine-direction discovery, and no-superlatives voice. Reword only deliberately; treat like the Session-3 formatting house style. Full detail: Conversational System Prompt — Elevation & Discovery in FEATURE_SPECS.md.
- **Handle uniqueness is a hard DB-level guarantee, not app-enforced** — case-insensitive via the `profiles_handle_lower_idx` unique index on `lower(handle)`. Full detail: Account Identity in FEATURE_SPECS.md.
- **`display_name` is the single source of truth for a user's name; handles are derived silently, never prompted** — there is no handle-capture screen anywhere in the app. Full detail: Account Identity in FEATURE_SPECS.md.
- **The `profileInitialized` gate is shared infrastructure** — identity/signup logic (display_name backfill, silent handle derivation) is wired inside this existing gated block, not a second listener; do not disturb it when touching either. Full detail: Authentication in CLAUDE.md (below).
- **`recipe_sends` is two-party with a status-only-update trigger** — a `BEFORE UPDATE` trigger (not RLS — Postgres RLS can't restrict which columns change) rejects any recipient write that touches the snapshot, `sender_id`, `recipient_id`, `photo_url`, or `note`; verified by violation testing. Full detail: Account-to-Account Sharing — Build 2 in FEATURE_SPECS.md.
- **`connections`/`notifications` have no client INSERT policy — deny-all by design** — rows must be created through a trusted server-side path at send/save time, never a direct client insert. Full detail: Account-to-Account Sharing — Build 2 in FEATURE_SPECS.md.
- **`send_recipe_to_friend` is the trusted write path for sends** — a `SECURITY DEFINER` Postgres function is the ONLY way `recipe_sends`/`notifications` rows get created for a send; it bypasses RLS on write, so its own internal guards ARE the security boundary. Do NOT add a client-side insert path to these tables; do NOT weaken the in-function guards. Full detail: Account-to-Account Sharing — Build 3 in FEATURE_SPECS.md.
- **`send-{token}.jpg` is a THIRD immutable photo path case**, alongside live `{recipeId}.jpg` and share `share-{token}.jpg` above — keyed on a client-minted token resolved BEFORE the RPC call (the sender has no UPDATE policy on `recipe_sends` and the row's `photo_url` is trigger-immutable, so post-insert photo attachment is impossible by design). No existing function may construct a `send-` prefix. Full detail: Account-to-Account Sharing — Build 3 in FEATURE_SPECS.md.
- **Saving a received recipe is a THREE-ACTOR sequence** — client `saveRecipe` → SQL `finish_received_recipe_save` → service-role `copy-received-recipe-photo` Edge Function, in that fixed order, deliberately NOT atomic across DB+storage. Full detail: Account-to-Account Sharing — Build 4 (Session a) in FEATURE_SPECS.md.
- **`copy-received-recipe-photo` is the app's FIRST service-role Edge Function** — authorize-with-caller, act-with-admin; the pattern for all future service-role functions. Full detail: Account-to-Account Sharing — Build 4 (Session a) in FEATURE_SPECS.md.
- **`recipe_sends.saved_recipe_id` is settable exactly once** (null → a recipient-owned recipe id, never reassignable) — service role bypasses RLS but NOT triggers, so this holds even for the elevated photo-copy actor. Full detail: Account-to-Account Sharing — Build 4 (Session a) in FEATURE_SPECS.md.
- **`finish_received_recipe_save` (`SECURITY DEFINER`) is the only path that stamps `inspired_by`, forms the connection, sets `saved_recipe_id`, and flips status** — atomically, row-locked against a concurrent double-finish; connection ordering uses canonical `LEAST`/`GREATEST` of the two profile ids (the table's UNIQUE constraint alone would NOT catch a reversed-pair duplicate without this). Full detail: Account-to-Account Sharing — Build 4 (Session a) in FEATURE_SPECS.md.
- **`profiles` stays owner-only SELECT — `search_profiles`/`get_my_connections` are the ONLY way an authenticated user reads another user's profile data** (both `SECURITY DEFINER`, `authenticated`-only, both returning only `{id, display_name, handle}`, never a full row). Full detail: Account-to-Account Sharing — Send UI in FEATURE_SPECS.md.
- **`get_sender_names` is the ONLY sanctioned `sender_id`→display-name lookup.** Full detail: Account-to-Account Sharing — Receiving in FEATURE_SPECS.md.
- **The receive/save path is three steps in fixed order** — `saveReceivedRecipe` → `finish_received_recipe_save` → `copy-received-recipe-photo` (soft-fail). Callers must invalidate the cache via `clearRecipeCache` directly, not `finishSaveRecipe`'s inline clear. Full detail: Account-to-Account Sharing — Receiving in FEATURE_SPECS.md.
- **`connections` is first-class, canonical, and deduped** — one row per pair regardless of which side saved or how many times; this is the seed a future social feed reads from. Full detail: Account-to-Account Sharing — Receiving in FEATURE_SPECS.md.
- **The received recipe view must visually MATCH `RecipeCard`, but as a sibling, never fused into it** — built by hand-matching presentation, not by sharing the component (`RecipeCard` is itself a known-trouble file). Full detail: Account-to-Account Sharing — Receiving in FEATURE_SPECS.md.
- **The received-recipe shelf relocated off Home to a Recipes-tab pill; Home keeps only a small dark-green summary card, deliberately distinct from the (now live) suggestions carousel.** Full detail: Account-to-Account Sharing — Receiving in FEATURE_SPECS.md; visual spec in DESIGN_SPEC.md's Home and Recipes — Categories sections.
- **`get_suggested_recipe` is the ONLY client read path into deny-all `suggested_recipe_pool`** — scoped to any slice ever assigned to the caller (not date-scoped), grants explicitly revoked from `anon` (Postgres's default-privilege grant-to-anon gap bites here). Full detail: Suggested Recipes — Layer 4 (suggestions carousel) in FEATURE_SPECS.md.
- **Suggestion saves are deliberately connection-free** — plain `saveRecipe('ai', categoryId)`, never `saveReceivedRecipe`; no `inspired_by`, no connection, no notification. Full detail: Suggested Recipes — Layer 4 (suggestions carousel) in FEATURE_SPECS.md.
- **Occasion-window timing is DUPLICATED, not shared, and expires** — `chips.ts`'s tentpole timing is copied (not imported) into `compute-slice`; edit both. Thanksgiving/Super Bowl floating dates expire after 2027 — extend in both places before then. Full detail: Occasion-Aware Suggestions in FEATURE_SPECS.md.
- **`matrix-pipeline.mjs`'s existing-rows fetch MUST stay paginated** — do not remove it; above 1,000 pool rows the additive shortfall count silently breaks without it. Full detail: Suggested Recipes Pool — Layer 1 in FEATURE_SPECS.md.
- **Accepted dietary-checker flags (swap-policy + false-cognate rows) are DESIGNED to re-flag on every `--recheck-only` run** — do not "re-fix" a re-flagged row without first checking it isn't already a known accepted case. Full detail: Suggested Recipes Pool — Layer 1 in FEATURE_SPECS.md.
- **The dietary swap policy depends on the full ingredient line surviving display** — never truncate/summarize an ingredient string in a way that could drop an "or `<alternative>`" clause; that clause is the compliance proof. Full detail: Suggested Recipes Pool — Layer 1 in FEATURE_SPECS.md.
- **Onboarding's chat script writes `profiles` via the exact same setters as the old three-textbox flow, and gates the `generateTasteProfile` handoff on a real DB poll bounded by a single tunable ceiling** — never let it hang, and know `compute-slice`'s existing-slice short-circuit means a ceiling-timeout slice sticks for the rest of that day. Full detail: Onboarding — Conversational Flow in FEATURE_SPECS.md.
- **`profiles.allergies` structured Big-9 gate takes merge priority over the unchanged prose-based `deriveDietaryGates`, with a deterministic backstop for `unparsed:true` records** — fail-closed pool columns, suggested-recipes-only enforcement; `NULL` now also fails closed (`compute-slice` v8). Full detail: Structured Hard-Allergy Capture & Gate in FEATURE_SPECS.md.
- **A cached or fallback `user_recipe_slices` row is only served if its stored `gate_fingerprint` matches a freshly-computed one for the user's CURRENT `allergies`/`taste_profile`** — a mismatch forces a recompute (or no slice) instead of serving stale gates; `created_at` on that table is NOT recompute evidence (no `updated_at` column — it reflects the first insert for that `slice_date`, not the latest write). Full detail: Gate Fingerprint, Profile Allergy UI & Deterministic Confirmation in FEATURE_SPECS.md.
- **Build/cook-chat is separately hardened against hard allergens** — a prompt-level salience layer plus a deterministic `scanRecipeDraftForBig9` backstop (title+description+ingredients+step text) at the parse choke-point, bounded 3-attempt regenerate, null-profile fail-closed to all-nine. Full detail: Build/Cook-Chat Allergy Hardening in FEATURE_SPECS.md.
- **`compute-slice` Stage 2's narrowed-to-60 + 6-field-slimmed AI payload is a cost-down change with zero safety surface** — narrowing is a strict subset of the already Stage-1-gated candidate set (cannot introduce an ungated candidate), and dropping the 9 dietary boolean columns from what the AI sees changes nothing enforcement-wise, since the AI was never the enforcement layer for them — Stage-1 SQL + `validIds` filtering still do all real gating. Never re-add the booleans to this payload "for the AI to check." Full detail: Suggested Recipes — Layer 3 (assignment runtime) in FEATURE_SPECS.md.
- **A recipe with no `recipe_categories` row is invisible in every library view** — `getSavedRecipesAll`/`getSavedRecipesForCategory` inner-join it; every save path MUST assign a category (new accounts start with zero). Full detail: Share-to-Save / Discovered in FEATURE_SPECS.md.
- **Build's recipe preview is the shared component `ExpandedRecipeOverlay.tsx`** — reused as-is (Build-preserving optional-prop defaults) across Build, the Discovered-tile preview, and the logged-out share preview; extend it, don't re-style a new one. Full detail: Share-to-Save / Discovered in FEATURE_SPECS.md.
- **Design System detail (fonts, palette, nav, logo assets) now lives in DESIGN_SPEC.md, not CLAUDE.md** — CLAUDE.md no longer carries the app-wide design-system summary. Full detail: Design System in DESIGN_SPEC.md.
- **AI Layer's conversational-behavior detail (system-prompt building, recipe-parsing consolidation, recipe context injection, formatting house style, microcopy voice) moved out of CLAUDE.md's AI Layer section** — the model/API/streaming facts and the `ai-chat`/grocery-enrichment boundary warnings stay in CLAUDE.md. Full detail: AI Layer — Conversational Behavior in FEATURE_SPECS.md.
- **Build Conversation Persistence moved to FEATURE_SPECS.md** — Build state (`buildMessages`, `buildConversationHistory`, `buildCurrentRecipe`, etc.) lives at App level, not in Cook, and survives tab switches/nav/save. Full detail: Build Conversation Persistence in FEATURE_SPECS.md.
- **Chat from Recipe Card moved to FEATURE_SPECS.md** — `transferToRecipeChat` is the only sanctioned path from a saved Recipe Card into Build; RecipeCard has no closure access to App-level setters. Full detail: Chat from Recipe Card in FEATURE_SPECS.md.
- **Most Standing Cleanup / Watch Items bullets moved to FEATURE_SPECS.md** — only the genuinely universal ones (schema-is-dashboard-only, the TS-error-count-drift caution, the loading-spinner-reuse note, the Fraunces/Lazydog non-loading fact, and the A2A-sharing-items-live-elsewhere pointer) remain in CLAUDE.md. Full detail: Standing Cleanup — Relocated Items in FEATURE_SPECS.md.
- **`log_event()` (`SECURITY DEFINER`) is the ONLY write path into deny-all `user_events`** — `logEvent` (`src/lib/events.ts`) is fire-and-forget (never await/chain/gate control flow on it), props are IDs/small enums only, never free text or recipe content. Full detail: Behavior & Funnel Instrumentation (user_events) in FEATURE_SPECS.md.
- **Pairings non-negotiables: `alcohol_ok` NULL reads as no-alcohol everywhere; pairings/drink prefs never enter a share or send snapshot; the drink-carrier list stays separate from `ALLERGEN_SYNONYM_MAP`; `filterPairings` runs on every generated AND every cached set, never skipped.** Full detail: Pairings in FEATURE_SPECS.md.
- **`delete_user_account_data()` is the sole data-deletion step for account deletion — any new table holding a user reference must be added to both its deletion statements and its zero-rows verification block**, or that table's data silently survives account deletion forever. Full detail: Account Deletion in FEATURE_SPECS.md.
- **`runAllergyGatedGeneration` (inside `Cook`, App.tsx) is the ONLY path into Build recipe generation — never inline a new parse → scan → `setCurrentRecipe` sequence; a new input path gets its own `source` label.** The gate runs pre-preview only — there is no save-time re-check — so any future path that saves a recipe without first showing the gated preview must add its own scan. Full detail: Allergy Gate Consolidation in FEATURE_SPECS.md.
- **Voice input only ever calls `setInput` (`onChange`) — never `sendMessage`, never auto-send.** `CookInputBar`'s `voiceEnabled` prop (wired on Build's main input and the saved-recipe chat box) shares one `useVoiceRecording` hook; a transcript always lands in the box for the user to edit and send manually. Full detail: Voice Input (Build) in FEATURE_SPECS.md.

---

## Tech Stack

- React + TanStack Start + Vite
- Bun (local dev server only — **Vercel builds via npm/`package-lock.json`, NOT bun**; any dependency change must keep `package-lock.json` in sync)
- Supabase — auth, database, storage, edge functions. Client at `src/lib/supabase.ts`
- Nitro — Vercel deployment adapter
- Anthropic API — server-side via Supabase Edge Function `ai-chat` (key never in browser)
- OpenAI API — server-side via Supabase Edge Function `transcribe-voice` (voice-to-text only; key never in browser)
- Tabler Icons
- Fonts: Lazydog (display), Fraunces italic, Inter, Playwrite US Modern (logo assets only)

**Local dev:** `bun dev` from `~/Developer/tipsy-dinner-app` → localhost:8080 or 8081
**GitHub:** github.com/benjaminhiggins15-byte/tipsy-dinner-app
**Deployment:** Vercel, live at tipsydinner.com. Every push to main auto-deploys.

---

## Data Layer

**Supabase tables** (RLS enabled on all; owner-only unless noted):
- `profiles` — display_name, handle, palate, inspiration, constraints, onboarding_complete
- `recipes` — saved recipes; `is_public` bool + `share_token` for public links
- `ingredients` — one row per ingredient, with `sort_order` (separate table to enable ingredient search later)
- `categories`, `recipe_categories` (join — a recipe can be in many categories)
- `groupings`, `grouping_parts` — the Dishes & Menus data model (`kind` = `recipe`/`dish`/`menu`, immutable); `cook_posts` holds a frozen `grouping_snapshot` JSONB per post; `recipes.in_library` gates library visibility until promoted. Full detail: `docs/features/dishes-and-menus.md`.
- `occasions`, `menus`, `menu_recipes` — **retired (2026-11-13)**, superseded by `groupings`/`grouping_parts` above; tables remain in the DB, empty, pending a later cleanup pass
- `grocery_items` — grocery list rows (raw + AI-enriched fields), owner-only
- `grocery_list_shares` — frozen snapshots for public grocery share links; owner-write, no direct anon/authenticated read (see note below)
- `recipe_shares` — frozen snapshots for public recipe share links; owner-write, no direct anon/authenticated read (same pattern as `grocery_list_shares`; see Recipe Sharing in FEATURE_SPECS.md)
- `suggested_recipe_pool` — offline-generated recipe pool for a future suggestions feature; RLS deny-all, service-role-only, no live app read path yet. Full detail: Suggested Recipes Pool — Layer 1 in FEATURE_SPECS.md.
- `profiles.taste_profile` (text, nullable) — AI-generated prose interpretation of a user's onboarding answers, for a future Layer 3 consumer, not the user. Full detail: Suggested Recipes — Layer 2 in FEATURE_SPECS.md.
- `user_recipe_slices` — per-user, per-day 3-4 recipe slice computed by the `compute-slice` Edge Function; owner-only RLS, no shelf UI yet. Full detail: Suggested Recipes — Layer 3 (assignment runtime) in FEATURE_SPECS.md.

**Public share reads go ONLY through SECURITY DEFINER functions.**
`get_recipe_share_by_token`, `get_grocery_list_share_by_token`, and
`get_my_discovered_shares` are the sole read paths into `recipe_shares`/
`grocery_list_shares`. Never re-add an anon/public SELECT policy on either
table. Share tokens are `crypto.randomUUID()`. History: Recipe Sharing in
FEATURE_SPECS.md.

**Key schema decisions:**
- Ingredients stored as **free-text strings**, NOT structured `{amount, unit}`. Deliberate and load-bearing: fits the free-text nature of AI cooking ("a good glug of olive oil"); AI normalizes on demand where structure is needed. The AI is the bridge between free-text recipes and any feature that computes over ingredients (grocery, future pantry/nutrition/scaling). Full structured-storage migration is a trigger-gated option — revisit ONLY if a feature must compute across the whole library's quantities in *stored* form.
- `steps` is a JSONB array inside `recipes` (never searched independently). Each
  element is a `RecipeStep` (`string | { title, instruction }`) — see "Recipe Step
  Titles" in FEATURE_SPECS.md.
- Menu section canonical order (enforced in app code, not DB): apps → mains → sides → desserts → drinks.
- `recipes.photo_url` (text, nullable) predates the Recipe Photos feature and sat
  unused; `photo_version` (int4, not null, default 0) was added for that feature. See
  "Recipe Photos" in FEATURE_SPECS.md.
- **Cache trap: `source` (`'ai' | 'manual'`) is selected from the DB in both
  `getSavedRecipesForCategory` and `getSavedRecipesAll`, but silently dropped in
  the `.map()` that builds the cached `Recipe` object — it never reaches
  `recipesByCategory`. Do not assume `recipe.source` is available from the cache.

**PostgREST nested-embed gotcha:** when a table is embedded two levels deep (e.g.
`recipe_categories` → `recipes` → `cook_events`), ordering/selecting on it requires
the dotted foreign-table path (`recipes.cook_events`) — the bare name returns
PostgREST error `PGRST108` ("not an embedded resource in this request").

**Schema lives ONLY in the Supabase dashboard** — no in-repo migration files. Known
logged risk; follow the existing hand-applied-SQL convention when adding tables and
flag it. History: Account Identity in FEATURE_SPECS.md.

**Any write to the shared Supabase DB — including migration bookkeeping (e.g.
`supabase migration repair`) — requires founder approval first.**

---

## AI Layer

- Model: `claude-sonnet-4-5` via Supabase Edge Function `ai-chat` (`/functions/v1/ai-chat`)
- API key server-side only (`ANTHROPIC_API_KEY` in Edge Function env). Client sends the real caller's session access token, never the anon key — see the caller-auth convention below. Swapping LLM = one-line change in the edge function.
- Streaming implemented (SSE, word-by-word) via `parseSSEStream` in App.tsx
- `max_tokens` = 4096 (raised from 2048 to give the grocery enrichment call headroom; Anthropic bills only generated tokens, so no cost/behavior change for normal turns)
- Two modes: Brainstorm and Recipe. Never enter Recipe mode except on explicit user choice. Recipe card is never updated for technique/wine/tangent questions.

**`ai-chat` requires a signed-in caller (locked 2026-10-24) but is still not a
template for authenticated writes.** It now requires `verify_jwt = true` plus an
in-code `auth.getUser()` check on a caller-scoped client (anon key + forwarded
Authorization header) — the same convention as
`transcribe-voice`/`copy-received-recipe-photo`/`delete-account` — run before any
Anthropic call; a missing or invalid token gets a 401 and never reaches the model.
Beyond confirming a real session exists, it does no per-user authorization: no
row-level permission check, because it's a stateless AI proxy, not a writer of
protected tables. `send_recipe_to_friend` (Account-to-Account Sharing — Build 3 in
FEATURE_SPECS.md) is the app's FIRST `security definer` function and FIRST trusted
server-side write to protected tables; it deliberately does NOT follow `ai-chat`'s
pattern — it's called via `supabase.rpc(...)`, which carries the real caller's JWT,
so `auth.uid()` inside the function is the true authenticated sender.

**Convention: every call to `ai-chat` sends the real caller's session access
token, never the anon key.** Every client call site fetches it via
`getAccessToken()` (`src/tipsy/data.ts`) and sends it as the `Authorization:
Bearer` header; `compute-slice`'s own server-to-server call to `ai-chat` forwards
its caller's `Authorization` header unchanged rather than minting a new one or
using the anon key. Any new caller that doesn't follow this gets a 401 — there is
no anon-key fallback path.

**Voice transcription is a separate vendor, not a second `ai-chat`.**
`transcribe-voice` (Edge Function) calls OpenAI's `gpt-4o-transcribe`, not
Anthropic — `verify_jwt = true`, caller authenticated via `auth.getUser()` on
a caller-scoped client, same pattern as `copy-received-recipe-photo`. Key
lives only in the Supabase secret `OPENAI_API_KEY`, never in `ai-chat`'s env
or the client. Audio and transcripts are never stored or logged. Full
detail: Voice Input (Build) in FEATURE_SPECS.md.

**Grocery enrichment is a SEPARATE AI island.** `enrichGroceryItems` (data.ts) is a
structured JSON-in/JSON-out utility with its own prompt
(`GROCERY_ENRICHMENT_SYSTEM_PROMPT`, defined just above it). **Never merge, adapt
from, or share code with the conversational system prompt (`buildSystemPrompt`)** —
different purposes (structured utility vs. conversational voice); mixing risks both
contracts.

---

## Authentication

- Supabase Auth (`@supabase/supabase-js`). Client `src/lib/supabase.ts`. Screens `src/tipsy/SignUp.tsx`, `src/tipsy/SignIn.tsx`; slide transitions via `src/tipsy/AuthFlow.tsx`.
- Email/password + Google OAuth, both working. Email confirmation disabled (intentional). Profile auto-created on signup via Postgres trigger.
- Routing: no session → SignUp; session + `onboarding_complete` false → Onboarding; session + true → app shell, now opening on Home (see 2026-08-11 note above).
- Onboarding: three questions (palate, inspiration, constraints), each writes to `profiles`; loader sets `onboarding_complete` true.
- Signup persists `display_name` into `profiles` for both email/password and Google
  OAuth, and silently derives a unique `handle` alongside it for genuinely new
  profiles — no handle-capture screen. Full detail: "Account Identity" in
  FEATURE_SPECS.md.
- `getCurrentView()` has a fourth, logged-out `"shared-recipe"` state, for a
  stranger with no session on a share link. `PENDING_SHARE_TOKEN_KEY`
  (localStorage) carries the token through signup/sign-in, including the OAuth
  round-trip. Full detail: Share-to-Save / Discovered in FEATURE_SPECS.md.

**Duplicate SIGNED_IN event.** `onAuthStateChange` fires a duplicate SIGNED_IN when
the browser tab regains focus. A `profileInitialized` ref prevents re-running
profile/migration logic on subsequent events; it resets to false on logout so
re-auth works. (This was the root cause of the old tab-refocus state-reset bug.) The
`display_name` backfill and silent handle derivation (Account Identity,
FEATURE_SPECS.md) are wired inside this same gated block, not a second listener —
they inherit the tab-refocus guard for free. Any future identity/signup logic
belongs here too, not in a parallel listener.

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
`recipesByCategory[categoryKey]`. **`RecipePicker.tsx` also reads from this same
cache** (passed down as props) rather than fetching independently, which avoids a
refetch/flash on its known double-mount. Full double-mount mechanism: Recipe List
Cache (Option 2) — RecipePicker Double-Mount Detail in FEATURE_SPECS.md.

**ScreenStage tree.** Unified structure: the current screen always renders in the
same base-layer position; the outgoing screen renders as an overlay only during a
transition. (Previously alternated between two JSX shapes, causing unmount/remount on
every navigation.) NOTE: `paddingBottom: 64` (App.tsx ~lines 1669 & 1682) is
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
flow and app frame, snapshot-first with a legacy live fallback. **Must stay
chrome-free** (no in-app UI like the chat icon). Full detail: Recipe Sharing in
FEATURE_SPECS.md.

**"View in app" and share-to-save** are deliberately separate from the A2A send
system — no `recipe_sends`, `connections`, or `notifications` row for a
share-to-save. Full detail: Share-to-Save / Discovered in FEATURE_SPECS.md.

**Vercel quirks.** Nitro generates `.vercel/output` (gitignored); `config.json`,
`.vc-config.json`, and `tslib.es6.mjs` are written via a Nitro compiled hook in
`vite.config.ts`. Output dir: `.vercel/output`.

---

## Session Rules for Claude Code

- **NEVER use the Supabase service-role key or the GoTrue Admin API (including read-only lookups) without explicit founder approval in that session. All DB reads and writes go through `supabase db query --linked`. Auth-user deletions are done by the founder in the Supabase dashboard.** (This happened twice: once during a security check, once during the beta-gate cleanup.)
- Design decisions are made in Claude.ai first — never figure out design in Claude Code. Claude Code executes precise prompts and makes no decisions.
- Read CLAUDE.md at the start of every session. Ask for a plan before writing code.
- One clearly-scoped screen/task per session. Preserve existing functionality and data flow exactly unless explicitly told to change it.
- **Diagnose before fixing (hard rule).** Always a read-pass that changes nothing before concluding anything is broken. This is a Lovable-built, incrementally-extended codebase whose failure modes don't announce themselves — first-guess causes have repeatedly been wrong, and bugs have hidden behind bugs. Confirm before fixing.
- **Load-Bearing Contracts index — intake rule (keep the always-read file lean).** When a new contract is established, it enters the Load-Bearing Contracts index as a ONE-LINE POINTER only: contract name + the invariant in a single compact phrase + "Full detail: [section] in FEATURE_SPECS.md." The full explanation — mechanics, rationale, SQL guard lists, verification notes — lives ONCE, in the pointed-to FEATURE_SPECS section, never in the index. Two failure modes this prevents, both found in the Aug 2026 audit: (1) the index silently becoming a SECOND full home for a contract (detail duplicated in both files — it must exist in exactly one place); (2) a BACKWARDS reference, where the FEATURE_SPECS section says "see the CLAUDE.md bullet for detail" — detail must live in FEATURE_SPECS and be pointed TO from the index, never the reverse. Cross-cutting contracts (ones an unrelated session could break) stay indexed like all others; only their detail location differs. If CLAUDE.md crosses ~40k again despite this rule, revisit path-scoped rules (`.claude/rules/*.md`) as the next lever — but not before.
- **Text inputs must render at ≥16px font-size.** iOS Safari auto-zooms the viewport on focus of any input/textarea below that size; this has bitten production before (fixed by the "bump sub-16px inputs" hotfix, 2026-11-13). Check any new text input against this.
- **Shared sheets and toasts live in `src/tipsy/BottomSheet.tsx`** (`BottomSheet`, `Toast`, `DragHandle`, `SheetKeyframes`) — every sheet/toast in the app, including Dishes & Menus' (`AddPartSheet`, `SaveToSheet`, `LogGroupingCookSheet`, etc.), is built on these. Don't fork a new sheet/toast implementation.
- **After any change to the cook-posts/groupings DB schema, run the full post → unpost → re-post → save cycle locally before it reaches production.** `postCook`/`unpostCook` are reused generically across recipe-, dish-, and menu-kind posts, so a change aimed at one kind can silently break another.

**Branch workflow for risky/structural changes** (tipsydinner.com is live): work on a
branch → push → Vercel builds a preview → test on a real phone → merge to main only
once verified. **Gotcha:** Google OAuth redirects to PRODUCTION, so logging into a
branch preview needs a separate test account (real accounts bounce to production).
Keep one test account around — but be deliberate about which account you're in when
diagnosing: stray test accounts have twice caused identity-mismatch confusion (a
"delete bug" and a menu-save failure that were both session-identity artifacts, not
code defects).

**Phone-specific UI changes (iOS keyboard, safe-area, viewport/zoom, scroll-lock, etc.)
always get a Vercel preview + real-phone test before merging** — even small, isolated
changes; desktop browser testing has repeatedly missed iOS-only regressions (the
November 2026 keyboard-sheet/scroll-lock/LogCookTypePicker hotfixes).

- Auto-approve edits: `/permissions`. Git checkpoint before risky changes: `git commit --allow-empty -m "checkpoint" && git push`. Rollback: `git reset --hard <hash> && git push origin main --force`.

---

## Standing Cleanup / Watch Items

- A standing baseline of pre-existing TypeScript errors unrelated to feature work. Re-count with `bunx tsc --noEmit` before claiming a change introduced zero new errors — do not trust a documented figure, it has drifted before. Baseline as of 2026-11-14 (`main` HEAD `ba5e4ff`): 4. Not noise by default — treat each as a possible real bug until checked. Drift history and a past baseline-error-that-was-real-bug case: Menus & Recipe-Delete Hardening in FEATURE_SPECS.md.
- **Correction:** there is no reusable loading-spinner component. `Spinner.tsx` exists but has zero imports anywhere in the app (dead code). The "Updating…" pattern is inline in `GroceryList` (`App.tsx`), not a shared component — reusing it elsewhere (e.g. Occasions/Menus load flash) means copying the inline pattern, not importing something.
- Account-to-account sharing's own standing cleanup/watch items live in their respective FEATURE_SPECS.md build sections, not here.
- **Fraunces italic renders as generic serif app-wide, and Lazydog renders as its plain fallback — neither font's stylesheet/`@font-face` is actually wired.** Closed by decision 2026-09-20, not a bug to re-discover: known fix path is adding a Fraunces `<link>` next to the existing Inter one in `src/routes/__root.tsx`, and a `@font-face` block for `src/fonts/lazydog.ttf`; out of scope until a session deliberately picks it up. Every "Fraunces italic"/"Lazydog" instruction elsewhere in this doc is aspirational until then. See Fonts in Design System.
- **Silent-success bug class: an operation reports success (no thrown error) while doing nothing or the wrong thing.** Current known instances: 5 `data.ts` delete helpers (`deleteCustomCategory`, `deleteOccasion`, `deleteMenu`, `removeRecipeFromMenuSection`'s delete, `clearGroceryItems`) don't check affected-row count and don't return a boolean; `ai-chat`'s `llm_usage` insert trusts a client-supplied `userId` instead of the verified JWT identity; a recipe delete never sweeps its own hero photo (`{recipeId}.jpg`) from storage. Full detail: Menus & Recipe-Delete Hardening and AI Layer — Conversational Behavior in FEATURE_SPECS.md.
- **Un-awaited-async bug class: a fire-and-forget promise/IIFE where later code isn't ordered after it resolves.** Current known instances: `handleChipClick`'s un-awaited IIFE around `runAllergyGatedGeneration` (App.tsx); the historical `Occasions.tsx` un-awaited `saveOccasion` call (fixed 2026-09-24, merge `d62b107`, kept as a cautionary case). Full detail: Allergy Gate Consolidation and Menus & Recipe-Delete Hardening in FEATURE_SPECS.md.
