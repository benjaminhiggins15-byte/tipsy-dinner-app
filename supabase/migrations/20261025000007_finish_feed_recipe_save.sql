-- DRAFT -- NOT APPLIED. Per CLAUDE.md's Session Rules, any write to the
-- shared Supabase DB requires explicit founder approval first; this file is
-- staged for review only. Do not run `supabase migration repair` / push /
-- apply against the linked project until that approval is given.
--
-- Cooking Feed -- save-from-feed. A viewer saves a posted cook's recipe into
-- their own library, with "inspired by [poster]" credit.
--
-- Sibling of finish_shared_recipe_save (20261002000001_shared_recipe_save.sql),
-- NOT finish_received_recipe_save -- there is no two-party recipe_sends-style
-- row here, so there is nothing to look up a sender/recipient/status from and
-- nothing to flip to 'saved'. Founder decisions restated for this function's
-- scope (not revisited):
--   - Deliberately CONNECTION-FREE, same as finish_shared_recipe_save -- no
--     `connections` row. Connections stay reserved for the two-party
--     send/receive flow.
--   - Credit name = poster's display name with the SAME fallback as the feed
--     itself (coalesce(display_name, '@'||handle, 'A Tipsy Dinner cook'),
--     matching get_cook_feed/get_cook_post's poster_display_name column),
--     computed server-side here -- never trusting a client-supplied name.
--   - The new recipe row is built entirely from the post's FROZEN
--     recipe_snapshot by the client's ordinary saveRecipe() call BEFORE this
--     function ever runs; this function never reads recipe_snapshot itself,
--     it only stamps attribution onto a recipe row the caller already
--     created and owns.
--   - Self-save (viewer saves their own post): the UI hides the Save button
--     for this case (CookPostDetailScreen, app-code change, not in this
--     migration), but this function does not rely on that alone -- it
--     independently checks poster_id = caller and silently skips the stamp
--     (no exception), mirroring finish_shared_recipe_save's own self-share
--     no-op (`if v_sharer_id = v_user_id then return`).
--
-- Duplicate saves: there is no recipe_sends-style per-(viewer, post) row to
-- flip to 'saved', so nothing here blocks a viewer from saving the same post
-- twice -- identical in behavior to finish_shared_recipe_save/saveSharedRecipe
-- for a repeated share save. Each call creates its own new recipe row (via
-- the client's own saveRecipe()) and this function stamps each one
-- independently and identically. See the app-code report for the exact
-- client-side consequence.
create or replace function public.finish_feed_recipe_save(p_post_id uuid, p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid;
  v_poster_id   uuid;
  v_credit_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Caller must own the recipe row being stamped -- same guard shape as
  -- finish_received_recipe_save / finish_shared_recipe_save.
  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_caller_id
  ) then
    raise exception 'recipe not found or not owned by caller';
  end if;

  -- cook_posts has owner-only RLS (cook_posts_select_own); this SECURITY
  -- DEFINER function deliberately bypasses it, same as get_cook_feed/
  -- get_cook_post, so a non-owner viewer's save path can read the poster's id.
  select user_id into v_poster_id
  from public.cook_posts
  where id = p_post_id;

  if v_poster_id is null then
    raise exception 'post not found';
  end if;

  -- Self-save: no credit to self. Silent no-op, not an exception -- the
  -- recipe the client already saved via saveRecipe() stays, just uncredited.
  if v_poster_id = v_caller_id then
    return;
  end if;

  -- Same fallback chain as get_cook_feed/get_cook_post's poster_display_name
  -- column (20261025000003_get_cook_feed_and_get_cook_post.sql) -- computed
  -- fresh here rather than trusting a client-supplied credit string.
  select coalesce(p.display_name, '@' || p.handle, 'A Tipsy Dinner cook')
  into v_credit_name
  from public.profiles p
  where p.id = v_poster_id;

  update public.recipes
  set inspired_by_id = v_poster_id,
      inspired_by_name = v_credit_name
  where id = p_recipe_id
    and user_id = v_caller_id; -- redundant with the EXISTS check above, kept as defense in depth
end;
$$;

revoke execute on function public.finish_feed_recipe_save(uuid, uuid) from public;
revoke execute on function public.finish_feed_recipe_save(uuid, uuid) from anon;
grant execute on function public.finish_feed_recipe_save(uuid, uuid) to authenticated;

-- ============================================================================
-- EXPLICITLY NOT IN THIS MIGRATION
-- ============================================================================
-- - No `connections` row -- founder decision, deliberate (see header).
-- - No recipe_sends-style status/idempotency tracking -- there is no
--   per-(viewer, post) row to flip, so repeat saves of the same post are not
--   blocked here. See the app-code report for exactly what that means for a
--   user who taps Save twice on the same post.
-- - Photo copy -- handled entirely client-side in saveFeedRecipe (data.ts),
--   not in SQL. See the app-code report for why no service-role Edge
--   Function is needed here (recipe-photos is a public bucket and the client
--   already holds a resolved public photo_url via get_cook_post).
