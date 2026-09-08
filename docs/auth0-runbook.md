# Authentication runbook — Auth0

Simply Safe Legacy uses Auth0 as its identity provider. Sign-in, sign-up,
password reset, MFA and social login all happen on Auth0's hosted pages; this
application never sees, stores, or verifies a password.

What that buys: there is no password hash in our database to steal, no reset
endpoint to abuse, and no session-signing secret whose leak would let an
attacker mint tokens. The backend holds only Auth0's *public* keys.

```
 browser ──▶ Auth0 Universal Login ──▶ access token (RS256)
                                            │
                                            ▼
                              backend verifies vs tenant JWKS
                              iss + aud + exp + RS256 pinned
                                            │
                                            ▼
                              sub ──▶ users.auth0_sub ──▶ local user
```

---

## 1. Create the tenant

1. Sign up at [auth0.com](https://auth0.com) and create a tenant.
2. Pick a region close to your users; the tenant domain looks like
   `simplysafelegacy.us.auth0.com`.
3. Use **separate tenants for dev and production**. Auth0's free plan allows
   this, and it keeps test users out of the production directory.

## 2. Create the API (the audience)

This represents *your backend* — the thing tokens are minted for.

**Dashboard → Applications → APIs → Create API**

| Field | Value |
| --- | --- |
| Name | `Simply Safe Legacy API` |
| Identifier | `https://api.simplysafelegacy.com` |
| Signing algorithm | **RS256** |

The identifier is the `aud` claim and never needs to be a real reachable URL —
but it must match `AUTH0_AUDIENCE` exactly. The backend rejects any token
carrying a different audience, so a token minted for another API in the same
tenant cannot be replayed against yours.

Under the API's **Settings**, enable:

- **Allow Skipping User Consent** (first-party app, no consent screen)
- **Token Expiration**: 86400 (24h) or lower

## 3. Create the SPA application

**Dashboard → Applications → Applications → Create Application**
→ *Single Page Web Application* → React.

Under **Settings**, set:

| Field | Production | Development |
| --- | --- | --- |
| Allowed Callback URLs | `https://app.simplysafelegacy.com` | `http://localhost:5173, http://localhost:8000` |
| Allowed Logout URLs | `https://app.simplysafelegacy.com` | `http://localhost:5173, http://localhost:8000` |
| Allowed Web Origins | `https://app.simplysafelegacy.com` | `http://localhost:5173, http://localhost:8000` |

> These are an allowlist for where Auth0 will send a token. Keep them exact —
> a wildcard or a stale entry is an open redirect that leaks authorization
> codes.

Note the **Client ID**. There is *no client secret* here: a SPA is a public
client and cannot keep one. Security comes from PKCE (handled by the SDK) plus
the callback allowlist above.

Under **Advanced Settings → Grant Types**, ensure `Authorization Code` and
`Refresh Token` are enabled, and `Implicit` is **off** — the implicit flow
returns tokens in the URL fragment, where they leak into history and logs.

## 4. Refresh token rotation

**Application → Settings → Refresh Token Rotation**

- **Rotation**: Enabled
- **Reuse Interval**: 0 seconds
- **Absolute Expiration**: 30 days (or your session policy)

Rotation means each refresh invalidates the previous token, so a stolen
refresh token is detectable: when the legitimate client next refreshes, Auth0
sees a reused token and revokes the whole family.

## 5. Password policy and breach detection

**Security → Attack Protection**

- **Breached Password Detection**: on — blocks credentials known from public
  breaches.
- **Brute-force Protection**: on.
- **Suspicious IP Throttling**: on.

**Authentication → Database → Username-Password-Authentication → Password
Policy**: set to **Good** or **Excellent**, minimum length 12 to match what
the app previously enforced.

## 6. Require verified emails

This is load-bearing, not cosmetic.

The backend links an Auth0 identity to a pre-existing account **by email**, so
that users who predate Auth0 keep their vaults. If Auth0 allowed an
unverified email through, someone could sign up as `victim@example.com` and be
handed the victim's vault. The backend therefore refuses any sign-in whose
`email_verified` is false — but configure Auth0 to match:

**Authentication → Database → Username-Password-Authentication → Settings**
→ enable **Requires Email Verification**.

Also add a login action to block unverified users at the source:

**Actions → Library → Build Custom** → *Login / Post Login*:

```js
exports.onExecutePostLogin = async (event, api) => {
  if (!event.user.email_verified) {
    api.access.deny("Please verify your email address before signing in.");
  }
};
```

Deploy it and drag it into the **Login** flow.

## 7. Google social connection

Replaces the app's old direct Google OAuth integration.

**Authentication → Social → Create Connection → Google**

Use your existing Google OAuth client (the same one from the old
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) — but add Auth0's callback to it
in the Google Cloud Console:

```
https://YOUR_TENANT.us.auth0.com/login/callback
```

Enable the connection for the SPA application. Google sign-ins arrive with a
subject like `google-oauth2|1234…` and are stored in `users.auth0_sub` the
same way any other identity is.

## 8. Environment variables

Backend (`.env.prod`):

```sh
AUTH0_DOMAIN=simplysafelegacy.us.auth0.com     # no scheme, no trailing slash
AUTH0_AUDIENCE=https://api.simplysafelegacy.com
```

Frontend (build-time, so they must be set when the image is built):

```sh
VITE_AUTH0_DOMAIN=simplysafelegacy.us.auth0.com
VITE_AUTH0_CLIENT_ID=<SPA client id>
VITE_AUTH0_AUDIENCE=https://api.simplysafelegacy.com
```

`JWT_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are no longer read
by the backend and can be deleted from the env files.

## 9. Migrating existing users

The chosen strategy is **force password reset**: no password hashes leave the
database, and every user establishes a fresh credential at Auth0.

Existing rows keep their `id`, so vault ownership, memberships, release
requests and documents are all preserved. A user is linked to their Auth0
identity on first sign-in, matched by **verified email**.

Steps:

1. Export the live user list:

   ```sql
   \copy (SELECT email, name FROM users ORDER BY created_at) TO 'users.csv' CSV HEADER
   ```

2. Convert to Auth0's bulk-import JSON (no passwords — users will set one):

   ```json
   [
     {"email": "someone@example.com", "email_verified": true, "name": "Someone"}
   ]
   ```

   Mark `email_verified: true` only for addresses you already trust; the app
   refuses unverified sign-ins, and these users' emails were previously
   validated by their use of the product. If you cannot vouch for an address,
   leave it false and let the user verify.

3. **Authentication → Database → Import Users** (or the Management API's
   `POST /api/v2/jobs/users-imports`) and upload the file.

4. Trigger reset emails so everyone can set a password. Via the Management
   API, for each user:

   ```sh
   curl -X POST "https://$AUTH0_DOMAIN/dbconnections/change_password" \
     -H 'Content-Type: application/json' \
     -d '{"client_id":"'"$CLIENT_ID"'","email":"someone@example.com","connection":"Username-Password-Authentication"}'
   ```

5. Tell users first. A reset email arriving unannounced looks like phishing —
   send your own notice ahead of the cutover explaining that sign-in is
   changing and a reset link is coming.

> **Verify the user count before you start.** Run
> `SELECT count(*) FROM users;` against production. If it is small (your own
> test accounts), skip the import and let people sign up fresh.

## 10. Verification checklist

After deploying, confirm each of these:

```sh
# 1. The tenant's JWKS is reachable (what the backend loads at boot)
curl -s https://$AUTH0_DOMAIN/.well-known/jwks.json | head -c 120

# 2. The backend refuses unauthenticated calls
curl -s -o /dev/null -w '%{http_code}\n' https://app.simplysafelegacy.com/api/auth/me
# expect 401

# 3. The backend refuses a malformed token
curl -s -o /dev/null -w '%{http_code}\n' https://app.simplysafelegacy.com/api/auth/me \
  -H 'Authorization: Bearer not.a.token'
# expect 401
```

In the browser:

- Visiting `/login` redirects to Auth0's hosted page.
- After signing in you land on `/dashboard` and the URL has no `?code=`.
- A pre-existing user still sees their vault (proves email linking worked).
- Signing out returns to the landing page, and hitting Back does not restore
  the session.

The backend logs `auth0 ready` with the resolved issuer at startup, and
refuses to boot if `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` are missing or the JWKS
cannot be fetched — a misconfigured tenant fails the deploy, not every login.

## What replaced what

| Before | After |
| --- | --- |
| `POST /api/auth/register` | Auth0 Universal Login (sign-up tab) |
| `POST /api/auth/login` | Auth0 Universal Login |
| `POST /api/auth/google` | Auth0 Google social connection |
| `users.password_hash` (argon2id) | nothing — dropped in migration 014 |
| `users.google_sub` | `users.auth0_sub` |
| HS256 JWT signed with `JWT_SECRET` | Auth0 RS256 access token, verified via JWKS |
| Token in `localStorage` | in-memory token + rotating refresh token |
