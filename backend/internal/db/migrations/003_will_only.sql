-- 003_will_only.sql — collapse the document model down to a single will
-- per vault. Pre-launch decision: we don't need multi-document yet, and
-- inlining the will onto the vault row keeps the read-path trivial.
-- File uploads are out of scope until further notice (no file_key column).

-- Drop the per-document access table first (FK on documents).
DROP TABLE IF EXISTS member_document_access;
DROP TABLE IF EXISTS documents;

ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS has_will                BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS will_location_type      TEXT,
    ADD COLUMN IF NOT EXISTS will_location_address   TEXT,
    ADD COLUMN IF NOT EXISTS will_location_description TEXT,
    ADD COLUMN IF NOT EXISTS will_updated_at         TIMESTAMPTZ;
