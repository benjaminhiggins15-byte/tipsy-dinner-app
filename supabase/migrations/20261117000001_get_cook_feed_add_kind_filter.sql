-- DRAFT -- NOT APPLIED. Per CLAUDE.md's Session Rules, any write to the
-- shared Supabase DB requires explicit founder approval first; this file is
-- staged for review only. Do not run `supabase migration repair` / push /
-- apply against the linked project until that approval is given.
--
-- Home Redesign -- Section 2: feed type filter.
--
-- Why: Home needs two separate feed reads -- RECIPE posts only (the "cooked
-- lately" rail) and DISH+MENU posts only (the hero) -- and the feed screen
-- is getting type filters of its own. get_cook_feed today has no kind
-- filter, so a client-side filter-after-fetch would break keyset pagination
-- (a filtered page could come back thinner than p_limit purely because
-- non-matching rows were discarded client-side, making "has more" and the
-- next cursor both unreliable).
--
-- Only change: one new OPTIONAL trailing parameter, p_kinds text[] DEFAULT
-- NULL. NULL (the default) means "all kinds" -- today's exact behavior,
-- unchanged. A non-null array (e.g. '{recipe}' or '{dish,menu}') filters on
-- the same cp.grouping_snapshot ->> 'kind' expression the SELECT list
-- already computes, added to the WHERE clause so it's applied BEFORE
-- `order by ... limit v_limit` -- pagination within a filtered view stays
-- correct because the keyset comparison and the kind filter both run in the
-- same WHERE clause, ahead of the limit, exactly like the existing
-- is_posted/before-cursor predicates.
--
-- Signature-change trap (see CLAUDE.md / task brief): Postgres identifies a
-- function by name + parameter TYPE list. Adding a parameter changes that
-- list, so a bare CREATE OR REPLACE would create a SECOND, overloaded
-- get_cook_feed rather than replacing the current one -- and PostgREST's
-- RPC dispatch becomes ambiguous (or silently picks a resolution order) the
-- moment two overloads exist. Handled explicitly: DROP the current
-- 3-param signature and CREATE the new 4-param one in the same transaction,
-- so exactly one get_cook_feed ever exists at a time. Every other property
-- (body logic, SECURITY DEFINER, search_path, REVOKE/GRANT set) is restated
-- identically to the live definition in 20261107000001_feed_parts_preview.sql
-- -- this is purely "add one optional parameter and one WHERE predicate."
--
-- Backward compatibility: a caller that omits p_kinds (every existing call
-- site today -- see getCookFeed() in src/tipsy/data.ts and its callers in
-- App.tsx/CookFeed.tsx, none of which pass a third/fourth arg) gets
-- p_kinds = NULL, which short-circuits the new predicate to true for every
-- row -- byte-for-byte the same result set, same order, same pagination
-- behavior as before this migration.
BEGIN;

DROP FUNCTION IF EXISTS public.get_cook_feed(int, timestamptz, uuid);

create or replace function public.get_cook_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_kinds text[] default null
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
      -- New filter, added BEFORE the limit (same WHERE clause as the keyset
      -- cursor predicate above) so pagination stays correct within a
      -- filtered view. NULL (default) short-circuits to true for every row
      -- -- see the file header for the backward-compat argument.
      and (p_kinds is null or (cp.grouping_snapshot ->> 'kind') = any (p_kinds))
    order by cp.created_at desc, cp.id desc
    limit v_limit;
end; $$;

revoke execute on function public.get_cook_feed(int, timestamptz, uuid, text[]) from public, anon;
grant execute on function public.get_cook_feed(int, timestamptz, uuid, text[]) to authenticated;

-- PostgREST caches the function signature it discovered at schema-load time;
-- without this, a request issued before the next automatic cache refresh
-- could still resolve against the just-dropped 3-param signature and 404,
-- or (worse, if PostgREST's cache briefly holds both an old and new
-- reflection mid-reload) resurface the exact overload ambiguity this
-- migration's DROP was written to prevent. Queued here, inside the
-- transaction; Postgres delivers NOTIFY at COMMIT, after the DROP/CREATE/
-- GRANT above are durable, so there is no window where PostgREST could
-- reload and see a half-applied state.
NOTIFY pgrst, 'reload schema';

COMMIT;
