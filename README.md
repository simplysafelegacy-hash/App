# Sealed

A quiet place for wills, trusts, and the other papers that matter most.

Sealed is a subscription service: users record where their originals rest
(home safe, bank deposit box, solicitor's office), upload encrypted digital
copies, and name the people who may see each document when the time comes.

---

## Stack

| Tier      | Choice                                                             |
| --------- | ------------------------------------------------------------------ |
| Frontend  | Vite + React 18 + TypeScript · Tailwind · shadcn primitives        |
| Backend   | Go 1.22 monolith · Chi router · pgx/v5 · JWT + bcrypt              |
| Database  | PostgreSQL 16                                                      |
| Storage   | S3 (MinIO in dev) via `aws-sdk-go-v2`, presigned-URL uploads       |
| Delivery  | Dockerfiles per service · `docker-compose.yml` orchestrates it all |

Design direction: cream-paper and ink, Fraunces display serif paired with
Instrument Sans, generous type sizes for older readers.

---

## Quick start

### 1. Set up Google OAuth (required — it's the only sign-in method)

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create OAuth client ID** → application type **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:8000`  *(the docker-compose frontend)*
   - `http://localhost:5173`  *(vite dev server, optional)*
4. Authorized redirect URIs: leave **empty** — the popup flow uses
   `postmessage` instead. (You only need a redirect URI for full-page
   redirects, which we don't use.)
5. Copy the resulting **Client ID** and **Client secret** into `.env`.

### 2. Boot the stack

```sh
cp .env.example .env
# Paste your Google client id / secret into .env. Set JWT_SECRET to a
# 32+ char random value (openssl rand -hex 32).

docker compose up --build
```

When the stack is healthy:

| Service           | URL                        |
| ----------------- | -------------------------- |
| Frontend          | http://localhost:8000      |
| Backend (direct)  | http://localhost:8080      |
| MinIO console     | http://localhost:9001      |
| Postgres          | localhost:5432             |

The frontend is built at container build time with `VITE_DEMO_MODE=false`
so it calls the real backend through nginx's `/api` proxy.

### Frontend-only (no backend)

If you just want to work on the UI:

```sh
npm install
npm run dev
```

This runs Vite on http://localhost:5173 in **demo mode** — the AppContext
seeds itself with mock vault data. Set `VITE_DEMO_MODE=false` to hit a
running backend instead (see `.env.example`).

### Backend-only

```sh
cd backend
cp ../.env.example .env   # and fill in values
go mod tidy
go run ./cmd/server
```

---

## Repo layout

```
app/
├── src/                      # React app
│   ├── components/
│   │   ├── SealMark.tsx      # The wordmark / wax-seal
│   │   └── layout/           # Header, Footer, Layout, PageHeader
│   ├── context/AppContext    # Auth & vault state
│   ├── lib/api.ts            # Typed client for the Go backend
│   ├── lib/types.ts          # Domain types
│   └── pages/                # Landing, Login, Signup, Dashboard, …
├── backend/
│   ├── cmd/server/main.go    # Entry point
│   └── internal/
│       ├── auth/             # JWT + bcrypt + middleware
│       ├── config/           # Env parsing
│       ├── db/               # pgx pool + embedded migrations
│       ├── handlers/         # HTTP handlers (auth, vault, documents, …)
│       ├── models/           # Domain structs
│       ├── router/           # Chi routes + CORS
│       └── storage/          # S3 client w/ presigned URLs
├── Dockerfile.frontend       # Multi-stage build → nginx
├── nginx.conf                # SPA fallback + /api proxy
├── docker-compose.yml        # postgres + minio + backend + frontend
└── .env.example
```

---

## API surface

All endpoints are JSON. Authenticated routes require `Authorization: Bearer <token>`.

| Method | Path                                | Purpose                               |
| ------ | ----------------------------------- | ------------------------------------- |
| POST   | `/api/auth/google`                  | Exchange a Google auth code → our JWT |
| GET    | `/api/auth/me`                      | Current user                          |
| GET    | `/api/vault`                        | The caller's vault (null if none)     |
| POST   | `/api/vault`                        | Create or update the caller's vault   |
| GET    | `/api/documents`                    | List documents                        |
| POST   | `/api/documents`                    | Create a document entry               |
| GET    | `/api/documents/{id}`               | Get one document                      |
| PATCH  | `/api/documents/{id}`               | Update a document                     |
| DELETE | `/api/documents/{id}`               | Remove a document                     |
| POST   | `/api/documents/{id}/upload-url`    | Get a presigned S3 PUT URL            |
| GET    | `/api/viewers`                      | List authorized viewers               |
| POST   | `/api/viewers`                      | Add an authorized viewer              |
| DELETE | `/api/viewers/{id}`                 | Remove an authorized viewer           |
| GET    | `/api/notifications`                | Activity feed                         |
| POST   | `/api/notifications/{id}/read`      | Mark a notification as read           |
| GET    | `/health`                           | Liveness check (unauthenticated)      |

### File uploads

1. Client `POST /api/documents` to create the entry.
2. Client `POST /api/documents/{id}/upload-url` with `{filename, contentType}`.
3. Server responds with a 15-minute presigned `PUT` URL.
4. Client `PUT`s the raw file bytes directly to S3/MinIO.

The server never streams file bytes — it only authorizes uploads and records
the resulting S3 key.

---

## Production notes

- **`JWT_SECRET` must be at least 32 characters.** Generate with `openssl rand -hex 32`.
- Point `DATABASE_URL` at your managed Postgres (RDS / Cloud SQL / Supabase DB).
- Clear `S3_ENDPOINT` and set `S3_USE_PATH_STYLE=false` for real AWS S3.
- Provide real credentials via `S3_ACCESS_KEY` / `S3_SECRET_KEY` or IAM role.
- Put the backend behind TLS (nginx, a managed load balancer, or Caddy).
- Tighten `ALLOWED_ORIGINS` to your production domain(s) only.
