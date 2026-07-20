-- 005_document_types_and_permissions.sql — add POA/directive records and
-- document-specific authorized-person roles.

ALTER TYPE vault_role ADD VALUE IF NOT EXISTS 'poa_agent';
ALTER TYPE vault_role ADD VALUE IF NOT EXISTS 'health_care_proxy';

ALTER TABLE vault_members
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS access_timing TEXT NOT NULL DEFAULT 'now';

UPDATE vault_members
SET access_timing = 'after_death'
WHERE role::text = 'successor' AND access_timing = 'now';

ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS has_power_of_attorney BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS poa_location_type TEXT,
    ADD COLUMN IF NOT EXISTS poa_location_address TEXT,
    ADD COLUMN IF NOT EXISTS poa_location_description TEXT,
    ADD COLUMN IF NOT EXISTS poa_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS has_health_care_directive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS health_care_location_type TEXT,
    ADD COLUMN IF NOT EXISTS health_care_location_address TEXT,
    ADD COLUMN IF NOT EXISTS health_care_location_description TEXT,
    ADD COLUMN IF NOT EXISTS health_care_updated_at TIMESTAMPTZ;
