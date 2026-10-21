#!/usr/bin/env bash
# Operator-side (Mac) companion of backup-db.sh (Sentinela condition 9: encrypted off-VM copy with a
# distinct key, and a real restore before the first post).
#   setup-key     once: creates the GPG key pair on the Mac (you choose a passphrase) and installs only
#                 the PUBLIC key + the backup cron on the VM
#   pull          copies new encrypted dumps from the VM to ~/Backups/linkedin-ops and verifies sha256
#   restore-test  decrypts the newest local dump and restores it into a throwaway postgres container on
#                 the VM (plaintext only in that container, removed afterwards); prints row counts
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST (user@ip)}"
: "${DEPLOY_SSH_KEY:?set DEPLOY_SSH_KEY}"
SSH=(ssh -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$DEPLOY_HOST")
LOCAL_DIR=${LOCAL_DIR:-$HOME/Backups/linkedin-ops}
UID_NAME="LinkedIn Ops backup <backup@linkedin-ops.invalid>"
ROOT=$(git rev-parse --show-toplevel)

setup_key() {
  if ! gpg --list-keys "$UID_NAME" >/dev/null 2>&1; then
    # future-default = ed25519 primary + cv25519 encryption subkey; gpg asks for a passphrase (pinentry).
    gpg --quick-generate-key "$UID_NAME" future-default default never
  fi
  fpr=$(gpg --list-keys --with-colons "$UID_NAME" | awk -F: '/^fpr/{print $10; exit}')
  gpg --export "$fpr" | "${SSH[@]}" "set -e; d=\$HOME/linkedin-ops; mkdir -p \$d/gnupg \$d/backups; chmod 700 \$d/gnupg; gpg --batch --homedir \$d/gnupg --import; echo $fpr > \$d/backup-recipient.fpr"
  "${SSH[@]}" "cat > \$HOME/linkedin-ops/backup-db.sh && chmod 700 \$HOME/linkedin-ops/backup-db.sh" < "$ROOT/infra/deploy/backup-db.sh"
  "${SSH[@]}" "(crontab -l 2>/dev/null | grep -v linkedin-ops/backup-db.sh; echo '40 3 * * * \$HOME/linkedin-ops/backup-db.sh >> \$HOME/linkedin-ops/backups/backup.log 2>&1') | crontab -"
  echo "public key $fpr installed on the VM; nightly backup at 03:40 (VM time). Private key stays in this Mac's GPG keyring."
}

pull() {
  mkdir -p "$LOCAL_DIR"; chmod 700 "$LOCAL_DIR"
  rsync -a -e "ssh -i $DEPLOY_SSH_KEY -o IdentitiesOnly=yes -o BatchMode=yes" "$DEPLOY_HOST:linkedin-ops/backups/linkedin-ops-*" "$LOCAL_DIR/"
  for f in "$LOCAL_DIR"/*.dump.gpg; do
    [ "$(shasum -a 256 "$f" | awk '{print $1}')" = "$(cat "$f.sha256")" ] || { echo "checksum mismatch: $f" >&2; exit 1; }
  done
  echo "pulled to $LOCAL_DIR: $(ls "$LOCAL_DIR"/*.dump.gpg | wc -l | tr -d ' ') dumps, checksums ok"
}

restore_test() {
  latest=$(ls -1t "$LOCAL_DIR"/*.dump.gpg | head -1)
  echo "restore test of $(basename "$latest")"
  name=linkedin-ops-restore-test
  "${SSH[@]}" "docker rm -f $name >/dev/null 2>&1; docker run -d --name $name -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore postgres:17-alpine >/dev/null; for i in \$(seq 1 30); do docker exec $name pg_isready -U postgres -d restore >/dev/null 2>&1 && break; sleep 1; done"
  gpg --decrypt "$latest" | "${SSH[@]}" "docker exec -i $name pg_restore -U postgres -d restore --no-owner"
  "${SSH[@]}" "docker exec $name psql -U postgres -d restore -Atc \"select 'users='||count(*) from users union all select 'publications='||count(*) from publications union all select 'migrations='||count(*) from _prisma_migrations\"; docker rm -f $name >/dev/null"
  echo "restore test finished; throwaway container removed"
}

case "${1:-}" in
  setup-key) setup_key ;;
  pull) pull ;;
  restore-test) restore_test ;;
  *) echo "usage: $0 setup-key|pull|restore-test" >&2; exit 2 ;;
esac
