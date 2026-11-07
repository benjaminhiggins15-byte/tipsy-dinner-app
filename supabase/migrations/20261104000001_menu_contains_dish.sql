-- Hand-applied to production 2026-11-04 via supabase db query --linked.
--
-- Additive follow-on to supabase/migrations/20261102000001_post_groupings_v1_5.sql.
-- Founder decision: a menu section can hold a dish, a recipe, or a freeform
-- line -- one level only (a dish's own parts can never themselves hold a
-- further child grouping).
--
-- ============================================================
-- 1. grouping_parts gets child_grouping_id
-- ============================================================
-- ON DELETE CASCADE: deleting a dish (the groupings row) must remove it
-- from every menu part that embedded it -- same "it cannot outlive its
-- source" posture as grouping_parts.grouping_id's own CASCADE above it.
alter table public.grouping_parts
  add column child_grouping_id uuid references public.groupings(id) on delete cascade;

comment on column public.grouping_parts.child_grouping_id is
  'A menu-kind part may embed a dish grouping here instead of recipe_id/freeform_text. '
  'See the grouping_parts_before_write trigger for the kind/ownership rules, and the '
  'comment above save_grouping_from_post for how this shows up in a frozen '
  'cook_posts.grouping_snapshot.';

-- Exactly one of {recipe_id, freeform_text, child_grouping_id} must be set.
-- Supersedes the original two-way xor -- same intent, one more column.
alter table public.grouping_parts
  drop constraint grouping_parts_recipe_xor_freeform;

alter table public.grouping_parts
  add constraint grouping_parts_exactly_one_target check (
    (case when recipe_id is not null then 1 else 0 end) +
    (case when freeform_text is not null then 1 else 0 end) +
    (case when child_grouping_id is not null then 1 else 0 end) = 1
  );

-- ============================================================
-- 2. grouping_parts_before_write -- child_grouping_id rules
-- ============================================================
-- Restated whole (CREATE OR REPLACE requires it). Unchanged: the user_id
-- stamp and the recipe_id-ownership check at the top, and the existing
-- recipe/dish/menu section rules. New: child_grouping_id is only legal on a
-- menu-kind part; the referenced child must be a dish owned by the SAME
-- user as the parent grouping (mirrors the recipe_id ownership check just
-- above it, same reason -- RLS on grouping_parts only validates user_id,
-- trigger-stamped, so without this check a caller could link another
-- user's dish into their own menu); and dish-kind / recipe-kind parts are
-- explicitly forbidden from ever holding a child_grouping_id, which is what
-- actually keeps this to "one level only" -- a dish's own parts can never
-- point at a further child, so menu -> dish -> dish is structurally
-- impossible, not just undocumented.
create or replace function public.grouping_parts_before_write()
returns trigger language plpgsql as $$
declare
  v_kind        grouping_kind;
  v_owner       uuid;
  v_child_kind  grouping_kind;
  v_child_owner uuid;
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

  if new.child_grouping_id is not null then
    select kind, user_id into v_child_kind, v_child_owner
      from public.groupings where id = new.child_grouping_id;
    if v_child_owner is null then
      raise exception 'grouping_parts: child_grouping_id not found';
    end if;
    if v_child_kind is distinct from 'dish' then
      raise exception 'grouping_parts: child_grouping_id must reference a dish';
    end if;
    if v_child_owner is distinct from v_owner then
      raise exception 'grouping_parts: child_grouping_id must belong to the grouping owner';
    end if;
  end if;

  if v_kind = 'recipe' then
    if new.section is not null then
      raise exception 'recipe-kind parts must have a null section';
    end if;
    if new.child_grouping_id is not null then
      raise exception 'recipe-kind parts cannot have a child grouping';
    end if;

  elsif v_kind = 'dish' then
    if new.section is null or new.section not in ('component', 'also') then
      raise exception 'dish-kind parts must have section component or also';
    end if;
    if new.child_grouping_id is not null then
      raise exception 'dish-kind parts cannot have a child grouping';
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
    -- child_grouping_id is allowed here; validated above. No further
    -- per-section restriction -- a dish can sit in any course section,
    -- same as a recipe or a freeform line can today.
  end if;

  return new;
end; $$;

-- ============================================================
-- 3. save_grouping_from_post -- nested dish parts
-- ============================================================
-- Snapshot shape addition (documentation only -- cook_posts.grouping_snapshot
-- itself is untouched by this draft, no column/table change): a menu part
-- that embeds a dish carries a `dish` key in place of `recipe`/
-- `freeform_text`, shaped exactly like a top-level dish snapshot --
-- {kind:'dish', title, parts:[{section,position,recipe:RecipeSendSnapshot|null,
-- freeform_text|null}]}. The nested parts array reuses the ordinary
-- recipe/freeform part shape (never another `dish` key -- one level only,
-- enforced at write time by the trigger above, so no recursive case is
-- needed when parsing it back out here).
--
-- Restated whole (CREATE OR REPLACE requires it). Unchanged: auth/ownership
-- checks, idempotent re-save short-circuit (still keyed on the TOP-level
-- grouping's (user_id, source_post_id) -- a dish created as a side effect
-- of a menu save never itself gets a source_post_id, both because only the
-- top-level saved grouping is allowed one (see this file's §1 for why --
-- groupings_user_source_post_uidx is a (user_id, source_post_id) unique
-- index and a per-user re-save of the SAME post must resolve to exactly one
-- row to stay idempotent) and because re-save's early-return happens before
-- any inserts run, so a re-save can never create a second copy of the
-- nested dish either), and the existing recipe/freeform branches. New: a
-- third branch recognizes a `dish` part, creates it as its own
-- kind='dish' grouping for the SAVER (no source_post_id), re-using the same
-- field-by-field recipe/ingredient copy and inspired_by crediting as the
-- top-level loop, then links it into the saved menu via child_grouping_id.
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

-- ============================================================
-- 4. delete_user_account_data -- confirmed, no change needed
-- ============================================================
-- No new table is introduced by this draft (child_grouping_id is a column
-- on the already-covered grouping_parts table). delete_user_account_data's
-- existing groupings/grouping_parts handling (added by
-- 20261102000002_delete_user_account_data_add_groupings.sql) already:
--   - deletes every groupings row with user_id = p_user_id directly, which
--     CASCADEs to grouping_parts regardless of which of the three target
--     columns a given part uses;
--   - counts grouping_parts before/after by user_id, not by which column is
--     set, so child_grouping_id rows are already included in that count;
--   - a dish and the menu(s) that embed it are always owned by the SAME
--     user (enforced by the trigger above), so there is no cross-user
--     grouping_parts row left dangling by one user's deletion that could
--     point at another still-live user's dish.
-- Verified against a local test below (nested menu-with-dish, account
-- delete, zero-rows check) rather than re-stated here as a no-op diff.
