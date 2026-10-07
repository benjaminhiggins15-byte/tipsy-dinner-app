-- Pairings feature, schema-only step. No capture, parsing, or generation
-- logic touched in this migration.

-- profiles: drink-pairing preferences. NULL in each column means "never
-- asked" / "not yet parsed" — distinct from an explicit false/empty answer.
-- alcohol_ok fails closed: NULL is treated as false (no alcohol) everywhere
-- it is read, mirroring the allergies fail-closed convention.
ALTER TABLE profiles
  ADD COLUMN wants_pairings boolean,
  ADD COLUMN drink_preference text,
  ADD COLUMN alcohol_ok boolean;

-- recipes: cached AI drink-pairing suggestions, generated lazily on first
-- open of the Pairings tab. NULL = never generated for this recipe yet.
-- pairings_fingerprint pins the cache to the recipe's own content (title +
-- ingredients + steps) plus the profile inputs it was generated under
-- (drink_preference + alcohol_ok + allergies), mirroring
-- user_recipe_slices.gate_fingerprint in compute-slice — a mismatch means
-- regenerate, not trust-the-stale-cache.
ALTER TABLE recipes
  ADD COLUMN pairings jsonb,
  ADD COLUMN pairings_fingerprint text;

-- llm_usage: widen the call_type whitelist for the two new Pairings AI
-- calls. Every previously-allowed value is preserved unchanged; this is
-- additive only.
ALTER TABLE llm_usage
  DROP CONSTRAINT llm_usage_call_type_check;

ALTER TABLE llm_usage
  ADD CONSTRAINT llm_usage_call_type_check CHECK (call_type IN (
    'build-chat', 'reflection', 'constraints-parse',
    'taste-profile', 'grocery-enrich', 'slice',
    'step-title-backfill', 'drink-parse', 'pairings-gen'
  ));
