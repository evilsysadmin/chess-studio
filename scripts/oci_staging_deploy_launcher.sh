#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (sudo)' >&2
  exit 77
fi
target=staging
if [[ $# -eq 1 && "$1" =~ ^[0-9a-f]{40}$ ]]; then
  sha="$1"
elif [[ $# -eq 2 && "$1" =~ ^(staging|production)$ && "$2" =~ ^[0-9a-f]{40}$ ]]; then
  target="$1"
  sha="$2"
else
  echo 'usage: chess-studio-deploy [staging|production] <40-char git sha>' >&2
  exit 64
fi
repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
payload="$repo/scripts/oci_existing_a1_deploy.sh"

command -v git >/dev/null 2>&1 || { echo 'missing required command: git' >&2; exit 69; }
[[ -d "$repo/.git" ]] || { echo "missing repo checkout: $repo" >&2; exit 66; }

# The launcher is the stable host contract. Runtime deployment behavior lives in
# the requested immutable repository revision so changing deploy logic no longer
# requires recycling the staging A1 through cloud-init.
# The old launcher fetched BEFORE the payload's deploy.lock was acquired.
# The host watcher and Run Command could therefore mutate the SAME shallow
# checkout concurrently (.git/shallow.lock) even when deploy.lock was held.
# Take the EXISTING mutation lock before touching Git, then hand the open FD
# to the payload through exec. Never delete Git's own locks.
command -v flock >/dev/null 2>&1 || { echo 'flock required for OCI deploy' >&2; exit 69; }
install -d -m 0755 /var/lib/chess-studio
deploy_lock_file=/var/lib/chess-studio/deploy.lock
exec 8>"$deploy_lock_file"
# The host watcher legitimately owns the lock for an entire deploy (sometimes
# several minutes). A 120s waiter falsely failed concurrent OCI Run Commands
# with exit 75 even though the watcher could commit the SAME SHA shortly after.
# Bound the wait to 7m (under OCI Run Command's 15m budget), report contention
# every 30s, and drop stale staging generations WITHOUT touching Git state.
lock_acquired=false
for ((lock_attempt=1; lock_attempt<=84; lock_attempt++)); do
  if flock -w 5 8; then
    lock_acquired=true
    break
  fi
  if ((lock_attempt % 6 == 0)); then
    echo "OCI_DEPLOY_LOCK_WAIT phase=launcher_checkout waited_s=$((lock_attempt * 5)) target=$target" >&2
    if [[ "$target" == staging ]]; then
      # ls-remote never changes the working tree or shallow Git metadata.
      # Failure to reach origin is NOT evidence of supersession.
      current_main="$(git -C "$repo" ls-remote --exit-code origin refs/heads/main 2>/dev/null | awk 'NR == 1 {print $1}' || true)"
      if [[ "$current_main" =~ ^[0-9a-f]{40}$ && "$current_main" != "$sha" ]]; then
        echo "OCI_DEPLOY_SUPERSEDED phase=launcher_lock_wait repo_ref=$sha current_main=$current_main"
        exit 0
      fi
    fi
  fi
done
if [[ "$lock_acquired" != true ]]; then
  echo "OCI_DEPLOY_LOCK_TIMEOUT phase=launcher_checkout waited_s=420 target=$target" >&2
  # Read-only diagnostics; never remove a Git lock or kill its owner.
  if command -v fuser >/dev/null 2>&1; then
    fuser -v "$deploy_lock_file" >&2 || true
  fi
  exit 75
fi
# A generation may become stale between the last 30s probe and the lock
# acquisition. Reject it before fetch/checkout; payload repeats this guard.
if [[ "$target" == staging ]]; then
  current_main="$(git -C "$repo" ls-remote --exit-code origin refs/heads/main 2>/dev/null | awk 'NR == 1 {print $1}' || true)"
  if [[ "$current_main" =~ ^[0-9a-f]{40}$ && "$current_main" != "$sha" ]]; then
    echo "OCI_DEPLOY_SUPERSEDED phase=launcher_lock_acquired repo_ref=$sha current_main=$current_main"
    exit 0
  fi
fi
git -C "$repo" fetch --no-tags --depth=1 origin "$sha"
git -C "$repo" checkout --detach "$sha"
[[ -f "$payload" && ! -L "$payload" ]] || { echo "missing deploy payload in $sha: $payload" >&2; exit 66; }

CHESS_STUDIO_HOST_LOCK_HELD=1 CHESS_STUDIO_CHECKOUT_READY=1 exec /bin/bash "$payload" "$target" "$sha"
