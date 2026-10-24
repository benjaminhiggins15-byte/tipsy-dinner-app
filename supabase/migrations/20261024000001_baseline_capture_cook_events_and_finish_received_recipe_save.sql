-- Baseline capture of pre-existing live schema — no behavior change.
--
-- NOT APPLIED. Repo-only capture; do NOT run `supabase migration up` /
-- `supabase db push` against the linked project. Per CLAUDE.md, any write
-- to the shared Supabase DB requires explicit founder approval first, and
-- this file's entire purpose is the opposite of a write: it documents
-- objects that already exist live so future changes to them are auditable
-- against a tracked definition instead of only the dashboard.
--
-- Captured 2026-10-24 via read-only queries (information_schema / pg_catalog
-- / pg_get_functiondef) against the linked project, per CLAUDE.md's
-- "Schema lives ONLY in the Supabase dashboard" known-risk item and the two
-- Standing Cleanup bullets this closes:
--   - "cook_events... no in-repo migrations" (table + RLS policies)
--   - "finish_received_recipe_save exists only in the live database"
--
-- Every statement below is guarded (IF NOT EXISTS / DROP+CREATE OR REPLACE
-- for the function / existence checks for policies) so re-running this file
-- against a database that already matches is a no-op. This file describes
-- CURRENT live state only — it does not change RLS posture, grants, FK
-- actions, or function logic in any way.

-- ============================================================
-- Table: public.cook_events
-- ============================================================
-- One row per logged "cooked this on this date" event against a saved
-- recipe. Columns, types, defaults, and FK actions below match the live
-- table exactly as read back via information_schema.columns / pg_constraint.
CREATE TABLE IF NOT EXISTS public.cook_events (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  recipe_id  uuid NOT NULL,
  cooked_on  date NOT NULL,
  score      numeric(3,1),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cook_events_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_events_user_id_fkey'
  ) THEN
    ALTER TABLE public.cook_events
      ADD CONSTRAINT cook_events_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_events_recipe_id_fkey'
  ) THEN
    ALTER TABLE public.cook_events
      ADD CONSTRAINT cook_events_recipe_id_fkey
      FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
  END IF;
END $$;

-- No indexes exist beyond the primary key's implicit unique btree on (id) —
-- confirmed via pg_indexes at capture time. Not added here; this file
-- documents existing state only, and adding one would be a behavior/
-- performance change outside this task's scope.

ALTER TABLE public.cook_events ENABLE ROW LEVEL SECURITY;

-- Live policies are all "own rows only", keyed on auth.uid() = user_id, one
-- per command. Captured verbatim via pg_policy / pg_get_expr.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_events_select_own'
      AND polrelid = 'public.cook_events'::regclass
  ) THEN
    CREATE POLICY cook_events_select_own ON public.cook_events
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_events_insert_own'
      AND polrelid = 'public.cook_events'::regclass
  ) THEN
    CREATE POLICY cook_events_insert_own ON public.cook_events
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_events_update_own'
      AND polrelid = 'public.cook_events'::regclass
  ) THEN
    CREATE POLICY cook_events_update_own ON public.cook_events
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_events_delete_own'
      AND polrelid = 'public.cook_events'::regclass
  ) THEN
    CREATE POLICY cook_events_delete_own ON public.cook_events
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Table-level grants at capture time were the standard Supabase default
-- (ALL on the table to anon/authenticated/postgres/service_role) — RLS
-- above is the real enforcement boundary, not these grants. Not restated
-- here as explicit GRANT statements: Postgres applies these same defaults
-- automatically to a freshly-created table in this project, and re-issuing
-- them would not be idempotent-safe to express as a diff against unknown
-- future grant state. Flagged for awareness, not reproduced mechanically.

-- ============================================================
-- Function: public.finish_received_recipe_save(p_send_id uuid, p_recipe_id uuid)
-- ============================================================
-- SECURITY DEFINER; the sole path that stamps inspired_by_id/inspired_by_name,
-- forms the connections row, sets recipe_sends.saved_recipe_id, and flips
-- recipe_sends.status to 'saved' for the Account-to-Account receive flow.
-- See "Account-to-Account Sharing — Build 4" in FEATURE_SPECS.md for the
-- full design rationale. Body below is byte-for-byte what pg_get_functiondef
-- returned at capture time — CREATE OR REPLACE is idempotent by nature, so
-- no existence guard is needed.
CREATE OR REPLACE FUNCTION public.finish_received_recipe_save(p_send_id uuid, p_recipe_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id   uuid;
  v_send        record;
  v_sender_name text;
  v_user_a      uuid;
  v_user_b      uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  select id, sender_id, recipient_id, status
    into v_send
    from public.recipe_sends
   where id = p_send_id
   for update;

  if v_send.id is null then
    raise exception 'send not found';
  end if;

  if v_send.recipient_id <> v_caller_id then
    raise exception 'caller is not the recipient of this send';
  end if;

  if v_send.status <> 'pending' then
    raise exception 'send is not pending (status=%)', v_send.status;
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_caller_id
  ) then
    raise exception 'recipe not found or not owned by caller';
  end if;

  select display_name into v_sender_name
    from public.profiles
   where id = v_send.sender_id;

  update public.recipes
     set inspired_by_id   = v_send.sender_id,
         inspired_by_name = v_sender_name
   where id = p_recipe_id;

  v_user_a := least(v_send.sender_id, v_caller_id);
  v_user_b := greatest(v_send.sender_id, v_caller_id);

  insert into public.connections (user_a, user_b, created_via)
  values (v_user_a, v_user_b, p_send_id)
  on conflict (user_a, user_b) do nothing;

  update public.recipe_sends
     set saved_recipe_id = p_recipe_id,
         status = 'saved'
   where id = p_send_id;
end;
$function$;

-- EXECUTE at capture time: granted to PUBLIC (the Postgres default for a
-- new function, never explicitly revoked) — anon and authenticated both
-- inherit it. This is safe only because the function's own internal guards
-- (auth.uid() IS NULL check, recipient-match check, pending-status check,
-- ownership check) ARE the security boundary, same posture documented for
-- send_recipe_to_friend / delete_user_account_data in CLAUDE.md /
-- FEATURE_SPECS.md. Not changed here — reproducing the default again below
-- so this file reflects what a fresh deploy of this exact definition would
-- also produce, with no net privilege change.
GRANT EXECUTE ON FUNCTION public.finish_received_recipe_save(uuid, uuid) TO PUBLIC;
