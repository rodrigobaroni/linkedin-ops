#!/usr/bin/env bash
# Deploy LinkedIn Ops to a host that already runs a shared Caddy on 80/443 (MVP-0, Rodrigo's Oracle VM).
# Runs on the operator's machine. Ships a git ref with `git archive` over SSH (the VM needs no GitHub
# credentials), builds immutable images tagged with the commit sha on the VM, takes an encrypted backup and
# applies migrations, starts the worker (pg-boss queues ready) and then api + web behind the host's Caddy,
# verifies health and rolls back to the previous release on failure. Secrets never touch the repository,
# argv, the terminal or the logs.
#
#   export DEPLOY_HOST=ubuntu@1.2.3.4 DEPLOY_SSH_KEY=~/path/key APP_HOST=linkedin.example.com
#   infra/deploy/deploy-shared-host.sh init-env          # once: ~/linkedin-ops/.env on the VM (0600)
#   infra/deploy/deploy-shared-host.sh escrow-key        # once: ENCRYPTION_KEY copy in the macOS Keychain
#   infra/deploy/deploy-shared-host.sh deploy [git-ref]  # default origin/main
#   REQUIRE_PUBLIC=0 ... deploy                          # first deploy, before the Caddy site block exists
#   infra/deploy/deploy-shared-host.sh status
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST (user@ip)}"
: "${DEPLOY_SSH_KEY:?set DEPLOY_SSH_KEY (path to the private key)}"
REMOTE_DIR=${REMOTE_DIR:-linkedin-ops} # relative to the remote user's home (ssh starts there)
PROJECT=${COMPOSE_PROJECT:-linkedin-ops}
SSH=(ssh -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$DEPLOY_HOST")
ROOT=$(git rev-parse --show-toplevel)

init_env() {
  : "${APP_HOST:?set APP_HOST (public hostname, e.g. linkedin.example.com)}"
  local local_env="$ROOT/.env" client_id client_secret openai_key openai_model
  client_id=$(grep -E '^LINKEDIN_CLIENT_ID=' "$local_env" | cut -d= -f2-)
  client_secret=$(grep -E '^LINKEDIN_CLIENT_SECRET=' "$local_env" | cut -d= -f2-)
  [ -n "$client_id" ] && [ -n "$client_secret" ] || { echo "LINKEDIN_CLIENT_ID/SECRET missing in $local_env" >&2; exit 1; }
  # The worker refuses to boot in production without them (validateWorkerEnv); no default model is assumed.
  openai_key=$(grep -E '^OPENAI_API_KEY=' "$local_env" | cut -d= -f2-)
  openai_model=$(grep -E '^OPENAI_MODEL=' "$local_env" | cut -d= -f2-)
  [ -n "$openai_key" ] && [ -n "$openai_model" ] || { echo "OPENAI_API_KEY/OPENAI_MODEL missing in $local_env" >&2; exit 1; }
  # The LinkedIn and OpenAI credentials travel inside the script on stdin (never argv or screen); every other
  # secret is generated on the VM. The file is written to a temporary name and moved atomically.
  {
    printf 'client_id=%q\nclient_secret=%q\nopenai_key=%q\nopenai_model=%q\n' \
      "$client_id" "$client_secret" "$openai_key" "$openai_model"
    cat <<'REMOTE'
set -euo pipefail
dir=$HOME/$1; host=$2
required="NODE_ENV APP_BASE_URL DATABASE_URL POSTGRES_PASSWORD SESSION_SECRET ENCRYPTION_KEY LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET LINKEDIN_REDIRECT_URI OPENAI_API_KEY OPENAI_MODEL"
complete() { for k in $required; do grep -qE "^$k=.+" "$1" || return 1; done; }
mkdir -p "$dir/releases" "$dir/backups"; chmod 700 "$dir"
env_file=$dir/.env
if [ -e "$env_file" ]; then
  if complete "$env_file"; then echo "$env_file already exists and is complete; nothing to do"; exit 0; fi
  echo "refusing: $env_file exists but is incomplete; inspect and remove it explicitly" >&2; exit 1
fi
umask 077
tmp=$(mktemp "$dir/.env.XXXXXX"); trap 'rm -f "$tmp"' EXIT
pg_pass=$(openssl rand -hex 24)
cat > "$tmp" <<ENV
# Generated on $(date -u +%FT%TZ) by infra/deploy/deploy-shared-host.sh init-env. Never commit or print.
NODE_ENV=production
APP_TIMEZONE=America/Sao_Paulo
LOG_LEVEL=info
APP_BASE_URL=https://$host
API_BASE_URL=https://$host/api/v1
POSTGRES_USER=linkedin_ops
POSTGRES_PASSWORD=$pg_pass
POSTGRES_DB=linkedin_ops
POSTGRES_PORT=5432
DATABASE_URL=postgresql://linkedin_ops:$pg_pass@postgres:5432/linkedin_ops
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
LINKEDIN_CLIENT_ID=$client_id
LINKEDIN_CLIENT_SECRET=$client_secret
LINKEDIN_REDIRECT_URI=https://$host/api/v1/auth/linkedin/callback
LINKEDIN_PKCE=disabled
# Worker only (the Compose file never hands them to api or web).
OPENAI_API_KEY=$openai_key
OPENAI_MODEL=$openai_model
# Object storage is not used by MVP-0 (no media); the Compose base still requires the variables.
S3_ENDPOINT=https://objectstorage.invalid
S3_REGION=unused
S3_BUCKET=unused
S3_ACCESS_KEY_ID=unused
S3_SECRET_ACCESS_KEY=unused
S3_FORCE_PATH_STYLE=true
API_PUBLISH_PORT=3101
WEB_PUBLISH_PORT=3100
ENV
complete "$tmp" || { echo "generated env is incomplete" >&2; exit 1; }
chmod 600 "$tmp"; mv "$tmp" "$env_file"; trap - EXIT
echo "created $env_file (0600)"
REMOTE
  } | "${SSH[@]}" bash -s -- "$REMOTE_DIR" "$APP_HOST"
  echo "Next: infra/deploy/deploy-shared-host.sh escrow-key (Sentinela condition 5)"
}

escrow_key() {
  # `security -i` reads its commands from stdin, so the key never appears in any process's argv.
  "${SSH[@]}" "grep -E '^ENCRYPTION_KEY=' \"\$HOME/$REMOTE_DIR/.env\" | cut -d= -f2-" | {
    read -r key
    [ -n "$key" ] || { echo "ENCRYPTION_KEY not found on the VM" >&2; exit 1; }
    printf 'add-generic-password -U -a linkedin-ops -s "linkedin-ops ENCRYPTION_KEY v1" -w "%s"\n' "$key" | security -i >/dev/null
  }
  security find-generic-password -a linkedin-ops -s "linkedin-ops ENCRYPTION_KEY v1" >/dev/null
  echo "ENCRYPTION_KEY v1 stored in the login Keychain (service 'linkedin-ops ENCRYPTION_KEY v1')."
}

deploy() {
  local ref=${1:-origin/main} sha
  git -C "$ROOT" fetch -q origin
  sha=$(git -C "$ROOT" rev-parse --short=12 "$ref")
  echo "deploying $ref ($sha) to $DEPLOY_HOST"
  # Stage into a unique temp dir (no lock needed); the release is promoted under the deploy lock below.
  local incoming
  incoming=$(git -C "$ROOT" archive --format=tar "$sha" | gzip -1 | "${SSH[@]}" bash -c "'set -euo pipefail
    test -s \$HOME/$REMOTE_DIR/.env; mkdir -p \$HOME/$REMOTE_DIR/releases
    tmp=\$(mktemp -d \$HOME/$REMOTE_DIR/releases/.incoming.XXXXXX); tar -xzf - -C \"\$tmp\"
    ln -sfn \$HOME/$REMOTE_DIR/.env \"\$tmp/.env\"; basename \"\$tmp\"'")
  "${SSH[@]}" bash -s -- "$sha" "$PROJECT" "$REMOTE_DIR" "${APP_HOST:-}" "${REQUIRE_PUBLIC:-1}" "$incoming" <<'REMOTE'
set -euo pipefail
sha=$1 project=$2 base=$HOME/$3 host=$4 require_public=$5 incoming=$base/releases/$6
exec 9>"$base/deploy.lock"
flock -n 9 || { rm -rf "$incoming"; echo "another deploy is running" >&2; exit 1; }
# The worker fails closed without its OpenAI settings (validateWorkerEnv): refuse before building anything.
# Presence only: the values are never read into a variable or printed.
for k in OPENAI_API_KEY OPENAI_MODEL; do
  grep -qE "^$k=.+" "$base/.env" || { rm -rf "$incoming"; echo "refusing to deploy: $k is missing in $base/.env" >&2; exit 1; }
done
# Promote the staged tree under the lock. The same sha has the same content, so an existing release is kept.
if [ -d "$base/releases/$sha" ]; then rm -rf "$incoming"; else mv "$incoming" "$base/releases/$sha"; fi
compose() { # $1 = release sha; IMAGE_TAG pins immutable images per release (shell env beats --env-file)
  local r=$1; shift
  (cd "$base/releases/$r" && IMAGE_TAG=$r docker compose -p "$project" --env-file .env \
    -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.shared-proxy.yml "$@")
}
retry() { local n=0; until "$@"; do n=$((n + 1)); [ "$n" -ge 10 ] && return 1; sleep 3; done; }
# Single source of truth for the running release: the `current` symlink.
prev=$(basename "$(readlink "$base/current" 2>/dev/null || true)")
tools=(docker run --rm --network "${project}_internal" --env-file "$base/.env" "linkedin-ops/api-tools:$sha")

compose "$sha" build api web worker
docker build -q --target build -f "$base/releases/$sha/apps/api/Dockerfile" -t "linkedin-ops/api-tools:$sha" "$base/releases/$sha" >/dev/null
compose "$sha" up -d --wait postgres

# Encrypted backup BEFORE any DDL (runbook database-migrations.md); only skippable on the very first deploy.
if [ -x "$base/backup-db.sh" ]; then "$base/backup-db.sh"
elif [ -n "$prev" ]; then echo "refusing to migrate: backup-db.sh is not installed (run backup-offsite.sh setup-key)" >&2; exit 1
else echo "first deploy: no data to back up yet"; fi
echo "--- migration status before:"; "${tools[@]}" pnpm db:migrate:status || true
if ! "${tools[@]}" pnpm db:migrate; then
  echo "MIGRATION FAILED. The running release (${prev:-none}) was NOT touched; the schema may be partially migrated." >&2
  echo "Next steps (no blind retry): '${tools[*]} pnpm db:migrate:status'; fix forward or 'prisma migrate resolve'," >&2
  echo "or restore the backup taken above (docs/runbooks/database-migrations.md)." >&2
  exit 1
fi
echo "--- migration status after:"
if ! "${tools[@]}" pnpm db:migrate:status; then
  echo "migrations still pending or failed after db:migrate; the running release (${prev:-none}) was NOT touched" >&2
  exit 1
fi

# Releases older than this script never built a worker image: roll the worker back only to an image that
# exists (an `up` without it would build during the rollback), otherwise stop it.
rollback_worker() {
  if [ -n "$prev" ] && [ -d "$base/releases/$prev" ] && docker image inspect "linkedin-ops/worker:$prev" >/dev/null 2>&1; then
    echo "rolling back worker to $prev" >&2; compose "$prev" up -d --wait worker || true
  else
    echo "no previous worker image to roll back to; stopping the worker" >&2; compose "$sha" stop worker || true
  fi
}
rollback() {
  if [ -n "$prev" ] && [ -d "$base/releases/$prev" ]; then
    echo "rolling back api/web to $prev" >&2; compose "$prev" up -d --wait api web || true
  else
    echo "no previous release to roll back to; stopping api/web" >&2; compose "$sha" stop api web || true
  fi
  rollback_worker
}
# The worker owns the `pgboss` schema and provisions its queues at boot (dead-letter queue first); the api
# answers 503 to producers until they exist. Credentials stay inside the postgres container's environment.
queues_ready() {
  local n=0 found sql="SELECT count(*) FROM pgboss.queue WHERE name IN ('cv.extract', 'cv.extract.dlq')"
  # The SQL goes on the here-string: `exec` reads stdin, which would otherwise be the rest of this script.
  # shellcheck disable=SC2016 # expanded by the container's shell, from its own environment
  until found=$(compose "$sha" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAq' \
      <<<"$sql" 2>/dev/null) && [ "$found" = 2 ]; do
    n=$((n + 1)); [ "$n" -ge 20 ] && return 1; sleep 3
  done
}
# Worker BEFORE api/web: a failure here leaves the running api/web untouched.
if ! compose "$sha" up -d --wait worker || ! queues_ready; then
  echo "worker did not become ready (healthy + queues cv.extract and cv.extract.dlq in pgboss.queue within 60 s)" >&2
  compose "$sha" ps -a worker >&2 || true; compose "$sha" logs --no-color --tail=80 worker >&2 || true
  rollback_worker; exit 1
fi
check() {
  retry curl -fsS --max-time 5 -o /dev/null http://172.17.0.1:3101/api/v1/health &&
    retry curl -fsS --max-time 5 -o /dev/null http://172.17.0.1:3101/api/v1/ready &&
    retry curl -fsS --max-time 5 -o /dev/null http://172.17.0.1:3100/ &&
    { [ "$require_public" = 0 ] || retry curl -fsS --max-time 10 -o /dev/null "https://$host/api/v1/health"; }
}
if ! compose "$sha" up -d --wait --remove-orphans api web || ! check; then
  compose "$sha" ps -a >&2 || true; compose "$sha" logs --no-color --tail=80 api web worker >&2 || true
  rollback; exit 1
fi
ln -sfn "$base/releases/$sha" "$base/current.tmp" && mv -T "$base/current.tmp" "$base/current"
echo "deployed $sha (previous: ${prev:-none}); worker queues, api health, ready and web ok$([ "$require_public" = 0 ] || echo ", https://$host ok")"
REMOTE
}

status() {
  "${SSH[@]}" bash -s -- "$PROJECT" "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
base=$HOME/$2; sha=$(basename "$(readlink "$base/current")")
cd "$base/releases/$sha" && IMAGE_TAG=$sha docker compose -p "$1" --env-file .env \
  -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.shared-proxy.yml ps
echo "current release: $sha"
# Presence only, never the values.
for k in OPENAI_API_KEY OPENAI_MODEL; do
  if grep -qE "^$k=.+" "$base/.env"; then echo "$k: present"; else echo "$k: MISSING (the worker will not boot)"; fi
done
REMOTE
}

case "${1:-}" in
  init-env) init_env ;;
  escrow-key) escrow_key ;;
  deploy) shift; deploy "${1:-}" ;;
  status) status ;;
  *) echo "usage: $0 init-env|escrow-key|deploy [ref]|status" >&2; exit 2 ;;
esac
