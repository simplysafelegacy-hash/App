-- 016_consent_eligibility.sql
--
-- The signup checkbox asks the user to confirm four separate things:
--
--   "I confirm that I am at least 18 years old and a New Jersey resident,
--    agree to the Terms of Service and acknowledge the Privacy Policy."
--
-- 015 recorded only the last two. The first two are eligibility
-- attestations, and the Privacy Policy's section 1 makes them load-bearing:
-- the Services are offered only to New Jersey residents who are at least
-- 18. An attestation the user made but that was never written down is not
-- an attestation you can rely on later.
--
-- Recorded as separate columns rather than folded into accepted_terms
-- because they are distinct claims: what a user attested to should be
-- reconstructable from the row, not inferred from the checkbox copy that
-- happened to be live that day.
--
-- Both default FALSE and are NOT NULL. Rows written by 015 keep FALSE,
-- which is accurate: those users were never asked. Never backfill these to
-- TRUE — that would fabricate an attestation nobody made.

ALTER TABLE user_legal_consents
    ADD COLUMN IF NOT EXISTS attested_age_18 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_legal_consents
    ADD COLUMN IF NOT EXISTS attested_nj_resident BOOLEAN NOT NULL DEFAULT FALSE;
