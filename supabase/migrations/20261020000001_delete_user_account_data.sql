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
--
-- Verification strategy (revised 2026-10-21, second pass): every DIRECT
-- DELETE uses `RETURNING` and a per-row ownership check inside a PL/pgSQL
-- FOR loop, instead of comparing an aggregate row count against anything.
-- This is deliberately NOT "row_count must equal the before-snapshot
-- count" (that was the first revision, 2026-10-20) — an exact-equality
-- count check is itself vulnerable to a race if a row for this SAME user
-- is inserted between the before-count and the delete (e.g. user_events/
-- llm_usage are fire-and-forget, high-volume tables the deleting user's own
-- client could still be writing to mid-request), and a non-strict
-- "deleted >= expected" relaxation would silently let a WRONG WHERE CLAUSE
-- that also deletes other users' rows pass undetected. Per-row RETURNING
-- checks solve both problems at once: every single row actually touched by
-- a DELETE is individually asserted to belong to p_user_id (catching a bad
-- WHERE clause regardless of row counts), and no snapshot-vs-delete count
-- comparison exists to be raced by a legitimate concurrent insert. The
-- inspired_by UPDATE above keeps its own exact row-count check instead
-- (see the statement itself) — it runs against `recipes`, not a
-- high-write-volume logging table, so this race does not apply there.
-- After every delete/update has run (including the profiles cascade), a
-- final AFTER snapshot confirms this user has zero rows left in EVERY
-- inventory table, direct or cascaded, as a last-line sanity check.
--
-- NULL-safe ownership checks (revised 2026-10-21, third pass — review finding
-- F1): every per-row RETURNING check now uses `coalesce(<comparison>, false)`
-- instead of a bare `<>`/`=` comparison. A bare `<>` evaluates to NULL (which
-- PL/pgSQL's `if` treats as false, i.e. "don't raise") when either side is
-- NULL — so a NULL in an ownership column would have silently passed the
-- very guard meant to catch a wrong WHERE clause. Confirmed via a read-only
-- schema check that `recipe_sends.{sender_id,recipient_id}` and
-- `connections.{user_a,user_b}` are all NOT NULL (so today's fixed WHERE
-- clauses can't actually produce a NULL in those columns), but
-- `llm_usage.user_id` and `user_events.user_id` ARE nullable (by design —
-- pre-signup/anon rows) — the coalesce pattern below is defense-in-depth
-- against any future change to these statements' WHERE clauses, not a fix
-- for a currently-reachable hole.
--
-- Sanitized exception messages (revised 2026-10-21, third pass — review
-- finding F3): every per-row ownership-check exception now names only the
-- table and the check, never any row's id — a prior revision interpolated
-- the mismatched row's id/columns directly into the message text, which
-- would have propagated another real user's UUID back to the deleting
-- user's own client on the (should-never-happen) path where this guard
-- actually trips. The final zero-rows and inspired_by-count checks below
-- still reference p_user_id (the caller's own id, already known to them)
-- and plain counts — never another user's id or data.
--
-- Known, accepted side effect (not a bug): the inspired_by-clearing UPDATE
-- above fires recipes' own `updated_at` BEFORE UPDATE trigger on the other
-- user's recipe row (bumping only `updated_at` — no other column changes,
-- and nothing in the app currently reads/sorts/invalidates on
-- recipes.updated_at). Separately, connections.created_via references
-- recipe_sends(id) ON DELETE SET NULL, so deleting this user's recipe_sends
-- rows (below) can transiently null created_via on a connections row
-- immediately before that same connections row is deleted by this
-- function's very next statement — every connections row reachable via
-- that FK necessarily has this user as user_a or user_b (finish_received_
-- recipe_save always sets the pair from the triggering send's own sender_id/
-- recipient_id), so no connections row outside this user's own rows is
-- ever touched, transiently or otherwise.
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
