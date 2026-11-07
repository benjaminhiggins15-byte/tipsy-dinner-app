-- DRAFT -- NOT APPLIED. Rollback companion for feed_parts_preview.sql.
-- Restores get_cook_feed to its pre-parts-preview signature (the version
-- live in production as of 20261102000001_post_groupings_v1_5.sql).

drop function if exists public.get_cook_feed(int, timestamptz, uuid);

create or replace function public.get_cook_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  post_id uuid, created_at timestamptz, cooked_on date, score numeric(3,1),
  note text, photo_url text, photo_source text,
  grouping_kind text, grouping_title text, grouping_description text,
  poster_id uuid, poster_display_name text, poster_handle text
)
language plpgsql security definer set search_path = public as $$
declare v_caller_id uuid; v_limit int;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then raise exception 'not authenticated'; end if;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
    select cp.id, cp.created_at, cp.cooked_on, cp.score, cp.note, cp.photo_url, cp.photo_source,
           cp.grouping_snapshot ->> 'kind',
           coalesce(cp.grouping_snapshot ->> 'title', cp.grouping_snapshot -> 'parts' -> 0 -> 'recipe' ->> 'title'),
           case when cp.grouping_snapshot ->> 'kind' = 'recipe'
                then cp.grouping_snapshot -> 'parts' -> 0 -> 'recipe' ->> 'description'
                else null end,
           p.id, coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'), p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    where cp.is_posted = true
      and (p_before_created_at is null or p_before_id is null
           or (cp.created_at, cp.id) < (p_before_created_at, p_before_id))
    order by cp.created_at desc, cp.id desc
    limit v_limit;
end; $$;

revoke execute on function public.get_cook_feed(int, timestamptz, uuid) from public, anon;
grant execute on function public.get_cook_feed(int, timestamptz, uuid) to authenticated;
