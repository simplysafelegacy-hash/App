#!/usr/bin/env bash
# update.sh — incremental code push.
#
# Required: --dev or --prod, same as deploy.sh.
# Use this after every code change. For first-time provisioning, use
# deploy/deploy.sh instead.
#
# Database
# --------
#   --dev   postgres runs as a container beside the app (profile "localdb").
#   --prod  postgres lives on its own VM. No database container is created
#           on the app VM; the backend connects out to POSTGRES_HOST.
#
# Schema updates ship with the code: migrations are embedded in the Go
# binary and applied at boot against whichever database DATABASE_URL points
# at, gated by RUN_MIGRATIONS (default true). So `update.sh --prod` deploys
# both the code and the pending schema changes, and prints which migrations
# were applied. Set RUN_MIGRATIONS=false in .env.prod to push code without
# touching the schema.
#
# What it does:
#   1. For --prod, validates .env.prod points at a real database VM.
#   2. rsync project to the app VM (excludes .env files).
#   3. scp the matching .env.<dev|prod> to the remote as .env. This
#      keeps remote env in sync with whatever you've edited locally —
#      if you'd rather edit the remote .env in place, comment out the
#      push_env call below.
#   4. Pin CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS, and for prod
#      COMPOSE_PROFILES='' so no postgres container is ever started.
#   5. Check the app VM can reach Postgres.
#   6. docker compose up -d --build (rebuilds only changed images), then
#      report the migrations that ran.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

usage() {
    cat <<USAGE
Usage: deploy/update.sh --dev | --prod

  --dev    Update dev.simplysafelegacy.com using .env.dev.
  --prod   Update app.simplysafelegacy.com using .env.prod.
           Applies pending DB migrations to the database VM on boot
           unless RUN_MIGRATIONS=false.
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
    if [[ "$DB_MIGRATE" == "false" ]]; then
        echo "  RUN_MIGRATIONS=false — schema will NOT be touched by this deploy."
    fi
else
    read_db_settings
    echo "→ Database: local postgres container (compose profile 'localdb')"
fi

sync_project
push_env

if [[ "$TARGET" == "prod" ]]; then
    check_db_reachable
fi

echo "→ Rebuilding & restarting changed services …"
remote "cd '$DEPLOY_PATH' && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

echo "→ Tailing backend logs for ~10s so startup is visible …"
remote "cd '$DEPLOY_PATH' && timeout 10 docker compose logs --tail=20 -f backend || true"

report_migrations

echo "→ Done. https://$CHOSEN_DOMAIN"
