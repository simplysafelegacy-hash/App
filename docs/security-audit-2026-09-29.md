# App security audit — September 29, 2026

## Result and scope

The audit found security defects and vulnerable dependencies. The fixes below are applied locally. Both dependency scans now report zero findings. This is a source audit with regression tests, not a certification of the deployed service.

Reviewed the Go API, React client, PostgreSQL queries and migrations, Auth0 token/account resolution, vault/document permissions, administrator release operations, Stripe billing, uploads/downloads, support email, and Docker/proxy definitions.

No .env files were opened or sourced. Vite and Vitest used envFile: false. Compose validation used an explicitly empty config file and disabled automatic .env loading. No production database, AWS bucket, Auth0 tenant, or running service was accessed or changed. Existing changes were preserved; they were committed separately during the session before these security edits began.

## Findings fixed

| Priority | Finding and impact | Applied change |
| --- | --- | --- |
| High | Missing permission rows fell back to a membership role. A contacts-only steward could read the will between membership creation and permission insertion, or if permission insertion failed. | Non-owner reads require explicit document permissions. Membership and permissions save in one transaction. Empty permissions mask vault identity. Frontend predicates match. See backend/internal/handlers/permissions.go, members.go, and src/lib/permissions.ts. |
| High | Production ports: [] did not remove inherited published ports. Direct backend/frontend access could bypass the HTTPS proxy and its headers. | Use !reset []; local ports bind to loopback. Reset PostgreSQL ports in the production overlay too. Merged production configuration confirms only Caddy publishes ports. [Docker merge rules](https://docs.docker.com/reference/compose-file/merge/). |
| High / conditional | Dependency findings included router XSS/open redirects, a critical Vitest development-server issue, Go standard-library issues, and a pgx SQL-injection advisory. | Upgrade dependencies and pin the Go build to 1.25.13. pgx is 5.9.2, Chi 5.3.0, x/text 0.39.0, React Router 7.18.4, Vite 7.3.6, Vitest 5.0.2, and SWC plugin 4.3.3. npm is the maintained lockfile; the stale Bun lock was removed. |
| Medium | Beneficiary memberId accepted membership from another vault, subject only to a global foreign key. | The insert verifies the referenced member belongs to the entry's vault and rejects malformed IDs and cross-vault references. See entries.go. |
| Medium | Stripe checkout metadata took precedence over the current price, potentially retaining a higher entitlement after a portal downgrade. | Determine the plan from recognized current price IDs; unknown/empty prices fail closed. See billing.go. |
| Medium | Concurrent requests could bypass member-count and release-submission caps. | Serialize member creation on the vault row and release submissions on the member row. Recheck caps inside each transaction. |
| Medium | Same-name release-proof files shared an object key; failed packets could leave uploaded proof orphaned. | Add a UUID to each proof object key and attempt cleanup on database failure. Member-facing creation responses no longer include storage keys. Cleanup failures are logged and require operational handling. |
| Medium | Individual re-seal returned success while global vault release still granted access. | Return 409 and require the global release to be cleared first. See vault.go. |
| Medium | API responses lacked general cache protection, and authenticated operations lacked request budgets. | Add private/no-store and defensive headers. Per user: 120 requests/minute, burst 60; mutations 30/minute, burst 10; support 5/hour, burst 2. Budgets are per backend process. |
| Medium | Forwarding headers could forge log/consent attribution; the frontend Docker context lacked secret exclusions. | Proxies overwrite the selected client-IP header. Replace deprecated RealIP middleware and ignore other forwarding headers for consent attribution. Add root .dockerignore exclusions for environment files, credentials, repository state, and unrelated directories. |
| Low / hardening | JSON decoding accepted valid prefixes with trailing data; admin review ignored decoding errors; post-login targets lacked local-path validation. | Enforce one bounded JSON value, reject null/unknown fields/trailing data, validate admin bodies, restrict redirects to internal paths, and sanitize support Reply-To headers. |

The pgx advisory applies to non-default simple-protocol queries containing dollar-quoted literals and attacker-controlled placeholder values. Queries reviewed use bound parameters and fixed SQL fragments; no matching application exploit was demonstrated. The vulnerable dependency was still upgraded. See [GO-2026-5004](https://pkg.go.dev/vuln/GO-2026-5004).

## Controls already present

- Auth0 JWT verification pins RS256 and validates issuer, audience, required expiry, and a nonempty subject. Tests reject expired tokens, foreign keys, wrong issuer/audience, unsigned tokens, and HMAC algorithm confusion.
- Local users are resolved by Auth0 subject. First-time provisioning checks profile/subject equality and a verified email. Another subject cannot overwrite an already linked identity.
- Every private route runs authentication middleware. Administrator routes check users.is_admin in the database. Vault mutations require owner access.
- Vault membership is resolved using authenticated user ID plus vault ID. Attachment/entry IDs are scoped to that vault; notifications are scoped to the authenticated user.
- Documents, attachments, entries, and funeral details are filtered by document permissions. Hidden grants remain unreadable after release.
- SQL values are passed as parameters. Dynamic query fragments reviewed come from fixed code branches.
- Downloads use authenticated handlers, conservative content types, attachment disposition, no-sniff, no-store, and a restrictive document CSP.
- Stripe webhooks verify signatures and timestamps, cap body size, and record processed event IDs.
- Access tokens remain in SDK memory. The active-vault ID in localStorage does not grant server authority.
- CORS uses configured origins. Bearer authorization, rather than ambient cookies, authenticates API mutations.

## Validation

| Check | Result |
| --- | --- |
| go test -race ./... | Passed, including concurrent rate-limit tests |
| Go test inventory | 110 passing cases including subtests; 2 S3 integration tests skipped |
| go vet ./... | Passed |
| govulncheck ./... on Go 1.25.13 | No findings; initial scan reported 25 symbol-level findings |
| npm audit | Zero findings across all dependencies; initial scan reported 24 affected package entries |
| npm audit --omit=dev | Zero findings |
| Clean npm ci --ignore-scripts | Passed |
| Production Vite build with environment-file loading disabled | Passed; bundle-size warning remains |
| Vitest with environment-file loading disabled | 13 tests passed |
| TypeScript app/node configuration checks | Passed |
| ESLint on changed frontend source/tests | Passed |
| Production Compose merge with empty config | Only Caddy publishes ports |
| git diff --check | Passed |

New tests cover every private route's missing-authentication response, all owner-only mutation handlers, empty permissions, CORS, JSON limits, billing downgrades, download headers, redirects, false-success re-sealing, IP attribution, and rate-limit concurrency/capacity.

No test PostgreSQL instance was configured, Docker's daemon was unavailable, and no S3 test endpoint was configured. Database-backed authorization, transaction/concurrency behavior, and storage round trips still need integration testing. SQL changes were reviewed and compiled but not exercised against PostgreSQL. Docker images and deployed headers were not tested.

## Remaining work before production sign-off

1. **Auth0 tenant and account lifecycle — high priority.** Verify administrator MFA, attack protection, exact callback/logout/origin allowlists, short access-token lifetimes, refresh-token rotation, and account disable/revocation behavior. Issued access tokens remain usable until expiry without an application revocation mechanism. Review migration-only automatic email linking in auth0.go: a verified matching email can claim a legacy row with no auth0_sub. Once migration is complete, disable that path or replace it with controlled recovery. Auth0 recommends authenticating both identities for ordinary account linking: [linking guidance](https://auth0.com/docs/manage-users/user-accounts/user-account-linking/link-user-accounts).
2. **Production configuration and infrastructure — high priority.** Actual settings remain unverified because environment files were excluded. Confirm APP_ENV=production, HTTPS public URLs, exact CORS origins, encrypted and certificate-validated database connections, private database networking, least-privilege credentials, S3 public-access blocks, expected KMS keys, protected backups, and retention/deletion policies. The base Compose database URL defaults to sslmode=disable; production must override this appropriately.
3. **Integration and container verification — high priority.** Exercise two unrelated users/vaults, failed permission writes, concurrent caps, duplicate filenames, rollback/deletion failures, admin denials, and release/re-seal behavior in an isolated database/storage environment. Build and scan final images, pull fresh base images, and verify deployed ports and headers.
4. **Billing event ordering — medium priority.** Webhook deduplication and state updates remain separate. Delayed events or another subscription for the same customer can overwrite subscription state. Reconcile authoritative Stripe state and define the policy for multiple subscriptions; test event ordering and retries.
5. **Abuse, storage, and mail — medium priority.** Request budgets run after authentication and are process-local. Add edge limits for unauthenticated traffic and a shared limiter for multiple replicas. Add total storage quotas, upload scanning/quarantine where required, orphan-object reconciliation, and alerts. SMTP still depends on relay STARTTLS support and lacks an explicit context-bound network deadline.
6. **Browser policy — defense in depth.** The SPA CSP controls framing but does not restrict script sources. Add a tested script/connect/frame policy covering the actual Auth0 domain, workers, and fonts. Uploaded documents have a separate restrictive CSP.
7. **Legal eligibility — product decision.** Consent is recorded, but API vault operations do not require current consent. If age/residency/current terms are intended as access conditions, enforce them on the server.

## Rollout notes

- Use Node 22.12+ with npm, Go 1.25.13+, and Docker Compose 2.24.4+. Dockerfiles were updated.
- Rebuild and redeploy before these fixes protect production.
- Non-owner memberships with no permission rows now have no read access. Migration 007 backfilled legacy permissions; inspect remaining empty rows through an authorized database session and restore only intended grants.
- Individual re-seal now returns 409 while global release is active. Re-seal the vault first.
- Unknown Stripe prices grant no paid entitlement; confirm every sold price maps to the intended plan.
- This audit performed no deployment, commit, push, or production-data changes.
