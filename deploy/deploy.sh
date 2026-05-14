#!/usr/bin/env bash
# deploy.sh — first-time deployment to a fresh Ubuntu VM.
#
# Required: one of --dev or --prod. Each maps to its own env file
# (.env.dev or .env.prod) and its own Caddy domain (CADDY_DOMAIN_DEV
# vs CADDY_DOMAIN). There is no default — picking the wrong target
# would be a footgun.
#
# What it does:
#   1. Loads deploy/.env.deploy (SSH target + Caddy domains).
#   2. scp's the chosen .env.<dev|prod> to the remote as .env.
#   3. Installs Docker + compose plugin on the VM (idempotent).
#   4. rsyncs the project to $DEPLOY_PATH.
#   5. Rewrites CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS on the
#      remote .env to match the chosen target (safety net in case the
#      env file disagrees).
#   6. Brings up the stack with the production overlay.
#
# Re-run safe end-to-end. After the first run, use deploy/update.sh.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

usage() {
    cat <<USAGE
Usage: deploy/deploy.sh --dev | --prod

  --dev    Deploy to CADDY_DOMAIN_DEV (e.g. dev.simplysafelegacy.com)
           using .env.dev for application secrets.
  --prod   Deploy to CADDY_DOMAIN (e.g. app.simplysafelegacy.com)
           using .env.prod for application secrets.
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

# Pick the target-specific values.
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
    echo "ERROR: $ENV_FILE not found — create it before deploying $TARGET." >&2
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

echo "→ Checking Docker on $DEPLOY_HOST …"
remote 'bash -s' <<'REMOTE'
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
    echo "  installing Docker…"
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER" || true
    echo "  installed."
else
    echo "  Docker already installed."
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "  ERROR: docker compose plugin missing — re-run after fixing." >&2
    exit 1
fi
REMOTE

echo "→ Ensuring $DEPLOY_PATH exists on the VM …"
remote "sudo mkdir -p '$DEPLOY_PATH' && sudo chown -R \$(id -u):\$(id -g) '$DEPLOY_PATH'"

echo "→ rsyncing project to $DEPLOY_HOST:$DEPLOY_PATH …"
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

echo "→ Building and starting the stack …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Waiting for backend health …"
remote "for i in 1 2 3 4 5 6 7 8 9 10; do \
    if docker exec \$(docker ps -qf name=simplysafelegacy-backend) wget -q -O- http://localhost:8080/health 2>/dev/null | grep -q ok; then \
        echo '  backend healthy.'; exit 0; \
    fi; \
    echo '  …waiting'; sleep 3; \
done; echo '  backend did not come up healthy in time — check logs.'; exit 1" || true

cat <<DONE

Deployed ($TARGET).

  https://$CHOSEN_DOMAIN

Caddy fetches the Let's Encrypt cert on the first HTTPS request. DNS for
$CHOSEN_DOMAIN must already point at the VM. Tail logs:

  ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && docker compose logs -f --tail=100'

For incremental updates: deploy/update.sh --$TARGET
DONE
