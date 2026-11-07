-- Hand-applied to production 2026-11-07 via supabase db query --linked.
--
-- Why this is needed: get_cook_feed (supabase/migrations/20261102000001_
-- post_groupings_v1_5.sql, lines 356-406) returns grouping_kind/title/
-- description but nothing about a dish/menu's contents. The feed card for a
-- dish or menu post currently has no way to show a parts preview (e.g.
-- "Grilled Salmon, Roasted Asparagus +2 more") -- it can only show the bare
-- title. This migration adds two new trailing columns, parts_preview
-- (text[]) and parts_remaining (int), computed from the already-frozen
-- grouping_snapshot jsonb (no extra joins to grouping_parts/groupings, no
-- new RLS surface).
--
-- Preview rules (client-facing spec from the task brief):
--   dish: first 3 part labels (recipe title, or freeform_text if no
--         recipe), in position order. remaining = total parts - 3 (floor 0).
--   menu: first 2 "dish or recipe" labels only (embedded-dish title or
--         recipe title) -- freeform lines are deliberately excluded from
--         the preview itself, since a freeform menu line (e.g. "candles")
--         is not a dish being served. remaining = count of dish-or-recipe
--         parts - 2 (floor 0). This means a menu with freeform lines may
--         show a remaining count that undercounts total raw parts -- that
--         is intentional: the count describes "more dishes/recipes," not
--         "more rows."
--   recipe: both columns are null (unaffected -- a single-recipe post
--         already shows its own title via the existing fallback logic).
--
-- Must DROP + CREATE (not CREATE OR REPLACE): the RETURNS TABLE shape is
-- gaining columns, same reason the original 20261102000001 migration had to
-- drop get_cook_feed's prior signature before redefining it.
--
-- Found and fixed during local verification (dishes-menus-v1-5 branch,
-- 2026-11-07): the menu-kind freeform-exclusion filter must use jsonb `->>`,
-- not `->` -- a freeform part's `recipe`/`dish` keys are present but set to
-- JSON null (GroupingPartSnapshot always serializes them), and `->` treats
-- "present with JSON null" as non-NULL, so freeform lines were leaking into
-- the menu preview/remaining-count. `->>` collapses JSON null to SQL NULL,
-- fixing both the preview CTE and the remaining-count CASE below.
--
-- Rollback companion: docs/drafts/feed_parts_preview_rollback.sql (not
-- copied into migrations -- stays a draft-only reference).

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
              -- ->> (not ->) deliberately: a freeform part's `recipe`/`dish` keys
              -- are present but set to JSON null (GroupingPartSnapshot always
              -- serializes them), and `jsonb -> key` treats "present with JSON
              -- null" as non-NULL. `->>` collapses JSON null to SQL NULL, so
              -- freeform parts are correctly excluded here.
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
             -- Same ->> fix as the preview CTE above -- see that comment.
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
