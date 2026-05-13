#!/usr/bin/env bash
# deploy.sh — first-time deployment to a fresh Ubuntu VM.
#
# What this does:
#   1. Loads deploy/.env.deploy for DEPLOY_HOST / DEPLOY_PATH / CADDY_DOMAIN.
#   2. Installs Docker + the compose plugin on the VM (idempotent).
#   3. rsyncs the project to $DEPLOY_PATH.
#   4. If the remote /opt/simplysafelegacy/.env doesn't exist, copies your
#      local .env over so the stack has Stripe/Google secrets.
#   5. Starts the stack with the production overlay (adds Caddy, drops
#      direct port mappings).
#
# Re-run safe — idempotent end-to-end. After the first run, prefer
# deploy/update.sh for incremental code pushes; it skips the Docker
# install step.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DEV_MODE=0
for arg in "$@"; do
    case "$arg" in
        --dev) DEV_MODE=1 ;;
        -h|--help)
            cat <<USAGE
Usage: deploy/deploy.sh [--dev]

  --dev    Deploy to CADDY_DOMAIN_DEV instead of CADDY_DOMAIN
           (e.g. dev.simplysafelegacy.com instead of app.simplysafelegacy.com).
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
: "${CADDY_DOMAIN:?CADDY_DOMAIN is required in deploy/.env.deploy}"

if (( DEV_MODE )); then
    : "${CADDY_DOMAIN_DEV:?CADDY_DOMAIN_DEV is required when --dev is used}"
    CADDY_DOMAIN="$CADDY_DOMAIN_DEV"
    echo "→ Dev mode: deploying to $CADDY_DOMAIN"
else
    echo "→ Deploying to $CADDY_DOMAIN"
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
    --exclude 'deploy/.env.deploy' \
    --exclude 'supabase' \
    --exclude '.DS_Store' \
    -e "$RSYNC_SSH" \
    "$ROOT/" "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "→ Checking remote .env …"
if remote "test -f '$DEPLOY_PATH/.env'"; then
    echo "  remote .env present — leaving it alone."
else
    if [[ -f "$ROOT/.env" ]]; then
        echo "  no remote .env yet — copying your local .env over (one-time)."
        scp "${SSH_OPTS[@]}" "$ROOT/.env" "$DEPLOY_HOST:$DEPLOY_PATH/.env"
    else
        echo "  WARNING: no .env locally and none on the VM — backend will fail" >&2
        echo "  to boot until you place one at $DEPLOY_PATH/.env." >&2
    fi
fi

echo "→ Setting CADDY_DOMAIN in remote .env …"
remote "grep -q '^CADDY_DOMAIN=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^CADDY_DOMAIN=.*|CADDY_DOMAIN=$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'CADDY_DOMAIN=$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"
remote "grep -q '^PUBLIC_APP_URL=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'PUBLIC_APP_URL=https://$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"
remote "grep -q '^ALLOWED_ORIGINS=' '$DEPLOY_PATH/.env' \
    && sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$CADDY_DOMAIN|' '$DEPLOY_PATH/.env' \
    || echo 'ALLOWED_ORIGINS=https://$CADDY_DOMAIN' >> '$DEPLOY_PATH/.env'"

echo "→ Building and starting the stack on $DEPLOY_HOST …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Waiting for backend health …"
remote "for i in 1 2 3 4 5 6 7 8 9 10; do \
    if docker exec \$(docker ps -qf name=simplysafelegacy-backend) wget -q -O- http://localhost:8080/health 2>/dev/null | grep -q ok; then \
        echo '  backend healthy.'; exit 0; \
    fi; \
    echo '  …waiting'; sleep 3; \
done; echo '  backend did not come up healthy in time — check logs.'; exit 1" || true

cat <<DONE

Deployed.

  https://$CADDY_DOMAIN

Caddy will fetch a Let's Encrypt cert on first request — make sure DNS for
$CADDY_DOMAIN points at the VM. Tail logs with:

  ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && docker compose logs -f --tail=100'

For incremental updates, use deploy/update.sh.
DONE
