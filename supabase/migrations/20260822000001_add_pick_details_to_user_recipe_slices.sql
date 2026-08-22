-- Denormalized per-pick display fields for the (not-yet-built) suggestions
-- carousel, so the client can render a slice's picks from a row it already
-- has owner-only RLS access to, without ever reading suggested_recipe_pool
-- directly. Nullable, no default: existing rows stay null until their next
-- natural compute-slice recompute fills them in (no backfill).
alter table public.user_recipe_slices
  add column pick_details jsonb;
