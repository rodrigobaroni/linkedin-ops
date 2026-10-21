#!/usr/bin/env bash
# Nightly encrypted Postgres dump on the VM (MVP-0, Sentinela condition 9). Installed by
# `deploy-shared-host.sh install-backup`; runs from cron. The dump is encrypted with the operator's GPG
# PUBLIC key: the private key lives only on the operator's Mac, so the VM cannot decrypt its own backups.
set -euo pipefail
dir=$HOME/linkedin-ops
project=${COMPOSE_PROJECT:-linkedin-ops}
recipient=$(cat "$dir/backup-recipient.fpr")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out=$dir/backups/linkedin-ops-$stamp.dump.gpg
umask 077
docker exec "${project}-postgres-1" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' |
  gpg --batch --yes --trust-model always --homedir "$dir/gnupg" --encrypt --recipient "$recipient" --output "$out.partial"
mv "$out.partial" "$out"
sha256sum "$out" | awk '{print $1}' > "$out.sha256"
ls -1t "$dir"/backups/linkedin-ops-*.dump.gpg | tail -n +15 | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -u +%FT%TZ) backup ok $out"
