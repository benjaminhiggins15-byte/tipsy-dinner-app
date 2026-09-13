-- Session 1 cost meter. Records one row per billable Anthropic call, made
-- from inside the ai-chat edge function (the single choke point every AI
-- call in the app routes through, including compute-slice's Stage 2
-- selection, which calls back into ai-chat server-to-server).

create table public.llm_usage (
  id             uuid primary key default gen_random_uuid(),
  -- Deliberately NOT a foreign key to auth.users. For 6 of 7 call types this
  -- value is self-reported by an anonymous caller (ai-chat's verify_jwt=false
  -- posture, unchanged) — a bad value must never fail the INSERT and lose the
  -- cost row. The edge function format-validates to a UUID shape before
  -- insert and substitutes NULL on failure; existence-in-auth.users is
  -- intentionally not enforced here.
  user_id        uuid,
  call_type      text not null check (call_type in (
                   'build-chat', 'reflection', 'constraints-parse',
                   'taste-profile', 'grocery-enrich', 'slice',
                   'step-title-backfill'
                 )),
  model          text not null,
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  cost_usd       numeric(10,6) not null check (cost_usd >= 0),
  created_at     timestamptz not null default now()
);

create index llm_usage_user_created_idx
  on public.llm_usage (user_id, created_at desc);

create index llm_usage_call_type_created_idx
  on public.llm_usage (call_type, created_at desc);

alter table public.llm_usage enable row level security;

-- Owner can read own rows. Rows with user_id IS NULL (the missing-
-- attribution sentinel) are unreadable via this policy to anyone, including
-- the caller who triggered them — by design; there is no client-facing
-- consumer of this table in Session 1. Read via service-role/dashboard.
create policy llm_usage_select_own
  on public.llm_usage
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated or anon — deny-all by
-- design, same posture as connections/notifications. Only the service-role
-- client inside the edge functions writes here, and service role bypasses
-- RLS regardless of policy. Explicit revoke below is belt-and-suspenders,
-- matching this codebase's own documented default-grant-to-anon gotcha.
revoke insert, update, delete on public.llm_usage from authenticated, anon;
