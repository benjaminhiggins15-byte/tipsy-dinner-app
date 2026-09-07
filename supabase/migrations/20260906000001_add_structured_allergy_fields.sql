-- Build 0 of structured hard-allergy support. Schema only — no capture,
-- serving, or pipeline logic touched in this migration.

-- profiles: new structured allergy field. No default — NULL means
-- "never asked," distinct from an explicit {"big9":[],"other":[]} answer.
-- This distinction is load-bearing for a future fail-closed gate.
ALTER TABLE profiles
  ADD COLUMN allergies jsonb;

ALTER TABLE profiles
  ADD CONSTRAINT allergies_shape_check CHECK (
    allergies IS NULL
    OR (
      jsonb_typeof(allergies) = 'object'
      AND jsonb_typeof(allergies -> 'big9') = 'array'
      AND jsonb_typeof(allergies -> 'other') = 'array'
    )
  );

-- suggested_recipe_pool: the 6 genuinely-missing Big-9 allergen columns
-- (milk -> is_dairy_free and wheat -> is_gluten_free are reused as-is,
-- not touched here). DEFAULT true is deliberate and fail-closed: an
-- untagged row must read as "assume contains this allergen," never as
-- "confirmed safe."
ALTER TABLE suggested_recipe_pool
  ADD COLUMN contains_egg     boolean NOT NULL DEFAULT true,
  ADD COLUMN contains_fish    boolean NOT NULL DEFAULT true,
  ADD COLUMN contains_soy     boolean NOT NULL DEFAULT true,
  ADD COLUMN contains_sesame  boolean NOT NULL DEFAULT true,
  ADD COLUMN contains_peanut  boolean NOT NULL DEFAULT true,
  ADD COLUMN contains_treenut boolean NOT NULL DEFAULT true;
