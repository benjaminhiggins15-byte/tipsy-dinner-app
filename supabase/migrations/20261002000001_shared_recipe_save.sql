-- Chunk 3 (share-to-save) — REDESIGNED. Replaces the earlier claim/attach/
-- finish lock-table draft (see docs/proposals/share-to-save-chunk3-results.md
-- for why that draft was stopped before being applied). Nothing in this file
-- has ever been applied to the remote database.
--
-- New model: a public-share recipe is NEVER auto-saved. It appears as a
-- "Discovered" item on Home; the user taps it, previews it, and saves it
-- through the app's STANDARD save flow (category picker included). This
-- migration only needs to support that: (1) a lightweight pending/saved/
-- dismissed record so Home can show the shelf and so the save step is
-- idempotent/attributable, and (2) the attribution stamp, now toggle-aware.
--
-- Deliberately CONNECTION-FREE, same as Suggested Recipes saves (see
-- "Suggested Recipes — Layer 4" in FEATURE_SPECS.md) and explicitly NOT
-- reusing recipe_sends / saveReceivedRecipe / finish_received_recipe_save —
-- those are the two-party friend-sharing system and must stay untouched.

-- -----------------------------------------------------------------------
-- profiles.share_show_name: persisted default for the "Show my name" toggle
-- presented at share time. Defaults true (today's implicit behavior).
-- -----------------------------------------------------------------------
alter table public.profiles
  add column share_show_name boolean not null default true;

-- -----------------------------------------------------------------------
-- shared_recipe_discoveries: one row per (user_id, share_token). Unlike the
-- earlier draft, this is NOT a concurrency lock — there is no claim/steal
-- mechanism, no staleness window, no attach step. It is just a durable
-- record of "this user has this pending/saved/dismissed share," so the
-- Discovered shelf survives across devices and a save can be marked
-- idempotent.
-- -----------------------------------------------------------------------
create table public.shared_recipe_discoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_token text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'saved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, share_token),
  unique (recipe_id)
);

alter table public.shared_recipe_discoveries enable row level security;

-- Owner-select only. No insert/update/delete policy for the client — every
-- write goes through the SECURITY DEFINER functions below, same deny-all-
-- except-owner-select posture as connections/notifications.
create policy shared_recipe_discoveries_select_own
  on public.shared_recipe_discoveries
  for select
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- record_shared_recipe_discovery: best-effort idempotent record of a
-- pending discovery. Called from the Onboarding Loader and from Home's
-- mount effect after reading PENDING_SHARE_TOKEN_KEY back from localStorage
-- (the latter is also the "View in app" path for an already-signed-in user
-- re-opening the same share link). Deliberately silent (no exception) on an
-- unknown/deleted token, because the token is a localStorage value that may
-- be stale by the time this runs — a failed lookup here must never block
-- onboarding or Home mount.
--
-- Resurrects on re-discovery in exactly two cases, mirroring the decision
-- that re-opening the same share link should surface it again unless it's
-- genuinely already handled:
--   - the existing row is 'dismissed' -> back to 'pending'.
--   - the existing row is 'saved' but its recipe_id has gone null (the
--     saved recipe was since deleted, via this table's
--     `on delete set null` FK) -> back to 'pending', so it isn't
--     permanently stranded as an unreachable "saved" ghost.
-- A 'saved' row whose recipe still exists, or an already-'pending' row, is
-- left untouched (plain no-op) — a repeat visit must never duplicate or
-- regress a real save.
-- -----------------------------------------------------------------------
create or replace function public.record_shared_recipe_discovery(p_share_token text)
returns void
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

  if not exists (
    select 1 from public.recipe_shares where share_token = p_share_token
  ) then
    return; -- unknown/deleted token: silently do nothing
  end if;

  insert into public.shared_recipe_discoveries (user_id, share_token)
  values (v_user_id, p_share_token)
  on conflict (user_id, share_token) do update
  set status = 'pending',
      updated_at = now()
  where shared_recipe_discoveries.status = 'dismissed'
     or (shared_recipe_discoveries.status = 'saved'
         and shared_recipe_discoveries.recipe_id is null);
end;
$$;

-- Supabase grants EXECUTE to anon separately from PUBLIC by default, so
-- PUBLIC and anon must both be revoked explicitly, not just one or the
-- other, on every function below.
revoke all on function public.record_shared_recipe_discovery(text) from public;
revoke all on function public.record_shared_recipe_discovery(text) from anon;
grant execute on function public.record_shared_recipe_discovery(text) to authenticated;

-- -----------------------------------------------------------------------
-- dismiss_shared_recipe_discovery: marks a still-pending record dismissed.
-- Only affects 'pending' rows, so it can never un-save an already-saved
-- discovery. Mirrors the existing "Sent to you" dismiss affordance
-- (dismissReceivedRecipe, which flips recipe_sends.status). A dismissed row
-- is resurrected back to 'pending' by record_shared_recipe_discovery above
-- if the same share is ever re-discovered.
-- -----------------------------------------------------------------------
create or replace function public.dismiss_shared_recipe_discovery(p_share_token text)
returns void
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

  update public.shared_recipe_discoveries
  set status = 'dismissed', updated_at = now()
  where user_id = v_user_id and share_token = p_share_token and status = 'pending';
end;
$$;

revoke all on function public.dismiss_shared_recipe_discovery(text) from public;
revoke all on function public.dismiss_shared_recipe_discovery(text) from anon;
grant execute on function public.dismiss_shared_recipe_discovery(text) to authenticated;

-- -----------------------------------------------------------------------
-- finish_shared_recipe_save: called AFTER the client has already saved the
-- recipe via the standard, unmodified saveRecipe() (with a real category).
-- Self-sufficient — it does NOT require record_shared_recipe_discovery to
-- have run first (that call is a best-effort UI nicety for the shelf, not a
-- precondition for a correct save): this function upserts the discovery
-- row itself via ON CONFLICT, so a save works even if the pending record
-- was never created (race, cleared localStorage, direct deep link while
-- already signed in, etc).
--
-- Stamps recipes.inspired_by_id/inspired_by_name, toggle-aware:
--   - share_shares row gone (deleted share / sharer account cascaded away),
--     or a self-share (sharer = saver) -> skip the stamp, no exception.
--   - snapshot has showSharer === false -> skip the stamp entirely, with NO
--     profile-name fallback. The sharer explicitly asked to stay anonymous.
--   - snapshot has showSharer === true, or the key is absent (legacy
--     snapshot minted before the toggle existed) -> stamp, preferring the
--     frozen sharerName, falling back to the sharer's CURRENT
--     profiles.display_name only when sharerName was never captured.
-- Idempotent — safe to call again with the same recipe_id.
-- -----------------------------------------------------------------------
create or replace function public.finish_shared_recipe_save(p_share_token text, p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_sharer_id uuid;
  v_snapshot jsonb;
  v_show_sharer boolean;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_user_id
  ) then
    raise exception 'recipe not found or not owned by caller';
  end if;

  insert into public.shared_recipe_discoveries (user_id, share_token, recipe_id, status)
  values (v_user_id, p_share_token, p_recipe_id, 'saved')
  on conflict (user_id, share_token) do update
    set recipe_id = coalesce(public.shared_recipe_discoveries.recipe_id, excluded.recipe_id),
        status = 'saved',
        updated_at = now();

  select rs.user_id, rs.recipe into v_sharer_id, v_snapshot
  from public.recipe_shares rs
  where rs.share_token = p_share_token;

  if v_sharer_id is null or v_sharer_id = v_user_id then
    return; -- share gone, or self-share: never stamp either way
  end if;

  if v_snapshot ? 'showSharer' then
    v_show_sharer := (v_snapshot ->> 'showSharer')::boolean;
  else
    v_show_sharer := true; -- legacy snapshot predates the toggle
  end if;

  if not v_show_sharer then
    return; -- sharer chose to stay anonymous: no stamp, no fallback
  end if;

  v_name := nullif(trim(both from (v_snapshot ->> 'sharerName')), '');
  if v_name is null then
    select p.display_name into v_name from public.profiles p where p.id = v_sharer_id;
  end if;

  update public.recipes
  set inspired_by_id = v_sharer_id, inspired_by_name = v_name
  where id = p_recipe_id;
end;
$$;

revoke all on function public.finish_shared_recipe_save(text, uuid) from public;
revoke all on function public.finish_shared_recipe_save(text, uuid) from anon;
grant execute on function public.finish_shared_recipe_save(text, uuid) to authenticated;
