# Cooking Feed v1.5 (groupings) — cutover plan

Draft only. No DB writes, no migrations applied, no deploys, no app code
changes have been made. Companion to `post_groupings_v1_5.sql`.

## 1. Dependency inventory (what breaks when `cook_posts` is dropped)

**Will the `DROP TABLE cook_posts` itself fail?** No. No inbound FK
references `cook_posts` in production today (nothing currently exists that
points at it) — the DROP succeeds on its own, with CASCADE not even needed.
The risk is everything that *reads/writes it afterward*, silently starting
to error at call time once the shape changes underneath it.

| Object | Disposition | Why |
|---|---|---|
| `cook_posts` table | **Dropped + recreated** (new shape) | 0 rows in prod; shape changes are too extensive for ALTER (nullable `grouping_id`, new `private_photo_path`, `is_posted`, etc.) |
| `get_cook_feed(int,timestamptz,uuid)` | **Dropped + recreated** | Return shape changes (recipe_snapshot → grouping_snapshot-derived columns); included in `post_groupings_v1_5.sql` |
| `get_cook_post(uuid)` | **Dropped + recreated** | Same reason; included |
| `finish_feed_recipe_save(uuid,uuid)` | **Dropped, not replaced** | Fully superseded — `save_grouping_from_post` does its job (attribution stamping) inline, in the same transaction as the recipe insert, for every kind including the n=1 recipe case. No live caller after app cutover. Included in `post_groupings_v1_5.sql` |
| `delete_user_account_data(uuid)` | **Rewritten (companion, not in this file)** | Must add `groupings` (direct delete) and `grouping_parts` (cascade, verification-only) to its deletion + zero-rows blocks, per the Load-Bearing Contract. See §2 below for why it's not drafted in the `.sql` file. |
| Storage RLS policies on `recipe-photos` / `cook-photos-private` | **Untouched** | Confirmed: none reference `cook_posts` in USING/WITH CHECK — they gate on path prefix (`(storage.foldername(name))[1] = auth.uid()`) only |
| `cook-photos-private` bucket row, indexes, grants on old `cook_posts` | **Dropped with the table** | No separate action needed |
| `supabase/functions/delete-account/index.ts` | **Untouched** | Sweeps the `cook-photos-private` bucket by path prefix, not by querying `cook_posts`; no code reference to the table |

### App call sites (no code changes made — this is the inventory for the app half of the cutover)

| File / function | Disposition |
|---|---|
| `src/tipsy/data.ts` — `postCook()` | Retired. Replaced by a grouping-aware post function (name TBD at implementation) that inserts into `groupings`/`grouping_parts`/`cook_posts` (or, for the hidden recipe-kind case, just `cook_posts` against an existing 1-part grouping) |
| `src/tipsy/data.ts` — `unpostCook()` | Retired. Replaced by an `UPDATE cook_posts SET is_posted=false ...` call (flag flip, not a row delete) — see §4 photo lifecycle |
| `src/tipsy/data.ts` — `saveFeedRecipe()` | Retired. Replaced by a thin wrapper calling `supabase.rpc('save_grouping_from_post', ...)` plus the client-side photo copy step |
| `src/tipsy/data.ts` — `getCookFeed()` / `getCookPost()` | Rewritten for the new RPC return shape (`grouping_kind`/`grouping_title`/`photo_source` instead of `recipe_title`) |
| `src/tipsy/CookFeed.tsx` — `CookFeedCard`, `CookPostDetailScreen`, `handlePickCategory` | Rewritten to render parts (not a single recipe) and call the new save RPC |
| `src/tipsy/App.tsx` — Log Cook sheet "Post publicly" toggle, `handleRemovePost` | Rewired to the new post/unpost-via-flag functions. **Cutover scope: recipe-kind (n=1) path only** — zero visible UX change for today's single-recipe flow. The dish/menu composer UI is explicitly out of scope here (deferred per the earlier "feed card shape deferred to the builder step" decision) — the schema supports it, the UI doesn't exist yet |
| `RecipeSendSnapshot`-adjacent types in `data.ts` | Extended/replaced with a `GroupingSnapshot` shape matching `grouping_snapshot`'s jsonb structure |

## 2. Column type verification (`save_grouping_from_post`'s inserts)

| Column | Confirmed type | Source | Cast used | OK? |
|---|---|---|---|---|
| `recipes.steps` | `jsonb` | CLAUDE.md ("steps is a JSONB array") | `->'steps'` (jsonb, not text) | ✅ |
| `recipes.cook_time` | `text` (inferred, dashboard-only — no migration declares it) | 3 of 4 `data.ts` call sites type it `string \| null`; `RecipeSendSnapshot` (the canonical frozen shape feeding this function) types it `string \| null` | `->>'cook_time'` | ✅, with caveat below |
| `recipes.serves` | `text` (inferred, same basis) | same | `->>'serves'` | ✅, with caveat below |
| `recipes.source` | `text` (free-text `'ai'\|'manual'`, no enum type exists) | data.ts usage | `'manual'` literal | ✅ |
| `recipes.inspired_by_id` | `uuid` | set by `finish_received_recipe_save`/`finish_feed_recipe_save` | `nullif(v_poster_id, v_caller_id)` (uuid) | ✅ |
| `recipes.inspired_by_name` | `text` | same | `v_credit_name` (text) | ✅ |
| `ingredients.name` / `.quantity` | `text` | CLAUDE.md ("free-text strings") | `->>'name'` / `->>'quantity'` | ✅ |
| `ingredients.sort_order` | `integer` | usage in `.sort((a,b)=>a.sort_order-b.sort_order)` | `(ord - 1)::int` | ✅ |
| `recipe_categories.recipe_id/category_id/user_id` | `uuid` (dashboard-only, inferred from consistent uuid usage app-wide) | — | matching uuid variables | ✅ |
| `categories.id/user_id` | `uuid` | — | matching uuid variables | ✅ |
| `grouping_parts.position` | `int` (this draft) | — | `(v_part->>'position')::int` | ✅ |

**No actual cast mismatch was found** on re-verification — every insert already used the right extraction operator (`->>` for text targets, `->` for the jsonb `steps` target) with matching casts.

**One real finding, not a bug in this draft:** `recipes.cook_time`/`recipes.serves` can't be confirmed from a migration (dashboard-only schema, a standing known gap — see CLAUDE.md). The inference is solid (3 of 4 call sites + the canonical snapshot type agree on `string | null`/text), but one stray `data.ts` type (~line 966–967) declares them `number | null` instead — a **pre-existing inconsistency in app code**, not introduced by this change. Recommend a one-time read-only type confirmation (e.g. `supabase db query --linked "select pg_typeof(cook_time), pg_typeof(serves) from recipes limit 1"`) before applying, to rule out a silent `text`-into-`numeric` cast failure.

## 2a. Title parity (recipe-kind posts)

`groupings.title` is null for `kind='recipe'` by design (see the column's own comment in `post_groupings_v1_5.sql`) — so `grouping_snapshot->>'title'` is also null for every recipe-kind post. `get_cook_feed` now covers this server-side with a fallback (`coalesce(grouping_snapshot->>'title', grouping_snapshot->'parts'->0->'recipe'->>'title')`), but as belt-and-suspenders, not as the only fix: **when building the frozen `grouping_snapshot` at post time, the client must also write the recipe's title into the snapshot's own top-level `title` key** for recipe-kind posts (not leave it null and rely solely on the part-level fallback) — the same way today's `postCook` already builds the frozen `recipe_snapshot`. This keeps the common case independent of the fallback and limits the fallback to covering only snapshots written before this change.

## 3. `photo_source` restored

Added back to `cook_posts` (`text`, CHECK `IN ('cook','recipe')` or null) and to both `get_cook_feed`/`get_cook_post`'s output. Semantics generalized:
- `'cook'` — the photo came from a live "this specific cook" source: `cook_events.photo_url` (kind='recipe') or `cook_posts.private_photo_path` (kind='dish'/'menu' — this is the *only* possible source for those kinds, there's no single recipe to fall back to).
- `'recipe'` — kind='recipe' only, falling back to the one recipe's own live `photo_url` when that particular cook had no photo of its own.

## 4. Photo privacy lifecycle (`is_posted` flag model)

**`private_photo_path` naming (dish/menu only):** `cook-photos-private/{userId}/post-{id}.jpg`, where `{id}` is the `cook_posts.id` row it belongs to — a fourth immutable photo-path case alongside the three in CLAUDE.md's Recipe Photos (live `{recipeId}.jpg`, share `share-{token}.jpg`, send `send-{token}.jpg`), and distinct from `cook_events`' own existing `{userId}/cook-{cookEventId}.jpg` private path (that one stays recipe-kind-only, keyed to a `cook_events` row, not a `cook_posts` row). This satisfies the new `cook_posts_private_photo_path_shape_chk` CHECK (`{user_id}/...` prefix) added in `post_groupings_v1_5.sql`, and matches the same `{user_id}/...`-prefix assumption that storage RLS and the delete-account sweep already rely on for every bucket.

- **Created unposted:** `photo_url` is NULL from insert. The public-bucket (`recipe-photos`) copy is never written unless/until posting happens — by construction, not by convention.
- **Posting (false→true):** client copies from the live source (`cook_events.photo_url` for kind='recipe', `cook_posts.private_photo_path` for dish/menu) into `recipe-photos/{userId}/post-{id}.jpg`, then `UPDATE cook_posts SET photo_url=..., photo_source=..., is_posted=true, posted_at=now()`. Soft-fail: a copy failure still flips `is_posted` true, leaving a photoless post — same convention as today's `postCook`.
- **Unposting (true→false):** client deletes the `recipe-photos` object **first**, then updates `photo_url=null, photo_source=null, is_posted=false, posted_at=null`. If the storage delete fails, abort and don't flip the flag — mirrors `unpostCook`'s existing delete-before-DB-write order, now applied to a column flip instead of a row delete.
- **Re-posting:** identical to posting, re-copying from the still-intact private source to the same destination path (`upsert:true`). The private source is never touched by unposting — only the public copy is removed — so re-posting always has something to copy from, unless the user separately deleted their private cook photo in the meantime (in which case re-posting just produces a photoless post, no hard error).
- All of this lives in **app code**, same as today — Postgres transactions can't span Supabase Storage. The DB's role is limited to the exact-match CHECK on `photo_url`'s shape and the column-lock trigger permitting exactly this set of columns to change via UPDATE.

## 5. Ordered cutover steps

**Precondition (read-only, re-check immediately before cutover):** confirm `cook_posts` still has 0 rows in production. If not, STOP — this plan assumes no data to migrate; a nonzero count needs a backfill step not covered here.

**DB:**
1. Founder review + approval of `post_groupings_v1_5.sql`.
2. Draft and review the `delete_user_account_data` companion update (see §1 table) as its own migration file, following the existing one-file-per-concern convention (like `20261025000002` did for the original `cook_posts`). Diff instructions: add a `groupings` block identical in shape to the existing `cook_posts` block (direct delete, ownership-check-via-RETURNING-loop, placed anywhere relative to `cook_posts`/`cook_events` since neither FK between the new tables is CASCADE); add `v_grouping_parts_user_before`/`_after` as an informational/verification-only pair (no direct delete — cascades via `groupings`); add both to the final zero-rows-after assertion block.
3. Apply both migrations together against the linked project (founder-approved `supabase db query --linked` per Session Rules).

**Explicitly OUT of this cutover:** `supabase migration repair --status applied` for the already-live-but-marked-DRAFT 2026-10-24/25 migrations (the pre-existing bookkeeping gap) is a separate, later job — not bundled here. It's cosmetic CLI-bookkeeping with no runtime effect, and bundling it with a live schema cutover only adds unrelated risk to a change that already touches RLS, triggers, and a security-definer function. Track and run it on its own, whenever is convenient, independent of this plan.

**App (deployed immediately after the DB step — see rollback note on why this isn't a zero-downtime dual-compatible rollout):**
5. Ship the `data.ts`/`App.tsx`/`CookFeed.tsx` changes listed in §1's app table, scoped to parity with today's recipe-kind flow only. **App-parity note:** today's `saveFeedRecipe` gives the newly-saved recipe its own photo (copying from the source) as part of the save — the replacement flow must preserve that; a recipe-kind save that leaves the new recipe photoless would be a regression. `save_grouping_from_post` only returns `grouping_id`, not the recipe id(s) it inserted, so the client-side photo-copy step needs its own lookup: after the RPC returns, query `grouping_parts` by `grouping_id` (`select recipe_id from grouping_parts where grouping_id = :id and recipe_id is not null order by position`) to get the new recipe id(s) to copy photos onto — for the recipe-kind (n=1) case this is exactly one row/one id.
6. Deploy to Vercel (auto-deploys on push to `main` per CLAUDE.md).

**Accepted tradeoff:** old app code calling the now-dropped `finish_feed_recipe_save` or inserting into the old `cook_posts` shape would error between step 3 and step 6. Given 0 live rows and the feed's current low usage, a short (~1-2 minute, Vercel deploy time) window of Cooking Feed-specific errors is accepted rather than engineering a dual-compatible transitional schema for a feature with no production data at stake.

## 6. Testing plan (no production contact)

What's actually in this repo: `supabase/config.toml` exists (6 edge functions configured, `verify_jwt=true`) — the Supabase CLI's local stack (`supabase start`, Docker-based Postgres/Auth/Storage/Studio) is usable. There is **no** seed SQL, **no** CLI entry in `package.json` (global install assumed), **no** `.github/workflows` CI, and **no** existing integration-test harness — the existing `*.test.ts`/`*.test.mjs` files are unit/functional only, none spin up Postgres.

The biggest obstacle: most of the base schema (`recipes`, `ingredients`, `categories`, `recipe_categories`, `profiles`, `cook_events`) is dashboard-only and not captured in `supabase/migrations/`, so a local instance needs that schema from somewhere before this draft can be tested on top of it.

**Founder decision: option (a).** Baseline comes from a read-only production
schema dump, not a hand-written stub.

Proposed steps:
1. `supabase start` locally (requires Docker).
2. Founder-approved, read-only `supabase db dump --linked --schema public -f baseline.sql` (schema structure only, no data, no service-role key) run once, reviewed, then applied locally. Flagged for explicit go-ahead since it touches the linked project even in read-only form, per the Session Rules' spirit. Because this dump already captures the live schema in full (including every dashboard-only table and the already-applied 2026-10-24/25 migrations), it supersedes the repo's `supabase/migrations/*.sql` as the baseline — it is not a gap those files need to fill.
3. Apply `baseline.sql` to the local instance, then apply `post_groupings_v1_5.sql` on top — all against `localhost`, never `--linked`. **Do NOT also replay `supabase/migrations/*.sql`** on top of the dump — those migrations are already reflected in the dump (it's a snapshot of the live, post-migration schema), and re-running them against an instance that already has their result risks duplicate-object errors or, worse, silently diverging from what's actually live if any migration was hand-edited after being applied.
4. Seed two test users (to exercise `inspired_by`/self-save), a couple of `categories`, a couple of `recipes` with ingredients, and a `cook_events` row.
5. Exercise locally via `psql`/Supabase Studio's SQL editor against `localhost:54321`'s Postgres (never production keys):
   - **Explicit test step, using the dump itself:** before inserting anything, read `baseline.sql`'s `CREATE TABLE recipes` statement (or run `select pg_typeof(cook_time), pg_typeof(serves) from recipes limit 1` locally once seeded) to confirm `recipes.cook_time`/`recipes.serves`'s actual column type. This is exactly the "one real finding" flagged in §2 above (dashboard-only columns, inferred as `text` from app code, never confirmed from a migration) — the dump is the first point in this plan that can confirm it directly rather than by inference. If either comes back as something other than `text` (e.g. `numeric`), `save_grouping_from_post`'s `->>'cook_time'`/`->>'serves'` text-extraction casts must be revisited before proceeding.
   - Insert a `kind='recipe'` grouping + 1 part + `cook_posts` row; confirm it succeeds.
   - Attempt invalid `grouping_parts` rows: null section on dish/menu, wrong section string, `'also'` with a `recipe_id`, `'component'` with only `freeform_text` — confirm each is rejected by `grouping_parts_before_write`.
   - Attempt to `UPDATE groupings SET kind = ...` — confirm `groupings_kind_lock` rejects it.
   - Call `save_grouping_from_post` (simulate a given caller via `set local "request.jwt.claims" = '{"sub":"<uuid>"}'`, a standard local Supabase RLS-testing technique) against a posted grouping owned by the other test user; confirm: the new recipe(s) get `inspired_by_id`/`name` stamped, `cook_time`/`serves` persisted, ingredient `sort_order` re-derived from array position, and a second call with the same `p_post_id` returns the same `grouping_id` (idempotency) rather than duplicating.
   - Call `save_grouping_from_post` with a `p_category_id` owned by a different user — confirm it raises.
   - `UPDATE cook_posts SET is_posted = true` (permitted) vs. `UPDATE cook_posts SET grouping_snapshot = '{}'::jsonb` (must be rejected by `cook_posts_column_lock`).
   - Delete a `groupings` row that has a posted `cook_posts` row pointing at it — confirm the post survives with `grouping_id` now null, not cascaded away.
   - Run the updated `delete_user_account_data` against a test user with groupings/parts/posts — confirm zero rows remain in all three new tables and no exception is raised.
6. This stays a manual pre-approval step, run locally before the founder authorizes applying anything to the linked project — not wired into CI as part of this change (no CI exists today; standing it up is separate, larger work).

## 7. Rollback plan

- **App:** instant — Vercel redeploy of the previous production deployment (one click / `vercel rollback` per Vercel's own tooling, outside this repo's scope to detail further).
- **DB:** harder, and only clean if the precondition in §5 held (0 rows at cutover) and no posts were created in the new schema during the cutover window — re-verify row counts in `groupings`/`cook_posts` before rolling back. If clean: founder-approved re-application of the *current* (pre-cutover) definitions of `cook_posts`, `get_cook_feed`, `get_cook_post`, and `finish_feed_recipe_save` — these already exist verbatim in `supabase/migrations/20261025000001` through `...007` and don't need to be redrafted, just re-run after dropping the new `groupings`/`grouping_parts`/`cook_posts`/`save_grouping_from_post` objects. If NOT clean (posts exist in the new schema): rollback requires a real decision from the founder about whether to accept data loss or hand-write a forward-fix instead — not a scripted rollback, flagged here rather than papered over.
- `delete_user_account_data` rollback: re-apply its current (pre-cutover) body from `20261025000002` verbatim.
