# Simply Safe Legacy

A private place to record where your will is kept and who can see it.

Per vault, users record three things:

1. **Whether they have a will** (yes / not yet).
2. **Where the original is physically kept** — home safe, bank deposit
   box, lawyer's office, or other, plus a precise location description.
3. **Who can access it and when** — stewards (now) and successors (after
   the vault is released).

No file uploads yet. That'll come back when the basics are proven.

---

## Stack

| Tier      | Choice                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| Frontend  | Vite + React 18 + TypeScript · Tailwind · shadcn primitives · Inter                   |
| Backend   | Go 1.25 monolith · Chi router · pgx/v5 · JWT + argon2id                               |
| Database  | PostgreSQL 16                                                                         |
| Billing   | Stripe Checkout + Customer Portal (hosted), webhooks for state                        |
| Delivery  | Docker compose · Caddy (auto-HTTPS) on a single VM · rsync-based deploy from laptop   |

Design: cream background, deep forest-green primary, Inter throughout,
generous type sizes for older readers. Tokens in `src/index.css`.

---

## Local development

### 1. Set up Google OAuth

Google sign-in lives alongside email/password. Either path is enough on
its own, but the OAuth client must be configured for the Google button
to work.

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create OAuth client ID** → application type **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:8000`  *(the docker-compose frontend)*
   - `http://localhost:5173`  *(vite dev server, optional)*
   - Your production origin(s) — see the **Deploy** section below.
4. Authorized redirect URIs: leave **empty** — the popup flow uses
   `postmessage` instead.
5. Copy the resulting **Client ID** and **Client secret** into `.env`,
   and the **Client ID** also into `VITE_GOOGLE_CLIENT_ID` (same value).

### 2. Boot the stack

For local docker-compose runs, this repo uses **`.env.dev`** by default
(it's gitignored). Copy from the template and fill in real values:

```sh
cp .env.example .env.dev
# Paste Google client id / secret. Set JWT_SECRET to a 32+ char value
# (openssl rand -hex 32). Stripe values can stay as test placeholders
# for now — checkout calls will return "plan not configured" errors
# until you wire real prices in (see Stripe section below).

# docker compose reads .env by default — point it at .env.dev:
docker compose --env-file .env.dev up --build
```

If you'd rather have docker-compose autoload it, symlink:
`ln -s .env.dev .env`.

When healthy:

| Service           | URL                        |
| ----------------- | -------------------------- |
| Frontend          | http://localhost:8000      |
| Backend (direct)  | http://localhost:8080      |
| Postgres          | localhost:5432             |

The frontend container is built with `VITE_DEMO_MODE=false` so it calls
the real backend through nginx's `/api` proxy.

### Frontend-only (no backend)

```sh
npm install
npm run dev
```

Vite on http://localhost:5173 in **demo mode** — the AppContext seeds
itself with mock vault data. Set `VITE_DEMO_MODE=false` to hit a
running backend instead.

### Backend-only

```sh
cd backend
cp ../.env.example .env   # and fill in values
go mod tidy
go run ./cmd/server
```

---

## Stripe setup

Three-step setup in test mode. Same steps in live mode when you flip the
keys to `sk_live_` / `pk_live_`.

### 1. Create the three recurring products

In the [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products), create three products with **recurring** prices:

| Product       | Price | Billing  |
| ------------- | ----- | -------- |
| Individual    | $15   | Monthly  |
| Family        | $25   | Monthly  |
| Safekeeping   | $50   | Monthly  |

Each product, once saved, exposes a `price_...` ID. Paste the three IDs
into `.env`:

```
STRIPE_PRICE_INDIVIDUAL=price_...
STRIPE_PRICE_FAMILY=price_...
STRIPE_PRICE_SAFEKEEPING=price_...
```

Until these are set, the Plans-page CTAs will return a "plan is not
configured" error.

### 2. Wire the webhook

The backend exposes `POST /api/billing/webhook`. Stripe sends events
there and the handler updates user subscription state. The signing
secret needs to match what's in `.env` as `STRIPE_WEBHOOK_SECRET`.

#### Dev (Stripe CLI)

```sh
brew install stripe/stripe-cli/stripe   # one-time
stripe login
stripe listen --forward-to localhost:8080/api/billing/webhook
```

The first line of output is `Ready! Your webhook signing secret is whsec_...`.
Paste that into `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the backend
(`docker compose restart backend`). Leave `stripe listen` running while
you test.

#### Production

In the [Stripe Dashboard → Developers → Webhooks → Add endpoint](https://dashboard.stripe.com/test/webhooks):

- **Endpoint URL**: `https://app.simplysafelegacy.com/api/billing/webhook`
  (or `https://dev.simplysafelegacy.com/...` for the dev environment).
- **Events to send** — exactly these five:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Click **Add endpoint**, then click into the new endpoint and reveal the
**Signing secret** (`whsec_...`). On the VM:

```sh
ssh -i ~/.ssh/lgc ubuntu@136.112.125.0
sudo nano /opt/simplysafelegacy/.env
#   set STRIPE_WEBHOOK_SECRET=whsec_...
cd /opt/simplysafelegacy
docker compose restart backend
```

You can confirm delivery in the dashboard's webhook log; failed
deliveries are retried automatically.

### 3. Test the flow

With the stack running and `STRIPE_WEBHOOK_SECRET` set:

1. Sign in to the app, go to `/plans`, click any plan.
2. You'll redirect to a Stripe-hosted Checkout page.
3. Use test card `4242 4242 4242 4242` with any future expiry and any
   CVC. (Other test cards: [stripe.com/docs/testing](https://stripe.com/docs/testing).)
4. After "Pay", Stripe redirects back to `/dashboard?subscription=success`.
5. The "Plan" strip on the dashboard should show your plan and renewal
   date — that data comes from the webhook, so it confirms the webhook
   chain is end-to-end working.

The "Manage" link in the same strip opens the Stripe Customer Portal
where users handle cancellations, payment-method changes, and plan
swaps. No UI work on our side.

---

## Deploy (single VM, Docker compose, Caddy auto-HTTPS)

The deploy is **rsync from your laptop → Docker compose on the VM**, with
Caddy on the VM handling TLS via Let's Encrypt. No GitHub, no CI, no
container registry.

### Two targets, two env files

The scripts require **either `--dev` or `--prod`** — there is no default.

| Flag      | Domain                       | Env file used    |
| --------- | ---------------------------- | ---------------- |
| `--dev`   | `dev.simplysafelegacy.com`   | `.env.dev`       |
| `--prod`  | `app.simplysafelegacy.com`   | `.env.prod`      |

The matching env file is scp'd to the VM as `/opt/simplysafelegacy/.env`
on every run, so changes to `.env.dev` / `.env.prod` on your laptop
propagate on the next `update.sh`. The deploy script also pins
`CADDY_DOMAIN`, `PUBLIC_APP_URL`, and `ALLOWED_ORIGINS` to the chosen
domain on the remote `.env` as a safety net.

### Prerequisites (one-time)

- An Ubuntu 22.04 or 24.04 VM with a public IP.
- DNS A records for `app.simplysafelegacy.com` and/or
  `dev.simplysafelegacy.com` pointing at that IP, **propagated**
  before the first deploy. Without DNS, Caddy can't pass the ACME
  HTTP-01 challenge.
- The VM's firewall must allow inbound 22 (SSH), 80 (ACME + redirect),
  and 443 (HTTPS). Cloud security group, host-level `ufw`, or both.
- An SSH key on your laptop authorized as `ubuntu` on the VM. The
  deploy scripts default to `~/.ssh/lgc`.
- `.env.dev` for dev deploys, `.env.prod` for prod — see "Local
  development" above and the Stripe section. Both are gitignored.

### Configure the deploy

```sh
cp deploy/.env.deploy.example deploy/.env.deploy
# Edit. Defaults:
#   DEPLOY_HOST=ubuntu@136.112.125.0
#   DEPLOY_IDENTITY_FILE=~/.ssh/lgc
#   DEPLOY_PATH=/opt/simplysafelegacy
#   CADDY_DOMAIN=app.simplysafelegacy.com
#   CADDY_DOMAIN_DEV=dev.simplysafelegacy.com
```

### First deploy

```sh
./deploy/deploy.sh --dev      # → dev.simplysafelegacy.com  (.env.dev)
./deploy/deploy.sh --prod     # → app.simplysafelegacy.com  (.env.prod)
```

This:

1. SSH's to the VM, installs Docker + the compose plugin if missing.
2. rsyncs the repo to `/opt/simplysafelegacy` (excluding
   `node_modules`, `dist`, `.git`, all `.env*` files, etc.).
3. scp's the chosen env file to the VM as `.env`.
4. Pins `CADDY_DOMAIN`, `PUBLIC_APP_URL`, and `ALLOWED_ORIGINS` on the
   remote `.env` to the chosen domain.
5. Brings the stack up with the production overlay
   (`docker-compose.yml` + `docker-compose.prod.yml`).
6. Polls `/health` until the backend reports OK.

Caddy fetches the Let's Encrypt cert on the first HTTPS request — give
it a few seconds.

### Subsequent updates (after code changes)

```sh
./deploy/update.sh --dev
./deploy/update.sh --prod
```

Rsyncs only the deltas, re-syncs the matching env file, rebuilds
whichever Docker images changed, and restarts affected services.
Postgres + Caddy ACME state survive. Tails ~10s of backend logs after
restart so you can spot a startup failure.

### Tail logs

```sh
ssh -i ~/.ssh/lgc ubuntu@136.112.125.0 \
  'cd /opt/simplysafelegacy && docker compose logs -f --tail=100'
```

---

## Repo layout

```
app/
├── src/                       # React app
│   ├── components/
│   │   ├── SealMark.tsx       # Brand mark + wordmark
│   │   └── layout/            # Header, Footer, Layout, PageHeader
│   ├── context/AppContext     # Auth, vault, billing state
│   ├── lib/api.ts             # Typed client for the Go backend
│   ├── lib/types.ts           # Domain types
│   └── pages/                 # Landing, Login, Signup, Dashboard, Members, Plans
├── backend/
│   ├── cmd/server/main.go     # Entry point
│   └── internal/
│       ├── auth/              # JWT + argon2id + Google OAuth
│       ├── config/            # Env parsing
│       ├── db/                # pgx pool + embedded migrations
│       ├── handlers/          # auth, vault (incl. will), members,
│       │                      #   billing (Stripe), notifications
│       ├── models/            # Domain structs
│       └── router/            # Chi routes + CORS
├── deploy/
│   ├── deploy.sh              # First-time provision
│   ├── update.sh              # Incremental push
│   └── .env.deploy.example
├── Caddyfile                  # Reverse-proxy + auto-HTTPS
├── Dockerfile.frontend        # Multi-stage build → nginx
├── docker-compose.yml         # Base: postgres + backend + frontend
├── docker-compose.prod.yml    # Overlay: + caddy, − direct ports
├── nginx.conf                 # SPA fallback + /api proxy
└── .env.example
```

---

## API surface

All endpoints are JSON. Authenticated routes require
`Authorization: Bearer <token>`. Vault-scoped routes additionally require
`X-Vault-Id: <vault-id>`.

| Method | Path                              | Purpose                                   |
| ------ | --------------------------------- | ----------------------------------------- |
| POST   | `/api/auth/google`                | Google auth code → our JWT                |
| POST   | `/api/auth/register`              | Email + password signup → our JWT         |
| POST   | `/api/auth/login`                 | Email + password sign-in → our JWT        |
| GET    | `/api/auth/me`                    | Current user (incl. subscription state)   |
| GET    | `/api/me/vaults`                  | Vaults the user has any role on           |
| GET    | `/api/vault`                      | The active vault                          |
| POST   | `/api/vault`                      | Create the caller's vault                 |
| POST   | `/api/vault/release`              | Release / re-seal the active vault        |
| PUT    | `/api/vault/will`                 | Record / update the will details          |
| GET    | `/api/members`                    | List members of the active vault          |
| POST   | `/api/members`                    | Add a steward or successor                |
| PATCH  | `/api/members/{id}`               | Update a member                           |
| DELETE | `/api/members/{id}`               | Remove a member                           |
| POST   | `/api/billing/checkout`           | Create a Stripe Checkout session          |
| POST   | `/api/billing/portal`             | Open the Stripe Customer Portal           |
| POST   | `/api/billing/webhook`            | Stripe webhook receiver (signature-auth)  |
| GET    | `/api/notifications`              | Activity feed (cross-vault)               |
| POST   | `/api/notifications/{id}/read`    | Mark a notification as read               |
| GET    | `/health`                         | Liveness check (unauthenticated)          |

### Auth methods

- **Google OAuth** — popup flow, ID-token verified server-side. If a
  matching verified email already has an account, the Google identity
  is linked onto it.
- **Email + password** — argon2id (m=64MiB, t=3, p=2), parameters
  stored inline in the PHC string so they can be raised without a
  backfill. Register rejects any existing email; login returns a
  generic error on every failure to avoid enumeration.

Email verification, password reset, and email-based MFA are
deliberately deferred until an email provider is in place. TOTP is the
planned MFA path — no provider needed.

---

## Production hygiene

- **`JWT_SECRET` must be at least 32 characters.** Generate with
  `openssl rand -hex 32`.
- **`ALLOWED_ORIGINS`** is the CORS allowlist on the Go backend. The
  SPA's API calls only succeed when its `Origin` is in this list.
  `deploy.sh` / `update.sh` overwrite this on the remote `.env` to
  match the deploy target, so the values in `.env.dev` / `.env.prod`
  are only relevant for local docker-compose runs (`localhost:8000`
  + `localhost:5173`).
- `PUBLIC_APP_URL` and `CADDY_DOMAIN` are likewise pinned to the
  deploy target on every run — don't edit them on the VM by hand.
- Switch Stripe keys from `sk_test_` / `pk_test_` to live, and create
  a separate webhook endpoint in live mode (the signing secret is
  per-endpoint).
- Tighten Google OAuth's authorized origins to your real domain(s)
  before going live.
