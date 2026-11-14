# Dishes & Menus (v1.5 "groupings")

Replaces the single-recipe Cooking Feed v1 model (`cook_posts` → one recipe)
and the old Menus feature (`occasions`/`menus`/`menu_recipes`). A cook —
logged or posted — can now be a single recipe, a dish made of multiple
recipes, or a menu made of dishes/recipes/freeform lines. Shipped
2026-11-02 through 2026-11-13.

## Data model

### `groupings`
One row per recipe/dish/menu "unit" a user has composed.

| column | notes |
|---|---|
| `id` | uuid PK |
| `user_id` | owner |
| `kind` | enum `grouping_kind`: `'recipe' \| 'dish' \| 'menu'` — **immutable** after insert (enforced by the `groupings_kind_lock` trigger) |
| `title` | text, nullable — null for `kind='recipe'` (falls back to its one part's recipe title); required for `dish`/`menu` |
| `source_post_id` | FK → `cook_posts.id`, `ON DELETE SET NULL`; unique on `(user_id, source_post_id)` — makes saving the same feed post twice idempotent |
| `created_at`, `updated_at` | `updated_at` is bumped by `logGroupingCook` so `listMyPlans` can sort "most recently cooked first" |

RLS: owner-only (`groupings_all_own`).

### `grouping_parts`
One row per item inside a grouping.

| column | notes |
|---|---|
| `id` | uuid PK |
| `grouping_id` | FK → `groupings`, `ON DELETE CASCADE` |
| `user_id` | denormalized from the parent, trigger-stamped — never trusted from the caller |
| `section` | text, nullable. `null` for `kind='recipe'`; `'component'` / `'also'` for `kind='dish'`; `'apps' \| 'mains' \| 'sides' \| 'desserts' \| 'drinks'` for `kind='menu'` |
| `recipe_id` | FK → `recipes`, nullable |
| `freeform_text` | nullable |
| `child_grouping_id` | FK → `groupings`, nullable, `ON DELETE CASCADE` — lets a **menu**-kind part embed a **dish**-kind grouping. Added 2026-11-04. |
| `position` | int, explicit ordering within a section |

Constraint `grouping_parts_exactly_one_target`: exactly one of
`recipe_id` / `freeform_text` / `child_grouping_id` must be set.

Section/ownership rules are enforced by the `grouping_parts_before_write`
BEFORE trigger, not just app code:
- `dish`-kind: `section='component'` requires `recipe_id` (no freeform);
  `section='also'` requires `freeform_text` (no recipe).
- `menu`-kind: `section` must be one of the five course names; any target
  type is allowed, but a `child_grouping_id` must point at a `dish`-kind
  grouping owned by the same user.
- Nesting is **one level only** — a dish's own parts can never themselves
  hold a `child_grouping_id`. Enforced at write time; no recursive case
  exists on read.
- Canonical course order (`apps → mains → sides → desserts → drinks`) is an
  app-level convention (`MenuScreen.tsx`), not a DB constraint.

No RLS is bypassed: `grouping_parts_all_own` is owner-only, same as
`groupings`.

### `cook_posts` (overhauled shape)
A cook log / feed post, now kind-agnostic.

| column | notes |
|---|---|
| `grouping_id` | FK → `groupings`, `ON DELETE SET NULL` (deleting a private grouping must not delete a public post about it — the feed only ever reads the frozen snapshot, never the live tables) |
| `cook_event_id` | FK → `cook_events`, `ON DELETE CASCADE` — **recipe-kind only**; null for dish/menu (no single `cook_events` row to anchor a multi-recipe cook to) |
| `grouping_snapshot` | `jsonb not null` — the frozen record, see shape below |
| `private_photo_path` | `cook-photos-private` bucket, mutable while unposted |
| `photo_url` | `recipe-photos` bucket, exists only while `is_posted = true` |
| `photo_source` | `'cook' \| 'recipe'` — `'recipe'` only applies to `kind='recipe'` (falling back to the single recipe's live photo); no `'recipe'` case exists for dish/menu |
| `is_posted`, `posted_at`, `score`, `note`, `cooked_on` | lifecycle/log fields |

Frozen-write semantics: `grouping_snapshot`/`cook_event_id`/`user_id`/
`cooked_on`/`grouping_id` (once non-null) are locked by a column-lock
trigger after insert. Only `is_posted`/`posted_at`/`photo_url`/
`photo_source`/`private_photo_path`/`score`/`note` may ever be updated —
this is how post → unpost → re-post works without ever re-inserting a row
(`cook_posts_cook_event_id_uidx` is a full unique index, not partial, so a
second insert for the same cook would violate it).

**`grouping_snapshot` shape** (TS types `GroupingSnapshot` /
`GroupingPartSnapshot`, `src/tipsy/data.ts`):

```
GroupingSnapshot = {
  kind: 'recipe' | 'dish' | 'menu';
  title: string;              // always populated at write time, even for
                               // kind='recipe' (groupings.title is null in
                               // the DB for that kind — the snapshot never
                               // relies on that DB-side fallback)
  parts: GroupingPartSnapshot[];
}

GroupingPartSnapshot = {
  section: string | null;
  position: number;
  recipe: RecipeSendSnapshot | null;
  freeform_text: string | null;
  dish?: { kind: 'dish'; title: string; parts: GroupingPartSnapshot[] } | null;
  // `dish` is menu-parts-only, one level deep — mirrors the DB's one-level
  // nesting limit. `recipe`/`freeform_text`/`dish` are mutually exclusive.
}
```

### `recipes.in_library`
`boolean not null default true`. `false` only for recipes created by
`save_grouping_from_post` when the saved grouping's `kind` is `'dish'` or
`'menu'` (at any nesting depth, including a nested dish's own parts) — the
recipe exists for the saver but is hidden from their library until they
explicitly promote it via **"Add to My Recipes"** (`add_recipe_to_library`).
Recipe-kind saves, and every pre-existing recipe, are always `true`.

Query functions that filter `recipes.in_library = true` (the "browse my
library" surface): `getSavedRecipesForCategory`, `getSavedRecipesAll`,
`getRecipeForLibraryNav` (all in `src/tipsy/data.ts`). Deliberately **not**
filtered: `getRecipesForMenuSection`-equivalent in-context reads, and
`loadSavedRecipes` (the one-time step-title backfill script needs every
recipe, hidden or not).

## Key functions

### `src/tipsy/data.ts`
- `saveGroupingFromPost(postId, categoryId?)` — wraps the `save_grouping_from_post` RPC.
- `getSavedGroupingIdForPost(postId)` — idempotent re-save check.
- `createGrouping(kind, title, parts)` / `updateGrouping(groupingId, title, parts)` — dish/menu builder save (update does a full replace of parts, not a patch).
- `deleteGrouping(groupingId)` — cascades parts and any nested dishes; returns `boolean`.
- `getMenusUsingDish(dishId)` — which menus embed a given dish, for delete-warning UI.
- `listMyPlans()` → `PlanSummary[]` — the user's own dish/menu groupings for `DishesMenusList`.
- `getPlan(groupingId)` → `PlanDetail` — full detail for one plan, via the private `getGroupingPartsExpanded` (one level of nested-dish expansion) plus past `cook_posts` for that grouping.
- `addRecipeToLibrary(recipeId, categoryId)` — wraps the `add_recipe_to_library` RPC.
- `getRecipePreview(recipeId)` — read-only fetch for a hidden (`in_library=false`) recipe, used by `ExpandedRecipeOverlay` from Plan Detail.
- `getRecipeForLibraryNav(recipeId)` — resolves an in-library recipe tapped from Plan Detail into the shape the normal recipe screen needs.
- `logGroupingCook(groupingId, input)` — logs a cooked dish/menu: builds the snapshot via the private `buildGroupingSnapshot`, uploads an optional photo, inserts the `cook_posts` row, bumps `groupings.updated_at`.
- `postCook` / `unpostCook` (pre-existing from Cooking Feed v1) are reused generically — they operate on any `cook_posts` row regardless of `kind`, which is why a dish/menu cook can be posted/unposted/re-posted the same way a recipe cook can.

### SQL / RPCs (`supabase/migrations/`)
- **`save_grouping_from_post(p_post_id, p_category_id default null)`** — `SECURITY DEFINER`. The sole write path from a feed post into a caller's own `groupings`. Auth-checks the caller, re-fetches the post's `grouping_snapshot`, is idempotent per `(user_id, source_post_id)`, and is one transaction (any exception rolls back every insert made so far). For `kind='recipe'`, `p_category_id` is required and the new recipe is filed into it with `in_library=true`. For `kind in ('dish','menu')`, `p_category_id` is ignored and every recipe created (at any nesting depth) gets `in_library=false` and no category row. Handles the nested-dish branch (a menu part whose JSON has a `dish` key) by inserting a child grouping and recursing one level.
- **`add_recipe_to_library(p_recipe_id, p_category_id)`** — `SECURITY INVOKER` (not DEFINER — both its writes are already RLS-protected). Validates category ownership, flips `recipes.in_library` to `true`, inserts `recipe_categories` (`ON CONFLICT DO NOTHING`, idempotent).
- **`get_cook_feed(limit, before, cursor_id)`** — `SECURITY DEFINER`, `authenticated`-only. Returns feed rows with `grouping_kind`/`grouping_title`/`grouping_description`, plus `parts_preview text[]` / `parts_remaining int` computed from the snapshot (first 3 parts for a dish, first 2 dish-or-recipe labels for a menu — freeform lines excluded from a menu's preview via a `jsonb ->>` comparison, not `->`, to correctly collapse a JSON `null` to SQL `null`).
- **`get_cook_post(post_id)`** — `SECURITY DEFINER`, `authenticated`-only. Returns one post's full `grouping_snapshot` for tap-through detail.
- `delete_user_account_data` was extended (migration below) to directly delete `groupings` rows (parts cascade) with ownership-validated `RETURNING` and a zero-rows-after check.

## Screens

| File | Role |
|---|---|
| `LogCookTypePicker.tsx` | Entry sheet: "Log a recipe / dish / menu" or "Start from a saved dish or menu." Rendered from Home. |
| `ChooseDishOrMenu.tsx` | Lists the user's plans (`listMyPlans`) to cook from; hands off to `LogGroupingCookSheet`. |
| `DishScreen.tsx` | Dish builder/editor (create or edit). Title + parts list (`component` recipes / `also` freeform), includes the `AddPartSheet`. Saves via `createGrouping`/`updateGrouping`. |
| `MenuScreen.tsx` | Menu builder/editor. Same shape as `DishScreen`, parts grouped by course section; "Add a part" can add a recipe, freeform text, or an existing dish (`child_grouping_id`). |
| `DishesMenusList.tsx` | "Dishes & Menus" library list (`listMyPlans`); entry point for creating new plans and for navigating to `PlanDetail`. |
| `PlanDetail.tsx` | View/edit one saved plan: parts by section, past cooks, delete (warns via `getMenusUsingDish` if a dish is embedded in a menu), and promotion of hidden (`in_library=false`) recipes via "Add to My Recipes." |
| `LogGroupingCookSheet.tsx` | Modal: date, score, note, optional photo, "Post publicly" toggle. Calls `logGroupingCook`. Rendered from `DishScreen`, `MenuScreen`, `ChooseDishOrMenu`, and `PlanDetail`. |
| `CookFeed.tsx` | Multiple exports: `CookFeedScreen` (the feed itself), `CookPostDetailScreen` / `DishMenuPostDetailScreen` (tap-through detail, keyed on `grouping_kind`), `SaveToSheet` (save a feed post into the user's own library/plans via `saveGroupingFromPost`/`addRecipeToLibrary`), `SaveToast`. |
| `src/tipsy/BottomSheet.tsx` | Shared `BottomSheet`/`Toast`/`DragHandle`/`SheetKeyframes` — every sheet/toast above is built on these, not a fork. |

**Navigation** (state cases in `App.tsx`): Home → `LogCookTypePicker` (sheet)
→ `dishScreen` / `menuScreen` (create) or `chooseDishOrMenu` → `planDetail` /
a grouping id → `LogGroupingCookSheet` (modal, not a full screen state) →
back to `cookFeed`. Separately, the "Dishes & Menus" pill → `dishesMenusList`
→ `planDetail:{groupingId}` → edit (`dishScreen`/`menuScreen` with
`groupingId`) or delete. From `cookFeed` → `dishMenuPostDetail:{postId}` →
`SaveToSheet` → `newcategoryfordishmenupost` (category creation mid-save) or
straight into the caller's library/plans.

## Migrations applied

All hand-applied to production via `supabase db query --linked` (no
`supabase db push` — see the Standing Cleanup migration-history-tidy-up
note in CLAUDE.md).

| Date | File | Summary |
|---|---|---|
| 2026-11-02 | `20261102000001_post_groupings_v1_5.sql` | Creates `grouping_kind` enum, `groupings`, `grouping_parts` (RLS + triggers); drops and recreates `cook_posts` with the frozen `grouping_snapshot` shape; implements `save_grouping_from_post`; recreates `get_cook_feed`/`get_cook_post` against the new shape; drops the superseded `finish_feed_recipe_save`. |
| 2026-11-02 | `20261102000002_delete_user_account_data_add_groupings.sql` | Extends `delete_user_account_data` to delete `groupings` (cascades `grouping_parts`) with ownership verification. |
| 2026-11-04 | `20261104000001_menu_contains_dish.sql` | Adds `grouping_parts.child_grouping_id`; replaces the two-way XOR constraint with the three-way `grouping_parts_exactly_one_target`; updates the before-write trigger and `save_grouping_from_post` for one-level dish nesting inside a menu. |
| 2026-11-07 | `20261107000001_feed_parts_preview.sql` | Recreates `get_cook_feed` to add `parts_preview`/`parts_remaining`, computed from the snapshot; fixes a `jsonb ->` vs `->>` bug that was letting freeform menu lines leak into the preview. |
| 2026-11-11 | `20261111000001_saved_recipes_in_library.sql` | Adds `recipes.in_library`; makes `save_grouping_from_post`'s category argument optional and sets `in_library=false` for dish/menu-sourced recipes; adds `add_recipe_to_library`; documents the query-function filtering inventory. |

Pre-groupings context: `20261025000001_cook_posts_feed_v1.sql` and its
follow-ons (Oct 25–26, 2026) were the original single-recipe `cook_posts`
model these migrations supersede.

## Rollback scripts

Kept in `docs/drafts/` (not copied into `supabase/migrations/`, per
project convention — a rollback is a reference artifact, not something ever
meant to run as a forward migration):
- `docs/drafts/post_groupings_v1_5_rollback.sql` — rollback for
  `post_groupings_v1_5.sql` + `post_groupings_v1_5_delete_account.sql`
  together, captured live against production on 2026-10-27 (not replayed
  from the migration files, in case those had drifted from what was
  actually live). Only valid for the "clean" case: zero rows created in the
  new schema during the cutover window. See
  `docs/drafts/post_groupings_v1_5_cutover.md` §7 for the full plan this
  rollback implements.
- `docs/drafts/menu_contains_dish_rollback.sql`
- `docs/drafts/feed_parts_preview_rollback.sql`
- `docs/drafts/saved_recipes_in_library_rollback.sql`

`docs/drafts/post_groupings_v1_5_cutover.md` is kept alongside its
rollback script as the dependency inventory / ordered-steps / testing-plan
companion document for that specific cutover — not itself a migration.

## Known limitations

- **Menu nesting is exactly one level.** A dish's own parts can never hold
  a further `child_grouping_id` — enforced by the before-write trigger, not
  just convention.
- **`in_library` promotion is manual, per-recipe.** Saving a dish/menu from
  the feed never auto-files its recipes into a category; each one must be
  promoted individually via "Add to My Recipes" from Plan Detail.
- **Snapshots are frozen at post time.** Editing or deleting the live
  recipe/dish/menu after a cook is posted never updates the post — this is
  deliberate (same posture as the rest of the app's snapshot-based sharing),
  but means a feed post can reference since-changed or since-deleted
  content.
- **No block/report mechanism** — unchanged from Cooking Feed v1 (founder
  decision); the founder removes problem posts manually via the Supabase
  dashboard.
- **Feed scope is global**, not connections-scoped — unchanged from
  Cooking Feed v1 (founder decision).
- **Old Menus tables are orphaned, not dropped.** `occasions`/`menus`/
  `menu_recipes` still exist (empty, as of retirement) pending a later
  cleanup pass; no app code reads or writes them anymore.
- **Migration-history bookkeeping is out of sync.** All migrations above
  were hand-applied via `supabase db query --linked`, not `supabase db
  push`, so the Supabase CLI's own migration-history table doesn't know
  about them. Fixing this (e.g. `supabase migration repair`) is a separate,
  deliberately deferred job — do not run it as a side effect of unrelated
  work.
