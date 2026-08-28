# deploy/_common.sh — shared plumbing for deploy.sh and update.sh.
# Sourced, never executed. Expects the caller to have set ROOT.

# ── Target selection ───────────────────────────────────────────────────────
# Parses --dev / --prod out of "$@" and sets TARGET. Callers pass "$@".
parse_target() {
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
}

# ── Config loading ─────────────────────────────────────────────────────────
# Sources deploy/.env.deploy and resolves the per-target host, domain and
# env file. Sets: DEPLOY_HOST, DEPLOY_PATH, CHOSEN_DOMAIN, ENV_FILE.
load_deploy_config() {
    if [[ ! -f "$ROOT/deploy/.env.deploy" ]]; then
        echo "deploy/.env.deploy not found — copy deploy/.env.deploy.example and fill in." >&2
        exit 1
    fi
    # shellcheck disable=SC1091
    source "$ROOT/deploy/.env.deploy"

    : "${DEPLOY_PATH:?DEPLOY_PATH is required in deploy/.env.deploy}"

    if [[ "$TARGET" == "dev" ]]; then
        : "${CADDY_DOMAIN_DEV:?CADDY_DOMAIN_DEV required in deploy/.env.deploy for --dev}"
        CHOSEN_DOMAIN="$CADDY_DOMAIN_DEV"
        ENV_FILE="$ROOT/.env.dev"
        # Dev may run on its own VM; fall back to the shared DEPLOY_HOST.
        DEPLOY_HOST="${DEPLOY_HOST_DEV:-${DEPLOY_HOST:-}}"
    else
        : "${CADDY_DOMAIN:?CADDY_DOMAIN required in deploy/.env.deploy for --prod}"
        CHOSEN_DOMAIN="$CADDY_DOMAIN"
        ENV_FILE="$ROOT/.env.prod"
        # Production app VM. DEPLOY_HOST_PROD wins so dev and prod can
        # live on different machines without swapping the file.
        DEPLOY_HOST="${DEPLOY_HOST_PROD:-${DEPLOY_HOST:-}}"
    fi

    if [[ -z "$DEPLOY_HOST" ]]; then
        echo "ERROR: no SSH target for $TARGET — set DEPLOY_HOST (or DEPLOY_HOST_${TARGET^^}) in deploy/.env.deploy." >&2
        exit 1
    fi

    if [[ ! -f "$ENV_FILE" ]]; then
        echo "ERROR: $ENV_FILE not found — create it before deploying $TARGET." >&2
        if [[ "$TARGET" == "prod" ]]; then
            echo "       Start from .env.prod.example:  cp .env.prod.example .env.prod" >&2
        fi
        exit 1
    fi
}

# ── SSH plumbing ───────────────────────────────────────────────────────────
# Sets SSH_OPTS array and RSYNC_SSH string from the optional port/identity.
setup_ssh() {
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
}

remote() {
    ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"
}

# ── Sync ───────────────────────────────────────────────────────────────────
sync_project() {
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
}

# ── Remote .env ────────────────────────────────────────────────────────────
# Writes one KEY=value into the remote .env, replacing any existing line.
set_remote_env() {
    local key="$1" value="$2"
    remote "grep -q '^${key}=' '$DEPLOY_PATH/.env' \
        && sed -i 's|^${key}=.*|${key}=${value}|' '$DEPLOY_PATH/.env' \
        || echo '${key}=${value}' >> '$DEPLOY_PATH/.env'"
}

push_env() {
    echo "→ Pushing $(basename "$ENV_FILE") → remote .env …"
    scp "${SSH_OPTS[@]}" "$ENV_FILE" "$DEPLOY_HOST:$DEPLOY_PATH/.env"

    echo "→ Pinning CADDY_DOMAIN / PUBLIC_APP_URL / ALLOWED_ORIGINS to $CHOSEN_DOMAIN …"
    set_remote_env CADDY_DOMAIN   "$CHOSEN_DOMAIN"
    set_remote_env PUBLIC_APP_URL "https://$CHOSEN_DOMAIN"
    set_remote_env ALLOWED_ORIGINS "https://$CHOSEN_DOMAIN"

    if [[ "$TARGET" == "prod" ]]; then
        # The app VM must never start its own postgres. The base compose
        # file keeps that service behind the "localdb" profile, so pinning
        # COMPOSE_PROFILES empty here is what keeps it off — even if
        # .env.prod was copied from .env.dev and still carries the profile.
        echo "→ Pinning COMPOSE_PROFILES='' (database lives on its own VM) …"
        set_remote_env COMPOSE_PROFILES ""
    fi
}

# ── Database preflight ─────────────────────────────────────────────────────
# Reads the DB settings out of the *local* env file so we can report them
# and, for prod, refuse to deploy against an obviously wrong config.
# Sets DB_HOST, DB_PORT, DB_NAME, DB_SSLMODE, DB_MIGRATE.
read_db_settings() {
    local f="$ENV_FILE"
    envget() {
        # Last assignment wins, strip surrounding quotes and inline noise.
        grep -E "^$1=" "$f" 2>/dev/null | tail -n1 | cut -d= -f2- | \
            sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
    }
    DB_HOST="$(envget POSTGRES_HOST)"
    DB_PORT="$(envget POSTGRES_REMOTE_PORT)"
    DB_NAME="$(envget POSTGRES_DB)"
    DB_SSLMODE="$(envget POSTGRES_SSLMODE)"
    DB_MIGRATE="$(envget RUN_MIGRATIONS)"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-simplysafelegacy}"
    DB_MIGRATE="${DB_MIGRATE:-true}"
}

# Fails fast when .env.prod still points the backend at a local container.
check_prod_db_config() {
    read_db_settings

    if [[ -z "$DB_HOST" || "$DB_HOST" == "postgres" || "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
        cat >&2 <<ERR
ERROR: POSTGRES_HOST in $(basename "$ENV_FILE") is '${DB_HOST:-<unset>}'.

Production runs Postgres on a separate VM, and the app VM starts no
postgres container — so this would leave the backend with nothing to
connect to. Set POSTGRES_HOST to the database VM's address, e.g.

  POSTGRES_HOST=10.128.0.5      # private IP of the database VM
  POSTGRES_REMOTE_PORT=5432
  POSTGRES_SSLMODE=require
ERR
        exit 1
    fi

    if [[ -z "$DB_SSLMODE" ]]; then
        echo "WARNING: POSTGRES_SSLMODE unset in $(basename "$ENV_FILE") — defaulting to 'disable'." >&2
        echo "         Set POSTGRES_SSLMODE=require unless the two VMs share a trusted private network." >&2
        DB_SSLMODE="disable"
    fi
}

# Verifies the app VM can actually open a TCP connection to the database VM
# before we bother rebuilding images. Non-fatal: warns and continues, since
# a firewall rule may be pending and the backend retries on boot anyway.
check_db_reachable() {
    echo "→ Checking the app VM can reach Postgres at $DB_HOST:$DB_PORT …"
    if remote "timeout 5 bash -c '</dev/tcp/$DB_HOST/$DB_PORT' 2>/dev/null"; then
        echo "  reachable."
    else
        cat >&2 <<WARN
  WARNING: $DEPLOY_HOST could not open a TCP connection to $DB_HOST:$DB_PORT.

  The deploy will continue and the backend retries for ~20s on boot, but
  if it stays unreachable check, on the database VM:
    - postgresql.conf   listen_addresses = '*'
    - pg_hba.conf       a host entry for the app VM's address
    - the firewall      inbound 5432 from the app VM only
WARN
    fi
}

# Prints what the backend logged about migrations after it booted.
report_migrations() {
    echo "→ Migration status from the backend log …"
    remote "cd '$DEPLOY_PATH' && docker compose logs --tail=200 backend 2>/dev/null \
        | grep -E 'migration applied|migrations:|RUN_MIGRATIONS' | tail -20" \
        || echo "  (no migration lines found — check 'docker compose logs backend')"
}
