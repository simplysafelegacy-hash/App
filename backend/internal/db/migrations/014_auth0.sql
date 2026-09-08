-- 014_auth0.sql
--
-- Authentication moved to Auth0. This backend no longer stores or verifies
-- passwords; Auth0 owns sign-in, sign-up, password reset, and social login.
--
-- auth0_sub is Auth0's stable subject claim ("auth0|abc123",
-- "google-oauth2|123..."). It is the only identifier the access token
-- carries, so it is how a request maps to a local user.
--
-- users.id is deliberately NOT changed: vaults.owner_id, vault_members,
-- release_requests and every other row reference it. Existing accounts keep
-- their id and are linked to Auth0 by verified email on first sign-in (see
-- handlers/auth0.go), so vault ownership survives the migration untouched.
--
-- password_hash and google_sub are dropped. Removing password_hash is the
-- point of the exercise: credentials we do not hold cannot be stolen from
-- us. google_sub is superseded by Auth0's Google social connection, which
-- issues a "google-oauth2|..." subject stored in auth0_sub instead.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth0_sub TEXT;

-- Partial unique index: many rows may sit at NULL during the cutover (users
-- who have not signed in since the switch), but a given Auth0 identity must
-- map to exactly one local account.
CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_sub_key
    ON users(auth0_sub) WHERE auth0_sub IS NOT NULL;

-- Case-insensitive email lookup, used when linking an Auth0 identity to a
-- pre-existing account. Emails are lowercased on write, so this mainly
-- guards against rows written before that was enforced.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
