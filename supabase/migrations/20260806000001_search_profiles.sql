create or replace function public.search_profiles(query text)
returns table (id uuid, display_name text, handle text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_query     text;
  v_escaped   text;
begin
  -- Identity: the real caller, not the function owner.
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Empty/whitespace-only query returns nothing, never the whole table.
  v_query := trim(query);
  if v_query = '' then
    return;
  end if;

  -- Escape LIKE metacharacters so a literal % or _ in the user's query
  -- is matched literally, not treated as a wildcard.
  v_escaped := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select p.id, p.display_name, p.handle
    from public.profiles p
    where p.id <> v_caller_id
      and (
        lower(p.handle) = lower(v_query)
        or lower(p.display_name) like lower(v_escaped) || '%' escape '\'
      )
    limit 10;
end;
$$;

grant execute on function public.search_profiles(text) to authenticated;

create index profiles_display_name_lower_idx
  on public.profiles (lower(display_name) text_pattern_ops);
