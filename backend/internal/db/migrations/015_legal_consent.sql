-- 015_legal_consent.sql
--
-- Records that a user accepted the Terms of Service and Privacy Policy, and
-- when. Consent is captured on /signup before the hand-off to Auth0, and
-- written when the account is provisioned on first sign-in.
--
-- Why a separate table rather than columns on users:
--
--   1. Consent is an append-only event log. If the terms change and users
--      re-accept, each acceptance is its own row with its own timestamp —
--      a column would overwrite the very history that makes the record
--      worth keeping.
--   2. A deleted user's consent record should be able to outlive the
--      account for as long as the retention policy requires; ON DELETE
--      CASCADE is used here for now (see below) but the shape allows that
--      to change without a rewrite.
--
-- document_version records WHICH text was agreed to. "The user accepted"
-- is not a defensible claim on its own — what they accepted has to be
-- pinned, or a later revision silently rewrites history. It is a plain
-- string ('2026-09-02') rather than a foreign key because the documents
-- live outside this database, on the marketing site.

CREATE TABLE IF NOT EXISTS user_legal_consents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- What was accepted. Both are accepted together in one checkbox today;
    -- separate columns keep the record honest if they are ever split.
    accepted_terms   BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_privacy BOOLEAN NOT NULL DEFAULT FALSE,

    -- Which revision of the documents. See note above.
    document_version TEXT NOT NULL,

    -- When they accepted. Set by the server, never by the client: a
    -- client-supplied timestamp is worth nothing as evidence.
    accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Provenance of the acceptance. Both nullable — behind a proxy the
    -- address may be unavailable, and neither is required for the record
    -- to be valid.
    ip_address       INET,
    user_agent       TEXT
);

-- The common query is "has this user consented, and when did they last
-- do so" — hence newest-first on user_id.
CREATE INDEX IF NOT EXISTS user_legal_consents_user_idx
    ON user_legal_consents (user_id, accepted_at DESC);
