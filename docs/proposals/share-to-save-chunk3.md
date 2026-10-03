# Chunk 3 — Share-to-Save: "Discovered" Shelf (REDESIGN, proposal only)

Status: **proposal only. Nothing applied, nothing deployed, no client code
written.** This replaces the earlier claim/attach/finish lock-table design.
That design was approved, partially implemented (migration + edge function
files updated, migration-history bookkeeping repaired), and then stopped
before anything was applied, because Step B's pre-build check 11 found that
saving with no category makes a recipe invisible everywhere a user can
browse their library — see `docs/proposals/share-to-save-chunk3-results.md`
for that investigation. The founder then redesigned the product behavior
itself rather than patching around the gap. This document describes the new
design from scratch.

---

## What changed, product-level

**No silent auto-save.** The old design saved the recipe automatically (with
no category) the moment onboarding/sign-in finished, then tried to recover
from the resulting invisible-recipe problem after the fact. The new design
never saves automatically. A shared recipe a user is about to discover sits
in a new **"Discovered"** section on Home — a sibling to the existing "Sent
to you" tile, same dark-green compact-card visual pattern, rendered only
when a pending discovery exists. Tapping it opens a recipe preview (title,
ingredients, steps, photo); tapping Save routes through the app's **standard
save flow**, including the real category picker. The category-invisibility
bug is structurally impossible in the new design, because a Discovered save
can never skip category selection — check 11 is moot, not patched.

**Attribution is a user choice made at share time, not a default.** A "Show
my name" switch is added to the share action, default ON, remembering the
sharer's last choice. Off means no name anywhere — not on the public page,
not on the Discovered tile, and no `inspired_by` stamp on the saved recipe.
The previously-considered "Inspired by others" auto-category idea is
dropped entirely.

**The A2A friend-sharing system is untouched.** No `recipe_sends` row, no
`connections` row, no `notifications` row, no `saveReceivedRecipe` call, for
any part of this feature. A public-share discovery gets its own save
handler built on plain `saveRecipe()` + a new attribution-stamp RPC + the
existing soft-fail photo-copy pattern.

---

## Full schema change list

1. **`profiles.share_show_name`** (new column) — `boolean not null default
   true`. Persists the sharer's last "Show my name" choice as the default
   shown next time they share. **Write-safety confirmed:** every existing
   `profiles` UPDATE path (`App.tsx` profile upsert helper ~line 704,
   `Onboarding.tsx`'s `safeUpdate`/`onUpdate` calls, `Profile.tsx`'s field
   editors, the `taste_profile` writer in `data.ts` ~line 206) writes a
   named-column `.update({...})` or a `Partial`-spread `.upsert(...,
   {onConflict: 'id'})` — none replace the full row, so none can null out a
   column they don't mention. A freshly-inserted profile (new-signup upsert,
   `App.tsx` ~line 674) also doesn't list this column, so it lands on the
   `DEFAULT true` cleanly. No onboarding/profile-edit write path needs any
   change for this column to be safe.
2. **`shared_recipe_discoveries`** (new table, replaces the old
   `shared_recipe_saves` lock table) — `id, user_id, share_token, recipe_id,
   status ('pending'|'saved'|'dismissed'), created_at, updated_at`, unique
   on `(user_id, share_token)` and on `recipe_id`. Owner-select-only RLS, no
   client write policy — every write goes through the functions below.
3. **`record_shared_recipe_discovery(p_share_token text)`** (new function,
   replaces `claim_shared_recipe_save`) — idempotent insert-or-ignore of a
   pending row. Silently no-ops on an unknown/deleted token. No locks, no
   staleness window, no "newly claimed" return value — it's a fire-and-
   forget call, not a concurrency primitive.
4. **`finish_shared_recipe_save(p_share_token text, p_recipe_id uuid)`**
   (rewritten, folds in what `attach_shared_recipe_save` used to do) —
   called once, right after a standard `saveRecipe()` succeeds. Self-
   sufficient: upserts the discovery row itself (works even if step 3 never
   ran for this token), then stamps `inspired_by_id`/`inspired_by_name`
   unless the share is gone, it's a self-share, or the snapshot's
   `showSharer` is explicitly `false`.
5. **`dismiss_shared_recipe_discovery(p_share_token text)`** (new) — marks a
   still-`pending` row `dismissed`, mirroring the existing "Sent to you"
   dismiss affordance (`dismissReceivedRecipe`, which updates
   `recipe_sends.status`). `record_shared_recipe_discovery` (item 3) is the
   resurrect path: re-discovering a `dismissed` share, or a `saved` share
   whose recipe has since been deleted (`recipe_id` gone null via this
   table's `on delete set null` FK), flips it back to `pending` instead of
   staying stuck. A `saved` row whose recipe still exists is left alone —
   re-opening the same link is a no-op once it's genuinely saved.
6. **`attach_shared_recipe_save`** — removed. Its job is now inside
   `finish_shared_recipe_save`'s upsert.
7. **`claim_shared_recipe_save`** — removed, replaced by item 3.

All four functions/table keep the same security posture as the rest of the
app's trusted-write surface: `SECURITY DEFINER`, `search_path = public`,
`revoke all ... from public` followed by `grant execute ... to
authenticated` (no `anon` access).

**`copy-shared-recipe-photo` edge function** — unchanged shape
(authorize-with-caller, act-with-admin, server-derived source path, soft-
fail no-photo, retry-on-copy-failure, fresh-read-then-increment
`photo_version`). Only its ownership check is re-keyed: it now looks up
`shared_recipe_discoveries` (not `shared_recipe_saves`) and additionally
requires `status = 'saved'`, so the function structurally cannot run ahead
of the stamp step, not just by client call-order discipline.

---

## Size comparison to the old design

The old migration had a table with two unique constraints doubling as a
concurrency lock, a `claim` function with staleness-window check-and-steal
logic (atomic `UPDATE ... WHERE updated_at < stale_before RETURNING`), a
separate `attach` function with `GET DIAGNOSTICS ROW_COUNT` zero-row
detection, and a `finish` function — four moving parts plus a client-side
resume/retry story for a dropped connection mid-claim. The new design has
one table (no lock semantics, just a status enum), one small `record`
function (no return value, no steal logic), one `dismiss` function, and one
`finish` function that now does the attach step itself via a single
`ON CONFLICT` upsert. No staleness window, no stale-claim stealing, no
"newly_claimed" signaling back to the client, no resume logic needed on the
client at all — the old design's entire concurrency story existed to make
an *automatic* save safe against double-firing; once the save is a single
explicit user tap through the standard flow, that problem doesn't exist,
because the standard save flow's own `saving`-boolean button-disable guard
(see below) already prevents a double-tap the same way every other save in
the app does.

---

## Client changes (prose only — no code written yet)

- **`shareRecipeSnapshot(recipeId)` → `shareRecipeSnapshot(recipeId,
  showSharer)`** (`data.ts`): accepts the toggle's chosen value, always
  writes a `showSharer: boolean` key into the snapshot JSON going forward
  (not conditionally omitted — so future reads can tell "new share, name
  hidden" apart from "legacy snapshot, field never existed"), still omits
  `sharerName` entirely when unavailable or when `showSharer` is false, and
  persists the choice back to `profiles.share_show_name` so the next share
  defaults to it.
- **Share-action UI**: add a "Show my name" switch wherever the share action
  currently lives, initialized from `profiles.share_show_name`, passed
  through to `shareRecipeSnapshot`.
- **Public share page** (`SharedRecipeView.tsx` / `r.$token.tsx`): any
  "inspired by {sharerName}" line must only render when `showSharer !==
  false` and a name is present. Exact current render location to be
  reverified at implementation time, not assumed here.
- **`RecipeShareSnapshot` type** (`data.ts`): add `showSharer?: boolean`
  alongside the existing optional `sharerName`.
- **Onboarding Loader** (`Onboarding.tsx`): replace the previously-planned
  claim/attach/resume logic with one best-effort step — if
  `PENDING_SHARE_TOKEN_KEY` is set, call `record_shared_recipe_discovery`
  (non-blocking relative to `HANDOFF_MAX_WAIT_MS`), then clear the
  localStorage key regardless of outcome. No polling, no retry.
- **Home.tsx mount effect**: for an already-signed-in user tapping a share
  link ("View in app" / logged-in save — the old chunk 4 plan), read
  `PENDING_SHARE_TOKEN_KEY` on mount the same way, call
  `record_shared_recipe_discovery`, clear the token, refresh the Discovered
  list.
- **New `getPendingDiscoveredRecipes()` helper** (`data.ts`, modeled on
  `getPendingReceivedRecipes()`): reads the caller's `pending`
  `shared_recipe_discoveries` rows ordered by `created_at desc`, then
  hydrates title/photo/sharerName/showSharer for the most recent ones via
  `recipe_shares` (already anon-readable by token, so no new read policy
  needed). Unlike `recipe_sends`, `shared_recipe_discoveries` does not store
  its own copy of the recipe content — it's intentionally just a pointer —
  so this helper does the join client-side.
- **Home.tsx "Discovered" section**: new section at the **top of Home,
  above "Jump in"** — rendered only when at least one `pending` discovery
  exists, newest first. "Sent to you" is unaffected and stays in its
  current position. Tile copy: name shown → `"from {sharerName}"` (matches
  the "Sent to you" tile style exactly); name hidden (`showSharer === false`
  or no name captured) → a quiet `"tap to save"` subline instead, no
  fabricated placeholder name. Tap opens a preview by reusing
  `ExpandedRecipeOverlay` with `photoUrl` set (same component Phase C
  already extended, same way `SharedRecipeView` uses it) — no new preview
  wrapper, since the existing prop surface already covers this case. Save
  action opens the existing `SaveRecipeFlow` category picker, same as every
  other save entry point.
- **Discovered dismiss**: mirrors `dismissReceivedRecipe` (`data.ts`
  ~line 2040, which updates `recipe_sends.status`) — a `dismissDiscovered
  Recipe(shareToken)` helper calling `dismiss_shared_recipe_discovery`,
  wired to whatever dismiss affordance "Sent to you"/`ReceivedRecipeView`
  uses today (`handleDismiss`, Home.tsx ~line 798).
- **Discovered save handler**: mirrors the shape of the existing
  `handlePickCategory` handlers (Home.tsx) used for received/suggested
  saves — `setTrayOpen(false)` → `setSaving(true)` → `saveRecipe(toSave,
  'manual', catKey)` → `finish_shared_recipe_save(token, newRecipeId)` →
  soft-fail `copy-shared-recipe-photo` → `clearRecipeCache(catKey)` →
  close. `source: 'manual'` matches what `saveReceivedRecipe` already
  passes for received saves (`data.ts` ~line 1985) — no new `source` value,
  no constraint change. **Double-tap protection**: reuses the exact same
  `saving`-boolean + `disabled={saving}` button-guard pattern already used
  by every other save handler on Home — no new mechanism needed.

---

## Resolved design decisions

1. **`recipes.source`** — reuse `'manual'`, the same literal
   `saveReceivedRecipe` already writes for received-recipe saves. No new
   value, no constraint change needed.
2. **Dismiss** — ships, mirroring the existing "Sent to you" dismiss
   mechanism 1:1 (status flip via a `SECURITY DEFINER` function, same
   trigger-free pattern). Resurrect behavior on re-discovery is handled
   inside `record_shared_recipe_discovery` itself (see schema item 3/5
   above): `dismissed` → back to `pending`; `saved` with `recipe_id` gone
   null (recipe deleted) → back to `pending`; `saved` with the recipe still
   present → no-op.
3. **Placement** — Discovered renders at the top of Home, above "Jump in,"
   only when pending items exist, newest first. "Sent to you" keeps its
   current position unchanged.
4. **Name-hidden tile copy** — `"tap to save"` subline when the name is
   hidden or absent; `"from {sharerName}"` when shown, matching the
   existing "Sent to you" tile exactly.
5. **Preview** — reuses `ExpandedRecipeOverlay` (with `photoUrl`) and the
   standard `SaveRecipeFlow` category-picker flow as-is. No new preview
   wrapper component.

---

## Violation tests (updated; none run yet — list only)

1. `record_shared_recipe_discovery` called twice for the same
   (user, token) — second call is a no-op, no duplicate row, no error.
2. `record_shared_recipe_discovery` called with an unknown/deleted token —
   no row created, no exception.
3. `finish_shared_recipe_save` called for a recipe not owned by the caller
   — raises.
4. `finish_shared_recipe_save` called when no prior pending record exists
   for that (user, token) — succeeds anyway, creates the row directly as
   `'saved'` (proves the self-sufficient upsert works, not just the
   happy path where step 3 ran first).
5. `finish_shared_recipe_save` with the snapshot's `showSharer: false` —
   stamp skipped, `inspired_by_id`/`inspired_by_name` stay null, no
   profile-name fallback applied.
6. `finish_shared_recipe_save` with a legacy snapshot missing the
   `showSharer` key entirely — stamp applied via the existing
   sharerName-then-profile-display_name fallback.
7. `finish_shared_recipe_save` for a self-share (sharer id = saver id) —
   stamp skipped regardless of `showSharer`.
8. `finish_shared_recipe_save` when the underlying `recipe_shares` row is
   gone (deleted share / cascaded sharer account) — stamp skipped, row
   still marked `'saved'`, no exception; recipe is never stranded.
9. `copy-shared-recipe-photo` invoked before `finish_shared_recipe_save`
   has run for that (caller, token, recipe_id) — rejected 403, proving the
   `status = 'saved'` check enforces call order at the edge-function layer,
   not just by client discipline.
10. `copy-shared-recipe-photo` invoked by a different authenticated user
    than the discovery row's owner — rejected 403.
11. Anon/public role cannot execute `record_shared_recipe_discovery`,
    `finish_shared_recipe_save`, or `dismiss_shared_recipe_discovery`
    directly (PUBLIC/anon revoked, `authenticated`-only granted) — verified
    via a direct `supabase.rpc()` call using only the anon key.
12. `dismiss_shared_recipe_discovery` on an already-`saved` row — no-op,
    status stays `'saved'` (the function only touches `'pending'` rows).
13. `record_shared_recipe_discovery` called again on a `dismissed` row for
    the same (user, token) — flips back to `pending`.
14. `record_shared_recipe_discovery` called again on a `saved` row whose
    `recipe_id` has gone null (recipe deleted) — flips back to `pending`.
15. `record_shared_recipe_discovery` called again on a `saved` row whose
    `recipe_id` still points at a live recipe — no-op, stays `saved`.

---

## Funnel hooks (locations only, comments not yet written)

Same four funnel-hook comment locations as the old design's plan, now
re-scoped to the new flow: share-link landing (public page view),
`record_shared_recipe_discovery` success (discovery recorded), Discovered
tile tap (preview opened), and `finish_shared_recipe_save` success (save
completed). Exact file:line placement to be finalized once the client code
is written, not at proposal stage.
