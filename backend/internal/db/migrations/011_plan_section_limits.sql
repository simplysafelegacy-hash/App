-- 011_plan_section_limits.sql — per-plan gates for the new vault sections.
--
-- Same pattern as 006: handlers read these booleans at runtime, so which
-- plans include which sections can be changed with a data update instead of
-- a code deploy. Defaults mirror the existing tiering — the free plan gets
-- the basic organizing sections; non-probate (financial designations) is
-- reserved for paid tiers alongside power of attorney and health directives.

ALTER TABLE subscription_plan_limits
    ADD COLUMN IF NOT EXISTS allow_personal_property BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_non_probate       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allow_funeral           BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_contacts          BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE subscription_plan_limits
SET allow_personal_property = TRUE,
    allow_non_probate       = FALSE,
    allow_funeral           = TRUE,
    allow_contacts          = TRUE
WHERE plan_code = 'free';

UPDATE subscription_plan_limits
SET allow_personal_property = TRUE,
    allow_non_probate       = TRUE,
    allow_funeral           = TRUE,
    allow_contacts          = TRUE
WHERE plan_code IN ('individual', 'family', 'safekeeping');
