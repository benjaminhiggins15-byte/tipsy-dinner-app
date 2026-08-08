create or replace function public.get_sender_names(ids uuid[])
returns table (id uuid, display_name text)
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

  if ids is null or array_length(ids, 1) is null then
    return;
  end if;

  return query
    select p.id, p.display_name
    from public.profiles p
    where p.id = any(ids)
      and exists (
        select 1 from public.recipe_sends rs
        where rs.sender_id = p.id
          and rs.recipient_id = v_caller_id
      );
end;
$$;

grant execute on function public.get_sender_names(uuid[]) to authenticated;
