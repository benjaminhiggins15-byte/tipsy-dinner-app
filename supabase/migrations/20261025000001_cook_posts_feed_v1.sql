-- DRAFT — NOT APPLIED. Do NOT run `supabase migration up` / `supabase db
-- push` against the linked project. Per CLAUDE.md, any write to the shared
-- Supabase DB requires explicit founder approval first; this file is staged
-- for review only, ahead of the public "cooking feed" v1 build.
--
-- Revision 2 — incorporates founder decisions on the first draft:
--   1. A post must NOT outlive its source (REVERSED from draft 1's SET NULL
--      design). cook_event_id/recipe_id are now NOT NULL + ON DELETE CASCADE.
--   2. Editing a cook's score/note after posting never updates the post
--      (confirmed, unchanged from draft 1 — still no UPDATE policy).
--   3. One post per cook_event stays enforced, now a plain UNIQUE (no longer
--      partial, since cook_event_id can no longer be NULL).
--   4. Photo privacy fix: live/unposted cook photos move to a NEW, NON-public
--      bucket (cook-photos-private); frozen post photos stay in the existing
--      public recipe-photos bucket. A CHECK constraint pins
--      cook_posts.photo_url to the row's own {user_id}/post-{id}.jpg shape.
--
-- Scope still does NOT include the public read path (the narrow SECURITY
-- DEFINER function for anon/authenticated feed reads) — still later work.
-- Scope still does NOT include delete_user_account_data — that is its own
-- separate draft file, 20261025000002_delete_user_account_data_add_cook_posts.sql,
-- per the Load-Bearing Contract in CLAUDE.md requiring its own reviewed diff.
--
-- ============================================================================
-- DECISION (1) — A POST DOES NOT OUTLIVE ITS SOURCE
-- ============================================================================
-- cook_posts.cook_event_id and cook_posts.recipe_id are both NOT NULL and
-- ON DELETE CASCADE. Deleting a cook_events row (directly, via the HISTORY
-- tab's delete) cascades its cook_posts row away. Deleting a recipe cascades
-- its cook_events rows away (existing, unchanged behavior) which transitively
-- cascades their cook_posts rows away too — no separate mechanism needed,
-- Postgres walks the FK graph. The frozen recipe_snapshot/photo_url still
-- exist — per the founder's framing, that's for READ SAFETY (so the feed
-- never has to join back to a live, possibly-edited recipe to render a card),
-- not for surviving deletion.
--
-- recipe_id is kept as its own direct FK (not just reachable via
-- cook_event_id -> cook_events.recipe_id) purely for query convenience (e.g.
-- "all posts for this recipe" without a join) — it is otherwise redundant
-- with cook_event_id's chain and cascades in lockstep with it by construction
-- (a cook_event's recipe_id is immutable after creation), so the two FKs
-- cannot desync.
--
-- STORAGE DOES NOT CASCADE — this is the one thing Postgres cannot do for
-- you. Deleting a cook_events or recipes row removes the DB rows, but the
-- live cook photo ({userId}/cook-{cookEventId}.jpg, now in the new private
-- bucket below) and the frozen post photo ({userId}/post-{postId}.jpg, in the
-- public recipe-photos bucket) are orphaned storage objects unless the
-- APPLICATION removes them first. Required app-level pre-delete steps (listed
-- here since no DB mechanism can do this; not implemented in this draft):
--   - Before deleteCookEvent(eventId) runs its DB delete: look up that one
--     cook_event's own photo path (if any) in cook-photos-private AND look up
--     its (at most one, per the UNIQUE constraint) cook_posts row's photo_url
--     in recipe-photos; delete both storage objects; THEN delete the DB row
--     (which cascades the cook_posts row automatically).
--   - Before deleteSavedRecipe(recipeId) runs its DB delete: fetch ALL
--     cook_events for that recipe, and for each one, its private cook-photo
--     path and its cook_posts row's post-photo path (if any); delete every
--     one of those storage objects across both buckets; THEN delete the
--     recipe (which cascades cook_events, which cascades cook_posts).
--   - This compounds the ALREADY-FLAGGED, pre-existing gap in CLAUDE.md
--     ("Deleting a saved recipe never removes its storage photo") — that gap
--     covers only the recipe's own {recipeId}.jpg and is not fixed by this
--     draft either; it is now one of three photo types a recipe delete must
--     sweep for, not introduced by this feature.
--
-- ============================================================================
-- DECISION (2) — POSTS ARE IMMUTABLE AFTER CREATION (CONFIRMED)
-- ============================================================================
-- No UPDATE policy exists on cook_posts (see RLS section below) — this was
-- already draft 1's design and is now confirmed, not just recommended.
-- Editing a cook_events row's score/note via the existing updateCookEvent
-- after it has been posted has NO effect on an already-created cook_posts
-- row; there is no code path (app or DB) that could propagate such an edit,
-- because the client has no UPDATE grant on this table at all. A "repost"
-- after editing is a brand-new row with a brand-new id.
--
-- ============================================================================
-- DECISION (4a) — BUCKET PRIVACY: recipe-photos IS a public bucket
-- ============================================================================
-- Confirmed from existing behavior already live in this codebase: the public
-- share route (r.$token.tsx) renders recipe_shares/recipe_sends photos via
-- bare public CDN URLs to anonymous visitors with no auth step, and
-- CLAUDE.md's own "Public bucket != SDK access permitted" note only matters
-- because the bucket's public flag is genuinely set. That flag makes EVERY
-- object in recipe-photos fetchable by anyone holding its URL, authenticated
-- or not, regardless of storage.objects RLS, which only governs SDK calls
-- (.download()/.upload()/.list()), never the public CDN path.
--
-- This means a live, UNPOSTED cook photo at {userId}/cook-{cookEventId}.jpg,
-- if placed in this same bucket, WOULD be readable by anyone holding the URL
-- the moment the owner's own UI renders it to them (the URL has to reach the
-- client to be displayed at all) -- violating "un-posted cooks are never
-- readable by anyone but the owner" at the storage layer even though the DB
-- row itself is correctly RLS-locked. This is the same latent property every
-- OTHER live photo in recipe-photos already has (nothing new), but it had
-- never been promised as fully private before -- cook photos are the first
-- thing in this app explicitly promised that guarantee, so it needs an actual
-- fix, not just the existing "the path is hard to guess" posture.
--
-- FIX (recommended): a NEW, NON-public bucket, cook-photos-private, holds the
-- live/unposted cook photo only. storage.objects RLS on this bucket is
-- owner-scoped for SELECT too (not just INSERT, unlike recipe-photos'
-- documented write-only scoping) -- with public=false there is no CDN bypass
-- to worry about, so RLS is the complete read boundary, not just a write
-- boundary. The owner views their own in-progress cook photo via the
-- authenticated SDK (.download() or a short-lived createSignedUrl()), never
-- getPublicUrl() -- calling getPublicUrl() against a private bucket returns a
-- URL that will 403, so this also fails CLOSED rather than open if a future
-- call site gets this wrong, unlike a same-bucket "just don't call
-- getPublicUrl for this one path" convention would.
--
-- At POST time, the display photo (cook photo if present, else the live
-- recipe photo) is byte-copied from its source (cook-photos-private OR
-- recipe-photos, depending on which is being shown) into the PUBLIC
-- recipe-photos bucket at {userId}/post-{postId}.jpg -- this is the exact
-- moment privacy is deliberately traded for publicness, matching the user's
-- explicit "post publicly" action. Still a same-user, same-or-cross-bucket
-- copy (never cross-USER), so still no service-role Edge Function needed --
-- same actor, same authenticated client, just naming a different bucket in
-- the .from() call when the source is cook-photos-private.
--
-- CHEAPER FALLBACK, not implemented here, noted for completeness: skip the
-- new bucket, keep cook-{cookEventId}.jpg in recipe-photos, store only the
-- storage PATH (not a public URL) in cook_events.photo_url, and enforce by
-- convention that no call site ever invokes getPublicUrl() on it (signed URL
-- only). Lower infra cost, but fails OPEN (a future mistaken getPublicUrl()
-- call silently leaks) rather than failing closed. Recommending the new
-- bucket over this for that reason.
--
-- First in-repo SQL touching storage.buckets/storage.objects -- every bucket
-- and policy up to now has been dashboard-only, same convention as the rest
-- of the schema. This migration starts tracking this one bucket's policies
-- in-repo; recipe-photos' own existing bucket/policies remain dashboard-only
-- and uncaptured, same as before.
--
-- ============================================================================
-- DECISION (4b) — photo_url SHAPE ENFORCED IN THE DB, NOT JUST THE CLIENT
-- ============================================================================
-- A CHECK constraint (below) pins cook_posts.photo_url to end with exactly
-- '/' || user_id || '/post-' || id || '.jpg' -- i.e., the row's OWN user_id
-- and OWN primary key, never any other user's folder and never a different
-- filename shape (so it can't be pointed at a live cook-{...}.jpg, a live
-- recipe {recipeId}.jpg, or someone else's post). Combined with the INSERT
-- policy's auth.uid() = user_id check, this makes "a post can only ever
-- reference its own poster's own frozen copy" a DB-enforced invariant, not
-- just something the client is trusted to get right.
--
-- REQUIRED APP-CODE CONSEQUENCE: because the check validates against the
-- row's own `id`, and the storage copy must happen BEFORE the DB row exists
-- (same-user copy, then insert), the client must mint `id` itself
-- (crypto.randomUUID()) and pass it explicitly into the INSERT rather than
-- relying on the DEFAULT gen_random_uuid() -- otherwise the client would not
-- know the destination filename in advance. Same "mint before the copy"
-- sequencing already used by shareRecipeSnapshot/sendRecipeToFriends, just
-- reused as the actual primary key this time instead of a separate token
-- column.
--
-- ============================================================================
-- STORAGE PATH CONVENTIONS (updated)
-- ============================================================================
--   - Live, optional, replaceable cook photo: cook-photos-private bucket
--     (NEW, non-public), path {userId}/cook-{cookEventId}.jpg -- mutable,
--     upsert-on-replace. Written/removed only by a new uploadCookPhoto/
--     removeCookPhoto pair in data.ts (app-code, not in this migration).
--     Never resolved via getPublicUrl(); owner's own view uses a short-lived
--     signed URL or an authenticated .download().
--   - Frozen, immutable post photo: recipe-photos bucket (existing, public),
--     path {userId}/post-{postId}.jpg -- written exactly once, at post time,
--     via a same-user download-then-upload (source is cook-photos-private or
--     recipe-photos depending on which photo is being shown; destination is
--     always recipe-photos). Public URL is correct and intentional here (see
--     decision 4a) -- by the time this object exists, the user has explicitly
--     chosen to make it public. Immutable thereafter except by the explicit
--     unpost/delete-post action (item 4 of the original task), which removes
--     the object before deleting the row.
--
-- Both are still flat filenames with no subfolders beneath {userId}/, so the
-- EXISTING account-deletion storage sweep (one level deep per bucket) still
-- requires no code change for recipe-photos' post-{id}.jpg objects -- but the
-- sweep MUST be extended to also cover the new cook-photos-private bucket, or
-- a deleted account's private cook photos would be the one object type left
-- behind. Flagged here; the actual Edge Function change is listed as an
-- app-code item in the report, not drafted in SQL (it lives in
-- supabase/functions/delete-account/index.ts, outside migrations).
--
-- ============================================================================
-- 0. New bucket: cook-photos-private
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cook-photos-private', 'cook-photos-private', false)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped for every operation, including SELECT -- with public=false
-- there's no CDN bypass, so RLS here is the entire read boundary, not just a
-- write boundary (unlike recipe-photos' documented write-only scoping).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_photos_private_select_own'
      AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY cook_photos_private_select_own ON storage.objects
      FOR SELECT
      USING (bucket_id = 'cook-photos-private' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_photos_private_insert_own'
      AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY cook_photos_private_insert_own ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'cook-photos-private' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_photos_private_update_own'
      AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY cook_photos_private_update_own ON storage.objects
      FOR UPDATE
      USING (bucket_id = 'cook-photos-private' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_photos_private_delete_own'
      AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY cook_photos_private_delete_own ON storage.objects
      FOR DELETE
      USING (bucket_id = 'cook-photos-private' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- ============================================================================
-- 1. cook_events: add the optional, mutable live cook photo
-- ============================================================================
-- Mirrors recipes.photo_url/photo_version exactly (nullable + non-null
-- cache-busting version, never a render-time value per the Load-Bearing
-- Contract in CLAUDE.md) -- except this photo_url, by convention, is NEVER a
-- public CDN URL (see decision 4a); app code must treat it as either a bare
-- storage path or resolve it to a signed URL just-in-time, never persist a
-- public URL here.
ALTER TABLE public.cook_events
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS photo_version integer NOT NULL DEFAULT 0;

-- ============================================================================
-- 2. cook_posts: the frozen, public-eligible post
-- ============================================================================
-- recipe_snapshot is a RECONSTITUTION snapshot, same shape family as
-- send_recipe_to_friend's p_snapshot (title, description, ingredients as
-- {name, quantity, sort_order}, steps normalized via normalizeStep() as
-- {title, instruction}, cook_time, serves) -- deliberately NOT the display-
-- oriented RecipeShareSnapshot shape, because a future "save this from the
-- feed" step (explicitly later work) will need to insert directly into
-- recipes+ingredients the same way saveReceivedRecipe does. No photo key
-- inside the jsonb, same reasoning as recipe_sends.recipe: the photo travels
-- only as its own column (photo_url below).
--
-- id has a DEFAULT for convenience/safety, but per decision 4b the inserting
-- client MUST supply its own crypto.randomUUID() explicitly rather than rely
-- on it, since the storage copy has to happen first and needs to know the
-- filename in advance.
CREATE TABLE IF NOT EXISTS public.cook_posts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  cook_event_id   uuid        NOT NULL,
  recipe_id       uuid        NOT NULL,
  recipe_snapshot jsonb       NOT NULL,
  photo_url       text,
  score           numeric(3,1),
  note            text,
  cooked_on       date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cook_posts_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_posts_user_id_fkey'
  ) THEN
    ALTER TABLE public.cook_posts
      ADD CONSTRAINT cook_posts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Decision (1): CASCADE, not SET NULL. A post cannot outlive its source.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_posts_cook_event_id_fkey'
  ) THEN
    ALTER TABLE public.cook_posts
      ADD CONSTRAINT cook_posts_cook_event_id_fkey
      FOREIGN KEY (cook_event_id) REFERENCES public.cook_events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_posts_recipe_id_fkey'
  ) THEN
    ALTER TABLE public.cook_posts
      ADD CONSTRAINT cook_posts_recipe_id_fkey
      FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
  END IF;

  -- Decision (4b): photo_url, when present, must be exactly this row's own
  -- frozen copy -- never another user's folder, never a different filename
  -- shape (live cook photo, live recipe photo, someone else's post).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cook_posts_photo_url_shape_chk'
  ) THEN
    ALTER TABLE public.cook_posts
      ADD CONSTRAINT cook_posts_photo_url_shape_chk
      CHECK (
        photo_url IS NULL
        OR photo_url LIKE '%/' || user_id::text || '/post-' || id::text || '.jpg'
      );
  END IF;
END $$;

-- Decision (3): one post per cook_event, plain UNIQUE now that cook_event_id
-- can never be NULL (no partial-index WHERE clause needed anymore).
CREATE UNIQUE INDEX IF NOT EXISTS cook_posts_cook_event_id_key
  ON public.cook_posts (cook_event_id);

-- Standard ownership/listing indexes -- cheap, low-risk, not load-bearing for
-- correctness. created_at DESC anticipates the later public-feed function's
-- ordering; add/drop freely if that function's real query shape differs.
CREATE INDEX IF NOT EXISTS cook_posts_user_id_idx ON public.cook_posts (user_id);
CREATE INDEX IF NOT EXISTS cook_posts_created_at_idx ON public.cook_posts (created_at DESC);

-- ============================================================================
-- 3. RLS — owner-only, no exceptions. No anon/public policy of any kind.
-- ============================================================================
-- Table-level grants will be the standard Supabase default (ALL to
-- anon/authenticated/postgres/service_role) exactly like every other table in
-- this schema -- RLS below is the entire enforcement boundary. Enabled, not
-- forced, matching cook_events' own convention.
ALTER TABLE public.cook_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_posts_select_own'
      AND polrelid = 'public.cook_posts'::regclass
  ) THEN
    CREATE POLICY cook_posts_select_own ON public.cook_posts
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- WITH CHECK does the ownership-guard work a SECURITY DEFINER function
  -- would otherwise need to do (no RPC is used for posting -- see design
  -- decision in the original draft report): a client cannot post referencing
  -- another user's cook_event_id, and the cook_event's own recipe_id must
  -- match the recipe_id being stored, closing the gap where a caller could
  -- otherwise pair a real cook_event with an unrelated (but still
  -- self-owned) recipe_id.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_posts_insert_own'
      AND polrelid = 'public.cook_posts'::regclass
  ) THEN
    CREATE POLICY cook_posts_insert_own ON public.cook_posts
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.cook_events ce
          WHERE ce.id = cook_posts.cook_event_id
            AND ce.user_id = auth.uid()
            AND ce.recipe_id = cook_posts.recipe_id
        )
      );
  END IF;

  -- No UPDATE policy, deliberately (decision 2, confirmed). Posts are
  -- immutable once created -- a "repost" is a new row (fresh id), not an
  -- update to an old one.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'cook_posts_delete_own'
      AND polrelid = 'public.cook_posts'::regclass
  ) THEN
    CREATE POLICY cook_posts_delete_own ON public.cook_posts
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- EXPLICITLY NOT IN THIS MIGRATION (deferred, later step per the task)
-- ============================================================================
-- - The public, anon-reachable SECURITY DEFINER read function (e.g.
--   get_cook_feed / get_cook_post) that will be the ONLY path for anyone
--   other than the owner to read a cook_posts row, scoped to posted rows and
--   card-only fields. Until it exists, cook_posts has zero non-owner read
--   paths -- confirmed by the RLS policies above.
-- - delete_user_account_data -- see
--   20261025000002_delete_user_account_data_add_cook_posts.sql, a separate
--   draft file per the Load-Bearing Contract in CLAUDE.md.
