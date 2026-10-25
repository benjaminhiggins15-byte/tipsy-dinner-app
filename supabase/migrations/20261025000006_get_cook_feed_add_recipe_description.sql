-- DRAFT -- NOT APPLIED. Per CLAUDE.md's Session Rules, any write to the
-- shared Supabase DB requires explicit founder approval first; this file is
-- staged for review only. Do not run `supabase migration repair` / push /
-- apply against the linked project until that approval is given.
--
-- Feed Card Redesign -- the new image-forward card needs the recipe's
-- description (Recipe Card's italic-description styling) in addition to the
-- title get_cook_feed already returns.
--
-- Field audit against the frozen recipe_snapshot shape (RecipeSendSnapshot,
-- data.ts): its keys are exactly
--   title, description, ingredients, steps, cook_time, serves
-- -- confirmed both from the TS type and by inspecting live rows
-- (`select jsonb_object_keys(recipe_snapshot) from cook_posts`). There is NO
-- inspired-by/credit key in this shape at all -- postCook's SELECT against
-- `recipes` never fetches `inspired_by_name` (it only reads title,
-- description, steps, cook_time, serves, photo_url, ingredients), so the
-- snapshot never carries it, even though `recipes.inspired_by_name` exists
-- as a live column elsewhere in the schema. Per the task's instruction to
-- extract from the frozen snapshot ONLY (never joining back to the live
-- `recipes` row -- that's the whole point of freezing a snapshot, per
-- cook_posts_feed_v1's "read safety" design comment), there is nothing to
-- add for an inspired-by credit. OMITTED here, not added as a NULL-returning
-- stub -- a future snapshot-shape change (adding an inspired-by field to
-- RecipeSendSnapshot/postCook) would be a separate, deliberate decision, not
-- something this migration should pre-guess.
--
-- Only change: add recipe_description (text), extracted the same way
-- recipe_title already is: cp.recipe_snapshot ->> 'description'.
--
-- NOTE: adding an output column to a `returns table (...)` function is a
-- return-type change -- Postgres rejects this under CREATE OR REPLACE
-- ("cannot change return type of existing function"), so this must DROP and
-- recreate, not replace in place (same as 20261025000004). Every other
-- property (parameters, body logic, security settings) is restated
-- identically to the live definition -- this is purely "add one more column
-- to the SELECT list and the RETURNS TABLE clause." get_cook_post is
-- untouched -- it already returns the full recipe_snapshot, so its caller
-- (the tap-through detail view) already has the description; only the feed
-- list function needs the new column.
--
-- Explicit BEGIN/COMMIT (per founder instruction, same as 20261025000004) so
-- get_cook_feed is never, even momentarily, missing or mis-granted to a
-- concurrent caller between the DROP and the matching GRANT.
BEGIN;

DROP FUNCTION IF EXISTS public.get_cook_feed(int, timestamptz, uuid);

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
  recipe_description text,
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

COMMIT;

-- ============================================================================
-- EXPLICITLY NOT IN THIS MIGRATION
-- ============================================================================
-- - get_cook_post -- untouched; already returns the full recipe_snapshot.
-- - An inspired-by/credit field -- no such key exists in the frozen
--   recipe_snapshot shape today (see audit above). Still does NOT return the
--   full snapshot from get_cook_feed -- only one more named scalar column,
--   same discipline as every other field this function exposes.
-- - CookFeedCard's app-code redesign -- separate, app-code-only change; see
--   the task report.
