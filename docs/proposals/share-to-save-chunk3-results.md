# Chunk 3 — Step B Results

**Status: migration applied, edge function deployed, live violation tests
15/15 PASS, teardown complete. Client code (Step B(c)) complete, type-checked,
built, committed (`8e6b519`), pushed to `feature/share-to-save`. Independently
re-verified against live state 2026-10-03 (see "Step B(c) + independent
re-verification" below) — not phone-tested yet.**

Everything below the "Superseded" marker documents the OLD claim/attach/finish
lock-table design (check 11's uncategorized-recipe finding from that round led
to the full redesign described in `share-to-save-chunk3.md`). It's kept for
history, not current truth. The new sections below pick up from there with the
redesigned migration that's now actually live.

---

## Step B(a)/(b) — redesigned migration: applied, deployed, tested (current)

**Applied:** `supabase/migrations/20261002000001_shared_recipe_save.sql` via
`supabase db push`. Confirmed live via `supabase migration list` (version
`20261002000001` matched on both Local and Remote). No prior migration-history
repair was needed this round — the remote bookkeeping was already clean from
the repair done during the old design's pre-flight (see below).

**Deployed:** `supabase/functions/copy-shared-recipe-photo/index.ts` via
`supabase functions deploy copy-shared-recipe-photo`, re-keyed to check
`shared_recipe_discoveries.status = 'saved'` (the new table) instead of the
old claim-table shape.

### Live violation tests — 15/15 PASS

Executed directly against production via throwaway accounts (Admin API) and
service-role REST fixtures: a "sharer" profile, a "saver" profile, 6
`recipe_shares` rows (snapshot JSON only — no backing recipe needed for the
sharer side), 6 recipes owned by the saver (to satisfy `finish_shared_recipe_save`'s
ownership check) + 1 owned by the sharer (self-share case), and one real
1x1 PNG uploaded to the sharer's `share-{token}.jpg` path.

| # | Test | Result |
|---|------|--------|
| 1a | anon cannot execute `record_shared_recipe_discovery` | PASS — rejected |
| 1b | anon cannot execute `dismiss_shared_recipe_discovery` | PASS — rejected |
| 1c | anon cannot execute `finish_shared_recipe_save` | PASS — rejected |
| 2 | user cannot read another user's `shared_recipe_discoveries` rows | PASS — RLS owner-select-only holds |
| 3 | `finish_shared_recipe_save` on a recipe the caller doesn't own | PASS — rejected ("recipe not found or not owned by caller") |
| 4 | `showSharer: false` → no stamp, no profile-name fallback | PASS |
| 5 | legacy snapshot (no `showSharer` key) → stamped, sharerName preferred, profile `display_name` fallback when sharerName absent | PASS |
| 6 | self-share (sharer = saver) → no stamp | PASS |
| 7 | deleted `recipe_shares` row → save succeeds, no stamp, no exception | PASS |
| 8 | re-discovery resurrects `dismissed` → `pending` | PASS |
| 9 | re-discovery resurrects `saved` with `recipe_id` gone null (post-delete `on delete set null`) → `pending` | PASS |
| 10 | re-discovery is a no-op for a `saved` row whose recipe still exists | PASS |
| 11 | `dismiss_shared_recipe_discovery` never un-saves a `saved` row (only touches `pending`) | PASS |
| 12a | `copy-shared-recipe-photo` rejects a call before `finish_shared_recipe_save` has run (no matching `status='saved'` discovery row) | PASS — 403 |
| 12b | `copy-shared-recipe-photo` rejects a call for a recipe the caller doesn't own | PASS — 403 |
| 12c | `copy-shared-recipe-photo` full success path: copies correctly, patches `recipes.photo_url`/`photo_version`, leaves the source byte-identical | PASS — verified by hash |

Test 12c was independently re-verified this session, including the one piece
left open mid-run: source object re-fetched and re-hashed post-copy
(`431ced69...` — unchanged from the pre-copy hash), destination object fetched
and hashed (same `431ced69...`, matching the original 1x1 PNG fixture
byte-for-byte), and `recipes.photo_url`/`photo_version` independently
confirmed via a direct service-role read (not just trusting the function's
JSON response).

The `shared_recipe_discoveries` table's final pre-teardown state (9 rows) was
internally consistent with every resurrect/status test above — e.g. the row
for the "deleted recipe" test showed `status='pending', recipe_id=null` after
the backing recipe was deleted and re-discovery ran, exactly as designed.

### Teardown — exact accounting

**Created during testing:**
- 2 auth users (sharer `18c2ed67-dcd2-4be6-a570-cb920671ded5`, saver
  `397a4f32-ed7f-4145-9d71-ffe45e9a7326`) + their auto-created `profiles` rows
- 6 `recipe_shares` rows (1 more existed transiently and was deleted mid-test
  to simulate the "deleted share" case before teardown)
- 7 `recipes` rows (1 — the "deleted recipe" test fixture — was already
  deleted mid-test as part of test 9, leaving 6 live at teardown time)
- 9 `shared_recipe_discoveries` rows
- 2 storage objects: `{sharer}/share-{token}.jpg` (source) and
  `{saver}/{recipeId}.jpg` (copy destination)

**Deleted, in this order:** both storage objects (explicit delete, not
cascade) → both auth users via Admin API (cascades `profiles` →
`recipes`/`recipe_shares`/`shared_recipe_discoveries` via existing `on delete
cascade` FKs).

**Post-teardown verification (all re-queried, all empty):** `profiles`,
`recipe_shares`, `recipes`, `shared_recipe_discoveries` scoped to both test
user ids — 0 rows each; storage list under both user-id prefixes — 0 objects
each; `auth.admin.listUsers` filtered to the sharer id — 0 users. Nothing
test-related remains in the production database or storage bucket.

---

## Superseded — old claim/attach/finish design (historical record only)

Status: **paused after pre-build checks 7 and 11, per explicit stop-and-report
instructions.** Nothing has been applied to the remote database, no function
has been deployed, and no client code has been written. Migration history
bookkeeping (see below) is the only remote-affecting action taken so far, and
it changed no schema.

---

## Pre-flight: migration history repair (not a schema change)

Before anything else, `supabase migration list` showed four local migration
files not recorded in the remote migration-history table:
`20260822000001`, `20260823000001`, `20260906000001`, `20260923000001`. This
is the known dashboard-applied-schema drift described in CLAUDE.md, not new
breakage. Verified via REST (`user_recipe_slices.pick_details`,
`user_recipe_slices.gate_fingerprint`, `profiles.allergies`,
`get_suggested_recipe`) that all four migrations' schema already exists live
on the remote DB — confirmed, not assumed. Ran
`supabase migration repair --status applied <those 4 versions>`, which only
updates Supabase's bookkeeping table to reflect reality; it executes no SQL
against the schema itself. This was necessary so that applying the new
`20261002000001` migration (step c, not yet run) via the CLI wouldn't also
attempt to blindly re-run those four already-live migrations and fail on
"column already exists" / similar conflicts.

---

## Step B(a) — Migration/edge-function diff from the approved proposal

**`supabase/migrations/20261002000001_shared_recipe_save.sql`:**
1. Staleness window: `interval '20 seconds'` → `interval '60 seconds'` in
   `claim_shared_recipe_save`.
2. `finish_shared_recipe_save`: the `if v_sharer_id is null then raise
   exception 'share not found'` block was removed. The sharer-stamp block is
   now guarded by `if v_sharer_id is not null and v_sharer_id <> v_user_id`
   — a missing `recipe_shares` row (deleted share, or sharer account
   cascaded away) now just skips the stamp and falls through to mark the
   claim `'saved'`, instead of raising. `not authenticated`, `not owned`, and
   `no matching claim` still raise unchanged.
3. `attach_shared_recipe_save`: added `get diagnostics v_updated =
   row_count` after the `UPDATE`; if zero rows were affected, it now checks
   whether the claim already has this exact `recipe_id` attached (harmless
   repeat → success) and otherwise raises `'no claim to attach to, or a
   different recipe_id is already attached'`. Previously a zero-row update
   was a silent no-op.
4. Added `revoke all on function ... from public;` immediately before each
   of the three `grant execute ... to authenticated;` lines. Functions
   default to `PUBLIC` execute on creation; this closes that off explicitly
   (removes `anon` access) before granting only to `authenticated`.
5. `claim_shared_recipe_save`'s `'share not found'` raise is unchanged
   (still raises; the client treats this one as terminal).
6. Removed the "PROPOSAL ONLY — NOT APPLIED" header comment (no longer
   accurate once this doc exists as the tracking record).

**`supabase/functions/copy-shared-recipe-photo/index.ts`:** no functional
change. Removed the "PROPOSAL ONLY — NOT DEPLOYED" header comment only.

**`supabase/config.toml`:** added a `[functions.copy-shared-recipe-photo]`
block (`enabled = true`, `verify_jwt = true`), matching
`copy-received-recipe-photo`'s existing entry. This wasn't in the original
proposal (the proposal didn't include config registration) but is required
for `supabase functions deploy` to pick up the new function with the correct
JWT-verification setting.

---

## Step B(b) — Pre-build checks

### Check 7 — photo path convention (PASS)

Queried `recipe_shares` live (31 total rows). 19 have a `photoUrl` in their
snapshot. For every one of the 19, derived the expected source path as
`{user_id}/share-{share_token}.jpg` from the row's own `user_id` +
`share_token` (never from the stored `photoUrl` string itself), then issued
a direct `HEAD`-equivalent request to the public storage URL for that exact
derived path.

**Result: 19/19 match.** Every existing `recipe_shares` row with a photo has
a real object at the derived path. No mismatches. Full path list and status
codes:

```
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-5ceb3e6a-6626-419a-a133-1a36ed01c2f0.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-6daef9ae-834d-48c3-bb3e-a835a8b70a58.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-88a756f4-1db9-4c6c-a59a-561dc115aa66.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-37ad6ca4-03c2-4036-95b0-eb2c27273c57.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-1cedf4a0-dc72-45cd-9e8a-760cb86b68f7.jpg
200 26cc6942-8f7e-4e19-ba68-c30617119ee5/share-b89c2ca9-0bdf-4050-ae22-86e61285c0c4.jpg
200 0e81fa42-9261-4869-9d53-6336ddd0f8ee/share-01b2579b-e72f-4ac6-9a6e-3864ba3d464b.jpg
200 0e81fa42-9261-4869-9d53-6336ddd0f8ee/share-27c599fb-7785-4c7c-9787-a6ea01734a25.jpg
200 0e81fa42-9261-4869-9d53-6336ddd0f8ee/share-94cec749-fde5-48b3-99dd-4df131d85a9b.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-d30cfd67-c01f-46d7-adab-ce6ae970e01c.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-d864bcca-16fb-4c16-b8a9-d8a850923d06.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-b8bd87d9-7d6c-4e2f-bc7e-3006b34166d6.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-b75d6e0e-df54-49a1-8b52-eba584d8cfb3.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-fb30b539-ed04-4433-a05d-32d9ef350556.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-86b1494d-2d9e-45be-a991-ea663609651a.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-ce3373f1-c5ad-4cc6-94ac-5f63ecb9f352.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-03b4de4e-bc54-4862-a193-d02dd70f93cc.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-50a398f7-43cd-4cfb-9c4b-fa5dff987b55.jpg
200 8b0b795a-2724-4540-a0a8-c581a8f13fe9/share-46112e2b-3d8a-4e28-9340-2cec888c455d.jpg
```

Edge function is clear to deploy on this basis (pending resolution of check 11
below, since step B treats both checks as a joint gate before continuing).

### Check 11 — uncategorized recipe display (FAIL — blocking)

Dispatched a focused code-reading pass over the exact fetch paths. Finding,
with citations:

- **`saveRecipe(r, source, categoryId?)`** (`data.ts` ~line 1006): only
  inserts a `recipe_categories` row `if (categoryId)`. Calling it with no
  `categoryId` (as planned for the share-save flow) leaves the new recipe
  with **zero** `recipe_categories` rows.
- **`getSavedRecipesAll`** (`data.ts` ~line 1310, feeds the
  `recipesByCategory['__all__']` cache that both the "View all" screen and
  `RecipePicker` read from): queries
  `.from('recipe_categories').select('... recipes!inner (...)')` — an
  **INNER JOIN** keyed off `recipe_categories`. A recipe with no
  `recipe_categories` row produces **zero** result rows and is silently
  excluded from the entire result set, not just mis-sorted or mis-grouped.
- **`getSavedRecipesForCategory`** (`data.ts` ~line 1234): same
  `recipe_categories`-first `recipes!inner` shape, scoped to one category —
  structurally the same exclusion applies there too (irrelevant to View-all
  specifically, but confirms there's no other read path that would surface
  an uncategorized recipe).
- **Home.tsx**: does not fetch or display saved recipes at all (only daily
  chips, the suggestions carousel, and the received-recipe summary tile) —
  so this is a non-issue for Home specifically, but it means the *only*
  place a user could ever find this recipe (View all / library) is exactly
  the place that excludes it.
- **The "View all" screen** (`App.tsx` ~line 2408): renders
  `recipesByCategory["__all__"] ?? []` as a flat list with no
  category-grouping UI logic — the exclusion happens entirely upstream, in
  the query, not in rendering.

**Conclusion: a recipe saved via `saveRecipe()` with no `categoryId` would
exist in the `recipes` table but be invisible everywhere a user can browse
their library — not degraded, not miscategorized, genuinely unreachable.**
This is exactly the case the approval's check 11 was designed to catch, and
it fails. Per instruction, stopping here rather than building client code
against a save path that would produce invisible recipes.

**This is being reported in chat now, with options, rather than decided
unilaterally.**

---

## Step B(c) + independent re-verification (2026-10-03)

Client code implemented: `data.ts` (`showSharer` param on `shareRecipeSnapshot`,
`recordSharedRecipeDiscovery`, `dismissSharedRecipeDiscovery`,
`getPendingDiscoveredRecipes`, `saveSharedRecipe`), `ExpandedRecipeOverlay.tsx`
(`onBack`/`onDismiss`), `Home.tsx` (Discovered shelf, `DiscoveredDetailView`,
mount effect), `App.tsx` (routing, `share_show_name` field + toggle UI +
`handleToggleShowSharerName`), `Onboarding.tsx` (pending-token hook). Type-check:
`bunx tsc --noEmit` → 12 errors, matching documented `main` baseline exactly, none
in touched files. Build: clean. Committed `8e6b519`, pushed to
`origin/feature/share-to-save`.

This session re-verified everything below independently (live queries, not
memory/prior-doc trust), per explicit instruction. No remediation was needed —
every item was already correct.

- **FIX 1 (anon revoke), live:** queried `has_function_privilege` for
  `anon`/`authenticated` on all three functions directly against the linked
  remote DB. Result: `anon` → `false`, `authenticated` → `true` for
  `record_shared_recipe_discovery`, `dismiss_shared_recipe_discovery`,
  `finish_shared_recipe_save`. Matches the file's explicit
  `revoke ... from public; revoke ... from anon;` pairs.
- **GATE/FIX 2 (`share_show_name` isolation):** `updateProfile`
  (`App.tsx:736`) does `supabase.from('profiles').upsert({ id, ...updates },
  { onConflict: 'id' })` — only columns present in `updates` are written on
  conflict. Every other `onUpdate(...)` call site (`Onboarding.tsx:268,420,444`;
  `Profile.tsx:232,343,478`) passes a `Partial<ProfileType>` that never includes
  `share_show_name`; the toggle's own call (`App.tsx:3073`) passes
  `{ share_show_name: next }` only. No path can null or overwrite it outside the
  toggle.
- **FIX 3 (old draft removed):** `supabase/migrations/` contains exactly one
  `2026100*` file, `20261002000001_shared_recipe_save.sql` (the redesign). No
  `shared_recipe_saves`/claim-table draft file exists anywhere in the folder.
- **Step a, live:** `supabase migration list` shows `20261002000001` on both
  Local and Remote. `supabase functions list` shows `copy-shared-recipe-photo`
  ACTIVE, updated 2026-10-03 16:41:12.
- **Step b, violation tests:** the 15/15 PASS table and teardown accounting
  above were already recorded for this exact (redesigned) migration in a prior
  session. Re-ran a live spot-check this session against the two recorded test
  user ids and the `shared_recipe_discoveries` table as a whole: 0 rows
  everywhere. Teardown holds; no re-run needed since no schema change occurred
  between sessions.
- **Funnel hooks (file:line):** `App.tsx:3041` `share_link_created`;
  `Home.tsx:173` `discovered_shelf_mount`; `Home.tsx:1989`
  `discovered_save_category_picked`; `Home.tsx:2014` `discovered_save_complete`;
  `Home.tsx:2030` `discovered_save_tap`; `SharedRecipeView.tsx:22`
  `share_view_in_app`; `SharedRecipeView.tsx:32` `share_view_signup_tap`;
  `SharedRecipeView.tsx:36` `share_view_signin_tap` (pre-existing, unmodified
  this feature).
- **Vercel preview for `8e6b519`:** could not be verified — no `gh` or `vercel`
  CLI is available in this environment. Needs a manual check of the Vercel
  dashboard before phone-testing.

This document is now current as of 2026-10-03; nothing below this section
reflects outstanding work other than the Vercel preview check and the phone
test itself.
