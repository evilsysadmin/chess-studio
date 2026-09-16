#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'usage: oci_existing_a1_deploy.sh <40-char git sha>' >&2
  exit 64
fi

sha="$1"
repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
compose_file="$repo/infra/oci/runtime/docker-compose.yml"
env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}"
state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio}"
state_file="$state_dir/deployed.sha"
project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-staging}"
port="${CHESS_STUDIO_BACKEND_PORT:-4000}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 69; }
}

require git
require docker
require curl
require python3

docker compose version >/dev/null 2>&1 || { echo 'docker compose v2 is required' >&2; exit 69; }
[[ -d "$repo/.git" ]] || { echo "missing repo checkout: $repo" >&2; exit 66; }
[[ -s "$env_file" ]] || { echo "missing runtime env: $env_file" >&2; exit 42; }

install -d -m 0755 "$state_dir"
previous_sha=''
if [[ -s "$state_file" ]]; then
  previous_sha="$(tr -d '\r\n' < "$state_file")"
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || previous_sha=''
fi

compose() {
  local target_sha="$1"
  shift
  GIT_COMMIT_SHA="$target_sha" \
  CHESS_STUDIO_ENV_FILE="$env_file" \
  CHESS_STUDIO_BACKEND_PORT="$port" \
  docker compose -p "$project" -f "$compose_file" "$@"
}

attest() {
  local expected="$1"
  local ready release rc
  ready="$(mktemp)"
  release="$(mktemp)"

  if ! curl --fail --silent --show-error --max-time 8 \
    "http://127.0.0.1:${port}/api/ready" >"$ready"; then
    rm -f "$ready" "$release"
    return 1
  fi
  if ! curl --fail --silent --show-error --max-time 8 \
    "http://127.0.0.1:${port}/api/release" >"$release"; then
    rm -f "$ready" "$release"
    return 1
  fi

  if python3 - "$ready" "$release" "$expected" <<'PY'
import json
import pathlib
import sys
ready = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
release = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8'))
expected = sys.argv[3].lower()
if ready.get('ok') is not True or ready.get('storage') != 'mongo':
    raise SystemExit(1)
if str(release.get('build') or '').lower() != expected:
    raise SystemExit(1)
PY
  then
    rc=0
  else
    rc=$?
  fi
  rm -f "$ready" "$release"
  return "$rc"
}

rollback() {
  local failed_sha="$1"
  if [[ -z "$previous_sha" || "$previous_sha" == "$failed_sha" ]]; then
    echo 'no previous deployment available for rollback' >&2
    return 1
  fi
  if ! docker image inspect "chess-studio-backend:oci-$previous_sha" >/dev/null 2>&1; then
    echo "rollback image missing for $previous_sha" >&2
    return 1
  fi
  echo "rolling back OCI backend to $previous_sha" >&2
  git -C "$repo" checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  compose "$previous_sha" up -d --no-build --force-recreate backend
  for _ in $(seq 1 45); do
    if attest "$previous_sha"; then
      echo "CHESS_STUDIO_ROLLBACK_OK repo_ref=$previous_sha"
      return 0
    fi
    sleep 2
  done
  echo "rollback failed health/build attestation for $previous_sha" >&2
  return 1
}

record_successful_backend() {
  local successful_sha="$1"
  local tmp
  tmp="$(mktemp "$state_dir/deployed.sha.XXXXXX")"
  printf '%s\n' "$successful_sha" >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$state_file"
}

cd "$repo"
git fetch --no-tags --depth=1 origin "$sha"
git checkout --detach "$sha"
[[ -f "$compose_file" ]] || { echo "missing compose runtime in $sha: $compose_file" >&2; exit 66; }

# Telemetry sidecars are deliberately not part of the staging deployment gate.
# Prepare only the exact backend artifact before touching the currently serving
# release; observability can be restored independently once it cannot block P0.
if ! compose "$sha" build --pull backend; then
  [[ -z "$previous_sha" ]] || git checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  exit 1
fi

if ! compose "$sha" up -d --no-build --force-recreate backend; then
  rollback "$sha" || true
  exit 1
fi

for _ in $(seq 1 60); do
  if attest "$sha"; then
    record_successful_backend "$sha"
    echo "CHESS_STUDIO_DEPLOY_OK repo_ref=$sha"
    exit 0
  fi
  sleep 2
done

echo "new deployment failed readiness/build attestation: $sha" >&2
rollback "$sha" || true
exit 43
