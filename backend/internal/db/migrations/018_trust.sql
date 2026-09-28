-- 018_trust.sql — the trust becomes a first-class vault document.
--
-- Modelled on the will rather than on a list section: a trust is a single
-- named instrument whose *location* the owner records, it accepts document
-- copies, and it becomes operative on death — so it shares the will's
-- steward(now) / successor(after-death) access model and its death-certificate
-- release proof.
--
-- No constraint widening is needed anywhere else: document_type and section
-- are plain TEXT across vault_member_permissions, vault_document_releases,
-- release_requests and vault_attachments, and the steward/successor values
-- this section uses already exist in the vault_role enum.

ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS has_trust                 BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS trust_location_type       TEXT,
    ADD COLUMN IF NOT EXISTS trust_location_address    TEXT,
    ADD COLUMN IF NOT EXISTS trust_location_description TEXT,
    ADD COLUMN IF NOT EXISTS trust_updated_at          TIMESTAMPTZ;

-- Gated like every other section. Free stays will-only (see 017), so the
-- trust is a paid-plan document; the two paid plans agree on it, as they
-- agree on everything except max_authorized_people.
ALTER TABLE subscription_plan_limits
    ADD COLUMN IF NOT EXISTS allow_trust BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE subscription_plan_limits
SET allow_trust = FALSE, updated_at = NOW()
WHERE plan_code = 'free';

UPDATE subscription_plan_limits
SET allow_trust = TRUE, updated_at = NOW()
WHERE plan_code IN ('individual', 'family', 'safekeeping');
