-- DRAFT — NOT APPLIED, NOT a migration file. Lives in docs/drafts/ on
-- purpose, outside supabase/migrations/, pending founder review. Do NOT
-- run `supabase db push` / `supabase migration repair` against the linked
-- project. Per CLAUDE.md, any write to the shared Supabase DB requires
-- explicit founder approval first.
--
-- Cooking Feed v1.5 — groupings (recipe/dish/menu posts). Supersedes
-- cook_posts (0 rows in production as of this draft — verify again
-- immediately before cutover, see the companion cutover doc). This is a
-- SCHEMA-ONLY draft. One required companion change is NOT included here —
-- see "COMPANION CHANGE REQUIRED" at the bottom and the cutover doc's
-- step-by-step for why.

-- ============================================================
-- 0. Drop everything that depends on the old cook_posts shape
-- ============================================================
-- No inbound FK references cook_posts today, so this DROP succeeds on its
-- own — but get_cook_feed/get_cook_post/finish_feed_recipe_save all read
-- cook_posts columns that are changing shape, so they must be dropped in
-- the same migration or they'll start erroring at call time the instant
-- the table changes underneath them.
drop function if exists public.get_cook_feed(int, timestamptz, uuid);
drop function if exists public.get_cook_post(uuid);
drop function if exists public.finish_feed_recipe_save(uuid, uuid); -- superseded by save_grouping_from_post; see cutover doc item 1
drop table if exists public.cook_posts;

-- ============================================================
-- 1. Compositional, always-private layer
-- ============================================================
create type grouping_kind as enum ('recipe', 'dish', 'menu');

create table public.groupings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       grouping_kind not null,
  title      text,              -- null for kind='recipe'; falls back to its one part's recipe title
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- kind is immutable after creation — simpler than "immutable once it has
-- parts" and avoids ever needing to retroactively re-validate existing
-- grouping_parts rows against a changed kind's section rules.
create or replace function public.lock_grouping_kind()
returns trigger language plpgsql as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'groupings.kind cannot be changed after creation';
  end if;
  return new;
end; $$;

create trigger groupings_kind_lock before update on public.groupings
  for each row execute function public.lock_grouping_kind();

create table public.grouping_parts (
  id            uuid primary key default gen_random_uuid(),
  grouping_id   uuid not null references public.groupings(id) on delete cascade,
  -- Denormalized from the parent, same convention as ingredients.user_id /
  -- recipe_categories.user_id / menu_recipes.user_id elsewhere in this
  -- schema — lets delete_user_account_data's zero-rows check be a plain
  -- `where user_id = p_user_id`, not a join through a parent that may
  -- already be gone. Always set by the trigger below, never trusted from
  -- the caller.
  user_id       uuid not null references auth.users(id) on delete cascade,
  section       text,            -- null | 'component'/'also' | 'apps'/'mains'/'sides'/'desserts'/'drinks'
  recipe_id     uuid references public.recipes(id) on delete cascade,
  freeform_text text,
  position      int not null default 0,
  constraint grouping_parts_recipe_xor_freeform check (
    (recipe_id is not null and freeform_text is null) or
    (recipe_id is null and freeform_text is not null)
  )
);

-- Combines two jobs in one BEFORE trigger: (a) stamp user_id from the
-- parent grouping, unconditionally overriding anything the caller sends;
-- (b) validate section against the parent's kind. NULL used to silently
-- pass the dish/menu branches below in an earlier draft (`NULL NOT IN
-- (...)` is NULL, not true) — fixed by requiring non-null explicitly.
-- Also enforces founder decisions: dish 'also' parts must be freeform
-- (no recipe_id); dish 'component' parts must be a recipe reference (no
-- freeform_text).
create or replace function public.grouping_parts_before_write()
returns trigger language plpgsql as $$
declare
  v_kind  grouping_kind;
  v_owner uuid;
begin
  select kind, user_id into v_kind, v_owner from public.groupings where id = new.grouping_id;
  if v_owner is null then
    raise exception 'grouping_parts: parent grouping not found';
  end if;

  new.user_id := v_owner;

  -- A recipe_id part must reference a recipe owned by the grouping's own
  -- owner -- without this, grouping_parts_all_own's RLS check (which only
  -- validates user_id, trigger-stamped above) would let a caller attach
  -- someone else's recipe_id into their own grouping.
  if new.recipe_id is not null and not exists (
    select 1 from public.recipes r where r.id = new.recipe_id and r.user_id = v_owner
  ) then
    raise exception 'grouping_parts: recipe_id must belong to the grouping owner';
  end if;

  if v_kind = 'recipe' then
    if new.section is not null then
      raise exception 'recipe-kind parts must have a null section';
    end if;

  elsif v_kind = 'dish' then
    if new.section is null or new.section not in ('component', 'also') then
      raise exception 'dish-kind parts must have section component or also';
    end if;
    if new.section = 'also' and new.recipe_id is not null then
      raise exception 'dish "also" parts must be freeform text, not a recipe reference';
    end if;
    if new.section = 'component' and new.recipe_id is null then
      raise exception 'dish "component" parts must be a recipe reference, not freeform text';
    end if;

  elsif v_kind = 'menu' then
    if new.section is null or new.section not in ('apps','mains','sides','desserts','drinks') then
      raise exception 'menu-kind parts must have a valid course section';
    end if;
  end if;

  return new;
end; $$;

create trigger grouping_parts_before_write
  before insert or update on public.grouping_parts
  for each row execute function public.grouping_parts_before_write();

alter table public.groupings enable row level security;
alter table public.grouping_parts enable row level security;

create policy groupings_all_own on public.groupings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_id is trigger-derived (see above), so this is a plain owner check,
-- same shape as every other owned child table in this schema.
create policy grouping_parts_all_own on public.grouping_parts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 2. cook_posts: one cooked-and-logged instance of a grouping
-- ============================================================
create table public.cook_posts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- Nullable, ON DELETE SET NULL: deleting a private grouping must not
  -- silently delete a public post about it. The feed only ever reads
  -- grouping_snapshot, never the live groupings/grouping_parts tables, so
  -- a null here costs nothing at read time.
  grouping_id        uuid references public.groupings(id) on delete set null,
  -- recipe-kind only; null for dish/menu (no single cook_events row to
  -- anchor a multi-recipe cook to). CASCADE preserved from the original
  -- design: "a post cannot outlive its source" for this specific FK.
  cook_event_id      uuid references public.cook_events(id) on delete cascade,
  grouping_snapshot  jsonb not null, -- frozen {kind,title,parts:[{section,position,recipe:RecipeSendSnapshot|null,freeform_text|null}]}
  -- Live source photo: cook-photos-private, mutable, never public. Holds
  -- the dish/menu cook's own photo; for kind='recipe' the live source is
  -- instead the existing cook_events.photo_url (untouched, out of scope).
  private_photo_path text,
  -- Frozen public copy: recipe-photos, {userId}/post-{id}.jpg. Exists
  -- ONLY while is_posted = true — see cutover doc for the full
  -- post/unpost/re-post lifecycle (client-side, soft-fail).
  photo_url          text,
  -- Restored from the shipped v1 schema — the feed card's layout decision
  -- (big photo vs. compact) reads this today. 'cook' = the post's own
  -- private_photo_path (or, for kind='recipe', the cook_event's own
  -- photo); 'recipe' = kind='recipe' falling back to the single recipe's
  -- live photo_url. No 'recipe' case exists for dish/menu — there is no
  -- one recipe to fall back to.
  photo_source       text,
  is_posted          boolean not null default false,
  posted_at          timestamptz,
  score              numeric(3,1),
  note               text,
  cooked_on          date not null,
  created_at         timestamptz not null default now(),
  constraint cook_posts_photo_url_shape_chk check (
    photo_url is null or photo_url = user_id::text || '/post-' || id::text || '.jpg'
  ),
  -- Must sit under the owner's own folder ({user_id}/...) -- the same
  -- prefix storage RLS policies on cook-photos-private gate on
  -- ((storage.foldername(name))[1] = auth.uid()) and that the
  -- delete-account storage sweep relies on when it walks each bucket
  -- one level deep by uid. A path outside this prefix would be
  -- unreadable/unsweepable by both, so it's enforced here rather than
  -- trusted from the caller. See the cutover doc for the exact filename
  -- this draft expects.
  constraint cook_posts_private_photo_path_shape_chk check (
    private_photo_path is null or private_photo_path like (user_id::text || '/%')
  ),
  constraint cook_posts_photo_source_chk check (
    photo_source is null or photo_source in ('cook', 'recipe')
  )
);

create unique index cook_posts_cook_event_id_uidx
  on public.cook_posts (cook_event_id) where cook_event_id is not null;

alter table public.cook_posts enable row level security;

create policy cook_posts_select_own on public.cook_posts for select using (user_id = auth.uid());
create policy cook_posts_insert_own on public.cook_posts for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.groupings g where g.id = grouping_id and g.user_id = auth.uid())
);
create policy cook_posts_delete_own on public.cook_posts for delete using (user_id = auth.uid());
create policy cook_posts_update_own on public.cook_posts for update using (user_id = auth.uid());

-- Column-lock trigger (role: same as recipe_sends' — RLS can't restrict
-- which columns an UPDATE touches). Owner may change is_posted/posted_at/
-- score/note/photo_url/photo_source/private_photo_path (the posting
-- lifecycle); everything else is locked. grouping_id's FK is ON DELETE SET
-- NULL, which Postgres implements as a real UPDATE and WILL fire this
-- trigger — so the lock only blocks grouping_id being repointed to a
-- *different non-null* value, not the system's X -> NULL transition.
create or replace function public.lock_cook_posts_columns()
returns trigger language plpgsql as $$
begin
  if new.grouping_snapshot is distinct from old.grouping_snapshot
     or new.cook_event_id is distinct from old.cook_event_id
     or new.cooked_on is distinct from old.cooked_on
     or new.user_id is distinct from old.user_id
     or (new.grouping_id is distinct from old.grouping_id and new.grouping_id is not null) then
    raise exception 'cook_posts: locked columns (snapshot/cook_event/cooked_on/user, or grouping_id to non-null) cannot be updated';
  end if;
  return new;
end; $$;

create trigger cook_posts_column_lock before update on public.cook_posts
  for each row execute function public.lock_cook_posts_columns();

-- Added once, here, now that cook_posts exists — no forward reference, no
-- duplicate ALTER elsewhere. ON DELETE SET NULL: a poster must be able to
-- delete their own post even if someone else already saved a copy of it.
alter table public.groupings
  add column source_post_id uuid references public.cook_posts(id) on delete set null;

create unique index groupings_user_source_post_uidx
  on public.groupings (user_id, source_post_id) where source_post_id is not null;

-- ============================================================
-- 3. save_grouping_from_post -- one all-or-nothing save
-- ============================================================
create or replace function public.save_grouping_from_post(
  p_post_id     uuid,
  p_category_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id     uuid;
  v_poster_id     uuid;
  v_snapshot      jsonb;
  v_credit_name   text;
  v_grouping_id   uuid;
  v_existing_id   uuid;
  v_part          jsonb;
  v_new_recipe_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  select user_id, grouping_snapshot into v_poster_id, v_snapshot
  from public.cook_posts where id = p_post_id and is_posted = true;
  if v_snapshot is null then
    raise exception 'post not found or not public';
  end if;

  -- p_category_id ownership was unchecked in an earlier draft -- a caller
  -- could stamp any user's category id onto their own new recipes.
  if not exists (
    select 1 from public.categories c where c.id = p_category_id and c.user_id = v_caller_id
  ) then
    raise exception 'category not found or not owned by caller';
  end if;

  select id into v_existing_id from public.groupings
  where user_id = v_caller_id and source_post_id = p_post_id;
  if v_existing_id is not null then
    return v_existing_id; -- idempotent re-save
  end if;

  select coalesce(display_name, '@' || handle, 'A Tipsy Dinner cook')
    into v_credit_name from public.profiles where id = v_poster_id;

  insert into public.groupings (user_id, kind, title, source_post_id)
  values (v_caller_id, (v_snapshot->>'kind')::grouping_kind, v_snapshot->>'title', p_post_id)
  returning id into v_grouping_id;

  for v_part in select * from jsonb_array_elements(v_snapshot->'parts') loop
    if (v_part->'recipe') is not null and v_part->'recipe' <> 'null'::jsonb then

      -- Field-by-field match against today's saveRecipe/saveFeedRecipe
      -- (src/tipsy/data.ts): user_id, title, description, steps,
      -- created_at, source('manual') all match exactly.
      --
      -- cook_time/serves: today's saveRecipe silently drops both even
      -- though recipes has the columns and RecipeSendSnapshot carries
      -- them -- founder decision: persist them here (free, since the
      -- snapshot already has them); backporting the fix to today's
      -- saveFeedRecipe/saveReceivedRecipe is separate, later work.
      --
      -- Column type note: recipes.cook_time/recipes.serves are
      -- dashboard-only (no migration declares them), inferred as `text`
      -- from RecipeSendSnapshot's `string | null` TS type and 3 of 4
      -- call sites in data.ts. One call site (~data.ts:966-967) types
      -- them `number | null` instead -- a pre-existing inconsistency in
      -- app code, not introduced here. Recommend a one-time read-only
      -- type confirmation before applying (see cutover doc, testing).
      insert into public.recipes (
        user_id, title, description, steps, created_at, source,
        cook_time, serves, inspired_by_id, inspired_by_name
      )
      values (
        v_caller_id, v_part->'recipe'->>'title', v_part->'recipe'->>'description',
        v_part->'recipe'->'steps', now(), 'manual',
        v_part->'recipe'->>'cook_time', v_part->'recipe'->>'serves',
        nullif(v_poster_id, v_caller_id),
        case when v_poster_id <> v_caller_id then v_credit_name end
      )
      returning id into v_new_recipe_id;

      -- sort_order RE-DERIVED from array position (0-based), matching
      -- saveRecipe's `.map((ing, index) => ({ ..., sort_order: index }))`
      -- exactly -- any sort_order embedded in the snapshot is discarded,
      -- same as today. Column types confirmed: ingredients.name/quantity
      -- are text (free-text, per CLAUDE.md), sort_order is integer.
      insert into public.ingredients (recipe_id, user_id, name, quantity, sort_order)
      select v_new_recipe_id, v_caller_id, ing->>'name', ing->>'quantity', (ord - 1)::int
      from jsonb_array_elements(v_part->'recipe'->'ingredients') with ordinality as t(ing, ord);

      insert into public.recipe_categories (recipe_id, category_id, user_id)
      values (v_new_recipe_id, p_category_id, v_caller_id);

      insert into public.grouping_parts (grouping_id, section, recipe_id, position)
      values (v_grouping_id, v_part->>'section', v_new_recipe_id, (v_part->>'position')::int);
    else
      insert into public.grouping_parts (grouping_id, section, freeform_text, position)
      values (v_grouping_id, v_part->>'section', v_part->>'freeform_text', (v_part->>'position')::int);
    end if;
  end loop;

  return v_grouping_id;
end; $$;

revoke execute on function public.save_grouping_from_post(uuid, uuid) from public, anon;
grant execute on function public.save_grouping_from_post(uuid, uuid) to authenticated;

-- ============================================================
-- 4. get_cook_feed / get_cook_post
-- ============================================================
create or replace function public.get_cook_feed(
  p_limit int default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  post_id uuid, created_at timestamptz, cooked_on date, score numeric(3,1),
  note text, photo_url text, photo_source text,
  grouping_kind text, grouping_title text, grouping_description text,
  poster_id uuid, poster_display_name text, poster_handle text
)
language plpgsql security definer set search_path = public as $$
declare v_caller_id uuid; v_limit int;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then raise exception 'not authenticated'; end if;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  -- title parity fix: groupings.title is null for kind='recipe' (see
  -- groupings.title's own comment above), so grouping_snapshot->>'title' is
  -- also null for every recipe-kind post -- the feed card lost its title.
  -- Falls back to the snapshot's single part's recipe title for that case;
  -- dish/menu snapshots always carry a real top-level title and are
  -- unaffected. Companion fix: the client must write the recipe's title
  -- into the snapshot's own top-level `title` key at post time -- see the
  -- cutover doc's photo/snapshot lifecycle section.
  --
  -- grouping_description: parity restore (founder decision) for the v1
  -- feed card's description line, dropped by mistake in an earlier draft of
  -- this cutover. recipe-kind only -- its one part's recipe description;
  -- null for dish/menu (no single recipe to read a description from; those
  -- kinds have no description concept in this schema yet).
  return query
    select cp.id, cp.created_at, cp.cooked_on, cp.score, cp.note, cp.photo_url, cp.photo_source,
           cp.grouping_snapshot ->> 'kind',
           coalesce(cp.grouping_snapshot ->> 'title', cp.grouping_snapshot -> 'parts' -> 0 -> 'recipe' ->> 'title'),
           case when cp.grouping_snapshot ->> 'kind' = 'recipe'
                then cp.grouping_snapshot -> 'parts' -> 0 -> 'recipe' ->> 'description'
                else null end,
           p.id, coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'), p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    where cp.is_posted = true
      and (p_before_created_at is null or p_before_id is null
           or (cp.created_at, cp.id) < (p_before_created_at, p_before_id))
    order by cp.created_at desc, cp.id desc
    limit v_limit;
end; $$;

revoke execute on function public.get_cook_feed(int, timestamptz, uuid) from public, anon;
grant execute on function public.get_cook_feed(int, timestamptz, uuid) to authenticated;

create or replace function public.get_cook_post(p_post_id uuid)
returns table (
  post_id uuid, created_at timestamptz, cooked_on date, score numeric(3,1),
  note text, photo_url text, photo_source text, grouping_snapshot jsonb,
  poster_id uuid, poster_display_name text, poster_handle text
)
language plpgsql security definer set search_path = public as $$
declare v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then raise exception 'not authenticated'; end if;
  if p_post_id is null then return; end if;

  return query
    select cp.id, cp.created_at, cp.cooked_on, cp.score, cp.note, cp.photo_url, cp.photo_source,
           cp.grouping_snapshot, p.id,
           coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook'), p.handle
    from public.cook_posts cp
    join public.profiles p on p.id = cp.user_id
    where cp.id = p_post_id and cp.is_posted = true;
end; $$;

revoke execute on function public.get_cook_post(uuid) from public, anon;
grant execute on function public.get_cook_post(uuid) to authenticated;

-- ============================================================
-- COMPANION CHANGE REQUIRED (not included in this file)
-- ============================================================
-- delete_user_account_data (supabase/migrations/20261025000002_...) must be
-- restated with:
--   1. A new direct-delete block for `groupings`, same ownership-check-via-
--      RETURNING-loop pattern as its existing cook_posts block, placed near
--      it (order vs. cook_posts doesn't matter -- both FKs between them are
--      SET NULL, not CASCADE, so neither delete depends on the other).
--   2. A before-count for `grouping_parts` (informational only, cascades
--      automatically via groupings ON DELETE CASCADE -- same treatment as
--      ingredients/recipe_categories relative to recipes today).
--   3. Zero-rows-after checks for BOTH `groupings` and `grouping_parts` in
--      the function's final verification block, per the Load-Bearing
--      Contract: "any new table holding a user reference must be added to
--      both its deletion statements and its zero-rows verification block."
-- This is NOT drafted here as a full verbatim restatement -- the function
-- is 400+ lines and CREATE OR REPLACE requires restating it whole; doing
-- that from partial context risks introducing a real bug into a live,
-- security-critical function. See the cutover doc for the precise diff
-- instructions and why this is a separate file.
