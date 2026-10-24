-- DRAFT -- NOT APPLIED. Per CLAUDE.md's Session Rules, any write to the
-- shared Supabase DB requires explicit founder approval first; this file is
-- staged for review only. Do not run `supabase migration repair` / push /
-- apply against the linked project until that approval is given.
--
-- Founder decision (2026-10-25): Fix B. Closes an open-host hole found while
-- auditing cook_posts_photo_url_shape_chk (question-only session, no changes
-- made there): the live CHECK is
--   CHECK (photo_url IS NULL OR photo_url LIKE '%/' || user_id || '/post-' || id || '.jpg')
-- which only anchors the URL's SUFFIX. `%` matches any prefix, including a
-- scheme+host that isn't this project's Supabase storage host at all --
-- cook_posts_insert_own's WITH CHECK never touches photo_url, so an
-- authenticated client inserting directly (bypassing postCook) could set
-- photo_url to an attacker-controlled external URL ending in
-- `/{their-own-user-id}/post-{their-own-post-id}.jpg` and it would pass both
-- RLS and this CHECK. The feed would then render that URL as an <img src> to
-- every other authenticated user.
--
-- Fix B removes the host/URL concept from the column entirely (mirroring
-- cook_events.photo_url's existing bare-path convention) rather than pinning
-- the CHECK to a hardcoded host literal (Fix A, not taken). cook_posts.photo_url
-- now holds only the bare storage path, {user_id}/post-{id}.jpg, inside the
-- public recipe-photos bucket -- resolved to a public URL at READ time by
-- getCookFeed/getCookPost (data.ts), not stored. With no host substring left
-- in the column, there is nothing left to spoof: the new CHECK is an exact
-- equality against the row's own user_id/id, closing the hole completely
-- rather than just narrowing it.
--
-- Verified against production 2026-10-25 before drafting this file:
--   - cook_posts has exactly 1 row total, 1 with a non-null photo_url.
--   - That row's photo_url already matches the expected full-URL shape
--     (https://xzpmmthreeyscidhwriv.supabase.co/storage/v1/object/public/
--     recipe-photos/{user_id}/post-{id}.jpg) exactly -- 0 rows fail the
--     guard below. The guard is real safety for whenever this actually runs
--     (data may have changed by then), not a check known to be moot today.
--
-- Explicit BEGIN/COMMIT (same convention as 20261025000004) so the guard,
-- the data conversion, and the CHECK swap are atomic -- a failure partway
-- through (e.g. the guard firing) leaves the table completely untouched
-- rather than half-converted.
BEGIN;

-- Fail fast rather than guess: abort with the exact row count if any
-- existing photo_url isn't in the one shape this migration knows how to
-- convert. A hardcoded host literal is unavoidable here (CHECK/DO blocks
-- can't read env vars) but is used only for this one-time guard/conversion,
-- never persisted -- the new CHECK below has no host concept at all.
DO $$
DECLARE
  v_mismatched_count integer;
BEGIN
  SELECT count(*) INTO v_mismatched_count
  FROM public.cook_posts
  WHERE photo_url IS NOT NULL
    AND photo_url <> (
      'https://xzpmmthreeyscidhwriv.supabase.co/storage/v1/object/public/recipe-photos/'
      || user_id::text || '/post-' || id::text || '.jpg'
    );

  IF v_mismatched_count > 0 THEN
    RAISE EXCEPTION
      'cook_posts_photo_url_bare_path: % row(s) have a photo_url that does not match the expected full-URL shape -- aborting rather than guessing how to convert them',
      v_mismatched_count;
  END IF;
END $$;

-- Drop the old suffix-only LIKE check BEFORE converting the data below --
-- the bare path has no leading '/' before user_id, so the old CHECK (which
-- requires a literal '/' immediately before user_id) would reject the
-- converted value mid-UPDATE if dropped after instead of before.
ALTER TABLE public.cook_posts
  DROP CONSTRAINT IF EXISTS cook_posts_photo_url_shape_chk;

-- Convert: full public URL -> bare path.
UPDATE public.cook_posts
SET photo_url = user_id::text || '/post-' || id::text || '.jpg'
WHERE photo_url IS NOT NULL;

-- Replace it with an exact match. No host/URL substring exists in the
-- column anymore, so there is nothing left to anchor beyond the row's own
-- user_id/id -- this closes the hole completely rather than narrowing it to
-- one hardcoded host.
ALTER TABLE public.cook_posts
  ADD CONSTRAINT cook_posts_photo_url_shape_chk
  CHECK (
    photo_url IS NULL
    OR photo_url = user_id::text || '/post-' || id::text || '.jpg'
  );

COMMIT;

-- ============================================================================
-- EXPLICITLY NOT IN THIS MIGRATION
-- ============================================================================
-- - cook_posts_insert_own / cook_posts_select_own / cook_posts_delete_own --
--   untouched; none reference photo_url's shape.
-- - get_cook_feed / get_cook_post -- untouched. Both already just pass
--   cp.photo_url through as-is; after this migration that value is a bare
--   path instead of a full URL, resolved to a public URL by the TS wrapper
--   functions in data.ts (see the app-change summary in the task report),
--   not by the SQL functions themselves.
-- - The postCook (data.ts) app-code change that stores the bare path instead
--   of a resolved public URL -- drafted separately, not applied; see the
--   task report.
