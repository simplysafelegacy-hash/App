#!/usr/bin/env bash
# deploy.sh — first-time deployment to a fresh Ubuntu VM.
#
# Required: one of --dev or --prod. Each maps to its own env file
# (.env.dev or .env.prod) and its own Caddy domain (CADDY_DOMAIN_DEV
# vs CADDY_DOMAIN). There is no default — picking the wrong target
# would be a footgun.
#
# Topology
# --------
#   --dev   single VM: postgres runs as a container beside the app.
#   --prod  two VMs:
#             app VM  → caddy + frontend + backend   (this script targets it)
#             db  VM  → postgres, already provisioned, NOT managed here
#
# In prod the postgres service stays behind the "localdb" compose profile
# and is never enabled, so no database container is created on the app VM.
# The backend connects out to POSTGRES_HOST instead.
#
# Schema migrations are embedded in the Go binary and applied by the backend
# at boot, gated by RUN_MIGRATIONS (default true). Nothing separate to run.
#
# What it does:
#   1. Loads deploy/.env.deploy (SSH target + Caddy domains).
#   2. For --prod, validates that .env.prod points at a real database VM.
#   3. Installs Docker + compose plugin on the VM (idempotent).
#   4. rsyncs the project to $DEPLOY_PATH.
#   5. scp's the chosen .env.<dev|prod> to the remote as .env, then pins
#      CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS (and, for prod,
#      COMPOSE_PROFILES='') to match the chosen target.
#   6. Checks the app VM can reach Postgres.
#   7. Brings up the stack with the production overlay and reports which
#      migrations were applied.
#
# Re-run safe end-to-end. After the first run, use deploy/update.sh.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

usage() {
    cat <<USAGE
Usage: deploy/deploy.sh --dev | --prod

  --dev    Deploy to CADDY_DOMAIN_DEV (e.g. dev.simplysafelegacy.com)
           using .env.dev. Postgres runs as a local container.
  --prod   Deploy to CADDY_DOMAIN (e.g. app.simplysafelegacy.com)
           using .env.prod. Postgres lives on a separate VM; no
           database container is started on the app VM.
USAGE
}

# shellcheck source=deploy/_common.sh
source "$ROOT/deploy/_common.sh"

parse_target "$@"
load_deploy_config
setup_ssh

echo "→ Target: $TARGET ($CHOSEN_DOMAIN) using $(basename "$ENV_FILE")"
echo "→ App VM: $DEPLOY_HOST:$DEPLOY_PATH"

if [[ "$TARGET" == "prod" ]]; then
    check_prod_db_config
    echo "→ Database: $DB_HOST:$DB_PORT/$DB_NAME (sslmode=$DB_SSLMODE, migrations=$DB_MIGRATE)"
    echo "→ No postgres container will be started on the app VM."
else
    read_db_settings
    echo "→ Database: local postgres container (compose profile 'localdb')"
fi

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

sync_project
push_env

if [[ "$TARGET" == "prod" ]]; then
    check_db_reachable
fi

echo "→ Building and starting the stack …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Waiting for backend health …"
remote "for i in 1 2 3 4 5 6 7 8 9 10; do \
    if docker exec \$(docker ps -qf name=simplysafelegacy-backend) wget -q -O- http://localhost:8080/health 2>/dev/null | grep -q ok; then \
        echo '  backend healthy.'; exit 0; \
    fi; \
    echo '  …waiting'; sleep 3; \
done; echo '  backend did not come up healthy in time — check logs.'; exit 1" || true

report_migrations

cat <<DONE

Deployed ($TARGET).

  https://$CHOSEN_DOMAIN

Caddy fetches the Let's Encrypt cert on the first HTTPS request. DNS for
$CHOSEN_DOMAIN must already point at the VM. Tail logs:

  ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && docker compose logs -f --tail=100'

For incremental updates: deploy/update.sh --$TARGET
DONE
