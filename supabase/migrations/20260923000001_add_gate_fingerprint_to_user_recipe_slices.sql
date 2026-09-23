-- Fingerprint of the exact inputs (profiles.allergies + profiles.taste_profile)
-- that drove this slice's Stage-1 dietary gating, computed and stored at
-- compute time by compute-slice. The freshness check recomputes the current
-- fingerprint and only serves a cached row if it matches — closes the gap
-- where an allergy edit left a stale, already-cached slice being served for
-- the rest of that day. Nullable, no default: existing rows have no
-- fingerprint and are correctly treated as stale (forces one recompute, not
-- a crash) the next time they're requested.
alter table public.user_recipe_slices
  add column gate_fingerprint text;
