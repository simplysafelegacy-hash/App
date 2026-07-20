-- 007_document_permissions_and_release_requests.sql — document-specific
-- permissions plus release proof uploads for later admin review.

CREATE TABLE IF NOT EXISTS vault_member_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES vault_members(id) ON DELETE CASCADE,
    document_type   TEXT NOT NULL,
    permission_role TEXT NOT NULL,
    access_timing   TEXT NOT NULL DEFAULT 'now',
    hidden          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (member_id, document_type, permission_role)
);

INSERT INTO vault_member_permissions (
    member_id, document_type, permission_role, access_timing, hidden
)
SELECT id,
       CASE
           WHEN role::text = 'poa_agent' THEN 'power_of_attorney'
           WHEN role::text = 'health_care_proxy' THEN 'health_care_directive'
           ELSE 'will'
       END,
       role::text,
       COALESCE(access_timing, CASE WHEN role::text = 'successor' THEN 'after_death' ELSE 'now' END),
       FALSE
FROM vault_members
WHERE role::text <> 'owner'
ON CONFLICT (member_id, document_type, permission_role) DO NOTHING;

CREATE TABLE IF NOT EXISTS release_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    requester_id    UUID REFERENCES vault_members(id) ON DELETE SET NULL,
    document_type   TEXT NOT NULL,
    release_reason  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    note            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS release_request_files (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_request_id UUID NOT NULL REFERENCES release_requests(id) ON DELETE CASCADE,
    gcs_bucket         TEXT NOT NULL,
    gcs_object         TEXT NOT NULL,
    file_name          TEXT NOT NULL,
    content_type       TEXT NOT NULL DEFAULT '',
    file_size          BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_permissions_member
    ON vault_member_permissions(member_id);
CREATE INDEX IF NOT EXISTS idx_release_requests_vault
    ON release_requests(vault_id, created_at DESC);
