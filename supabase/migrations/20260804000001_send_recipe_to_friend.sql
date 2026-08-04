create or replace function public.send_recipe_to_friend(
  p_recipe_id     uuid,
  p_snapshot      jsonb,
  p_note          text,
  p_photo_url     text,
  p_recipient_ids uuid[]
)
returns table (recipient_id uuid, send_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_recipient uuid;
  v_send_id   uuid;
begin
  -- Identity: the real caller, not the function owner (SECURITY DEFINER doesn't change auth.uid()).
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'not authenticated';
  end if;

  -- Must have at least one recipient.
  if p_recipient_ids is null or array_length(p_recipient_ids, 1) is null then
    raise exception 'no recipients provided';
  end if;

  -- Self-send guard, checked before ownership/recipient validation.
  foreach v_recipient in array p_recipient_ids loop
    if v_recipient = v_sender_id then
      raise exception 'cannot send to self';
    end if;
  end loop;

  -- Ownership guard: caller must own the recipe being sent.
  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_sender_id
  ) then
    raise exception 'recipe not found or not owned by caller';
  end if;

  -- Recipient validation, all-or-nothing, up front before any writes.
  foreach v_recipient in array p_recipient_ids loop
    if not exists (select 1 from public.profiles p where p.id = v_recipient) then
      raise exception 'recipient % is not a valid user', v_recipient;
    end if;
  end loop;

  -- Writes: one recipe_sends + one notifications row per recipient, atomically.
  -- Duplicates allowed by design (no dedup check). Any unhandled exception above
  -- or below rolls back every write made in this call - all-or-nothing.
  foreach v_recipient in array p_recipient_ids loop
    insert into public.recipe_sends (sender_id, recipient_id, recipe, photo_url, note, status)
    values (v_sender_id, v_recipient, p_snapshot, p_photo_url, p_note, 'pending')
    returning id into v_send_id;

    insert into public.notifications (recipient_id, type, ref_id)
    values (v_recipient, 'recipe_received', v_send_id);

    recipient_id := v_recipient;
    send_id := v_send_id;
    return next;
  end loop;

  return;
end;
$$;

grant execute on function public.send_recipe_to_friend(uuid, jsonb, text, text, uuid[]) to authenticated;
