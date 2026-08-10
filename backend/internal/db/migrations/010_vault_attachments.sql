-- 010_vault_attachments.sql — generic uploaded-file storage for a vault.
--
-- Generalizes the release_request_files upload path (GCS object + metadata)
-- into a first-class attachment that hangs off a vault section, and
-- optionally off a specific list entry. Downloads are streamed through an
-- authenticated, permission-checked handler (never a public/signed GCS URL);
-- read access is decided by CanReadDocument(section), so a document copy is
-- visible to exactly the people permitted to that section, at the same time
-- as its location.

CREATE TABLE IF NOT EXISTS vault_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id     UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    section      TEXT NOT NULL,   -- 'will' | 'power_of_attorney' | 'health_care_directive' | any section
    entry_id     UUID REFERENCES vault_entries(id) ON DELETE CASCADE, -- optional: file attached to a list item
    gcs_bucket   TEXT NOT NULL,
    gcs_object   TEXT NOT NULL,   -- {vault_id}/attachments/{section}/{id}/{file_name}
    file_name    TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT '',
    file_size    BIGINT NOT NULL DEFAULT 0,
    uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_attachments_vault_section
    ON vault_attachments(vault_id, section);
CREATE INDEX IF NOT EXISTS idx_vault_attachments_entry
    ON vault_attachments(entry_id) WHERE entry_id IS NOT NULL;
