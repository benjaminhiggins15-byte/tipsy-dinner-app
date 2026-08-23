-- Scoped read path into suggested_recipe_pool (deny-all to clients, service-
-- role-only otherwise) for Thread 3b's suggestion detail view. Mirrors
-- get_sender_names: caller identity from auth.uid() only, membership proven
-- before any pool data is returned. Scope is deliberately ANY slice ever
-- assigned to the caller, not just today's slice, so a suggestion tapped
-- from an earlier day still resolves.
create or replace function public.get_suggested_recipe(p_recipe_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  cuisine text,
  effort text,
  cook_time int,
  serves int,
  ingredients jsonb,
  steps jsonb,
  is_vegetarian boolean,
  is_vegan boolean,
  is_gluten_free boolean,
  is_dairy_free boolean,
  contains_pork boolean,
  contains_shellfish boolean,
  contains_nuts boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  if p_recipe_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.user_recipe_slices s
    where s.user_id = v_caller_id
      and s.recipe_ids @> to_jsonb(array[p_recipe_id::text])
  ) then
    return;
  end if;

  return query
    select
      p.id, p.title, p.description, p.cuisine, p.effort, p.cook_time, p.serves,
      p.ingredients, p.steps,
      p.is_vegetarian, p.is_vegan, p.is_gluten_free, p.is_dairy_free,
      p.contains_pork, p.contains_shellfish, p.contains_nuts
    from public.suggested_recipe_pool p
    where p.id = p_recipe_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on function creation; every
-- sibling SECURITY DEFINER function in this codebase (get_sender_names,
-- search_profiles, get_my_connections) still carries that default grant
-- today (confirmed via information_schema.routine_privileges), neutralized
-- only by their own internal auth.uid()-null guard. This function revokes
-- that default explicitly so the ACL itself says authenticated-only, not
-- just the runtime guard.
--
-- Discovered while wiring this up: this project's `public` schema also has
-- an ALTER DEFAULT PRIVILEGES rule (pg_default_acl) that grants EXECUTE to
-- anon/authenticated/service_role directly on every new function owned by
-- `postgres`, independent of the PUBLIC pseudo-role — so revoking from
-- PUBLIC alone does NOT remove anon's access. anon must be revoked
-- explicitly too. Same latent gap likely affects every prior SECURITY
-- DEFINER function in this codebase; out of scope to fix here.
revoke execute on function public.get_suggested_recipe(uuid) from public;
revoke execute on function public.get_suggested_recipe(uuid) from anon;
grant execute on function public.get_suggested_recipe(uuid) to authenticated;
