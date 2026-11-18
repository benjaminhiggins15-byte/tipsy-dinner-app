-- DRAFT -- NOT APPLIED. Rollback companion for
-- 20261117000001_get_cook_feed_add_kind_filter.sql. Restores get_cook_feed
-- to its pre-kind-filter signature (the version live in production as of
-- 20261107000001_feed_parts_preview.sql) -- drops the 4-param signature and
-- recreates the 3-param one, same DROP + CREATE discipline as the forward
-- migration (signature is changing, so CREATE OR REPLACE alone would not
-- remove the 4-param overload).

drop function if exists public.get_cook_feed(int, timestamptz, uuid, text[]);

create or replace function public.get_cook_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  post_id uuid, created_at timestamptz, cooked_on date, score numeric(3,1),
  note text, photo_url text, photo_source text,
  grouping_kind text, grouping_title text, grouping_description text,
  parts_preview text[], parts_remaining int,
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
           pv.parts_preview, pv.parts_remaining,
           p.id, coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'), p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    left join lateral (
      select
        case cp.grouping_snapshot ->> 'kind'
          when 'dish' then (
            select array_agg(label order by ord) from (
              select coalesce(part -> 'recipe' ->> 'title', part ->> 'freeform_text') as label, ord
              from jsonb_array_elements(cp.grouping_snapshot -> 'parts') with ordinality as t(part, ord)
              order by ord
              limit 3
            ) s
          )
          when 'menu' then (
            select array_agg(label order by ord) from (
              select coalesce(part -> 'dish' ->> 'title', part -> 'recipe' ->> 'title') as label, ord
              from jsonb_array_elements(cp.grouping_snapshot -> 'parts') with ordinality as t(part, ord)
              where (part ->> 'dish') is not null or (part ->> 'recipe') is not null
              order by ord
              limit 2
            ) s
          )
          else null
        end as parts_preview,
        case cp.grouping_snapshot ->> 'kind'
          when 'dish' then greatest(0,
            (select count(*)::int from jsonb_array_elements(cp.grouping_snapshot -> 'parts')) - 3)
          when 'menu' then greatest(0,
            (select count(*)::int from jsonb_array_elements(cp.grouping_snapshot -> 'parts') as t(part)
             where (t.part ->> 'dish') is not null or (t.part ->> 'recipe') is not null) - 2)
          else null
        end as parts_remaining
    ) pv on true
    where cp.is_posted = true
      and (p_before_created_at is null or p_before_id is null
           or (cp.created_at, cp.id) < (p_before_created_at, p_before_id))
    order by cp.created_at desc, cp.id desc
    limit v_limit;
end; $$;

revoke execute on function public.get_cook_feed(int, timestamptz, uuid) from public, anon;
grant execute on function public.get_cook_feed(int, timestamptz, uuid) to authenticated;
