-- 002_google_oauth.sql — switch authentication to Google OAuth only.
-- Idempotent: safe to re-run. Bring an existing 001_init schema into line
-- with the OAuth-only world.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
    CREATE UNIQUE INDEX users_google_sub_key ON users(google_sub) WHERE google_sub IS NOT NULL;
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;
