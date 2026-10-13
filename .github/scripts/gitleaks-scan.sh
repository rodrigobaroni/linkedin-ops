#!/usr/bin/env bash
# Secret scanning for .github/workflows/security.yml. Runs the same way locally:
#   .github/scripts/gitleaks-scan.sh full                 # whole git history + working tree
#   .github/scripts/gitleaks-scan.sh range <base> <head>  # commits base..head (merges included) + working tree
# The gitleaks CLI is downloaded at a fixed version and verified against a pinned SHA-256 (TM-21),
# unless GITLEAKS_BIN points to a binary of the same version. Reports (SARIF) go to $REPORT_DIR.
set -euo pipefail

GITLEAKS_VERSION="8.30.1"
# sha256 of the release tarballs: https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1
checksum_for() {
  case "$1" in
    linux_x64) echo "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" ;;
    darwin_arm64) echo "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5" ;;
    *) echo "unsupported platform: $1" >&2; exit 1 ;;
  esac
}

MODE="${1:-full}"
BASE="${2:-}"
HEAD_SHA="${3:-}"
REPORT_DIR="${REPORT_DIR:-${RUNNER_TEMP:-/tmp}/gitleaks-reports}"
mkdir -p "$REPORT_DIR"

# Sets GITLEAKS_BIN. Every step checks its own status explicitly: `set -e` is not inherited by
# command substitutions, so a checksum mismatch must never be able to pass silently.
install_gitleaks() {
  local os arch platform tarball url tmp sum actual
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in x86_64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; esac
  platform="${os}_${arch}"
  sum="$(checksum_for "$platform")" || exit 1
  tarball="gitleaks_${GITLEAKS_VERSION}_${platform}.tar.gz"
  url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarball}"
  tmp="$(mktemp -d)"
  if ! curl -sSfL --retry 3 -o "$tmp/$tarball" "$url"; then
    echo "download failed: $url" >&2
    exit 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$tarball" | cut -d' ' -f1)"
  else
    actual="$(shasum -a 256 "$tmp/$tarball" | cut -d' ' -f1)"
  fi
  if [ "$actual" != "$sum" ]; then
    echo "checksum mismatch for $tarball: expected $sum, got $actual" >&2
    exit 1
  fi
  if ! tar -xzf "$tmp/$tarball" -C "$tmp" gitleaks; then
    echo "extraction failed: $tarball" >&2
    exit 1
  fi
  GITLEAKS_BIN="$tmp/gitleaks"
}

if [ -z "${GITLEAKS_BIN:-}" ]; then
  install_gitleaks
fi
installed="$("$GITLEAKS_BIN" version)" || exit 1
if [ "$installed" != "$GITLEAKS_VERSION" ]; then
  echo "gitleaks $installed found, expected $GITLEAKS_VERSION" >&2
  exit 1
fi
echo "gitleaks $installed ($GITLEAKS_BIN)"

status=0
run() {
  # Exit code 2 = leaks found (keep going so both scans report); anything else is an error.
  "$GITLEAKS_BIN" "$@" --no-banner --redact --exit-code 2 || {
    rc=$?
    if [ "$rc" -eq 2 ]; then status=2; else exit "$rc"; fi
  }
}

case "$MODE" in
  range)
    if [ -z "$BASE" ] || [ -z "$HEAD_SHA" ]; then
      echo "usage: $0 range <base-sha> <head-sha>" >&2
      exit 1
    fi
    if [[ "$BASE" =~ ^0+$ ]] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
      echo "base $BASE not available (new branch or first push): scanning full history instead"
      run git . --report-format sarif --report-path "$REPORT_DIR/git.sarif"
    else
      # --diff-merges=first-parent: a merge commit is diffed against the branch it lands on, so a
      # secret introduced only by a conflict resolution is scanned too (plain `git log -p` hides it).
      echo "scanning commits ${BASE}..${HEAD_SHA} (merge commits diffed against first parent)"
      run git . --log-opts "--diff-merges=first-parent ${BASE}..${HEAD_SHA}" --report-format sarif --report-path "$REPORT_DIR/git.sarif"
    fi
    ;;
  full)
    echo "scanning full git history"
    run git . --report-format sarif --report-path "$REPORT_DIR/git.sarif"
    ;;
  *)
    echo "unknown mode: $MODE (use 'full' or 'range <base> <head>')" >&2
    exit 1
    ;;
esac

# Working tree: catches a secret that only exists in the final snapshot (e.g. introduced by a merge
# or by a commit whose later rewrite is outside the scanned range).
echo "scanning working tree"
run dir . --report-format sarif --report-path "$REPORT_DIR/dir.sarif"

if [ "$status" -ne 0 ]; then
  echo "::error::gitleaks found secrets; see the job summary/SARIF reports in $REPORT_DIR"
fi
exit "$status"
