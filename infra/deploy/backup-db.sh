#!/usr/bin/env bash
# Nightly encrypted Postgres dump on the VM (MVP-0, Sentinela condition 9); installed by
# `backup-offsite.sh setup-key` and also run by `deploy-shared-host.sh deploy` before migrations.
# Encrypted to the operator's GPG PUBLIC key: the private key lives only on the operator's Mac, so the VM
# cannot decrypt its own backups. A dump and its checksum are published together, atomically.
set -euo pipefail
dir=$HOME/linkedin-ops
project=${COMPOSE_PROJECT:-linkedin-ops}
exec 8>"$dir/backup.lock"
flock -w 600 8 || { echo "$(date -u +%FT%TZ) backup skipped: another backup is running" >&2; exit 1; }
recipient=$(cat "$dir/backup-recipient.fpr")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name=linkedin-ops-$stamp.dump.gpg
umask 077
tmp=$(mktemp -d "$dir/backups/.tmp.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
docker exec "${project}-postgres-1" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' |
  gpg --batch --yes --trust-model always --homedir "$dir/gnupg" --encrypt --recipient "$recipient" --output "$tmp/$name"
[ -s "$tmp/$name" ] || { echo "empty dump" >&2; exit 1; }
(cd "$tmp" && sha256sum "$name" > "$name.sha256")
# Checksum first, then the dump: a reader that sees the dump always finds its checksum.
mv "$tmp/$name.sha256" "$dir/backups/$name.sha256"
mv "$tmp/$name" "$dir/backups/$name"
# Rotation: keep the 14 newest COMPLETE pairs (dump + checksum); never touch in-flight temp dirs.
ls -1t "$dir"/backups/linkedin-ops-*.dump.gpg | while read -r f; do [ -s "$f.sha256" ] && echo "$f"; done |
  tail -n +15 | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -u +%FT%TZ) backup ok $name"
