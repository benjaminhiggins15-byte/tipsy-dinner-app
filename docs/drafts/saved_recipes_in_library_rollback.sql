-- DRAFT -- LOCAL TEST ONLY. Rollback for docs/drafts/saved_recipes_in_library.sql.
-- Do NOT run against the linked/production project without explicit founder
-- approval, per CLAUDE.md.
--
-- Reverses EXACTLY that change (the in_library column, the category-
-- optional/in_library logic in save_grouping_from_post, and the new
-- add_recipe_to_library function) -- nothing from the earlier
-- post_groupings_v1_5.sql / menu_contains_dish.sql drafts it was built on
-- top of.
--
-- Safety: aborts (no-op) if any recipe is currently hidden
-- (in_library = false) -- dropping the column at that point would silently
-- destroy the "hidden until promoted" state for those rows (they'd revert
-- to the DEFAULT true visible everywhere, including a stale
-- recipe_categories-less row in getSavedRecipesAll/getSavedRecipesForCategory's
-- inner-joined list views -- or worse, simply vanish from every list with no
-- trace of ever having been saved, per CLAUDE.md's "a recipe with no
-- recipe_categories row is invisible in every library view" contract).
-- Clean rollback requires first resolving every hidden row -- either by
-- promoting it via add_recipe_to_library or deleting it -- a real decision,
-- not something this script should make silently.

begin;

do $$
declare
  v_hidden_count bigint;
begin
  select count(*) into v_hidden_count from public.recipes where in_library = false;
  if v_hidden_count <> 0 then
    raise exception 'saved_recipes_in_library rollback aborted: % recipe(s) still have in_library = false -- resolve them (promote via add_recipe_to_library, or delete) before rolling back', v_hidden_count;
  end if;
end $$;

drop function if exists public.add_recipe_to_library(uuid, uuid);

-- Restored verbatim from this local instance's live definition immediately
-- before saved_recipes_in_library.sql was applied (menu_contains_dish.sql's
-- version -- captured via pg_get_functiondef and diffed against the source
-- file before writing this rollback, byte-identical apart from the file
-- header). p_category_id reverts to required (no default); every recipe
-- created by a dish/menu save once again files a recipe_categories row
-- under the caller-supplied category, exactly as it did before this change.
--
-- DROP first: Postgres's CREATE OR REPLACE cannot remove a parameter
-- default from an existing function signature (confirmed by trying it
-- directly against the local instance) -- the argument TYPES are unchanged
-- (uuid, uuid), but going from "p_category_id uuid DEFAULT NULL" back to a
-- required "p_category_id uuid" needs the old version gone first.
drop function if exists public.save_grouping_from_post(uuid, uuid);

create or replace function public.save_grouping_from_post(
  p_post_id     uuid,
  p_category_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id       uuid;
  v_poster_id       uuid;
  v_snapshot        jsonb;
  v_credit_name     text;
  v_grouping_id     uuid;
  v_existing_id     uuid;
  v_part            jsonb;
  v_dish_part       jsonb;
  v_new_recipe_id   uuid;
  v_dish_grouping_id uuid;
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

    elsif (v_part->'dish') is not null and v_part->'dish' <> 'null'::jsonb then

      -- The embedded dish becomes its own grouping, owned by the saver, NOT
      -- source_post_id-tagged (only the top-level saved grouping gets one --
      -- see header comment). Its recipe parts get the same inspired_by
      -- credit as every other recipe created by this save.
      insert into public.groupings (user_id, kind, title)
      values (v_caller_id, 'dish', v_part->'dish'->>'title')
      returning id into v_dish_grouping_id;

      for v_dish_part in select * from jsonb_array_elements(v_part->'dish'->'parts') loop
        if (v_dish_part->'recipe') is not null and v_dish_part->'recipe' <> 'null'::jsonb then

          -- Same field-by-field mapping, cook_time/serves persistence, and
          -- column-type caveats as the top-level recipe branch above --
          -- see its comment for detail; not restated here to avoid two
          -- copies of the same explanation drifting apart.
          insert into public.recipes (
            user_id, title, description, steps, created_at, source,
            cook_time, serves, inspired_by_id, inspired_by_name
          )
          values (
            v_caller_id, v_dish_part->'recipe'->>'title', v_dish_part->'recipe'->>'description',
            v_dish_part->'recipe'->'steps', now(), 'manual',
            v_dish_part->'recipe'->>'cook_time', v_dish_part->'recipe'->>'serves',
            nullif(v_poster_id, v_caller_id),
            case when v_poster_id <> v_caller_id then v_credit_name end
          )
          returning id into v_new_recipe_id;

          -- sort_order re-derivation: same as the top-level recipe branch
          -- above -- see its comment for detail.
          insert into public.ingredients (recipe_id, user_id, name, quantity, sort_order)
          select v_new_recipe_id, v_caller_id, ing->>'name', ing->>'quantity', (ord - 1)::int
          from jsonb_array_elements(v_dish_part->'recipe'->'ingredients') with ordinality as t(ing, ord);

          insert into public.recipe_categories (recipe_id, category_id, user_id)
          values (v_new_recipe_id, p_category_id, v_caller_id);

          insert into public.grouping_parts (grouping_id, section, recipe_id, position)
          values (v_dish_grouping_id, v_dish_part->>'section', v_new_recipe_id, (v_dish_part->>'position')::int);
        else
          insert into public.grouping_parts (grouping_id, section, freeform_text, position)
          values (v_dish_grouping_id, v_dish_part->>'section', v_dish_part->>'freeform_text', (v_dish_part->>'position')::int);
        end if;
      end loop;

      insert into public.grouping_parts (grouping_id, section, child_grouping_id, position)
      values (v_grouping_id, v_part->>'section', v_dish_grouping_id, (v_part->>'position')::int);

    else
      insert into public.grouping_parts (grouping_id, section, freeform_text, position)
      values (v_grouping_id, v_part->>'section', v_part->>'freeform_text', (v_part->>'position')::int);
    end if;
  end loop;

  return v_grouping_id;
end; $$;

revoke execute on function public.save_grouping_from_post(uuid, uuid) from public, anon;
grant execute on function public.save_grouping_from_post(uuid, uuid) to authenticated;

alter table public.recipes drop column in_library;

commit;
