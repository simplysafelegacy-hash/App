#!/usr/bin/env bash
# update.sh — incremental code push.
#
# rsync the project to the VM and rebuild any changed images. Volumes
# (Postgres data, Caddy ACME state) are preserved.
#
# Use this after every code change. For first-time provisioning, use
# deploy/deploy.sh instead.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DEV_MODE=0
for arg in "$@"; do
    case "$arg" in
        --dev) DEV_MODE=1 ;;
        -h|--help)
            cat <<USAGE
Usage: deploy/update.sh [--dev]

  --dev    Re-point Caddy at CADDY_DOMAIN_DEV before rebuilding.
USAGE
            exit 0
            ;;
        *)
            echo "unknown argument: $arg (try --help)" >&2
            exit 1
            ;;
    esac
done

if [[ ! -f deploy/.env.deploy ]]; then
    echo "deploy/.env.deploy not found — copy deploy/.env.deploy.example and fill in." >&2
    exit 1
fi
# shellcheck disable=SC1091
source deploy/.env.deploy

: "${DEPLOY_HOST:?DEPLOY_HOST is required in deploy/.env.deploy}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required in deploy/.env.deploy}"

if (( DEV_MODE )); then
    : "${CADDY_DOMAIN_DEV:?CADDY_DOMAIN_DEV is required when --dev is used}"
    CADDY_DOMAIN="$CADDY_DOMAIN_DEV"
    echo "→ Dev mode: updating $CADDY_DOMAIN"
fi

SSH_OPTS=()
RSYNC_SSH="ssh"
if [[ -n "${DEPLOY_SSH_PORT:-}" ]]; then
    SSH_OPTS+=(-p "$DEPLOY_SSH_PORT")
    RSYNC_SSH="ssh -p $DEPLOY_SSH_PORT"
fi
if [[ -n "${DEPLOY_IDENTITY_FILE:-}" ]]; then
    # Expand a leading ~ since bash doesn't do it inside a variable.
    DEPLOY_IDENTITY_FILE="${DEPLOY_IDENTITY_FILE/#\~/$HOME}"
    SSH_OPTS+=(-i "$DEPLOY_IDENTITY_FILE")
    RSYNC_SSH="$RSYNC_SSH -i $DEPLOY_IDENTITY_FILE"
fi

remote() {
    ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

echo "→ rsyncing changes to $DEPLOY_HOST:$DEPLOY_PATH …"
rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'deploy/.env.deploy' \
    --exclude 'supabase' \
    --exclude '.DS_Store' \
    -e "$RSYNC_SSH" \
    "$ROOT/" "$DEPLOY_HOST:$DEPLOY_PATH/"

# Re-apply the domain-dependent env entries so a re-run with --dev (or
# without it) flips the remote correctly. Idempotent.
if [[ -n "${CADDY_DOMAIN:-}" ]]; then
    echo "→ Syncing CADDY_DOMAIN=$CADDY_DOMAIN to remote .env …"
    remote "grep -q '^CADDY_DOMAIN=' '$DEPLOY_PATH/.env' \
        && sed -i 's|^CADDY_DOMAIN=.*|CADDY_DOMAIN=$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
        || echo 'CADDY_DOMAIN=$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"
    remote "grep -q '^PUBLIC_APP_URL=' '$DEPLOY_PATH/.env' \
        && sed -i 's|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
        || echo 'PUBLIC_APP_URL=https://$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"
    remote "grep -q '^ALLOWED_ORIGINS=' '$DEPLOY_PATH/.env' \
        && sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
        || echo 'ALLOWED_ORIGINS=https://$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"
fi

echo "→ Rebuilding & restarting changed services …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Tailing backend logs for ~10s so startup is visible …"
remote "cd '$DEPLOY_PATH' && timeout 10 docker compose logs --tail=20 -f backend || true"

echo "→ Done. https://${CADDY_DOMAIN:-?}"
