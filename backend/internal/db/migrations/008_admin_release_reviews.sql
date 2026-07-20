-- 008_admin_release_reviews.sql — platform admin review workflow for
-- release proof uploads. Admin approval releases one document type without
-- unsealing the entire vault.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS vault_document_releases (
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    document_type       TEXT NOT NULL,
    release_request_id  UUID REFERENCES release_requests(id) ON DELETE SET NULL,
    released_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (vault_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_vault_document_releases_vault
    ON vault_document_releases(vault_id);

CREATE INDEX IF NOT EXISTS idx_release_requests_status
    ON release_requests(status, created_at DESC);
