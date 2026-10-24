-- DRAFT -- NOT APPLIED. Written for founder review per the Session Rules
-- (no DB write without explicit founder approval). Do not run
-- `supabase migration repair` / push / apply against the linked project
-- until that approval is given.
--
-- Cooking Feed -- photo provenance.
--
-- Today a cook_posts row's photo_url is byte-copied from one of two sources
-- (postCook, data.ts: this cook's own cook-photos-private object, else the
-- recipe's live recipe-photos object, else none) but the row never records
-- WHICH source it came from. The feed needs that distinction at render time:
-- a big-photo card layout only when the photo is the cook's own, a compact
-- card with a small thumbnail when it's the recipe fallback (or no photo at
-- all). A later, separate build will add a user-chosen AI "illustration"
-- option as a third source -- this column is sized for that from the start,
-- but that option is NOT added here.
--
-- Two parts, same migration:
--   1. cook_posts.photo_source (new column + CHECK)
--   2. get_cook_feed / get_cook_post updated to return it
--
-- ============================================================================
-- 1. cook_posts.photo_source
-- ============================================================================
-- Nullable: NULL means "no photo" (photo_url is also NULL in that case,
-- though this is not cross-validated by a CHECK -- see note below). Existing
-- rows (posted before this column existed) stay NULL -- acceptable, per the
-- task: those posts simply render as the compact/thumbnail layout, same as
-- any other no-provenance case, rather than being backfilled.
--
-- CHECK is deliberately a plain allow-list, not a cross-column rule tying
-- photo_source to photo_url's presence -- keeping it simple to widen (e.g.
-- adding 'illustration' later is a one-line change to this list, same
-- pattern as any other narrow allow-list CHECK in this schema) rather than a
-- more rigid constraint that would need rewriting alongside the list.
ALTER TABLE public.cook_posts
  ADD COLUMN IF NOT EXISTS photo_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_posts_photo_source_chk'
  ) THEN
    ALTER TABLE public.cook_posts
      ADD CONSTRAINT cook_posts_photo_source_chk
      CHECK (photo_source IS NULL OR photo_source IN ('cook', 'recipe'));
  END IF;
END $$;

-- No change needed to cook_posts_insert_own (WITH CHECK only constrains
-- user_id/cook_event_id/recipe_id consistency, never touched photo columns)
-- or to cook_posts_photo_url_shape_chk (keys off user_id/id only, independent
-- of this column). Both keep working unchanged against the wider row shape.

-- ============================================================================
-- 2. get_cook_feed / get_cook_post: also return photo_source
-- ============================================================================
-- NOTE: adding an output column to a `returns table (...)` function is a
-- RETURN-TYPE change -- Postgres rejects this under CREATE OR REPLACE
-- ("cannot change return type of existing function"). Both functions must be
-- dropped and recreated, not replaced in place. Every other property
-- (parameters, body logic, security settings) is unchanged from the live
-- 20261025000003 definitions -- this is purely "add one more column to the
-- SELECT list and the RETURNS TABLE clause."
--
-- Explicit BEGIN/COMMIT around the drop-through-grant sequence below (per
-- founder instruction) so the two functions are never, even momentarily,
-- missing or mis-granted to a concurrent caller: Postgres DDL is already
-- transactional, so without this wrapper each statement here would still
-- auto-commit individually, leaving a real (if narrow) window after the
-- DROPs and before the matching GRANTs where get_cook_feed/get_cook_post
-- would not exist at all for any caller hitting the feed mid-migration.
BEGIN;

DROP FUNCTION IF EXISTS public.get_cook_feed(int, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_cook_post(uuid);

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
  photo_source text,
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
      cp.photo_source,
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

create or replace function public.get_cook_post(p_post_id uuid)
returns table (
  post_id uuid,
  created_at timestamptz,
  cooked_on date,
  score numeric(3,1),
  note text,
  photo_url text,
  photo_source text,
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

COMMIT;

-- ============================================================================
-- EXPLICITLY NOT IN THIS MIGRATION
-- ============================================================================
-- - The 'illustration' CHECK value and whatever AI-generation plumbing it
--   needs -- future, separate work. Adding it later is a one-line CHECK
--   change (drop + recreate the constraint), no column/shape change.
-- - A backfill of photo_source for rows posted before this column existed --
--   they stay NULL, which the feed already treats as "render compact," so no
--   backfill is required for correctness.
-- - The postCook (data.ts) app-code change that actually populates this
--   column -- drafted separately, not run; see the task report.
