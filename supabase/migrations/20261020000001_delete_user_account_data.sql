-- NOT APPLIED. Written and reviewed on feature/account-deletion only.
-- Do NOT run `supabase migration up` / `supabase db push` against the
-- linked project until a founder explicitly approves applying it (per the
-- "Any write to the shared Supabase DB ... requires explicit founder
-- approval first" rule in CLAUDE.md). This file is a commit-only artifact
-- for review at this stage.
--
-- delete_user_account_data(p_user_id): the sole data-deletion step of
-- account deletion. Scope is deliberately split from the auth-row delete
-- and the storage sweep, both of which live in the delete-account Edge
-- Function (supabase/functions/delete-account/index.ts) and run AFTER this
-- function succeeds. service_role only — this function's own internal
-- guards (the null check, the fixed deletion order, and the verification
-- block below) ARE the security boundary, same posture as
-- send_recipe_to_friend / finish_received_recipe_save.
--
-- Deletion order is NOT arbitrary — it mirrors the FK graph found during
-- the pre-build investigation:
--   - notifications.recipient_id, recipe_sends.{sender_id,recipient_id},
--     and connections.{user_a,user_b} are all ON DELETE NO ACTION against
--     profiles(id) -> they MUST be emptied of this user's rows before the
--     profiles delete, or that delete throws a hard FK-violation instead of
--     cascading.
--   - grocery_items / grocery_list_shares are ON DELETE NO ACTION against
--     auth.users(id) directly -> they must be gone before the Edge
--     Function's later auth.admin.deleteUser() call, which this function
--     guarantees by deleting them here regardless of the profiles cascade.
--   - cook_events / recipe_shares / user_recipe_slices ARE ON DELETE
--     CASCADE from auth.users already, but are deleted explicitly here too,
--     per instruction, so this function's own data deletion is complete and
--     independently verifiable without relying on the later auth-row delete
--     ever happening.
--   - recipes.inspired_by_id/inspired_by_name on OTHER users' recipes is
--     handled FIRST, before anything else: inspired_by_id alone is
--     ON DELETE SET NULL from profiles, but that FK action would never
--     touch the sibling inspired_by_name text column, leaving the sender's
--     display name permanently orphaned as plain text on a recipient-owned
--     row (the exact leak identified in the pre-build sender-identity
--     check). Clearing both columns explicitly, before the profile is
--     touched, is the fix.
create or replace function public.delete_user_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- before-state (captured before any write in this function)
  v_recipes_inspired_before bigint;

  v_notifications_user_before bigint;
  v_notifications_total_before bigint;
  v_notifications_cascade_extra bigint; -- other users' notifications that will cascade away via recipe_sends.ref_id

  v_recipe_sends_user_before bigint;
  v_recipe_sends_total_before bigint;

  v_connections_user_before bigint;
  v_connections_total_before bigint;

  v_grocery_list_shares_user_before bigint;
  v_grocery_list_shares_total_before bigint;

  v_grocery_items_user_before bigint;
  v_grocery_items_total_before bigint;

  v_cook_events_user_before bigint;
  v_cook_events_total_before bigint;

  v_recipe_shares_user_before bigint;
  v_recipe_shares_total_before bigint;

  v_user_recipe_slices_user_before bigint;
  v_user_recipe_slices_total_before bigint;

  v_llm_usage_user_before bigint;
  v_llm_usage_total_before bigint;

  v_user_events_user_before bigint;
  v_user_events_total_before bigint;

  v_profiles_user_before bigint;
  v_profiles_total_before bigint;

  v_categories_user_before bigint;
  v_categories_total_before bigint;

  v_recipes_owned_user_before bigint;
  v_recipes_owned_total_before bigint;

  v_ingredients_user_before bigint;
  v_ingredients_total_before bigint;

  v_recipe_categories_user_before bigint;
  v_recipe_categories_total_before bigint;

  v_occasions_user_before bigint;
  v_occasions_total_before bigint;

  v_menus_user_before bigint;
  v_menus_total_before bigint;

  v_menu_recipes_user_before bigint;
  v_menu_recipes_total_before bigint;

  v_shared_recipe_discoveries_user_before bigint;
  v_shared_recipe_discoveries_total_before bigint;

  -- write results (rows updated/deleted by THIS function's own statements)
  v_inspired_by_cleared bigint;
  v_notifications_deleted bigint;
  v_recipe_sends_deleted bigint;
  v_connections_deleted bigint;
  v_grocery_list_shares_deleted bigint;
  v_grocery_items_deleted bigint;
  v_cook_events_deleted bigint;
  v_recipe_shares_deleted bigint;
  v_user_recipe_slices_deleted bigint;
  v_llm_usage_deleted bigint;
  v_user_events_deleted bigint;
  v_profiles_deleted bigint;

  -- after-state (captured after every write above)
  v_recipes_inspired_after bigint;
  v_notifications_user_after bigint;
  v_notifications_total_after bigint;
  v_recipe_sends_user_after bigint;
  v_recipe_sends_total_after bigint;
  v_connections_user_after bigint;
  v_connections_total_after bigint;
  v_grocery_list_shares_user_after bigint;
  v_grocery_list_shares_total_after bigint;
  v_grocery_items_user_after bigint;
  v_grocery_items_total_after bigint;
  v_cook_events_user_after bigint;
  v_cook_events_total_after bigint;
  v_recipe_shares_user_after bigint;
  v_recipe_shares_total_after bigint;
  v_user_recipe_slices_user_after bigint;
  v_user_recipe_slices_total_after bigint;
  v_llm_usage_user_after bigint;
  v_llm_usage_total_after bigint;
  v_user_events_user_after bigint;
  v_user_events_total_after bigint;
  v_profiles_user_after bigint;
  v_profiles_total_after bigint;
  v_categories_user_after bigint;
  v_categories_total_after bigint;
  v_recipes_owned_user_after bigint;
  v_recipes_owned_total_after bigint;
  v_ingredients_user_after bigint;
  v_ingredients_total_after bigint;
  v_recipe_categories_user_after bigint;
  v_recipe_categories_total_after bigint;
  v_occasions_user_after bigint;
  v_occasions_total_after bigint;
  v_menus_user_after bigint;
  v_menus_total_after bigint;
  v_menu_recipes_user_after bigint;
  v_menu_recipes_total_after bigint;
  v_shared_recipe_discoveries_user_after bigint;
  v_shared_recipe_discoveries_total_after bigint;
begin
  if p_user_id is null then
    raise exception 'delete_user_account_data: p_user_id must not be null';
  end if;

  -- =====================================================================
  -- BEFORE SNAPSHOT — must run before any write below.
  -- =====================================================================
  select count(*) into v_recipes_inspired_before from public.recipes where inspired_by_id = p_user_id;

  select count(*) into v_notifications_user_before from public.notifications where recipient_id = p_user_id;
  select count(*) into v_notifications_total_before from public.notifications;

  select count(*) into v_recipe_sends_user_before from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id;
  select count(*) into v_recipe_sends_total_before from public.recipe_sends;

  -- Notifications belonging to OTHER users that will cascade away (via
  -- notifications.ref_id -> recipe_sends ON DELETE CASCADE) once this
  -- user's recipe_sends rows are deleted below. This user's own
  -- notifications (recipient_id = p_user_id) are counted separately above
  -- and excluded here to avoid double-counting.
  select count(*) into v_notifications_cascade_extra
    from public.notifications n
    join public.recipe_sends rs on rs.id = n.ref_id
    where rs.sender_id = p_user_id and n.recipient_id <> p_user_id;

  select count(*) into v_connections_user_before from public.connections where user_a = p_user_id or user_b = p_user_id;
  select count(*) into v_connections_total_before from public.connections;

  select count(*) into v_grocery_list_shares_user_before from public.grocery_list_shares where user_id = p_user_id;
  select count(*) into v_grocery_list_shares_total_before from public.grocery_list_shares;

  select count(*) into v_grocery_items_user_before from public.grocery_items where user_id = p_user_id;
  select count(*) into v_grocery_items_total_before from public.grocery_items;

  select count(*) into v_cook_events_user_before from public.cook_events where user_id = p_user_id;
  select count(*) into v_cook_events_total_before from public.cook_events;

  select count(*) into v_recipe_shares_user_before from public.recipe_shares where user_id = p_user_id;
  select count(*) into v_recipe_shares_total_before from public.recipe_shares;

  select count(*) into v_user_recipe_slices_user_before from public.user_recipe_slices where user_id = p_user_id;
  select count(*) into v_user_recipe_slices_total_before from public.user_recipe_slices;

  select count(*) into v_llm_usage_user_before from public.llm_usage where user_id = p_user_id;
  select count(*) into v_llm_usage_total_before from public.llm_usage;

  select count(*) into v_user_events_user_before from public.user_events where user_id = p_user_id;
  select count(*) into v_user_events_total_before from public.user_events;

  select count(*) into v_profiles_user_before from public.profiles where id = p_user_id;
  select count(*) into v_profiles_total_before from public.profiles;

  select count(*) into v_categories_user_before from public.categories where user_id = p_user_id;
  select count(*) into v_categories_total_before from public.categories;

  select count(*) into v_recipes_owned_user_before from public.recipes where user_id = p_user_id;
  select count(*) into v_recipes_owned_total_before from public.recipes;

  select count(*) into v_ingredients_user_before from public.ingredients where user_id = p_user_id;
  select count(*) into v_ingredients_total_before from public.ingredients;

  select count(*) into v_recipe_categories_user_before from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_recipe_categories_total_before from public.recipe_categories;

  select count(*) into v_occasions_user_before from public.occasions where user_id = p_user_id;
  select count(*) into v_occasions_total_before from public.occasions;

  select count(*) into v_menus_user_before from public.menus where user_id = p_user_id;
  select count(*) into v_menus_total_before from public.menus;

  select count(*) into v_menu_recipes_user_before from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_menu_recipes_total_before from public.menu_recipes;

  select count(*) into v_shared_recipe_discoveries_user_before from public.shared_recipe_discoveries where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_total_before from public.shared_recipe_discoveries;

  -- =====================================================================
  -- DELETIONS — fixed order, see header comment for why.
  -- =====================================================================

  -- 1. Sever attribution on OTHER users' recipes BEFORE the profile delete.
  update public.recipes
     set inspired_by_name = null, inspired_by_id = null
   where inspired_by_id = p_user_id;
  get diagnostics v_inspired_by_cleared = row_count;

  delete from public.notifications where recipient_id = p_user_id;
  get diagnostics v_notifications_deleted = row_count;

  delete from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id;
  get diagnostics v_recipe_sends_deleted = row_count;

  delete from public.connections where user_a = p_user_id or user_b = p_user_id;
  get diagnostics v_connections_deleted = row_count;

  delete from public.grocery_list_shares where user_id = p_user_id;
  get diagnostics v_grocery_list_shares_deleted = row_count;

  delete from public.grocery_items where user_id = p_user_id;
  get diagnostics v_grocery_items_deleted = row_count;

  delete from public.cook_events where user_id = p_user_id;
  get diagnostics v_cook_events_deleted = row_count;

  delete from public.recipe_shares where user_id = p_user_id;
  get diagnostics v_recipe_shares_deleted = row_count;

  delete from public.user_recipe_slices where user_id = p_user_id;
  get diagnostics v_user_recipe_slices_deleted = row_count;

  delete from public.llm_usage where user_id = p_user_id;
  get diagnostics v_llm_usage_deleted = row_count;

  delete from public.user_events where user_id = p_user_id;
  get diagnostics v_user_events_deleted = row_count;

  -- Cascades: categories, recipes (owned), ingredients, recipe_categories,
  -- occasions, menus, menu_recipes, shared_recipe_discoveries.
  delete from public.profiles where id = p_user_id;
  get diagnostics v_profiles_deleted = row_count;

  -- =====================================================================
  -- AFTER SNAPSHOT
  -- =====================================================================
  select count(*) into v_recipes_inspired_after from public.recipes where inspired_by_id = p_user_id;

  select count(*) into v_notifications_user_after from public.notifications where recipient_id = p_user_id;
  select count(*) into v_notifications_total_after from public.notifications;

  select count(*) into v_recipe_sends_user_after from public.recipe_sends where sender_id = p_user_id or recipient_id = p_user_id;
  select count(*) into v_recipe_sends_total_after from public.recipe_sends;

  select count(*) into v_connections_user_after from public.connections where user_a = p_user_id or user_b = p_user_id;
  select count(*) into v_connections_total_after from public.connections;

  select count(*) into v_grocery_list_shares_user_after from public.grocery_list_shares where user_id = p_user_id;
  select count(*) into v_grocery_list_shares_total_after from public.grocery_list_shares;

  select count(*) into v_grocery_items_user_after from public.grocery_items where user_id = p_user_id;
  select count(*) into v_grocery_items_total_after from public.grocery_items;

  select count(*) into v_cook_events_user_after from public.cook_events where user_id = p_user_id;
  select count(*) into v_cook_events_total_after from public.cook_events;

  select count(*) into v_recipe_shares_user_after from public.recipe_shares where user_id = p_user_id;
  select count(*) into v_recipe_shares_total_after from public.recipe_shares;

  select count(*) into v_user_recipe_slices_user_after from public.user_recipe_slices where user_id = p_user_id;
  select count(*) into v_user_recipe_slices_total_after from public.user_recipe_slices;

  select count(*) into v_llm_usage_user_after from public.llm_usage where user_id = p_user_id;
  select count(*) into v_llm_usage_total_after from public.llm_usage;

  select count(*) into v_user_events_user_after from public.user_events where user_id = p_user_id;
  select count(*) into v_user_events_total_after from public.user_events;

  select count(*) into v_profiles_user_after from public.profiles where id = p_user_id;
  select count(*) into v_profiles_total_after from public.profiles;

  select count(*) into v_categories_user_after from public.categories where user_id = p_user_id;
  select count(*) into v_categories_total_after from public.categories;

  select count(*) into v_recipes_owned_user_after from public.recipes where user_id = p_user_id;
  select count(*) into v_recipes_owned_total_after from public.recipes;

  select count(*) into v_ingredients_user_after from public.ingredients where user_id = p_user_id;
  select count(*) into v_ingredients_total_after from public.ingredients;

  select count(*) into v_recipe_categories_user_after from public.recipe_categories where user_id = p_user_id;
  select count(*) into v_recipe_categories_total_after from public.recipe_categories;

  select count(*) into v_occasions_user_after from public.occasions where user_id = p_user_id;
  select count(*) into v_occasions_total_after from public.occasions;

  select count(*) into v_menus_user_after from public.menus where user_id = p_user_id;
  select count(*) into v_menus_total_after from public.menus;

  select count(*) into v_menu_recipes_user_after from public.menu_recipes where user_id = p_user_id;
  select count(*) into v_menu_recipes_total_after from public.menu_recipes;

  select count(*) into v_shared_recipe_discoveries_user_after from public.shared_recipe_discoveries where user_id = p_user_id;
  select count(*) into v_shared_recipe_discoveries_total_after from public.shared_recipe_discoveries;

  -- =====================================================================
  -- VERIFICATION (a): zero rows remaining for this user, every table.
  -- =====================================================================
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
    raise exception 'delete_user_account_data: categories still has % row(s) for % (expected 0, should have cascaded from profiles)', v_categories_user_after, p_user_id;
  end if;
  if v_recipes_owned_user_after <> 0 then
    raise exception 'delete_user_account_data: recipes (owned) still has % row(s) for % (expected 0, should have cascaded from profiles)', v_recipes_owned_user_after, p_user_id;
  end if;
  if v_ingredients_user_after <> 0 then
    raise exception 'delete_user_account_data: ingredients still has % row(s) for % (expected 0, should have cascaded from profiles)', v_ingredients_user_after, p_user_id;
  end if;
  if v_recipe_categories_user_after <> 0 then
    raise exception 'delete_user_account_data: recipe_categories still has % row(s) for % (expected 0, should have cascaded from profiles)', v_recipe_categories_user_after, p_user_id;
  end if;
  if v_occasions_user_after <> 0 then
    raise exception 'delete_user_account_data: occasions still has % row(s) for % (expected 0, should have cascaded from profiles)', v_occasions_user_after, p_user_id;
  end if;
  if v_menus_user_after <> 0 then
    raise exception 'delete_user_account_data: menus still has % row(s) for % (expected 0, should have cascaded from profiles)', v_menus_user_after, p_user_id;
  end if;
  if v_menu_recipes_user_after <> 0 then
    raise exception 'delete_user_account_data: menu_recipes still has % row(s) for % (expected 0, should have cascaded from profiles)', v_menu_recipes_user_after, p_user_id;
  end if;
  if v_shared_recipe_discoveries_user_after <> 0 then
    raise exception 'delete_user_account_data: shared_recipe_discoveries still has % row(s) for % (expected 0, should have cascaded from profiles)', v_shared_recipe_discoveries_user_after, p_user_id;
  end if;

  -- =====================================================================
  -- VERIFICATION (b): over-deletion guard. total_after must equal
  -- total_before minus exactly this user's rows (plus the explicit
  -- notifications cascade adjustment).
  -- =====================================================================
  if v_notifications_total_after <> (v_notifications_total_before - v_notifications_user_before - v_notifications_cascade_extra) then
    raise exception 'delete_user_account_data: over-deletion guard failed for notifications (before=%, user_rows=%, cascade_extra=%, after=%, expected_after=%)',
      v_notifications_total_before, v_notifications_user_before, v_notifications_cascade_extra, v_notifications_total_after,
      (v_notifications_total_before - v_notifications_user_before - v_notifications_cascade_extra);
  end if;

  if v_recipe_sends_total_after <> (v_recipe_sends_total_before - v_recipe_sends_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for recipe_sends (before=%, user_rows=%, after=%, expected_after=%)',
      v_recipe_sends_total_before, v_recipe_sends_user_before, v_recipe_sends_total_after, (v_recipe_sends_total_before - v_recipe_sends_user_before);
  end if;

  if v_connections_total_after <> (v_connections_total_before - v_connections_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for connections (before=%, user_rows=%, after=%, expected_after=%)',
      v_connections_total_before, v_connections_user_before, v_connections_total_after, (v_connections_total_before - v_connections_user_before);
  end if;

  if v_grocery_list_shares_total_after <> (v_grocery_list_shares_total_before - v_grocery_list_shares_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for grocery_list_shares (before=%, user_rows=%, after=%, expected_after=%)',
      v_grocery_list_shares_total_before, v_grocery_list_shares_user_before, v_grocery_list_shares_total_after, (v_grocery_list_shares_total_before - v_grocery_list_shares_user_before);
  end if;

  if v_grocery_items_total_after <> (v_grocery_items_total_before - v_grocery_items_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for grocery_items (before=%, user_rows=%, after=%, expected_after=%)',
      v_grocery_items_total_before, v_grocery_items_user_before, v_grocery_items_total_after, (v_grocery_items_total_before - v_grocery_items_user_before);
  end if;

  if v_cook_events_total_after <> (v_cook_events_total_before - v_cook_events_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for cook_events (before=%, user_rows=%, after=%, expected_after=%)',
      v_cook_events_total_before, v_cook_events_user_before, v_cook_events_total_after, (v_cook_events_total_before - v_cook_events_user_before);
  end if;

  if v_recipe_shares_total_after <> (v_recipe_shares_total_before - v_recipe_shares_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for recipe_shares (before=%, user_rows=%, after=%, expected_after=%)',
      v_recipe_shares_total_before, v_recipe_shares_user_before, v_recipe_shares_total_after, (v_recipe_shares_total_before - v_recipe_shares_user_before);
  end if;

  if v_user_recipe_slices_total_after <> (v_user_recipe_slices_total_before - v_user_recipe_slices_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for user_recipe_slices (before=%, user_rows=%, after=%, expected_after=%)',
      v_user_recipe_slices_total_before, v_user_recipe_slices_user_before, v_user_recipe_slices_total_after, (v_user_recipe_slices_total_before - v_user_recipe_slices_user_before);
  end if;

  if v_llm_usage_total_after <> (v_llm_usage_total_before - v_llm_usage_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for llm_usage (before=%, user_rows=%, after=%, expected_after=%)',
      v_llm_usage_total_before, v_llm_usage_user_before, v_llm_usage_total_after, (v_llm_usage_total_before - v_llm_usage_user_before);
  end if;

  if v_user_events_total_after <> (v_user_events_total_before - v_user_events_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for user_events (before=%, user_rows=%, after=%, expected_after=%)',
      v_user_events_total_before, v_user_events_user_before, v_user_events_total_after, (v_user_events_total_before - v_user_events_user_before);
  end if;

  if v_profiles_total_after <> (v_profiles_total_before - v_profiles_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for profiles (before=%, user_rows=%, after=%, expected_after=%)',
      v_profiles_total_before, v_profiles_user_before, v_profiles_total_after, (v_profiles_total_before - v_profiles_user_before);
  end if;

  if v_categories_total_after <> (v_categories_total_before - v_categories_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for categories (before=%, user_rows=%, after=%, expected_after=%)',
      v_categories_total_before, v_categories_user_before, v_categories_total_after, (v_categories_total_before - v_categories_user_before);
  end if;

  if v_recipes_owned_total_after <> (v_recipes_owned_total_before - v_recipes_owned_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for recipes/owned (before=%, user_rows=%, after=%, expected_after=%)',
      v_recipes_owned_total_before, v_recipes_owned_user_before, v_recipes_owned_total_after, (v_recipes_owned_total_before - v_recipes_owned_user_before);
  end if;

  if v_ingredients_total_after <> (v_ingredients_total_before - v_ingredients_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for ingredients (before=%, user_rows=%, after=%, expected_after=%)',
      v_ingredients_total_before, v_ingredients_user_before, v_ingredients_total_after, (v_ingredients_total_before - v_ingredients_user_before);
  end if;

  if v_recipe_categories_total_after <> (v_recipe_categories_total_before - v_recipe_categories_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for recipe_categories (before=%, user_rows=%, after=%, expected_after=%)',
      v_recipe_categories_total_before, v_recipe_categories_user_before, v_recipe_categories_total_after, (v_recipe_categories_total_before - v_recipe_categories_user_before);
  end if;

  if v_occasions_total_after <> (v_occasions_total_before - v_occasions_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for occasions (before=%, user_rows=%, after=%, expected_after=%)',
      v_occasions_total_before, v_occasions_user_before, v_occasions_total_after, (v_occasions_total_before - v_occasions_user_before);
  end if;

  if v_menus_total_after <> (v_menus_total_before - v_menus_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for menus (before=%, user_rows=%, after=%, expected_after=%)',
      v_menus_total_before, v_menus_user_before, v_menus_total_after, (v_menus_total_before - v_menus_user_before);
  end if;

  if v_menu_recipes_total_after <> (v_menu_recipes_total_before - v_menu_recipes_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for menu_recipes (before=%, user_rows=%, after=%, expected_after=%)',
      v_menu_recipes_total_before, v_menu_recipes_user_before, v_menu_recipes_total_after, (v_menu_recipes_total_before - v_menu_recipes_user_before);
  end if;

  if v_shared_recipe_discoveries_total_after <> (v_shared_recipe_discoveries_total_before - v_shared_recipe_discoveries_user_before) then
    raise exception 'delete_user_account_data: over-deletion guard failed for shared_recipe_discoveries (before=%, user_rows=%, after=%, expected_after=%)',
      v_shared_recipe_discoveries_total_before, v_shared_recipe_discoveries_user_before, v_shared_recipe_discoveries_total_after, (v_shared_recipe_discoveries_total_before - v_shared_recipe_discoveries_user_before);
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

-- Supabase grants EXECUTE to anon separately from PUBLIC by default, so
-- PUBLIC and anon must both be revoked explicitly, not just one or the
-- other (same gotcha documented on every other SECURITY DEFINER function
-- in this codebase). authenticated is revoked too: this function must be
-- reachable ONLY from the delete-account Edge Function's service-role
-- client, never directly from a logged-in client session.
revoke all on function public.delete_user_account_data(uuid) from public;
revoke all on function public.delete_user_account_data(uuid) from anon;
revoke all on function public.delete_user_account_data(uuid) from authenticated;
grant execute on function public.delete_user_account_data(uuid) to service_role;
