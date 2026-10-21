#!/usr/bin/env bash
# Deploy LinkedIn Ops to a host that already runs a shared Caddy on 80/443 (MVP-0, Rodrigo's Oracle VM).
# Runs on the operator's machine. Ships a git ref with `git archive` over SSH (the VM needs no GitHub
# credentials), builds the images on the VM (arm64 or amd64), applies migrations and starts api + web
# behind the host's Caddy. Secrets never touch the repository, the terminal or the logs.
#
# Usage:
#   DEPLOY_HOST=ubuntu@1.2.3.4 DEPLOY_SSH_KEY=~/path/key APP_HOST=linkedin.example.com \
#     infra/deploy/deploy-shared-host.sh init-env     # once: creates ~/linkedin-ops/.env on the VM (0600)
#   ... infra/deploy/deploy-shared-host.sh deploy [git-ref]   # default ref: origin/main
#   ... infra/deploy/deploy-shared-host.sh status
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST (user@ip)}"
: "${DEPLOY_SSH_KEY:?set DEPLOY_SSH_KEY (path to the private key)}"
REMOTE_DIR=${REMOTE_DIR:-linkedin-ops}
PROJECT=${COMPOSE_PROJECT:-linkedin-ops}
SSH=(ssh -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$DEPLOY_HOST")
ROOT=$(git rev-parse --show-toplevel)

compose_remote() { # $1 = release dir on the VM; rest = compose args
  local release=$1; shift
  # --env-file: Compose interpolates from the project directory (infra/docker) by default, not the repo root.
  printf 'cd %q && docker compose -p %q --env-file .env -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.shared-proxy.yml %s' \
    "$release" "$PROJECT" "$*"
}

init_env() {
  : "${APP_HOST:?set APP_HOST (public hostname, e.g. linkedin.example.com)}"
  local local_env="$ROOT/.env"
  local client_id client_secret
  client_id=$(grep -E '^LINKEDIN_CLIENT_ID=' "$local_env" | cut -d= -f2-)
  client_secret=$(grep -E '^LINKEDIN_CLIENT_SECRET=' "$local_env" | cut -d= -f2-)
  [ -n "$client_id" ] && [ -n "$client_secret" ] || { echo "LINKEDIN_CLIENT_ID/SECRET missing in $local_env" >&2; exit 1; }
  # The LinkedIn credentials travel inside the script on stdin (never in argv or on screen); every other
  # secret is generated on the VM.
  {
    printf 'client_id=%q\nclient_secret=%q\n' "$client_id" "$client_secret"
    cat <<'REMOTE'
set -euo pipefail
dir=$HOME/$1; host=$2
mkdir -p "$dir/releases" "$dir/backups"; chmod 700 "$dir"
env_file=$dir/.env
if [ -e "$env_file" ]; then echo "refusing: $env_file already exists (delete it explicitly to regenerate)" >&2; exit 1; fi
umask 077
pg_pass=$(openssl rand -hex 24)
cat > "$env_file" <<ENV
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
# Object storage is not used by MVP-0 (no media); the Compose base still requires the variables.
S3_ENDPOINT=https://objectstorage.invalid
S3_REGION=unused
S3_BUCKET=unused
S3_ACCESS_KEY_ID=unused
S3_SECRET_ACCESS_KEY=unused
S3_FORCE_PATH_STYLE=true
IMAGE_TAG=current
API_PUBLISH_PORT=3101
WEB_PUBLISH_PORT=3100
ENV
chmod 600 "$env_file"
echo "created $env_file (0600)"
REMOTE
  } | "${SSH[@]}" bash -s -- "$REMOTE_DIR" "$APP_HOST"
  echo "Next: keep a separate copy of ENCRYPTION_KEY (Sentinela condition 5):"
  echo "  infra/deploy/deploy-shared-host.sh escrow-key"
}

escrow_key() {
  # Stores ENCRYPTION_KEY in the macOS login Keychain of the operator, never on screen.
  "${SSH[@]}" "grep -E '^ENCRYPTION_KEY=' \$HOME/$REMOTE_DIR/.env | cut -d= -f2-" |
    { read -r key; security add-generic-password -U -a linkedin-ops -s "linkedin-ops ENCRYPTION_KEY v1" -w "$key"; }
  echo "ENCRYPTION_KEY v1 stored in the login Keychain (service: 'linkedin-ops ENCRYPTION_KEY v1')."
}

deploy() {
  local ref=${1:-origin/main} sha release
  git -C "$ROOT" fetch -q origin
  sha=$(git -C "$ROOT" rev-parse --short=12 "$ref")
  release="\$HOME/$REMOTE_DIR/releases/$sha"
  echo "deploying $ref ($sha) to $DEPLOY_HOST"
  git -C "$ROOT" archive --format=tar "$sha" | gzip -1 |
    "${SSH[@]}" "set -e; mkdir -p $release; tar -xzf - -C $release; ln -sfn \$HOME/$REMOTE_DIR/.env $release/.env; test -s \$HOME/$REMOTE_DIR/.env"
  "${SSH[@]}" "set -e
    $(compose_remote "$release" build api web)
    docker build -q --target build -f $release/apps/api/Dockerfile -t linkedin-ops/api-tools:current $release >/dev/null
    $(compose_remote "$release" up -d --wait postgres)
    docker run --rm --network ${PROJECT}_internal --env-file \$HOME/$REMOTE_DIR/.env linkedin-ops/api-tools:current pnpm db:migrate
    $(compose_remote "$release" up -d --wait --remove-orphans api web)
    ln -sfn $release \$HOME/$REMOTE_DIR/current
    curl -fsS --max-time 5 http://172.17.0.1:3101/api/v1/health >/dev/null && echo 'api health: ok'
    curl -fsS --max-time 5 -o /dev/null http://172.17.0.1:3100/ && echo 'web: ok'"
  echo "deployed $sha"
}

status() {
  "${SSH[@]}" "set -e; cd \$HOME/$REMOTE_DIR/current && docker compose -p $PROJECT --env-file .env -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.shared-proxy.yml ps"
}

case "${1:-}" in
  init-env) init_env ;;
  escrow-key) escrow_key ;;
  deploy) shift; deploy "${1:-}" ;;
  status) status ;;
  *) echo "usage: $0 init-env|escrow-key|deploy [ref]|status" >&2; exit 2 ;;
esac
