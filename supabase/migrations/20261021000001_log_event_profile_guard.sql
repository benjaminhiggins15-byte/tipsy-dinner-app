-- NOT APPLIED. Written and reviewed on feature/account-deletion only.
-- Do NOT run `supabase migration up` / `supabase db push` against the
-- linked project until a founder explicitly approves applying it (per the
-- "Any write to the shared Supabase DB ... requires explicit founder
-- approval first" rule in CLAUDE.md). This file is a commit-only artifact
-- for review at this stage.
--
-- Review finding F2 (account-deletion build): log_event() is the sole write
-- path into public.user_events (see 20261004000001_create_user_events.sql).
-- delete_user_account_data() deletes every existing user_events row for a
-- departing user as part of that transaction, but it cannot prevent a NEW
-- row from reappearing afterward — e.g. a client tab that is mid-flight on
-- a logEvent() call, or a queued/retried call that lands after the account
-- is gone. user_events.user_id is NOT a foreign key (deliberately, per that
-- table's own header comment, so a bad/missing id never fails the insert),
-- so nothing at the schema level stops this today.
--
-- Fix: log_event() now silently no-ops (same "never raise to a mid-funnel
-- caller" posture as every other rejection branch in this function) when
-- auth.uid() is non-null but has no matching public.profiles row — i.e. the
-- account has been deleted. Logged-out calls (v_user_id is null) are
-- untouched; this guard only ever applies to the authenticated-but-deleted
-- case. Placed immediately after the existing logged-out-allowlist check,
-- before the app_open dedupe lookup, so a rejected call does the least
-- possible work.
create or replace function public.log_event(
  p_event_type text,
  p_props jsonb default '{}'::jsonb,
  p_anon_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_props    jsonb := coalesce(p_props, '{}'::jsonb);
  v_logged_out_allowed constant text[] := array[
    'share_link_view', 'share_view_in_app',
    'share_view_signup_tap', 'share_view_signin_tap'
  ];
begin
  -- Unknown/null event_type -> silent return. (Also enforced by the table
  -- CHECK above; checked here first so a bad value is a no-op, not a
  -- caught constraint-violation exception.)
  if p_event_type is null or p_event_type not in (
    'share_link_view', 'share_view_in_app', 'share_view_signup_tap',
    'share_view_signin_tap', 'share_link_created', 'onboarding_started',
    'onboarding_step_answered', 'onboarding_share_token_detected',
    'onboarding_completed', 'discovered_shelf_mount', 'discovered_save_tap',
    'discovered_save_category_picked', 'discovered_save_complete',
    'app_open', 'recipe_saved', 'recipe_opened', 'riff_started',
    'recipe_sent', 'grocery_list_shared', 'screen_view', 'cook_logged'
  ) then
    return;
  end if;

  -- Oversized props -> silent return. pg_column_size is the stored/compressed
  -- size, not raw JSON text bytes, so this is an approximate ~2KB guard, not
  -- an exact byte-count enforcement — fine for "a caller ignored the IDs-only
  -- rule," not meant to be precise.
  if pg_column_size(v_props) > 2048 then
    return;
  end if;

  -- Logged out: only the pre-signup share-funnel events are allowed, and
  -- only when the caller supplied an anon_id to link this forward.
  if v_user_id is null then
    if p_anon_id is null or not (p_event_type = any(v_logged_out_allowed)) then
      return;
    end if;
  end if;

  -- Review finding F2: a non-null caller whose profiles row is gone (account
  -- deleted) must never produce a new user_events row — see header comment.
  if v_user_id is not null and not exists (
    select 1 from public.profiles where id = v_user_id
  ) then
    return;
  end if;

  -- app_open dedupe backstop: collapses duplicate auth events (TOKEN_REFRESHED,
  -- the documented duplicate-SIGNED_IN-on-tab-refocus bug, and the
  -- visibilitychange listener firing moments apart from an onAuthStateChange
  -- event) into one row per 2-minute window. Deliberately short — this is
  -- NOT a session boundary, just a duplicate-event collapse; real session
  -- gaps (30+ minutes) are computed later from the full event stream, not
  -- from app_open rows alone. Only reachable with v_user_id non-null
  -- (app_open isn't in the logged-out allowlist above).
  if p_event_type = 'app_open' and exists (
    select 1 from public.user_events
    where user_id = v_user_id
      and event_type = 'app_open'
      and created_at > now() - interval '2 minutes'
  ) then
    return;
  end if;

  insert into public.user_events (user_id, anon_id, event_type, props)
  values (v_user_id, p_anon_id, p_event_type, v_props);

exception
  when others then
    -- Belt-and-suspenders: no path above should reach here, but a telemetry
    -- call must never raise to the caller, full stop.
    return;
end;
$$;

revoke all on function public.log_event(text, jsonb, uuid) from public;
grant execute on function public.log_event(text, jsonb, uuid) to anon, authenticated;
