create or replace function public.get_my_connections()
returns table (id uuid, display_name text, handle text)
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

  return query
    select p.id, p.display_name, p.handle
    from public.connections c
    join public.profiles p
      on p.id = case
        when c.user_a = v_caller_id then c.user_b
        when c.user_b = v_caller_id then c.user_a
      end
    where c.user_a = v_caller_id or c.user_b = v_caller_id;
end;
$$;

grant execute on function public.get_my_connections() to authenticated;

create index connections_user_b_idx on public.connections (user_b);
