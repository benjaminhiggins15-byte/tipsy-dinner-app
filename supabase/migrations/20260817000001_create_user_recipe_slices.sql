create table public.user_recipe_slices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  slice_date       date not null,
  recipe_ids       jsonb not null,
  selection_reason text,
  status           text not null default 'ready',
  created_at       timestamptz not null default now()
);

-- One slice per user per local day — the freshness key / upsert target.
alter table public.user_recipe_slices
  add constraint user_recipe_slices_user_date_unique unique (user_id, slice_date);

-- "Today's slice" + recent-history lookups, most-recent-first.
create index user_recipe_slices_user_date_idx
  on public.user_recipe_slices (user_id, slice_date desc);

alter table public.user_recipe_slices enable row level security;

create policy user_recipe_slices_select_own
  on public.user_recipe_slices
  for select
  using (auth.uid() = user_id);

create policy user_recipe_slices_insert_own
  on public.user_recipe_slices
  for insert
  with check (auth.uid() = user_id);

create policy user_recipe_slices_update_own
  on public.user_recipe_slices
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_recipe_slices_delete_own
  on public.user_recipe_slices
  for delete
  using (auth.uid() = user_id);
