-- DRAFT — NOT APPLIED. Do NOT run `supabase migration up` / `supabase db
-- push` against the linked project. Per CLAUDE.md, any write to the shared
-- Supabase DB requires explicit founder approval first.
--
-- Adds public.cook_posts to delete_user_account_data, per the Load-Bearing
-- Contract in CLAUDE.md: "Any future table that stores a user_id... must be
-- added to both the deletion statements and the final zero-rows verification
-- block in 20261020000001_delete_user_account_data.sql, or a deleted
-- account's data in that table will silently survive forever."
--
-- MUST be applied, in order, after BOTH:
--   - 20261020000001_delete_user_account_data.sql (the base function)
--   - 20261025000001_cook_posts_feed_v1.sql (creates public.cook_posts)
-- CREATE OR REPLACE FUNCTION requires restating the entire function body —
-- Postgres has no mechanism to patch just one block of a plpgsql function.
-- The body below is the base function from 20261020000001 verbatim, with
-- exactly one addition: a direct cook_posts DELETE (same per-row, NULL-safe
-- ownership-check-via-RETURNING-loop pattern as every other direct delete in
-- this function), its own-before count not needed (same reasoning as every
-- other direct-delete table here — see the base file's header comment,
-- "second revision"), and a zero-rows-after check. Everything else is
-- UNCHANGED from the base file — diff against it directly to confirm only
-- the cook_posts-related lines are new.
--
-- Placement: cook_posts is deleted BEFORE cook_events, not after. Reason:
-- cook_posts.cook_event_id is now ON DELETE CASCADE from cook_events (see
-- 20261025000001). If cook_events were deleted first, this user's cook_posts
-- rows would already be gone via cascade by the time this function's own
-- explicit cook_posts DELETE ran — the statement wouldn't fail, but it would
-- silently report 0 rows deleted even though rows really were removed
-- (just by cascade, not by this statement), which would misreport the
-- function's own return payload and make the per-row ownership-check loop
-- pointless (nothing left to check). Deleting cook_posts first keeps the
-- direct-delete-with-ownership-check pattern meaningful and consistent with
-- every other table in this function.
--
-- No new cross-user side effect to scrub: unlike recipes.inspired_by_id/name,
-- cook_posts has no column on another user's row that would be left
-- orphaned as plain text by an FK's own ON DELETE action — cook_posts.user_id
-- cascades from auth.users like every other owned table here, and
-- cook_posts.recipe_id/cook_event_id only ever point at this SAME user's own
-- rows (enforced by 20261025000001's INSERT policy), so nothing else in the
-- database references a deleted user's identity through this table.
create or replace function public.delete_user_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Only needed where a statement's own exact-count check requires it
  -- (the inspired_by UPDATE) or where a before-count is informational only
  -- (cascade tables' "*_cascaded" fields in the return payload). Direct
  -- DELETE statements no longer compare against a before-count at all —
  -- see header comment.
  v_recipes_inspired_before bigint;
  v_notifications_cascade_extra bigint; -- other users' notifications that will cascade away via recipe_sends.ref_id when this user's recipe_sends rows are deleted below; tracked for the return payload only, not part of any guard

  -- cascade tables: emptied indirectly by the profiles delete. Before-counts
  -- feed only the return payload's "*_cascaded" fields; after-counts feed
  -- the zero-rows-remaining check below.
  v_categories_user_before bigint;
  v_recipes_owned_user_before bigint;
  v_ingredients_user_before bigint;
  v_recipe_categories_user_before bigint;
  v_occasions_user_before bigint;
  v_menus_user_before bigint;
  v_menu_recipes_user_before bigint;
  v_shared_recipe_discoveries_user_before bigint;

  -- write results (rows updated/deleted by THIS function's own direct
  -- statements), accumulated by the RETURNING-loop pattern below.
  v_inspired_by_cleared bigint;
  v_notifications_deleted bigint;
  v_recipe_sends_deleted bigint;
  v_connections_deleted bigint;
  v_grocery_list_shares_deleted bigint;
  v_grocery_items_deleted bigint;
  v_cook_posts_deleted bigint; -- NEW
  v_cook_events_deleted bigint;
  v_recipe_shares_deleted bigint;
  v_user_recipe_slices_deleted bigint;
  v_llm_usage_deleted bigint;
  v_user_events_deleted bigint;
  v_profiles_deleted bigint;

  -- loop variable, reused across every RETURNING-loop below.
  v_row record;

  -- after-state: EVERY inventory table (direct and cascade alike) — final
  -- zero-rows-for-this-user sanity check.
  v_recipes_inspired_after bigint;
  v_notifications_user_after bigint;
  v_recipe_sends_user_after bigint;
  v_connections_user_after bigint;
  v_grocery_list_shares_user_after bigint;
  v_grocery_items_user_after bigint;
  v_cook_posts_user_after bigint; -- NEW
  v_cook_events_user_after bigint;
  v_recipe_shares_user_after bigint;
  v_user_recipe_slices_user_after bigint;
  v_llm_usage_user_after bigint;
  v_user_events_user_after bigint;
  v_profiles_user_after bigint;
  v_categories_user_after bigint;
  v_recipes_owned_user_after bigint;
  v_ingredients_user_after bigint;
  v_recipe_categories_user_after bigint;
  v_occasions_user_after bigint;
  v_menus_user_after bigint;
  v_menu_recipes_user_after bigint;
  v_shared_recipe_discoveries_user_after bigint;
begin
  if p_user_id is null then
    raise exception 'delete_user_account_data: p_user_id must not be null';
  end if;

  -- =====================================================================
  -- BEFORE SNAPSHOT — only what's still needed: the inspired_by count (for
  -- its exact-match UPDATE check) and the cascade tables' counts (return
  -- payload only).
  -- =====================================================================
  select count(*) into v_recipes_inspired_before from public.recipes where inspired_by_id = p_user_id;

  -- Notifications belonging to OTHER users that will cascade away (via
  -- notifications.ref_id -> recipe_sends ON DELETE CASCADE) once this
  -- user's recipe_sends rows are deleted below. Tracked for the return
  -- payload only.
  select count(*) into v_notifications_cascade_extra
    from public.notifications n
    join public.recipe_sends rs on rs.id = n.ref_id
    where rs.sender_id = p_user_id and n.recipient_id <> p_user_id;

  select count(*) into v_categories_user_before from public.categories where user_id = p_user_id;
  select count(*) into v_recipes_owned_user_before from public.recipes where user_id = p_user_id;
  select count(*) into v_ingredients_user_before from public.ingredients where user_id = p_user_id;
  select count(*) into v_recipe_categories_user_before from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_occasions_user_before from public.occasions where user_id = p_user_id;
  select count(*) into v_menus_user_before from public.menus where user_id = p_user_id;
  select count(*) into v_menu_recipes_user_before from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_user_before from public.shared_recipe_discoveries where user_id = p_user_id;

  -- =====================================================================
  -- DELETIONS — fixed order, see header comment for why. Every direct
  -- DELETE uses RETURNING + a per-row ownership check (see header comment
  -- on verification strategy); the inspired_by UPDATE keeps its own exact
  -- row-count check.
  -- =====================================================================

  -- 1. Sever attribution on OTHER users' recipes BEFORE the profile delete.
  update public.recipes
     set inspired_by_name = null, inspired_by_id = null
   where inspired_by_id = p_user_id;
  get diagnostics v_inspired_by_cleared = row_count;
  if v_inspired_by_cleared <> v_recipes_inspired_before then
    raise exception 'delete_user_account_data: inspired_by clear mismatch on recipes (expected %, cleared %)', v_recipes_inspired_before, v_inspired_by_cleared;
  end if;

  v_notifications_deleted := 0;
  for v_row in
    delete from public.notifications where recipient_id = p_user_id
    returning recipient_id
  loop
    if not coalesce(v_row.recipient_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=notifications, check=recipient_id_match)';
    end if;
    v_notifications_deleted := v_notifications_deleted + 1;
  end loop;

  v_recipe_sends_deleted := 0;
  for v_row in
    delete from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id
    returning sender_id, recipient_id
  loop
    if not coalesce(v_row.sender_id = p_user_id or v_row.recipient_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=recipe_sends, check=sender_or_recipient_match)';
    end if;
    v_recipe_sends_deleted := v_recipe_sends_deleted + 1;
  end loop;

  v_connections_deleted := 0;
  for v_row in
    delete from public.connections where user_a = p_user_id or user_b = p_user_id
    returning user_a, user_b
  loop
    if not coalesce(v_row.user_a = p_user_id or v_row.user_b = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=connections, check=user_a_or_user_b_match)';
    end if;
    v_connections_deleted := v_connections_deleted + 1;
  end loop;

  v_grocery_list_shares_deleted := 0;
  for v_row in
    delete from public.grocery_list_shares where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=grocery_list_shares, check=user_id_match)';
    end if;
    v_grocery_list_shares_deleted := v_grocery_list_shares_deleted + 1;
  end loop;

  v_grocery_items_deleted := 0;
  for v_row in
    delete from public.grocery_items where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=grocery_items, check=user_id_match)';
    end if;
    v_grocery_items_deleted := v_grocery_items_deleted + 1;
  end loop;

  -- NEW — cook_posts, deleted BEFORE cook_events (see header comment on
  -- placement: cook_posts.cook_event_id cascades from cook_events, so
  -- deleting cook_events first would leave nothing for this statement to
  -- find).
  v_cook_posts_deleted := 0;
  for v_row in
    delete from public.cook_posts where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=cook_posts, check=user_id_match)';
    end if;
    v_cook_posts_deleted := v_cook_posts_deleted + 1;
  end loop;

  v_cook_events_deleted := 0;
  for v_row in
    delete from public.cook_events where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=cook_events, check=user_id_match)';
    end if;
    v_cook_events_deleted := v_cook_events_deleted + 1;
  end loop;

  v_recipe_shares_deleted := 0;
  for v_row in
    delete from public.recipe_shares where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=recipe_shares, check=user_id_match)';
    end if;
    v_recipe_shares_deleted := v_recipe_shares_deleted + 1;
  end loop;

  v_user_recipe_slices_deleted := 0;
  for v_row in
    delete from public.user_recipe_slices where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=user_recipe_slices, check=user_id_match)';
    end if;
    v_user_recipe_slices_deleted := v_user_recipe_slices_deleted + 1;
  end loop;

  v_llm_usage_deleted := 0;
  for v_row in
    delete from public.llm_usage where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=llm_usage, check=user_id_match)';
    end if;
    v_llm_usage_deleted := v_llm_usage_deleted + 1;
  end loop;

  v_user_events_deleted := 0;
  for v_row in
    delete from public.user_events where user_id = p_user_id
    returning user_id
  loop
    if not coalesce(v_row.user_id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=user_events, check=user_id_match)';
    end if;
    v_user_events_deleted := v_user_events_deleted + 1;
  end loop;

  -- Cascades: categories, recipes (owned), ingredients, recipe_categories,
  -- occasions, menus, menu_recipes, shared_recipe_discoveries.
  v_profiles_deleted := 0;
  for v_row in
    delete from public.profiles where id = p_user_id
    returning id
  loop
    if not coalesce(v_row.id = p_user_id, false) then
      raise exception 'delete_user_account_data: ownership check failed (table=profiles, check=id_match)';
    end if;
    v_profiles_deleted := v_profiles_deleted + 1;
  end loop;

  -- =====================================================================
  -- AFTER SNAPSHOT + VERIFICATION — zero rows remaining for this user,
  -- EVERY inventory table, direct or cascaded.
  -- =====================================================================
  select count(*) into v_recipes_inspired_after from public.recipes where inspired_by_id = p_user_id;
  select count(*) into v_notifications_user_after from public.notifications where recipient_id = p_user_id;
  select count(*) into v_recipe_sends_user_after from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id;
  select count(*) into v_connections_user_after from public.connections where user_a = p_user_id or user_b = p_user_id;
  select count(*) into v_grocery_list_shares_user_after from public.grocery_list_shares where user_id = p_user_id;
  select count(*) into v_grocery_items_user_after from public.grocery_items where user_id = p_user_id;
  select count(*) into v_cook_posts_user_after from public.cook_posts where user_id = p_user_id; -- NEW
  select count(*) into v_cook_events_user_after from public.cook_events where user_id = p_user_id;
  select count(*) into v_recipe_shares_user_after from public.recipe_shares where user_id = p_user_id;
  select count(*) into v_user_recipe_slices_user_after from public.user_recipe_slices where user_id = p_user_id;
  select count(*) into v_llm_usage_user_after from public.llm_usage where user_id = p_user_id;
  select count(*) into v_user_events_user_after from public.user_events where user_id = p_user_id;
  select count(*) into v_profiles_user_after from public.profiles where id = p_user_id;
  select count(*) into v_categories_user_after from public.categories where user_id = p_user_id;
  select count(*) into v_recipes_owned_user_after from public.recipes where user_id = p_user_id;
  select count(*) into v_ingredients_user_after from public.ingredients where user_id = p_user_id;
  select count(*) into v_recipe_categories_user_after from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_occasions_user_after from public.occasions where user_id = p_user_id;
  select count(*) into v_menus_user_after from public.menus where user_id = p_user_id;
  select count(*) into v_menu_recipes_user_after from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_user_after from public.shared_recipe_discoveries where user_id = p_user_id;

  if v_recipes_inspired_after <> 0 then
    raise exception 'delete_user_account_data: recipes.inspired_by_id still has % row(s) referencing % (expected 0)', v_recipes_inspired_after, p_user_id;
  end if;
  if v_notifications_user_after <> 0 then
    raise exception 'delete_user_account_data: notifications still has % row(s) for % (expected 0)', v_notifications_user_after, p_user_id;
  end if;
  if v_recipe_sends_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_sends still has % row(s) for % (expected 0)', v_recipe_sends_user_after, p_user_id;
  end if;
  if v_connections_user_after <> 0 then
    raise exception 'delete_user_account_data: connections still has % row(s) for % (expected 0)', v_connections_user_after, p_user_id;
  end if;
  if v_grocery_list_shares_user_after <> 0 then
    raise exception 'delete_user_account_data: grocery_list_shares still has % row(s) for % (expected 0)', v_grocery_list_shares_user_after, p_user_id;
  end if;
  if v_grocery_items_user_after <> 0 then
    raise exception 'delete_user_account_data: grocery_items still has % row(s) for % (expected 0)', v_grocery_items_user_after, p_user_id;
  end if;
  if v_cook_posts_user_after <> 0 then
    raise exception 'delete_user_account_data: cook_posts still has % row(s) for % (expected 0)', v_cook_posts_user_after, p_user_id;
  end if;
  if v_cook_events_user_after <> 0 then
    raise exception 'delete_user_account_data: cook_events still has % row(s) for % (expected 0)', v_cook_events_user_after, p_user_id;
  end if;
  if v_recipe_shares_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_shares still has % row(s) for % (expected 0)', v_recipe_shares_user_after, p_user_id;
  end if;
  if v_user_recipe_slices_user_after <> 0 then
    raise exception 'delete_user_account_data: user_recipe_slices still has % row(s) for % (expected 0)', v_user_recipe_slices_user_after, p_user_id;
  end if;
  if v_llm_usage_user_after <> 0 then
    raise exception 'delete_user_account_data: llm_usage still has % row(s) for % (expected 0)', v_llm_usage_user_after, p_user_id;
  end if;
  if v_user_events_user_after <> 0 then
    raise exception 'delete_user_account_data: user_events still has % row(s) for % (expected 0)', v_user_events_user_after, p_user_id;
  end if;
  if v_profiles_user_after <> 0 then
    raise exception 'delete_user_account_data: profiles still has % row(s) for % (expected 0)', v_profiles_user_after, p_user_id;
  end if;
  if v_categories_user_after <> 0 then
    raise exception 'delete_user_account_data: categories still has % row(s) for % after cascade (expected 0)', v_categories_user_after, p_user_id;
  end if;
  if v_recipes_owned_user_after <> 0 then
    raise exception 'delete_user_account_data: recipes (owned) still has % row(s) for % after cascade (expected 0)', v_recipes_owned_user_after, p_user_id;
  end if;
  if v_ingredients_user_after <> 0 then
    raise exception 'delete_user_account_data: ingredients still has % row(s) for % after cascade (expected 0)', v_ingredients_user_after, p_user_id;
  end if;
  if v_recipe_categories_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_categories still has % row(s) for % after cascade (expected 0)', v_recipe_categories_user_after, p_user_id;
  end if;
  if v_occasions_user_after <> 0 then
    raise exception 'delete_user_account_data: occasions still has % row(s) for % after cascade (expected 0)', v_occasions_user_after, p_user_id;
  end if;
  if v_menus_user_after <> 0 then
    raise exception 'delete_user_account_data: menus still has % row(s) for % after cascade (expected 0)', v_menus_user_after, p_user_id;
  end if;
  if v_menu_recipes_user_after <> 0 then
    raise exception 'delete_user_account_data: menu_recipes still has % row(s) for % after cascade (expected 0)', v_menu_recipes_user_after, p_user_id;
  end if;
  if v_shared_recipe_discoveries_user_after <> 0 then
    raise exception 'delete_user_account_data: shared_recipe_discoveries still has % row(s) for % after cascade (expected 0)', v_shared_recipe_discoveries_user_after, p_user_id;
  end if;

  -- =====================================================================
  -- RESULT
  -- =====================================================================
  return jsonb_build_object(
    'user_id', p_user_id,
    'inspired_by_cleared', v_inspired_by_cleared,
    'deleted', jsonb_build_object(
      'notifications', v_notifications_deleted,
      'notifications_cascaded_from_recipe_sends', v_notifications_cascade_extra,
      'recipe_sends', v_recipe_sends_deleted,
      'connections', v_connections_deleted,
      'grocery_list_shares', v_grocery_list_shares_deleted,
      'grocery_items', v_grocery_items_deleted,
      'cook_posts', v_cook_posts_deleted,
      'cook_events', v_cook_events_deleted,
      'recipe_shares', v_recipe_shares_deleted,
      'user_recipe_slices', v_user_recipe_slices_deleted,
      'llm_usage', v_llm_usage_deleted,
      'user_events', v_user_events_deleted,
      'profiles', v_profiles_deleted,
      'categories_cascaded', v_categories_user_before,
      'recipes_cascaded', v_recipes_owned_user_before,
      'ingredients_cascaded', v_ingredients_user_before,
      'recipe_categories_cascaded', v_recipe_categories_user_before,
      'occasions_cascaded', v_occasions_user_before,
      'menus_cascaded', v_menus_user_before,
      'menu_recipes_cascaded', v_menu_recipes_user_before,
      'shared_recipe_discoveries_cascaded', v_shared_recipe_discoveries_user_before
    )
  );
end;
$$;

-- Unchanged from the base file — restated because CREATE OR REPLACE doesn't
-- touch grants, but this keeps the file fully self-contained/runnable on its
-- own against a DB that already has the base function.
revoke all on function public.delete_user_account_data(uuid) from public;
revoke all on function public.delete_user_account_data(uuid) from anon;
revoke all on function public.delete_user_account_data(uuid) from authenticated;
grant execute on function public.delete_user_account_data(uuid) to service_role;
