-- Behavior/funnel events table. Structural twin of llm_usage (20260913000001):
-- same "deliberately not a foreign key, deny-all-but-the-function" posture,
-- same reason — most rows here are written before or during signup, so a bad
-- user_id must never fail the write. The ONE difference in posture from
-- llm_usage: that table left anon/authenticated's default SELECT grant in
-- place (relying solely on RLS); this one explicitly revokes it too, closing
-- the open-grant footgun flagged against llm_usage.
--
-- The only write path is public.log_event() below — a SECURITY DEFINER
-- function, EXECUTE granted to anon and authenticated, called via
-- supabase.rpc('log_event', ...). user_id always comes from auth.uid() inside
-- the function, never from the client. Every rejection is a silent return,
-- and the whole body is wrapped in an exception handler — this call can never
-- raise to a caller that is, by definition, mid-funnel and must not break.
--
-- Sessions are NOT computed here. app_open is a raw, deduped heartbeat only —
-- real session boundaries (a 30+ minute gap anywhere in a user's event
-- stream) are derived later, at read time, by a separate query. Do not
-- confuse app_open with "one row per session": the 2-minute backstop below
-- only collapses duplicate auth events firing together on tab refocus, not
-- genuinely distinct opens more than 2 minutes apart.

create table public.user_events (
  id          uuid primary key default gen_random_uuid(),
  -- Deliberately NOT a foreign key, same rationale as llm_usage.user_id: a
  -- bad/missing value must never fail the INSERT. Always auth.uid() as
  -- observed inside log_event() at write time — never client-supplied.
  user_id     uuid,
  -- Client-generated (crypto.randomUUID()), persisted in localStorage (or an
  -- in-memory fallback — see logEvent), present on logged-out AND logged-in
  -- events once minted, so pre-signup and post-signup rows for the same
  -- visitor can be correlated by anon_id even though they carry different
  -- (null vs. real) user_id values.
  anon_id     uuid,
  event_type  text not null check (event_type in (
                -- Funnel
                'share_link_view', 'share_view_in_app', 'share_view_signup_tap',
                'share_view_signin_tap', 'share_link_created', 'onboarding_started',
                'onboarding_step_answered', 'onboarding_share_token_detected',
                'onboarding_completed', 'discovered_shelf_mount', 'discovered_save_tap',
                'discovered_save_category_picked', 'discovered_save_complete',
                -- Behavior
                'app_open', 'recipe_saved', 'recipe_opened', 'riff_started',
                'recipe_sent', 'grocery_list_shared', 'screen_view', 'cook_logged'
              )),
  -- IDs and small enums only (recipe_id, share_token, source, step, screen,
  -- recipient_count, tz) — never free text (chat messages, onboarding
  -- answers, recipe content, emails). Enforced by caller discipline, not a
  -- DB constraint; log_event() rejects anything over ~2KB as a crude backstop
  -- against a caller that ignores this.
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index user_events_user_created_idx
  on public.user_events (user_id, created_at desc);

create index user_events_type_created_idx
  on public.user_events (event_type, created_at desc);

create index user_events_anon_id_idx
  on public.user_events (anon_id)
  where anon_id is not null;

-- Makes log_event()'s app_open dedupe backstop (does this user already have
-- an app_open in the last 2 minutes?) a tiny partial-index lookup instead of
-- a scan over the user's full, ever-growing event history.
create index user_events_app_open_recent_idx
  on public.user_events (user_id, created_at desc)
  where event_type = 'app_open';

alter table public.user_events enable row level security;

-- Owner can read own rows. Rows with user_id IS NULL (every pre-signup,
-- anon_id-only row) are unreadable via this policy to anyone, including the
-- visitor who generated them — same sentinel-unreadable posture as
-- llm_usage's NULL-user_id rows. No client-facing consumer of this table
-- today; read via service-role/dashboard.
create policy user_events_select_own
  on public.user_events
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated or anon — deny-all by
-- design, same posture as llm_usage/connections/notifications. Only
-- log_event() (SECURITY DEFINER, bypasses RLS) ever writes here.
--
-- Unlike llm_usage, which left anon/authenticated's table-level default
-- SELECT grant in place and relied on RLS alone (flagged as an open-but-inert
-- footgun), this table explicitly revokes ALL privileges from anon and
-- insert/update/delete from authenticated — belt-and-suspenders, not relying
-- solely on the policy.
revoke all on public.user_events from anon;
revoke insert, update, delete on public.user_events from authenticated;

-- Single write path. SECURITY DEFINER so it can insert despite the deny-all
-- policy above; search_path pinned to prevent search_path hijacking on a
-- definer function. Every rejection is a silent, no-op return — this runs
-- from logged-out, pre-signup, and mid-funnel contexts that must never see an
-- error surface from a telemetry call.
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
