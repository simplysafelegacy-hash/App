-- 009_vault_entries.sql — generic "list item + beneficiaries" foundation.
--
-- One shared shape backs every list-style vault section: personal property,
-- non-probate assets, and important contacts. The section column names which
-- feature an entry belongs to; the JSONB details column holds the fields
-- specific to that section, so new list sections need no schema change.
--
-- Access to entries is gated at the SECTION level by the same permission
-- engine that gates the will (see handlers/permissions.go CanReadDocument):
-- a viewer who may not read a section never receives its entries, and because
-- beneficiary names are child rows of an entry, they stay hidden too.

CREATE TABLE IF NOT EXISTS vault_entries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id   UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    section    TEXT NOT NULL,                 -- 'personal_property' | 'non_probate' | 'contacts'
    title      TEXT NOT NULL,                 -- "Grandmother's ring", "MetLife policy", "Jane Doe, Esq."
    details    JSONB NOT NULL DEFAULT '{}',   -- section-specific fields
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_entry_beneficiaries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id     UUID NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT '',
    share        TEXT NOT NULL DEFAULT '',    -- "50%", "everything", free-text
    note         TEXT NOT NULL DEFAULT '',
    member_id    UUID REFERENCES vault_members(id) ON DELETE SET NULL, -- optional link to a known member
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_entries_vault_section
    ON vault_entries(vault_id, section, sort_order);
CREATE INDEX IF NOT EXISTS idx_vault_entry_beneficiaries_entry
    ON vault_entry_beneficiaries(entry_id, sort_order);
