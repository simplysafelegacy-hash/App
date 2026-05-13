-- 001_init.sql — canonical Simply Safe Legacy schema.
-- Idempotent: every CREATE uses IF NOT EXISTS so re-running is safe.
--
-- Domain model:
--   users          — credentialed accounts. Authentication is via Google
--                    OAuth — password_hash is nullable so accounts that
--                    only ever sign in via OAuth carry no password.
--   vaults         — one per owner (the paying subscriber).
--   vault_members  — every relationship between a user (or pending-invite
--                    email) and a vault, including the owner themselves.
--                    The role on this row determines what they can do.
--   documents      — entries inside a vault.
--   member_document_access — fine-grained, per-document access for stewards
--                    and successors. Owners always see every document.
--   notifications  — per-user feed of vault events.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    CREATE TYPE vault_role AS ENUM ('owner', 'steward', 'successor');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    avatar_url    TEXT,
    name          TEXT NOT NULL,
    phone         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vaults (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    owner_name              TEXT NOT NULL,
    owner_email             TEXT NOT NULL,
    owner_phone             TEXT NOT NULL,
    emergency_contact_name  TEXT NOT NULL,
    emergency_contact_phone TEXT NOT NULL,
    released_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id   UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    role       vault_role NOT NULL DEFAULT 'steward',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vault_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vault_members_user
    ON vault_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vault_members_vault
    ON vault_members(vault_id);

CREATE TABLE IF NOT EXISTS documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id      UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    name          TEXT NOT NULL,
    file_key      TEXT,
    file_name     TEXT,
    location_type TEXT NOT NULL,
    address       TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_document_access (
    member_id   UUID NOT NULL REFERENCES vault_members(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, document_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id   UUID REFERENCES vaults(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    message    TEXT NOT NULL,
    read       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_vault_id ON documents(vault_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
