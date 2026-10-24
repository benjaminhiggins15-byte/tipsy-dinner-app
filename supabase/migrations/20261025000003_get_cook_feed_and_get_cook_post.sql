-- DRAFT -- NOT APPLIED. Written for founder review per the Session Rules
-- (no DB write without explicit founder approval). Do not run
-- `supabase migration repair` / push / apply against the linked project
-- until that approval is given.
--
-- Cooking Feed -- Step 2a: narrow read path.
--
-- cook_posts (see 20261025000001_cook_posts_feed_v1.sql) is owner-only RLS
-- (cook_posts_select_own: auth.uid() = user_id), no UPDATE policy, all FKs
-- ON DELETE CASCADE. A public feed needs to read EVERY user's posted cooks,
-- which the owner-only policy can never allow directly. Per CLAUDE.md's
-- established pattern (get_recipe_share_by_token, search_profiles,
-- get_my_connections, get_suggested_recipe), the fix is a narrow
-- SECURITY DEFINER function, never a new table policy -- RLS on cook_posts
-- is untouched by this migration.
--
-- Two functions:
--   get_cook_feed  -- keyset-paginated card list, newest first
--   get_cook_post  -- single post, full frozen snapshot, for tap-through
--
-- Both read ONLY cook_posts + profiles display fields. Neither touches
-- recipes, cook_events, or either storage bucket directly -- the frozen
-- recipe_snapshot and the already-public recipe-photos photo_url are
-- sufficient for display with no further joins.

-- ---------------------------------------------------------------------
-- get_cook_feed: newest-first, keyset-paginated card list.
--
-- Cursor is the (created_at, id) pair of the last row the caller already
-- has, not an OFFSET -- offset pagination would re-shift under concurrent
-- inserts (new posts land at the top of a feed query by definition). Both
-- cursor args must be passed together from the last row of the previous
-- page; if either is null, the first page is returned. created_at alone is
-- not safe as a cursor: timestamptz has microsecond resolution so a tie is
-- unlikely but not impossible, and silently losing or duplicating a row on
-- a tie is worse than requiring both columns.
--
-- Returns ONLY card fields -- recipe_title is pulled out of the frozen
-- snapshot, not the whole snapshot. Full snapshot is get_cook_post's job.
-- ---------------------------------------------------------------------
create or replace function public.get_cook_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  post_id uuid,
  created_at timestamptz,
  cooked_on date,
  score numeric(3,1),
  note text,
  photo_url text,
  recipe_title text,
  poster_id uuid,
  poster_display_name text,
  poster_handle text
)
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
      cp.recipe_snapshot ->> 'title',
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

-- ---------------------------------------------------------------------
-- get_cook_post: single post, full frozen snapshot, for tap-through from
-- the feed card into a read-only recipe view. No existence/ownership
-- check beyond "the post exists" -- the feed is global, not
-- connection-scoped (see report's open question on feed scope), so any
-- authenticated caller may tap through to any posted cook's snapshot.
-- Returns zero rows (not an error) if the id doesn't exist, matching
-- get_suggested_recipe's not-entitled-returns-nothing shape rather than
-- get_recipe_share_by_token's return-null shape (this is a `returns
-- table`, not a `returns jsonb`, function).
-- ---------------------------------------------------------------------
create or replace function public.get_cook_post(p_post_id uuid)
returns table (
  post_id uuid,
  created_at timestamptz,
  cooked_on date,
  score numeric(3,1),
  note text,
  photo_url text,
  recipe_snapshot jsonb,
  poster_id uuid,
  poster_display_name text,
  poster_handle text
)
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
