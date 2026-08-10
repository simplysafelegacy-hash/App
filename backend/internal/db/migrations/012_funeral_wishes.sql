-- 012_funeral_wishes.sql — the owner's funeral & burial wishes.
--
-- Singular per vault (like the will), but multi-field enough to warrant its own
-- table rather than widening the vaults row. Gated as the 'funeral' section by
-- the same permission engine, so stewards/successors can be permitted to read
-- it at the right time. `has_funeral` mirrors has_will: it records whether the
-- owner has filled anything in, which drives the recorded/release logic.

CREATE TABLE IF NOT EXISTS vault_funeral_wishes (
    vault_id       UUID PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
    has_funeral    BOOLEAN NOT NULL DEFAULT FALSE,
    disposition    TEXT NOT NULL DEFAULT '',  -- 'burial' | 'cremation' | 'donation' | 'undecided'
    service_wishes TEXT NOT NULL DEFAULT '',
    service_location TEXT NOT NULL DEFAULT '',
    officiant      TEXT NOT NULL DEFAULT '',
    readings_music TEXT NOT NULL DEFAULT '',
    prepaid_provider TEXT NOT NULL DEFAULT '', -- plot / plan provider + reference, if any
    notes          TEXT NOT NULL DEFAULT '',
    updated_at     TIMESTAMPTZ
);
