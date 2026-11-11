-- Hand-applied to production 2026-11-11 via supabase db query --linked.
--
-- Builds on post_groupings_v1_5 (supabase/migrations/20261102000001_
-- post_groupings_v1_5.sql) + menu_contains_dish (supabase/migrations/
-- 20261104000001_menu_contains_dish.sql), both already live in production
-- (confirmed by a pre-apply drift check against production's live
-- save_grouping_from_post, which already matched the nested-dish version).
--
-- Founder decision: saving a dish/menu from the feed no longer files its
-- recipes into a category. Its recipes are created for the saver but HIDDEN
-- from their recipe library until they choose "Add to my recipes".
-- Single-recipe post saves are UNCHANGED -- category still required,
-- recipe still lands in the library immediately.
--
-- Drafted and exhaustively tested locally first: docs/drafts/
-- saved_recipes_in_library.sql (forward) / saved_recipes_in_library_rollback.sql
-- (rollback, kept in docs/drafts only -- not copied into supabase/migrations/).

-- ============================================================
-- 1. recipes.in_library
-- ============================================================
-- NOT NULL DEFAULT true: every existing recipe (all created before this
-- column existed, all via paths that always filed a category) stays
-- visible in the library with no backfill step needed.
alter table public.recipes
  add column in_library boolean not null default true;

comment on column public.recipes.in_library is
  'false only for recipes created as part of a dish/menu post save '
  '(save_grouping_from_post, kind in (''dish'',''menu'')) that the saver has '
  'not yet promoted into their library via add_recipe_to_library. '
  'Recipe-kind saves and every pre-existing recipe are always true. Every '
  'app query that lists "a user''s recipes" must filter on this column -- '
  'see the inventory in this file''s own comment near the bottom, and in '
  'the companion session report, for every current call site.';

-- ============================================================
-- 2. save_grouping_from_post -- category optional, in_library semantics
-- ============================================================
-- Restated whole (CREATE OR REPLACE requires it). Unchanged from the
-- previously-live definition (post_groupings_v1_5.sql + menu_contains_dish.sql):
-- auth check, post/snapshot lookup, idempotent re-save short-circuit
-- (keyed on the top-level grouping's (user_id, source_post_id), same as
-- today), crediting (inspired_by_id/name), the dish-nesting structure and
-- its ownership/kind rules, and the all-or-nothing transaction (a single
-- plpgsql function body is one transaction; any raised exception rolls back
-- every insert made so far in this call). New in this migration:
--   - p_category_id is now optional (DEFAULT NULL).
--   - For kind='recipe' (the only kind with v_part->'recipe' reachable
--     OUTSIDE the dish-nesting branch at the top level... actually reachable
--     for dish/menu too, see below): category is still REQUIRED, checked
--     and owned exactly as today, and every recipe created still gets
--     in_library=true and its recipe_categories row, unchanged behavior.
--   - For kind in ('dish','menu'): p_category_id is ignored entirely (not
--     checked for ownership even if a caller passes one) -- every recipe
--     created, at ANY nesting depth (top-level dish/menu parts AND a menu's
--     nested dish's own parts), gets in_library=false and NO
--     recipe_categories row.
-- v_kind is read once, up front, and reused everywhere a kind-based branch
-- is needed, instead of re-deriving it from v_snapshot inline.
create or replace function public.save_grouping_from_post(
  p_post_id     uuid,
  p_category_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id        uuid;
  v_poster_id        uuid;
  v_snapshot         jsonb;
  v_kind             grouping_kind;
  v_credit_name      text;
  v_grouping_id      uuid;
  v_existing_id      uuid;
  v_part             jsonb;
  v_dish_part        jsonb;
  v_new_recipe_id    uuid;
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

  v_kind := (v_snapshot->>'kind')::grouping_kind;

  -- Category is only meaningful for a recipe-kind save (the saved recipe
  -- goes straight into the library, same as today). For dish/menu, the
  -- category argument is ignored outright -- not validated, not stamped
  -- anywhere -- because none of the recipes this call creates are filed
  -- into a category at save time; they land hidden (in_library=false) until
  -- a later, separate add_recipe_to_library call.
  if v_kind = 'recipe' then
    if p_category_id is null then
      raise exception 'category is required for recipe-kind saves';
    end if;
    -- p_category_id ownership was unchecked in an earlier draft -- a caller
    -- could stamp any user's category id onto their own new recipes.
    if not exists (
      select 1 from public.categories c where c.id = p_category_id and c.user_id = v_caller_id
    ) then
      raise exception 'category not found or not owned by caller';
    end if;
  end if;

  select id into v_existing_id from public.groupings
  where user_id = v_caller_id and source_post_id = p_post_id;
  if v_existing_id is not null then
    return v_existing_id; -- idempotent re-save
  end if;

  select coalesce(display_name, '@' || handle, 'A Tipsy Dinner cook')
    into v_credit_name from public.profiles where id = v_poster_id;

  insert into public.groupings (user_id, kind, title, source_post_id)
  values (v_caller_id, v_kind, v_snapshot->>'title', p_post_id)
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
      -- app code, not introduced here.
      --
      -- in_library: true only for a recipe-kind save (v_kind='recipe')
      -- -- a top-level part's recipe under a dish/menu grouping is always
      -- hidden, even though this branch is reachable for all three kinds.
      insert into public.recipes (
        user_id, title, description, steps, created_at, source,
        cook_time, serves, inspired_by_id, inspired_by_name, in_library
      )
      values (
        v_caller_id, v_part->'recipe'->>'title', v_part->'recipe'->>'description',
        v_part->'recipe'->'steps', now(), 'manual',
        v_part->'recipe'->>'cook_time', v_part->'recipe'->>'serves',
        nullif(v_poster_id, v_caller_id),
        case when v_poster_id <> v_caller_id then v_credit_name end,
        (v_kind = 'recipe')
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

      -- Only a recipe-kind save files a category row -- dish/menu recipes
      -- stay out of every recipe_categories-joining list view until
      -- promoted via add_recipe_to_library.
      if v_kind = 'recipe' then
        insert into public.recipe_categories (recipe_id, category_id, user_id)
        values (v_new_recipe_id, p_category_id, v_caller_id);
      end if;

      insert into public.grouping_parts (grouping_id, section, recipe_id, position)
      values (v_grouping_id, v_part->>'section', v_new_recipe_id, (v_part->>'position')::int);

    elsif (v_part->'dish') is not null and v_part->'dish' <> 'null'::jsonb then

      -- The embedded dish becomes its own grouping, owned by the saver, NOT
      -- source_post_id-tagged (only the top-level saved grouping gets one --
      -- see header comment). Its recipe parts get the same inspired_by
      -- credit as every other recipe created by this save. Reachable only
      -- when v_kind='menu' (grouping_parts_before_write forbids a
      -- child_grouping_id anywhere else), so every recipe created in this
      -- whole branch is unconditionally in_library=false with no
      -- recipe_categories row -- never gated on v_kind here, since it can
      -- only ever be 'menu' already.
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
            cook_time, serves, inspired_by_id, inspired_by_name, in_library
          )
          values (
            v_caller_id, v_dish_part->'recipe'->>'title', v_dish_part->'recipe'->>'description',
            v_dish_part->'recipe'->'steps', now(), 'manual',
            v_dish_part->'recipe'->>'cook_time', v_dish_part->'recipe'->>'serves',
            nullif(v_poster_id, v_caller_id),
            case when v_poster_id <> v_caller_id then v_credit_name end,
            false
          )
          returning id into v_new_recipe_id;

          -- sort_order re-derivation: same as the top-level recipe branch
          -- above -- see its comment for detail.
          insert into public.ingredients (recipe_id, user_id, name, quantity, sort_order)
          select v_new_recipe_id, v_caller_id, ing->>'name', ing->>'quantity', (ord - 1)::int
          from jsonb_array_elements(v_dish_part->'recipe'->'ingredients') with ordinality as t(ing, ord);

          -- No recipe_categories row -- nested-dish recipes stay hidden
          -- same as every other dish/menu-sourced recipe.
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

-- ============================================================
-- 3. add_recipe_to_library -- promote a hidden recipe into the library
-- ============================================================
-- SECURITY INVOKER (the default -- no "security definer" keyword), not
-- SECURITY DEFINER. Both writes below are exactly what an ordinary
-- authenticated client could already do directly with its own two RLS-
-- protected statements -- recipes_update_own and recipe_categories_insert_own
-- both already restrict to the caller's own rows. Bypassing RLS via
-- SECURITY DEFINER would add privilege-escalation surface for no benefit;
-- the one real gap -- recipe_categories_insert_own only checks the NEW
-- row's own user_id, not that category_id is owned by that same user, the
-- exact same gap already flagged and closed with an explicit check in
-- save_grouping_from_post above -- is closed below the same way, in plain
-- application code that still runs under the caller's own privileges.
create or replace function public.add_recipe_to_library(
  p_recipe_id   uuid,
  p_category_id uuid
) returns void
language plpgsql set search_path = public as $$
declare
  v_caller_id uuid;
  v_updated   uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_caller_id
  ) then
    raise exception 'category not found or not owned by caller';
  end if;

  -- RLS (recipes_update_own) independently enforces the same ownership
  -- check; the explicit `and user_id = v_caller_id` plus the
  -- affected-row check below gives a clear error instead of a silent
  -- zero-row no-op, same convention as the category check just above.
  update public.recipes set in_library = true
  where id = p_recipe_id and user_id = v_caller_id
  returning id into v_updated;
  if v_updated is null then
    raise exception 'recipe not found or not owned by caller';
  end if;

  -- Idempotent: a second call with the same (recipe, category) pair is a
  -- no-op, not an error -- recipe_categories' primary key is
  -- (recipe_id, category_id).
  insert into public.recipe_categories (recipe_id, category_id, user_id)
  values (p_recipe_id, p_category_id, v_caller_id)
  on conflict (recipe_id, category_id) do nothing;
end; $$;

revoke execute on function public.add_recipe_to_library(uuid, uuid) from public, anon;
grant execute on function public.add_recipe_to_library(uuid, uuid) to authenticated;

-- ============================================================
-- 4. Inventory -- app queries that list "a user's recipes"
-- ============================================================
-- Read-only search of src/ done ahead of this migration, NO app code
-- changed by it. Summary of the actual query-owning functions found, all in
-- src/tipsy/data.ts:
--   - getSavedRecipesForCategory (~line 1573-1609) -- per-category library
--     list, recipe_categories!inner-joined to recipes. Exported alias
--     getRecipesForCategory (line 1176) forwards to it.
--   - getSavedRecipesAll (~line 1656-1695) -- "View all" library list, same
--     join shape, unfiltered on category.
--   These two are the correct (and sufficient) place to add
--   `and recipes.in_library = true` -- every list/picker/count UI in the
--   app (Recipes screen, AllRecipes, Categories' recipeCounts, RecipePicker,
--   the dish/menu composer's AddPartSheet, CookFeed's SaveToSheet category
--   counts) reads through the shared App-level recipesByCategory cache,
--   which is populated ONLY by these two functions -- no other screen or
--   sheet queries recipes independently for a "browse my library" view.
--   - getRecipesForMenuSection (~line 3427-3485) -- shows a menu section's
--     ALREADY-ADDED recipes (MenuInterior) and feeds RecipePicker's
--     existingRecipeIds dedupe. Deliberately NOT in scope here: whether a
--     recipe already placed in a menu should still render once hidden is a
--     separate product call, not implied by this migration.
--   - loadSavedRecipes (~line 1216-1266) -- backfillStepTitles' one-time
--     maintenance-script read, not a user-facing library view; should stay
--     unfiltered so a hidden recipe still gets backfilled.
-- None of these were modified by this migration -- this section is
-- documentation only. The app-code filtering change (adding
-- `and recipes.in_library = true` to the two functions above) is separate,
-- later work, not part of this schema change.
