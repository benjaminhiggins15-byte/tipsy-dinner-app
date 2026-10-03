-- Share-to-token read hardening, phase 1 of 2 (additive only). Replaces the
-- three client-side table reads that currently rely on recipe_shares_select_anon /
-- grocery_list_shares_select_anon (qual = true, role {public}) — both let ANY anon
-- or authenticated caller enumerate every row in these tables, not just the one
-- they hold a token for. These three SECURITY DEFINER functions become the new
-- read paths. The open policies are NOT dropped here — see the follow-up
-- migration, applied only after the call sites below are switched over and live
-- in production (preview and prod share this database).
--
-- Column selection matches exactly what each existing call site reads today:
-- getRecipeSnapshotByToken selected only `recipe`; getPublicGroceryListByToken
-- selected only `items`; getPendingDiscoveredRecipes selected `share_token, recipe`.
-- user_id is never returned by any of the three.

-- -----------------------------------------------------------------------
-- get_recipe_share_by_token: single-row lookup by exact token, open to anon
-- AND authenticated (same audience the qual=true policy served — the public
-- /r/$token route is reachable logged-out or logged-in). Strips sharerName
-- when the snapshot explicitly opted out (showSharer = false); a missing
-- showSharer key is a legacy snapshot and is treated as true, matching
-- finish_shared_recipe_save's existing convention.
-- -----------------------------------------------------------------------
create or replace function public.get_recipe_share_by_token(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_show_sharer boolean;
begin
  select rs.recipe into v_snapshot
  from public.recipe_shares rs
  where rs.share_token = p_share_token;

  if v_snapshot is null then
    return null;
  end if;

  if v_snapshot ? 'showSharer' then
    v_show_sharer := (v_snapshot ->> 'showSharer')::boolean;
  else
    v_show_sharer := true;
  end if;

  if not v_show_sharer then
    v_snapshot := v_snapshot - 'sharerName';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.get_recipe_share_by_token(text) from public;
grant execute on function public.get_recipe_share_by_token(text) to anon;
grant execute on function public.get_recipe_share_by_token(text) to authenticated;

-- -----------------------------------------------------------------------
-- get_grocery_list_share_by_token: same shape for grocery_list_shares. No
-- sharerName concept on this snapshot type, so no stripping logic.
-- -----------------------------------------------------------------------
create or replace function public.get_grocery_list_share_by_token(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  select gls.items into v_items
  from public.grocery_list_shares gls
  where gls.share_token = p_share_token;

  return v_items;
end;
$$;

revoke all on function public.get_grocery_list_share_by_token(text) from public;
grant execute on function public.get_grocery_list_share_by_token(text) to anon;
grant execute on function public.get_grocery_list_share_by_token(text) to authenticated;

-- -----------------------------------------------------------------------
-- get_my_discovered_shares: authenticated-only. Returns the recipe_shares
-- rows (share_token, recipe) whose token appears in the caller's OWN
-- shared_recipe_discoveries — scope is proven by auth.uid(), never by
-- client input. Same showSharer stripping rule as get_recipe_share_by_token,
-- applied per row. Callers still read shared_recipe_discoveries directly
-- (unaffected owner-only RLS) for status/updated_at; this function only
-- replaces the batched recipe_shares .in(share_token) lookup.
-- -----------------------------------------------------------------------
create or replace function public.get_my_discovered_shares()
returns table (share_token text, recipe jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      rs.share_token,
      case
        when coalesce((rs.recipe ->> 'showSharer')::boolean, true) then rs.recipe
        else rs.recipe - 'sharerName'
      end as recipe
    from public.recipe_shares rs
    where rs.share_token in (
      select sd.share_token
      from public.shared_recipe_discoveries sd
      where sd.user_id = v_user_id
    );
end;
$$;

revoke all on function public.get_my_discovered_shares() from public;
revoke all on function public.get_my_discovered_shares() from anon;
grant execute on function public.get_my_discovered_shares() to authenticated;
