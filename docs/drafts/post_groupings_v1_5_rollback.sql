-- DRAFT — NOT APPLIED, NOT a migration file. Lives in docs/drafts/ on
-- purpose, pending founder review. Do NOT run `supabase migration up` /
-- `supabase db push` / `supabase migration repair` against the linked
-- project. Per CLAUDE.md, any write to the shared Supabase DB requires
-- explicit founder approval first.
--
-- Rollback for post_groupings_v1_5.sql + post_groupings_v1_5_delete_account.sql
-- (the v1.5 "groupings" cutover), per the cutover doc's §7 Rollback plan.
-- Only valid for the "clean" case that doc describes: 0 rows created in the
-- new schema during the cutover window. Built from objects CAPTURED LIVE
-- against the linked project on 2026-10-27 (pg_get_functiondef for every
-- function; full information_schema/pg_catalog capture for cook_posts'
-- columns, constraints, indexes, RLS, triggers, grants, comments) — NOT by
-- replaying supabase/migrations/*.sql, per explicit instruction. This
-- matters because CLAUDE.md flags these migrations as hand-applied and
-- potentially drifted from what's actually live; a live capture is the only
-- way to be sure the "old" shape this script restores is the ACTUAL old
-- shape, not what a migration file merely claims it to be.
--
-- Live capture findings, 2026-10-27 (pre-cutover, i.e. BEFORE
-- post_groupings_v1_5.sql / the delete_account companion have been
-- applied — this is what "old"/"rollback target" means throughout):
--   - cook_posts (old shape): 11 columns, none nullable except photo_url/
--     score/note/photo_source; cook_event_id and recipe_id both NOT NULL
--     (the "a post IS a cook_events-anchored, single-recipe thing" v1
--     model); a FULL unique index on cook_event_id (not partial — there is
--     no nullable case to exempt in this shape); no UPDATE RLS policy
--     (matches CLAUDE.md's "no UPDATE policy" note) and no triggers at all
--     (the column-lock trigger is new in v1.5). No table or column
--     comments exist on the live table — none to restore.
--   - get_cook_feed / get_cook_post / finish_feed_recipe_save /
--     delete_user_account_data: captured verbatim via pg_get_functiondef.
--     Notably get_cook_feed's live RETURNS TABLE already includes
--     recipe_description (added by migration ...006, after the
--     ...001-003 files the cutover doc's §7 note off-handedly cites) —
--     confirms the live-capture approach mattered here: restoring from
--     ...003 alone would have silently dropped recipe_description.
--   - Grants confirmed via information_schema.routine_privileges: the
--     three feed-reading functions grant EXECUTE to `authenticated` only
--     (anon explicitly has none); delete_user_account_data grants EXECUTE
--     to `service_role` only. No function grants PUBLIC/anon anything.
--
-- Precondition enforced by this script itself, not just documented: the
-- guard block immediately below ABORTS THE WHOLE TRANSACTION (raises,
-- nothing commits) if groupings, grouping_parts, or the (new-shape)
-- cook_posts table contains any row at all. A non-empty rollback is a
-- founder decision about accepting data loss vs. a hand-written forward
-- fix — explicitly NOT something this script will do silently, per the
-- cutover doc's §7 "If NOT clean" note.
--
-- Circular FK handling: groupings.source_post_id -> cook_posts(id) and
-- cook_posts.grouping_id -> groupings(id) are BOTH "on delete set null",
-- each referencing the other. Neither table can be dropped first without
-- either CASCADE (which this script deliberately avoids — a blanket
-- CASCADE would also silently drop anything else that happened to
-- reference either table, with no explicit accounting of what) or first
-- breaking the cycle. This script looks up and drops the two specific FK
-- constraints by querying pg_constraint for the actual conrelid/confrelid
-- pair, rather than hard-coding Postgres's default-generated constraint
-- names — those names cannot be confirmed by a live read today (the
-- objects don't exist yet pre-cutover); querying by table pair at rollback
-- time is correct regardless of what name Postgres actually assigned when
-- the forward migration was applied.
--
-- Explicit BEGIN/COMMIT around the whole script (same convention as
-- 20261025000004_cook_posts_add_photo_source.sql's drop-through-grant
-- wrapper) so this is one atomic unit: either every old object is back and
-- every new object is gone, or (on the guard raising, or any statement
-- erroring) nothing changes at all.
BEGIN;

-- =============================================================================
-- 0. GUARD — abort if there is any data to lose
-- =============================================================================
DO $$
DECLARE
  v_groupings_count bigint;
  v_grouping_parts_count bigint;
  v_cook_posts_count bigint;
BEGIN
  SELECT count(*) INTO v_groupings_count FROM public.groupings;
  SELECT count(*) INTO v_grouping_parts_count FROM public.grouping_parts;
  SELECT count(*) INTO v_cook_posts_count FROM public.cook_posts;

  IF v_groupings_count <> 0 OR v_grouping_parts_count <> 0 OR v_cook_posts_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK ABORTED: non-empty new-schema tables (groupings=%, grouping_parts=%, cook_posts=%) — a non-empty rollback is a founder decision (accept data loss vs. hand-written forward-fix), not something this script will do. Nothing has been changed.',
      v_groupings_count, v_grouping_parts_count, v_cook_posts_count;
  END IF;
END $$;

-- =============================================================================
-- 1. Drop the RPC layer the forward migration created
-- =============================================================================
DROP FUNCTION IF EXISTS public.save_grouping_from_post(uuid, uuid);
-- Both dropped (not CREATE OR REPLACE'd back): their RETURNS TABLE column
-- sets differ from the old shape (grouping_kind/grouping_title vs.
-- recipe_title/recipe_description; grouping_snapshot vs. recipe_snapshot),
-- and Postgres rejects CREATE OR REPLACE FUNCTION across a return-type
-- change — same reasoning documented in 20261025000004's own header.
DROP FUNCTION IF EXISTS public.get_cook_feed(int, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_cook_post(uuid);

-- =============================================================================
-- 2. Break the circular FK between groupings and cook_posts, explicitly
--    (looked up by table pair, not a hard-coded/guessed constraint name)
-- =============================================================================
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.cook_posts'::regclass
    AND confrelid = 'public.groupings'::regclass
    AND contype = 'f';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cook_posts DROP CONSTRAINT %I', v_conname);
  END IF;

  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.groupings'::regclass
    AND confrelid = 'public.cook_posts'::regclass
    AND contype = 'f';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.groupings DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- =============================================================================
-- 3. Drop tables, child-first (grouping_parts before groupings), each
--    taking its own triggers/policies/indexes with it automatically
-- =============================================================================
DROP TABLE IF EXISTS public.cook_posts;      -- new (v1.5) shape; old shape recreated in §6 below
DROP TABLE IF EXISTS public.grouping_parts;
DROP TABLE IF EXISTS public.groupings;

-- =============================================================================
-- 4. Drop trigger functions (now unreferenced — their triggers went with
--    the tables above) and the enum type (now unreferenced — groupings.kind
--    was its only user)
-- =============================================================================
DROP FUNCTION IF EXISTS public.lock_grouping_kind();
DROP FUNCTION IF EXISTS public.grouping_parts_before_write();
DROP FUNCTION IF EXISTS public.lock_cook_posts_columns();
DROP TYPE IF EXISTS public.grouping_kind;

-- =============================================================================
-- 5. Recreate cook_posts in its OLD (pre-cutover) shape, verbatim from the
--    live capture: columns, PK, FKs, CHECK constraints, indexes, RLS
--    (enabled, three owner-only policies, no UPDATE policy), no triggers,
--    no comments (none existed on the live table).
-- =============================================================================
CREATE TABLE public.cook_posts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  cook_event_id   uuid not null references public.cook_events(id) on delete cascade,
  recipe_id       uuid not null references public.recipes(id) on delete cascade,
  recipe_snapshot jsonb not null,
  photo_url       text,
  score           numeric(3,1),
  note            text,
  cooked_on       date not null,
  created_at      timestamptz not null default now(),
  photo_source    text,
  constraint cook_posts_photo_url_shape_chk check (
    photo_url is null or photo_url = user_id::text || '/post-' || id::text || '.jpg'
  ),
  constraint cook_posts_photo_source_chk check (
    photo_source is null or photo_source in ('cook', 'recipe')
  )
);

create unique index cook_posts_cook_event_id_key on public.cook_posts (cook_event_id);
create index cook_posts_created_at_idx on public.cook_posts (created_at desc);
create index cook_posts_user_id_idx on public.cook_posts (user_id);

alter table public.cook_posts enable row level security;

create policy cook_posts_select_own on public.cook_posts for select using (auth.uid() = user_id);
create policy cook_posts_insert_own on public.cook_posts for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.cook_events ce
    where ce.id = cook_posts.cook_event_id
      and ce.user_id = auth.uid()
      and ce.recipe_id = cook_posts.recipe_id
  )
);
create policy cook_posts_delete_own on public.cook_posts for delete using (auth.uid() = user_id);
-- No UPDATE policy — matches the live (old) table exactly; cook_posts rows
-- in this shape are never updated in place, only inserted/deleted.

-- =============================================================================
-- 6. Recreate get_cook_feed / get_cook_post / finish_feed_recipe_save /
--    delete_user_account_data, verbatim from the live capture, with their
--    original grants.
-- =============================================================================
create or replace function public.get_cook_feed(p_limit integer default 20, p_before_created_at timestamp with time zone default null, p_before_id uuid default null)
returns table(post_id uuid, created_at timestamp with time zone, cooked_on date, score numeric, note text, photo_url text, photo_source text, recipe_title text, recipe_description text, poster_id uuid, poster_display_name text, poster_handle text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_limit int;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Server-side cap regardless of what the client asks for.
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
    select
      cp.id,
      cp.created_at,
      cp.cooked_on,
      cp.score,
      cp.note,
      cp.photo_url,
      cp.photo_source,
      cp.recipe_snapshot ->> 'title',
      cp.recipe_snapshot ->> 'description',
      p.id,
      coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'),
      p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    where (
      p_before_created_at is null
      or p_before_id is null
      or (cp.created_at, cp.id) < (p_before_created_at, p_before_id)
    )
    order by cp.created_at desc, cp.id desc
    limit v_limit;
end;
$$;

revoke execute on function public.get_cook_feed(int, timestamptz, uuid) from public;
revoke execute on function public.get_cook_feed(int, timestamptz, uuid) from anon;
grant execute on function public.get_cook_feed(int, timestamptz, uuid) to authenticated;

create or replace function public.get_cook_post(p_post_id uuid)
returns table(post_id uuid, created_at timestamp with time zone, cooked_on date, score numeric, note text, photo_url text, photo_source text, recipe_snapshot jsonb, poster_id uuid, poster_display_name text, poster_handle text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  if p_post_id is null then
    return;
  end if;

  return query
    select
      cp.id,
      cp.created_at,
      cp.cooked_on,
      cp.score,
      cp.note,
      cp.photo_url,
      cp.photo_source,
      cp.recipe_snapshot,
      p.id,
      coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'),
      p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    where cp.id = p_post_id;
end;
$$;

revoke execute on function public.get_cook_post(uuid) from public;
revoke execute on function public.get_cook_post(uuid) from anon;
grant execute on function public.get_cook_post(uuid) to authenticated;

create or replace function public.finish_feed_recipe_save(p_post_id uuid, p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid;
  v_poster_id   uuid;
  v_credit_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Caller must own the recipe row being stamped -- same guard shape as
  -- finish_received_recipe_save / finish_shared_recipe_save.
  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_caller_id
  ) then
    raise exception 'recipe not found or not owned by caller';
  end if;

  -- cook_posts has owner-only RLS (cook_posts_select_own); this SECURITY
  -- DEFINER function deliberately bypasses it, same as get_cook_feed/
  -- get_cook_post, so a non-owner viewer's save path can read the poster's id.
  select user_id into v_poster_id
  from public.cook_posts
  where id = p_post_id;

  if v_poster_id is null then
    raise exception 'post not found';
  end if;

  -- Self-save: no credit to self. Silent no-op, not an exception -- the
  -- recipe the client already saved via saveRecipe() stays, just uncredited.
  if v_poster_id = v_caller_id then
    return;
  end if;

  -- Same fallback chain as get_cook_feed/get_cook_post's poster_display_name
  -- column (20261025000003_get_cook_feed_and_get_cook_post.sql) -- computed
  -- fresh here rather than trusting a client-supplied credit string.
  select coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook')
  into v_credit_name
  from public.profiles p
  where p.id = v_poster_id;

  update public.recipes
  set inspired_by_id = v_poster_id,
      inspired_by_name = v_credit_name
  where id = p_recipe_id
    and user_id = v_caller_id; -- redundant with the EXISTS check above, kept as defense in depth
end;
$$;

revoke execute on function public.finish_feed_recipe_save(uuid, uuid) from public;
revoke execute on function public.finish_feed_recipe_save(uuid, uuid) from anon;
grant execute on function public.finish_feed_recipe_save(uuid, uuid) to authenticated;

-- delete_user_account_data: restore the pre-cutover body verbatim (the
-- version live today, BEFORE the groupings/grouping_parts companion change
-- in post_groupings_v1_5_delete_account.sql) — identical in content to
-- supabase/migrations/20261025000002_delete_user_account_data_add_cook_posts.sql,
-- confirmed byte-equivalent (modulo cosmetic formatting) via
-- pg_get_functiondef against the live function in the prior session.
create or replace function public.delete_user_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Only needed where a statement's own exact-count check requires it
  -- (the inspired_by UPDATE) or where a before-count is informational only
  -- (cascade tables' "*_cascaded" fields in the return payload). Direct
  -- DELETE statements no longer compare against a before-count at all —
  -- see header comment.
  v_recipes_inspired_before bigint;
  v_notifications_cascade_extra bigint; -- other users' notifications that will cascade away via recipe_sends.ref_id when this user's recipe_sends rows are deleted below; tracked for the return payload only, not part of any guard

  -- cascade tables: emptied indirectly by the profiles delete. Before-counts
  -- feed only the return payload's "*_cascaded" fields; after-counts feed
  -- the zero-rows-remaining check below.
  v_categories_user_before bigint;
  v_recipes_owned_user_before bigint;
  v_ingredients_user_before bigint;
  v_recipe_categories_user_before bigint;
  v_occasions_user_before bigint;
  v_menus_user_before bigint;
  v_menu_recipes_user_before bigint;
  v_shared_recipe_discoveries_user_before bigint;

  -- write results (rows updated/deleted by THIS function's own direct
  -- statements), accumulated by the RETURNING-loop pattern below.
  v_inspired_by_cleared bigint;
  v_notifications_deleted bigint;
  v_recipe_sends_deleted bigint;
  v_connections_deleted bigint;
  v_grocery_list_shares_deleted bigint;
  v_grocery_items_deleted bigint;
  v_cook_posts_deleted bigint; -- NEW
  v_cook_events_deleted bigint;
  v_recipe_shares_deleted bigint;
  v_user_recipe_slices_deleted bigint;
  v_llm_usage_deleted bigint;
  v_user_events_deleted bigint;
  v_profiles_deleted bigint;

  -- loop variable, reused across every RETURNING-loop below.
  v_row record;

  -- after-state: EVERY inventory table (direct and cascade alike) — final
  -- zero-rows-for-this-user sanity check.
  v_recipes_inspired_after bigint;
  v_notifications_user_after bigint;
  v_recipe_sends_user_after bigint;
  v_connections_user_after bigint;
  v_grocery_list_shares_user_after bigint;
  v_grocery_items_user_after bigint;
  v_cook_posts_user_after bigint; -- NEW
  v_cook_events_user_after bigint;
  v_recipe_shares_user_after bigint;
  v_user_recipe_slices_user_after bigint;
  v_llm_usage_user_after bigint;
  v_user_events_user_after bigint;
  v_profiles_user_after bigint;
  v_categories_user_after bigint;
  v_recipes_owned_user_after bigint;
  v_ingredients_user_after bigint;
  v_recipe_categories_user_after bigint;
  v_occasions_user_after bigint;
  v_menus_user_after bigint;
  v_menu_recipes_user_after bigint;
  v_shared_recipe_discoveries_user_after bigint;
begin
  if p_user_id is null then
    raise exception 'delete_user_account_data: p_user_id must not be null';
  end if;

  -- =====================================================================
  -- BEFORE SNAPSHOT — only what's still needed: the inspired_by count (for
  -- its exact-match UPDATE check) and the cascade tables' counts (return
  -- payload only).
  -- =====================================================================
  select count(*) into v_recipes_inspired_before from public.recipes where inspired_by_id = p_user_id;

  -- Notifications belonging to OTHER users that will cascade away (via
  -- notifications.ref_id -> recipe_sends ON DELETE CASCADE) once this
  -- user's recipe_sends rows are deleted below. Tracked for the return
  -- payload only.
  select count(*) into v_notifications_cascade_extra
    from public.notifications n
    join public.recipe_sends rs on rs.id = n.ref_id
    where rs.sender_id = p_user_id and n.recipient_id <> p_user_id;

  select count(*) into v_categories_user_before from public.categories where user_id = p_user_id;
  select count(*) into v_recipes_owned_user_before from public.recipes where user_id = p_user_id;
  select count(*) into v_ingredients_user_before from public.ingredients where user_id = p_user_id;
  select count(*) into v_recipe_categories_user_before from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_occasions_user_before from public.occasions where user_id = p_user_id;
  select count(*) into v_menus_user_before from public.menus where user_id = p_user_id;
  select count(*) into v_menu_recipes_user_before from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_user_before from public.shared_recipe_discoveries where user_id = p_user_id;

  -- =====================================================================
  -- DELETIONS — fixed order, see header comment for why. Every direct
  -- DELETE uses RETURNING + a per-row ownership check (see header comment
  -- on verification strategy); the inspired_by UPDATE keeps its own exact
  -- row-count check.
  -- =====================================================================

  -- 1. Sever attribution on OTHER users' recipes BEFORE the profile delete.
  update public.recipes
     set inspired_by_name = null, inspired_by_id = null
   where inspired_by_id = p_user_id;
  get diagnostics v_inspired_by_cleared = row_count;
  if v_inspired_by_cleared <> v_recipes_inspired_before then
    raise exception 'delete_user_account_data: inspired_by clear mismatch on recipes (expected %, cleared %)', v_recipes_inspired_before, v_inspired_by_cleared;
  end if;

  v_notifications_deleted := 0;
  for v_row in
    delete from public.notifications where recipient_id = p_user_id
    returning recipient_id
  loop
    if not coalesce(v_row.recipient_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=notifications, check=recipient_id_match)';
    end if;
    v_notifications_deleted := v_notifications_deleted + 1;
  end loop;

  v_recipe_sends_deleted := 0;
  for v_row in
    delete from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id
    returning sender_id, recipient_id
  loop
    if not coalesce(v_row.sender_id = p_user_id or v_row.recipient_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=recipe_sends, check=sender_or_recipient_match)';
    end if;
    v_recipe_sends_deleted := v_recipe_sends_deleted + 1;
  end loop;

  v_connections_deleted := 0;
  for v_row in
    delete from public.connections where user_a = p_user_id or user_b = p_user_id
    returning user_a, user_b
  loop
    if not coalesce(v_row.user_a = p_user_id or v_row.user_b = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=connections, check=user_a_or_user_b_match)';
    end if;
    v_connections_deleted := v_connections_deleted + 1;
  end loop;

  v_grocery_list_shares_deleted := 0;
  for v_row in
    delete from public.grocery_list_shares where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=grocery_list_shares, check=user_id_match)';
    end if;
    v_grocery_list_shares_deleted := v_grocery_list_shares_deleted + 1;
  end loop;

  v_grocery_items_deleted := 0;
  for v_row in
    delete from public.grocery_items where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=grocery_items, check=user_id_match)';
    end if;
    v_grocery_items_deleted := v_grocery_items_deleted + 1;
  end loop;

  -- NEW — cook_posts, deleted BEFORE cook_events (see header comment on
  -- placement: cook_posts.cook_event_id cascades from cook_events, so
  -- deleting cook_events first would leave nothing for this statement to
  -- find).
  v_cook_posts_deleted := 0;
  for v_row in
    delete from public.cook_posts where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=cook_posts, check=user_id_match)';
    end if;
    v_cook_posts_deleted := v_cook_posts_deleted + 1;
  end loop;

  v_cook_events_deleted := 0;
  for v_row in
    delete from public.cook_events where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=cook_events, check=user_id_match)';
    end if;
    v_cook_events_deleted := v_cook_events_deleted + 1;
  end loop;

  v_recipe_shares_deleted := 0;
  for v_row in
    delete from public.recipe_shares where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=recipe_shares, check=user_id_match)';
    end if;
    v_recipe_shares_deleted := v_recipe_shares_deleted + 1;
  end loop;

  v_user_recipe_slices_deleted := 0;
  for v_row in
    delete from public.user_recipe_slices where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=user_recipe_slices, check=user_id_match)';
    end if;
    v_user_recipe_slices_deleted := v_user_recipe_slices_deleted + 1;
  end loop;

  v_llm_usage_deleted := 0;
  for v_row in
    delete from public.llm_usage where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=llm_usage, check=user_id_match)';
    end if;
    v_llm_usage_deleted := v_llm_usage_deleted + 1;
  end loop;

  v_user_events_deleted := 0;
  for v_row in
    delete from public.user_events where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=user_events, check=user_id_match)';
    end if;
    v_user_events_deleted := v_user_events_deleted + 1;
  end loop;

  -- Cascades: categories, recipes (owned), ingredients, recipe_categories,
  -- occasions, menus, menu_recipes, shared_recipe_discoveries.
  v_profiles_deleted := 0;
  for v_row in
    delete from public.profiles where id = p_user_id
    returning id
  loop
    if not coalesce(v_row.id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=profiles, check=id_match)';
    end if;
    v_profiles_deleted := v_profiles_deleted + 1;
  end loop;

  -- =====================================================================
  -- AFTER SNAPSHOT + VERIFICATION — zero rows remaining for this user,
  -- EVERY inventory table, direct or cascaded.
  -- =====================================================================
  select count(*) into v_recipes_inspired_after from public.recipes where inspired_by_id = p_user_id;
  select count(*) into v_notifications_user_after from public.notifications where recipient_id = p_user_id;
  select count(*) into v_recipe_sends_user_after from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id;
  select count(*) into v_connections_user_after from public.connections where user_a = p_user_id or user_b = p_user_id;
  select count(*) into v_grocery_list_shares_user_after from public.grocery_list_shares where user_id = p_user_id;
  select count(*) into v_grocery_items_user_after from public.grocery_items where user_id = p_user_id;
  select count(*) into v_cook_posts_user_after from public.cook_posts where user_id = p_user_id; -- NEW
  select count(*) into v_cook_events_user_after from public.cook_events where user_id = p_user_id;
  select count(*) into v_recipe_shares_user_after from public.recipe_shares where user_id = p_user_id;
  select count(*) into v_user_recipe_slices_user_after from public.user_recipe_slices where user_id = p_user_id;
  select count(*) into v_llm_usage_user_after from public.llm_usage where user_id = p_user_id;
  select count(*) into v_user_events_user_after from public.user_events where user_id = p_user_id;
  select count(*) into v_profiles_user_after from public.profiles where id = p_user_id;
  select count(*) into v_categories_user_after from public.categories where user_id = p_user_id;
  select count(*) into v_recipes_owned_user_after from public.recipes where user_id = p_user_id;
  select count(*) into v_ingredients_user_after from public.ingredients where user_id = p_user_id;
  select count(*) into v_recipe_categories_user_after from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_occasions_user_after from public.occasions where user_id = p_user_id;
  select count(*) into v_menus_user_after from public.menus where user_id = p_user_id;
  select count(*) into v_menu_recipes_user_after from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_user_after from public.shared_recipe_discoveries where user_id = p_user_id;

  if v_recipes_inspired_after <> 0 then
    raise exception 'delete_user_account_data: recipes.inspired_by_id still has % row(s) referencing % (expected 0)', v_recipes_inspired_after, p_user_id;
  end if;
  if v_notifications_user_after <> 0 then
    raise exception 'delete_user_account_data: notifications still has % row(s) for % (expected 0)', v_notifications_user_after, p_user_id;
  end if;
  if v_recipe_sends_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_sends still has % row(s) for % (expected 0)', v_recipe_sends_user_after, p_user_id;
  end if;
  if v_connections_user_after <> 0 then
    raise exception 'delete_user_account_data: connections still has % row(s) for % (expected 0)', v_connections_user_after, p_user_id;
  end if;
  if v_grocery_list_shares_user_after <> 0 then
    raise exception 'delete_user_account_data: grocery_list_shares still has % row(s) for % (expected 0)', v_grocery_list_shares_user_after, p_user_id;
  end if;
  if v_grocery_items_user_after <> 0 then
    raise exception 'delete_user_account_data: grocery_items still has % row(s) for % (expected 0)', v_grocery_items_user_after, p_user_id;
  end if;
  if v_cook_posts_user_after <> 0 then
    raise exception 'delete_user_account_data: cook_posts still has % row(s) for % (expected 0)', v_cook_posts_user_after, p_user_id;
  end if;
  if v_cook_events_user_after <> 0 then
    raise exception 'delete_user_account_data: cook_events still has % row(s) for % (expected 0)', v_cook_events_user_after, p_user_id;
  end if;
  if v_recipe_shares_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_shares still has % row(s) for % (expected 0)', v_recipe_shares_user_after, p_user_id;
  end if;
  if v_user_recipe_slices_user_after <> 0 then
    raise exception 'delete_user_account_data: user_recipe_slices still has % row(s) for % (expected 0)', v_user_recipe_slices_user_after, p_user_id;
  end if;
  if v_llm_usage_user_after <> 0 then
    raise exception 'delete_user_account_data: llm_usage still has % row(s) for % (expected 0)', v_llm_usage_user_after, p_user_id;
  end if;
  if v_user_events_user_after <> 0 then
    raise exception 'delete_user_account_data: user_events still has % row(s) for % (expected 0)', v_user_events_user_after, p_user_id;
  end if;
  if v_profiles_user_after <> 0 then
    raise exception 'delete_user_account_data: profiles still has % row(s) for % (expected 0)', v_profiles_user_after, p_user_id;
  end if;
  if v_categories_user_after <> 0 then
    raise exception 'delete_user_account_data: categories still has % row(s) for % after cascade (expected 0)', v_categories_user_after, p_user_id;
  end if;
  if v_recipes_owned_user_after <> 0 then
    raise exception 'delete_user_account_data: recipes (owned) still has % row(s) for % after cascade (expected 0)', v_recipes_owned_user_after, p_user_id;
  end if;
  if v_ingredients_user_after <> 0 then
    raise exception 'delete_user_account_data: ingredients still has % row(s) for % after cascade (expected 0)', v_ingredients_user_after, p_user_id;
  end if;
  if v_recipe_categories_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_categories still has % row(s) for % after cascade (expected 0)', v_recipe_categories_user_after, p_user_id;
  end if;
  if v_occasions_user_after <> 0 then
    raise exception 'delete_user_account_data: occasions still has % row(s) for % after cascade (expected 0)', v_occasions_user_after, p_user_id;
  end if;
  if v_menus_user_after <> 0 then
    raise exception 'delete_user_account_data: menus still has % row(s) for % after cascade (expected 0)', v_menus_user_after, p_user_id;
  end if;
  if v_menu_recipes_user_after <> 0 then
    raise exception 'delete_user_account_data: menu_recipes still has % row(s) for % after cascade (expected 0)', v_menu_recipes_user_after, p_user_id;
  end if;
  if v_shared_recipe_discoveries_user_after <> 0 then
    raise exception 'delete_user_account_data: shared_recipe_discoveries still has % row(s) for % after cascade (expected 0)', v_shared_recipe_discoveries_user_after, p_user_id;
  end if;

  -- =====================================================================
  -- RESULT
  -- =====================================================================
  return jsonb_build_object(
    'user_id', p_user_id,
    'inspired_by_cleared', v_inspired_by_cleared,
    'deleted', jsonb_build_object(
      'notifications', v_notifications_deleted,
      'notifications_cascaded_from_recipe_sends', v_notifications_cascade_extra,
      'recipe_sends', v_recipe_sends_deleted,
      'connections', v_connections_deleted,
      'grocery_list_shares', v_grocery_list_shares_deleted,
      'grocery_items', v_grocery_items_deleted,
      'cook_posts', v_cook_posts_deleted,
      'cook_events', v_cook_events_deleted,
      'recipe_shares', v_recipe_shares_deleted,
      'user_recipe_slices', v_user_recipe_slices_deleted,
      'llm_usage', v_llm_usage_deleted,
      'user_events', v_user_events_deleted,
      'profiles', v_profiles_deleted,
      'categories_cascaded', v_categories_user_before,
      'recipes_cascaded', v_recipes_owned_user_before,
      'ingredients_cascaded', v_ingredients_user_before,
      'recipe_categories_cascaded', v_recipe_categories_user_before,
      'occasions_cascaded', v_occasions_user_before,
      'menus_cascaded', v_menus_user_before,
      'menu_recipes_cascaded', v_menu_recipes_user_before,
      'shared_recipe_discoveries_cascaded', v_shared_recipe_discoveries_user_before
    )
  );
end;
$$;

revoke all on function public.delete_user_account_data(uuid) from public;
revoke all on function public.delete_user_account_data(uuid) from anon;
revoke all on function public.delete_user_account_data(uuid) from authenticated;
grant execute on function public.delete_user_account_data(uuid) to service_role;

COMMIT;
