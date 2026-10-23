#!/usr/bin/env bash
set -euo pipefail

signal_image="${CHESS_STUDIO_SIGNAL_IMAGE:-ghcr.io/evilsysadmin/chess-studio-backend:oci-staging-approved}"
immutable_prefix="${CHESS_STUDIO_BACKEND_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-backend:oci-}"
expected_source="https://github.com/evilsysadmin/chess-studio"
deploy_wrapper="/usr/local/sbin/chess-studio-deploy"
state_file="${CHESS_STUDIO_STATE_FILE:-/var/lib/chess-studio/deployed.sha}"
lock_file="/run/chess-studio-staging-signal.lock"
deploy_lock_file="/var/lib/chess-studio/deploy.lock"

# Advisory, read-only probe. The root deploy wrapper remains authoritative.
# A busy mutation lock must not queue this 15-second image signal timer behind
# an already-running CI or watcher deployment.
mutation_lock_available() {
  local candidate="$1" fd
  [[ ! -L "$candidate" ]] || return 1
  [[ ! -e "$candidate" ]] && return 0
  [[ -f "$candidate" ]] || return 1
  exec {fd}<"$candidate" || return 1
  if flock -n "$fd"; then
    flock -u "$fd"
    exec {fd}<&-
    return 0
  fi
  exec {fd}<&-
  return 1
}

self_test() (
  set -euo pipefail
  local dir path fd
  dir="$(mktemp -d)"
  trap 'rm -rf -- "$dir"' EXIT
  path="$dir/deploy.lock"
  mutation_lock_available "$path"
  : >"$path"
  mutation_lock_available "$path"
  exec {fd}>"$path"
  flock -n "$fd"
  if mutation_lock_available "$path"; then
    echo 'signal controller: held lock must block a second deploy' >&2
    exit 1
  fi
  flock -u "$fd"
  exec {fd}>&-
  mutation_lock_available "$path"
  ln -s "$path" "$dir/unsafe-link"
  if mutation_lock_available "$dir/unsafe-link"; then
    echo 'signal controller: symlink lock path must not be followed' >&2
    exit 1
  fi
  echo 'signal controller lock self-test: OK'
)

if [[ "${1:-}" == "--self-test" && $# -eq 1 ]]; then
  self_test
  exit 0
fi

command -v docker >/dev/null 2>&1 || { echo 'signal controller: docker missing' >&2; exit 69; }
command -v flock >/dev/null 2>&1 || { echo 'signal controller: flock missing' >&2; exit 69; }
command -v timeout >/dev/null 2>&1 || { echo 'signal controller: timeout missing' >&2; exit 69; }
[[ -x "$deploy_wrapper" ]] || { echo 'signal controller: deploy wrapper missing' >&2; exit 69; }

exec 9>"$lock_file"
flock -n 9 || exit 0

if ! timeout 20 docker pull --quiet "$signal_image" >/dev/null; then
  echo 'signal controller: approved image probe failed' >&2
  exit 75
fi

sha="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$signal_image" 2>/dev/null || true)"
source="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$signal_image" 2>/dev/null || true)"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'signal controller: approved image has invalid revision label' >&2; exit 65; }
[[ "$source" == "$expected_source" ]] || { echo 'signal controller: approved image has unexpected source label' >&2; exit 65; }

current=''
if [[ -s "$state_file" ]]; then
  current="$(tr -d '\r\n' < "$state_file")"
fi
if [[ "$current" == "$sha" ]]; then
  exit 0
fi

immutable_image="${immutable_prefix}${sha}"
if ! timeout 20 docker pull --quiet "$immutable_image" >/dev/null; then
  echo 'signal controller: immutable image missing' >&2
  exit 75
fi

signal_id="$(docker image inspect --format '{{.Id}}' "$signal_image")"
immutable_id="$(docker image inspect --format '{{.Id}}' "$immutable_image")"
[[ -n "$signal_id" && "$signal_id" == "$immutable_id" ]] || {
  echo 'signal controller: approved and immutable image identities differ' >&2
  exit 65
}

# If CI (or the watcher) already owns the mutation lock, defer instead of
# adding another long-lived waiter. The timer will inspect the approved image
# again on its next poll; this is not a successful deployment receipt.
if ! mutation_lock_available "$deploy_lock_file"; then
  echo "CHESS_STUDIO_SIGNAL_DEPLOY_DEFERRED reason=deploy-lock-busy repo_ref=$sha"
  exit 0
fi

echo "CHESS_STUDIO_SIGNAL_DEPLOY repo_ref=$sha"
exec "$deploy_wrapper" "$sha"
