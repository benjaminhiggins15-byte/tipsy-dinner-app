-- DRAFT -- LOCAL TEST ONLY. Reverses exactly menu_contains_dish.sql (same
-- directory), nothing else. Do NOT run against the linked/production
-- project without explicit founder approval, per CLAUDE.md.
--
-- Safety: aborts (raises, no changes committed -- the whole file runs as one
-- statement batch) if any grouping_parts row still has child_grouping_id
-- set. Dropping the column would silently discard that data, so this
-- refuses rather than doing it quietly.
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.grouping_parts where child_grouping_id is not null;
  if v_count <> 0 then
    raise exception 'menu_contains_dish_rollback: % grouping_parts row(s) still have child_grouping_id set -- refusing to drop the column. Unlink or delete them first.', v_count;
  end if;
end $$;

-- ============================================================
-- 1. save_grouping_from_post -- restore pre-dish-nesting version
-- ============================================================
-- Body below is copied verbatim (comments included) from production's live
-- pg_get_functiondef('public.save_grouping_from_post(uuid,uuid)') as of
-- 2026-11-04, confirmed via the drift check -- this is a true byte-for-byte
-- restore of the function body, not a re-derivation from memory.
create or replace function public.save_grouping_from_post(
  p_post_id     uuid,
  p_category_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id     uuid;
  v_poster_id     uuid;
  v_snapshot      jsonb;
  v_credit_name   text;
  v_grouping_id   uuid;
  v_existing_id   uuid;
  v_part          jsonb;
  v_new_recipe_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  select user_id, grouping_snapshot into v_poster_id, v_snapshot
  from public.cook_posts where id = p_post_id and is_posted = true;
  if v_snapshot is null then
    raise exception 'post not found or not public';
  end if;

  -- p_category_id ownership was unchecked in an earlier draft -- a caller
  -- could stamp any user's category id onto their own new recipes.
  if not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_caller_id
  ) then
    raise exception 'category not found or not owned by caller';
  end if;

  select id into v_existing_id from public.groupings
  where user_id = v_caller_id and source_post_id = p_post_id;
  if v_existing_id is not null then
    return v_existing_id; -- idempotent re-save
  end if;

  select coalesce(display_name, '@' || handle, 'A Tipsy Dinner cook')
    into v_credit_name from public.profiles where id = v_poster_id;

  insert into public.groupings (user_id, kind, title, source_post_id)
  values (v_caller_id, (v_snapshot->>'kind')::grouping_kind, v_snapshot->>'title', p_post_id)
  returning id into v_grouping_id;

  for v_part in select * from jsonb_array_elements(v_snapshot->'parts') loop
    if (v_part->'recipe') is not null and v_part->'recipe' <> 'null'::jsonb then

      -- Field-by-field match against today's saveRecipe/saveFeedRecipe
      -- (src/tipsy/data.ts): user_id, title, description, steps,
      -- created_at, source('manual') all match exactly.
      --
      -- cook_time/serves: today's saveRecipe silently drops both even
      -- though recipes has the columns and RecipeSendSnapshot carries
      -- them -- founder decision: persist them here (free, since the
      -- snapshot already has them); backporting the fix to today's
      -- saveFeedRecipe/saveReceivedRecipe is separate, later work.
      --
      -- Column type note: recipes.cook_time/recipes.serves are
      -- dashboard-only (no migration declares them), inferred as `text`
      -- from RecipeSendSnapshot's `string | null` TS type and 3 of 4
      -- call sites in data.ts. One call site (~data.ts:966-967) types
      -- them `number | null` instead -- a pre-existing inconsistency in
      -- app code, not introduced here. Recommend a one-time read-only
      -- type confirmation before applying (see cutover doc, testing).
      insert into public.recipes (
        user_id, title, description, steps, created_at, source,
        cook_time, serves, inspired_by_id, inspired_by_name
      )
      values (
        v_caller_id, v_part->'recipe'->>'title', v_part->'recipe'->>'description',
        v_part->'recipe'->'steps', now(), 'manual',
        v_part->'recipe'->>'cook_time', v_part->'recipe'->>'serves',
        nullif(v_poster_id, v_caller_id),
        case when v_poster_id <> v_caller_id then v_credit_name end
      )
      returning id into v_new_recipe_id;

      -- sort_order RE-DERIVED from array position (0-based), matching
      -- saveRecipe's `.map((ing, index) => ({ ..., sort_order: index }))`
      -- exactly -- any sort_order embedded in the snapshot is discarded,
      -- same as today. Column types confirmed: ingredients.name/quantity
      -- are text (free-text, per CLAUDE.md), sort_order is integer.
      insert into public.ingredients (recipe_id, user_id, name, quantity, sort_order)
      select v_new_recipe_id, v_caller_id, ing->>'name', ing->>'quantity', (ord - 1)::int
      from jsonb_array_elements(v_part->'recipe'->'ingredients') with ordinality as t(ing, ord);

      insert into public.recipe_categories (recipe_id, category_id, user_id)
      values (v_new_recipe_id, p_category_id, v_caller_id);

      insert into public.grouping_parts (grouping_id, section, recipe_id, position)
      values (v_grouping_id, v_part->>'section', v_new_recipe_id, (v_part->>'position')::int);
    else
      insert into public.grouping_parts (grouping_id, section, freeform_text, position)
      values (v_grouping_id, v_part->>'section', v_part->>'freeform_text', (v_part->>'position')::int);
    end if;
  end loop;

  return v_grouping_id;
end; $$;

revoke execute on function public.save_grouping_from_post(uuid, uuid) from public, anon;
grant execute on function public.save_grouping_from_post(uuid, uuid) to authenticated;

-- ============================================================
-- 2. grouping_parts_before_write -- restore pre-child_grouping_id version
-- ============================================================
-- Body below is copied verbatim (comments included) from production's live
-- pg_get_functiondef('public.grouping_parts_before_write()') as of
-- 2026-11-04, confirmed via the drift check -- a true byte-for-byte restore.
create or replace function public.grouping_parts_before_write()
returns trigger language plpgsql as $$
declare
  v_kind  grouping_kind;
  v_owner uuid;
begin
  select kind, user_id into v_kind, v_owner from public.groupings where id = new.grouping_id;
  if v_owner is null then
    raise exception 'grouping_parts: parent grouping not found';
  end if;

  new.user_id := v_owner;

  -- A recipe_id part must reference a recipe owned by the grouping's own
  -- owner -- without this, grouping_parts_all_own's RLS check (which only
  -- validates user_id, trigger-stamped above) would let a caller attach
  -- someone else's recipe_id into their own grouping.
  if new.recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = new.recipe_id and r.user_id = v_owner
  ) then
    raise exception 'grouping_parts: recipe_id must belong to the grouping owner';
  end if;

  if v_kind = 'recipe' then
    if new.section is not null then
      raise exception 'recipe-kind parts must have a null section';
    end if;

  elsif v_kind = 'dish' then
    if new.section is null or new.section not in ('component', 'also') then
      raise exception 'dish-kind parts must have section component or also';
    end if;
    if new.section = 'also' and new.recipe_id is not null then
      raise exception 'dish "also" parts must be freeform text, not a recipe reference';
    end if;
    if new.section = 'component' and new.recipe_id is null then
      raise exception 'dish "component" parts must be a recipe reference, not freeform text';
    end if;

  elsif v_kind = 'menu' then
    if new.section is null or new.section not in ('apps','mains','sides','desserts','drinks') then
      raise exception 'menu-kind parts must have a valid course section';
    end if;
  end if;

  return new;
end; $$;

-- ============================================================
-- 3. grouping_parts -- drop the three-way constraint, restore the xor,
--    drop the column
-- ============================================================
alter table public.grouping_parts
  drop constraint grouping_parts_exactly_one_target;

alter table public.grouping_parts
  add constraint grouping_parts_recipe_xor_freeform check (
    (recipe_id is not null and freeform_text is null) or
    (recipe_id is null and freeform_text is not null)
  );

alter table public.grouping_parts
  drop column child_grouping_id;
