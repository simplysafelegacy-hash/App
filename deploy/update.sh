#!/usr/bin/env bash
# update.sh — incremental code push.
#
# Required: --dev or --prod, same as deploy.sh.
# Use this after every code change. For first-time provisioning, use
# deploy/deploy.sh instead.
#
# What it does:
#   1. rsync project to the VM (excludes .env files).
#   2. scp the matching .env.<dev|prod> to the remote as .env. This
#      keeps remote env in sync with whatever you've edited locally —
#      if you'd rather edit the remote .env in place, comment out the
#      scp line below.
#   3. Pin CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS to match
#      the chosen target.
#   4. docker compose up -d --build (rebuilds only changed images).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

usage() {
    cat <<USAGE
Usage: deploy/update.sh --dev | --prod

  --dev    Update dev.simplysafelegacy.com using .env.dev.
  --prod   Update app.simplysafelegacy.com using .env.prod.
USAGE
}

TARGET=""
for arg in "$@"; do
    case "$arg" in
        --dev)  TARGET="dev" ;;
        --prod) TARGET="prod" ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "unknown argument: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ -z "$TARGET" ]]; then
    echo "ERROR: pick --dev or --prod." >&2
    usage >&2
    exit 1
fi

if [[ ! -f deploy/.env.deploy ]]; then
    echo "deploy/.env.deploy not found — copy deploy/.env.deploy.example and fill in." >&2
    exit 1
fi
# shellcheck disable=SC1091
source deploy/.env.deploy

: "${DEPLOY_HOST:?DEPLOY_HOST is required in deploy/.env.deploy}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required in deploy/.env.deploy}"

if [[ "$TARGET" == "dev" ]]; then
    : "${CADDY_DOMAIN_DEV:?CADDY_DOMAIN_DEV required in deploy/.env.deploy for --dev}"
    CHOSEN_DOMAIN="$CADDY_DOMAIN_DEV"
    ENV_FILE="$ROOT/.env.dev"
else
    : "${CADDY_DOMAIN:?CADDY_DOMAIN required in deploy/.env.deploy for --prod}"
    CHOSEN_DOMAIN="$CADDY_DOMAIN"
    ENV_FILE="$ROOT/.env.prod"
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found — create it before updating $TARGET." >&2
    exit 1
fi

echo "→ Target: $TARGET ($CHOSEN_DOMAIN) using $(basename "$ENV_FILE")"

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
    --exclude '.env.dev' \
    --exclude '.env.prod' \
    --exclude 'deploy/.env.deploy' \
    --exclude 'supabase' \
    --exclude '.DS_Store' \
    -e "$RSYNC_SSH" \
    "$ROOT/" "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "→ Pushing $(basename "$ENV_FILE") → remote .env …"
scp "${SSH_OPTS[@]}" "$ENV_FILE" "$DEPLOY_HOST:$DEPLOY_PATH/.env"

echo "→ Pinning CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS to $CHOSEN_DOMAIN …"
remote "grep -q '^CADDY_DOMAIN=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^CADDY_DOMAIN=.*|CADDY_DOMAIN=$CHOSEN_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'CADDY_DOMAIN=$CHOSEN_DOMAIN' >> '$DEPLOY_PATH/.env'"
remote "grep -q '^PUBLIC_APP_URL=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://$CHOSEN_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'PUBLIC_APP_URL=https://$CHOSEN_DOMAIN' >> '$DEPLOY_PATH/.env'"
remote "grep -q '^ALLOWED_ORIGINS=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$CHOSEN_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'ALLOWED_ORIGINS=https://$CHOSEN_DOMAIN' >> '$DEPLOY_PATH/.env'"

echo "→ Rebuilding & restarting changed services …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Tailing backend logs for ~10s so startup is visible …"
remote "cd '$DEPLOY_PATH' && timeout 10 docker compose logs --tail=20 -f backend || true"

echo "→ Done. https://$CHOSEN_DOMAIN"
