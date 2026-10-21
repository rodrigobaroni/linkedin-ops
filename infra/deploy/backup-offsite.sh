#!/usr/bin/env bash
# Operator-side (Mac) companion of backup-db.sh (Sentinela condition 9: encrypted off-VM copy with a
# distinct key, and a real restore before the first post).
#   setup-key       once: creates the GPG key pair on the Mac (gpg asks for a passphrase) and installs only
#                   the PUBLIC key, backup-db.sh and the nightly cron on the VM
#   pull            copies complete dump+checksum pairs from the VM (scp) to ~/Backups/linkedin-ops and verifies them
#   restore-test    verifies and decrypts the newest local dump, restores it into a throwaway postgres
#                   container on the VM (removed on any outcome) and prints row counts
#   install-launchd runs `pull` daily on the Mac and shows a macOS notification when it fails (Sentinela S-5)
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST (user@ip)}"
: "${DEPLOY_SSH_KEY:?set DEPLOY_SSH_KEY}"
SSH=(ssh -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$DEPLOY_HOST")
LOCAL_DIR=${LOCAL_DIR:-$HOME/Backups/linkedin-ops}
UID_NAME="LinkedIn Ops backup <backup@linkedin-ops.invalid>"
# Same image reference as infra/docker/docker-compose.yml (tag + digest).
PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

setup_key() {
  if ! gpg --list-keys "$UID_NAME" >/dev/null 2>&1; then
    # future-default = ed25519 primary + cv25519 encryption subkey; gpg asks for a passphrase (pinentry).
    gpg --quick-generate-key "$UID_NAME" future-default default never
  fi
  fpr=$(gpg --list-keys --with-colons "$UID_NAME" | awk -F: '/^fpr/{print $10; exit}')
  gpg --export "$fpr" | "${SSH[@]}" "set -e; d=\$HOME/linkedin-ops; mkdir -p \$d/gnupg \$d/backups; chmod 700 \$d/gnupg; gpg --batch --homedir \$d/gnupg --import; echo $fpr > \$d/backup-recipient.fpr"
  "${SSH[@]}" "cat > \$HOME/linkedin-ops/backup-db.sh && chmod 700 \$HOME/linkedin-ops/backup-db.sh" < "$ROOT/infra/deploy/backup-db.sh"
  "${SSH[@]}" "(crontab -l 2>/dev/null | grep -v linkedin-ops/backup-db.sh; echo '40 3 * * * \$HOME/linkedin-ops/backup-db.sh >> \$HOME/linkedin-ops/backups/backup.log 2>&1') | crontab -"
  echo "public key $fpr installed on the VM; nightly backup at 03:40 (VM time). The private key stays on this Mac."
}

verify() { [ -s "$1" ] && [ -s "$1.sha256" ] && [ "$(shasum -a 256 "$1" | awk '{print $1}')" = "$(awk '{print $1}' "$1.sha256")" ]; }

pull() {
  mkdir -p "$LOCAL_DIR"; chmod 700 "$LOCAL_DIR"
  # Only complete pairs (dump + checksum) are listed; scp needs nothing beyond sshd on the VM (no rsync).
  # Each pair lands in a temp dir, is verified there and only then moved into place (checksum first), so an
  # interrupted or corrupted copy is never mistaken for a good one; an existing invalid pair is re-fetched.
  tmp=$(mktemp -d "$LOCAL_DIR/.tmp.XXXXXX")
  # EXIT (not RETURN): under set -e a failing ssh/scp/verify ends the shell without running RETURN traps.
  trap 'rm -rf "$tmp"' EXIT
  "${SSH[@]}" 'cd "$HOME/linkedin-ops/backups" && for f in linkedin-ops-*.dump.gpg; do [ -s "$f.sha256" ] && echo "$f"; done' |
    while read -r name; do
      [ -n "$name" ] || continue
      verify "$LOCAL_DIR/$name" 2>/dev/null && continue
      scp -q -i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
        "$DEPLOY_HOST:linkedin-ops/backups/$name" "$DEPLOY_HOST:linkedin-ops/backups/$name.sha256" "$tmp/"
      verify "$tmp/$name" || { echo "checksum failed after copy: $name" >&2; exit 1; }
      mv -f "$tmp/$name.sha256" "$LOCAL_DIR/$name.sha256"
      mv -f "$tmp/$name" "$LOCAL_DIR/$name"
    done
  n=0
  for f in "$LOCAL_DIR"/*.dump.gpg; do
    [ -e "$f" ] || { echo "no backups found" >&2; exit 1; }
    verify "$f" || { echo "checksum missing or wrong: $f" >&2; exit 1; }
    n=$((n + 1))
  done
  newest=$(ls -1t "$LOCAL_DIR"/*.dump.gpg | head -1)
  age_h=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 3600 ))
  [ "$age_h" -le 36 ] || { echo "newest backup is ${age_h}h old" >&2; exit 1; }
  rm -rf "$tmp"; trap - EXIT
  echo "pulled to $LOCAL_DIR: $n verified dumps; newest $(basename "$newest") (${age_h}h)"
}

restore_test() {
  latest=$(ls -1t "$LOCAL_DIR"/*.dump.gpg | head -1)
  verify "$latest" || { echo "checksum failed for $latest" >&2; exit 1; }
  echo "restore test of $(basename "$latest")"
  name=linkedin-ops-restore-test
  cleanup() { "${SSH[@]}" "docker rm -f $name >/dev/null 2>&1 || true"; }
  trap cleanup EXIT
  "${SSH[@]}" "set -e; docker rm -f $name >/dev/null 2>&1 || true
    docker run -d --name $name -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore $PG_IMAGE >/dev/null
    for i in \$(seq 1 60); do docker exec $name pg_isready -U postgres -d restore -h 127.0.0.1 >/dev/null 2>&1 && exit 0; sleep 1; done
    echo 'throwaway postgres never became ready' >&2; exit 1"
  gpg --decrypt "$latest" | "${SSH[@]}" "docker exec -i $name pg_restore -U postgres -d restore --no-owner --exit-on-error"
  "${SSH[@]}" "docker exec $name psql -U postgres -d restore -v ON_ERROR_STOP=1 -Atc \"select 'users='||count(*) from users union all select 'publications='||count(*) from publications union all select 'migrations='||count(*) from _prisma_migrations\""
  echo "restore test ok; throwaway container removed"
}

install_launchd() {
  label=br.baroni.linkedin-ops.backup-pull
  plist=$HOME/Library/LaunchAgents/$label.plist
  log=$LOCAL_DIR/pull.log
  mkdir -p "$LOCAL_DIR" "$HOME/Library/LaunchAgents"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-c</string>
    <string>"$ROOT/infra/deploy/backup-offsite.sh" pull &gt;&gt; "$log" 2&gt;&amp;1 || osascript -e 'display notification "Falha ao copiar o backup do LinkedIn Ops (veja $log)" with title "LinkedIn Ops backup"'</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>DEPLOY_HOST</key><string>$DEPLOY_HOST</string>
    <key>DEPLOY_SSH_KEY</key><string>$DEPLOY_SSH_KEY</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>15</integer></dict>
  <key>RunAtLoad</key><false/>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "launchd job $label installed: daily pull at 09:15, notification on failure, log $log"
}

case "${1:-}" in
  setup-key) setup_key ;;
  pull) pull ;;
  restore-test) restore_test ;;
  install-launchd) install_launchd ;;
  *) echo "usage: $0 setup-key|pull|restore-test|install-launchd" >&2; exit 2 ;;
esac
