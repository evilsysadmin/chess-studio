#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'usage: oci_existing_a1_deploy.sh <40-char git sha>' >&2
  exit 64
fi

sha="$1"
repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
compose_file="$repo/infra/oci/runtime/docker-compose.yml"
tunnel_connector="$repo/scripts/oci_staging_tunnel_connector.sh"
k3s_capability_provision="$repo/scripts/oci_k3s_capability_provision.sh"
k3s_service_prepare="$repo/scripts/oci_k3s_service_prepare.py"
env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}"
state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio}"
state_file="$state_dir/deployed.sha"
project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-staging}"
port="${CHESS_STUDIO_BACKEND_PORT:-4000}"
staging_origin="${CHESS_STUDIO_STAGING_ORIGIN:-https://staging.chess-studio.shadowops.dpdns.org}"
registry_image_prefix="${CHESS_STUDIO_BACKEND_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-backend:oci-}"

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

image_ref() {
  printf '%s%s' "$registry_image_prefix" "$1"
}

legacy_image_ref() {
  printf 'chess-studio-backend:oci-%s' "$1"
}

image_available_for_rollback() {
  local target_sha="$1"
  docker image inspect "$(image_ref "$target_sha")" >/dev/null 2>&1 || \
    docker image inspect "$(legacy_image_ref "$target_sha")" >/dev/null 2>&1
}

compose() {
  local target_sha="$1"
  shift
  GIT_COMMIT_SHA="$target_sha" \
  CHESS_STUDIO_ENV_FILE="$env_file" \
  CHESS_STUDIO_BACKEND_PORT="$port" \
  CHESS_STUDIO_CORS_ORIGINS="$staging_origin" \
  docker compose -p "$project" -f "$compose_file" "$@"
}

k3s_is_armed() {
  local enabled
  [[ -e "$k3s_start_approval" || -L "$k3s_start_approval" ]] && return 0
  systemctl is-active --quiet k3s.service && return 0
  enabled="$(systemctl is-enabled k3s.service 2>/dev/null || true)"
  [[ "$enabled" =~ ^(enabled|enabled-runtime|linked|linked-runtime)$ ]]
}

k3s_contract_digest() {
  local file
  local files=(
    "$repo/scripts/oci_k3s_capability_provision.sh"
    "$repo/scripts/oci_k3s_assets_root.py"
    "$repo/scripts/oci_k3s_control_root.py"
    "$repo/scripts/oci_k3s_status_root.py"
    "$repo/scripts/oci_k3s_service_prepare.py"
    "$repo/infra/oci/runtime/ocarun.sudoers"
    "$repo/infra/oci/k3s/config.yaml"
    "$repo/infra/oci/k3s/k3s.service"
  )
  for file in "${files[@]}"; do
    [[ -f "$file" && ! -L "$file" ]] || {
      echo "missing K3s deploy-contract input: $file" >&2
      return 1
    }
  done
  sha256sum "${files[@]}" | sha256sum | awk '{print $1}'
}

record_k3s_contract_digest() {
  local digest="$1"
  local tmp
  tmp="$(mktemp "$state_dir/k3s-deploy-contract.sha256.XXXXXX")"
  printf '%s\n' "$digest" >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$k3s_contract_state_file"
}

reconcile_k3s_contract() {
  local digest cached=''
  digest="$(k3s_contract_digest)"
  if [[ -s "$k3s_contract_state_file" ]]; then
    cached="$(tr -d '\r\n' < "$k3s_contract_state_file")"
  fi

  if ! k3s_is_armed && [[ "$cached" == "$digest" ]]; then
    echo "OCI_K3S_DEPLOY_CONTRACT_REUSED digest=$digest"
    return 0
  fi

  /bin/bash "$k3s_capability_provision"
  python3 -S "$k3s_service_prepare"
  record_k3s_contract_digest "$digest"
  echo "OCI_K3S_DEPLOY_CONTRACT_REFRESHED digest=$digest"
}

cors_attest() {
  local headers rc
  headers="$(mktemp)"
  set +e
  curl --fail --silent --show-error --max-time 8 \
    -X OPTIONS \
    -H "Origin: $staging_origin" \
    -H 'Access-Control-Request-Method: GET' \
    -H 'Access-Control-Request-Headers: authorization,x-client-release' \
    -D "$headers" \
    -o /dev/null \
    "http://127.0.0.1:${port}/api/auth/me"
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    rm -f "$headers"
    return "$rc"
  fi
  if ! python3 - "$headers" "$staging_origin" <<'PY'
import pathlib
import sys
headers = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
expected = sys.argv[2].strip().lower()
parsed = {}
for line in headers.replace('\r\n', '\n').split('\n'):
    if ':' not in line:
        continue
    name, value = line.split(':', 1)
    parsed.setdefault(name.strip().lower(), []).append(value.strip())
origins = [v.lower() for v in parsed.get('access-control-allow-origin', [])]
methods = ','.join(parsed.get('access-control-allow-methods', [])).upper()
headers_allowed = ','.join(parsed.get('access-control-allow-headers', [])).lower()
if expected not in origins:
    raise SystemExit(1)
if 'GET' not in methods:
    raise SystemExit(1)
if 'authorization' not in headers_allowed:
    raise SystemExit(1)
PY
  then
    rm -f "$headers"
    return 1
  fi
  rm -f "$headers"
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
  [[ "$rc" -eq 0 ]] || return "$rc"
  cors_attest
}

rollback() {
  local failed_sha="$1"
  if [[ -z "$previous_sha" || "$previous_sha" == "$failed_sha" ]]; then
    echo 'no previous deployment available for rollback' >&2
    return 1
  fi
  if ! image_available_for_rollback "$previous_sha"; then
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
  echo "rollback failed health/build/CORS attestation for $previous_sha" >&2
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
if [[ "${CHESS_STUDIO_CHECKOUT_READY:-0}" == "1" ]]; then
  current_sha="$(git rev-parse HEAD)"
  [[ "$current_sha" == "$sha" ]] || { echo "launcher checkout mismatch: expected $sha, found $current_sha" >&2; exit 66; }
else
  git fetch --no-tags --depth=1 origin "$sha"
  git checkout --detach "$sha"
fi
[[ -f "$compose_file" ]] || { echo "missing compose runtime in $sha: $compose_file" >&2; exit 66; }
[[ -f "$tunnel_connector" && ! -L "$tunnel_connector" ]] || { echo "missing tunnel connector in $sha: $tunnel_connector" >&2; exit 66; }
[[ -f "$k3s_capability_provision" && ! -L "$k3s_capability_provision" ]] || { echo "missing K3s capability provisioner in $sha" >&2; exit 66; }
[[ -f "$k3s_service_prepare" && ! -L "$k3s_service_prepare" ]] || { echo "missing K3s service preparer in $sha" >&2; exit 66; }
/bin/bash "$tunnel_connector" --self-test
reconcile_k3s_contract

# CI already built and published the exact linux/arm64 backend image. Pull that
# immutable artifact before touching the serving container; do not invoke
# BuildKit on the A1 merely to retag an image that already exists in GHCR.
target_image="$(image_ref "$sha")"
if ! docker pull "$target_image"; then
  echo "failed to pull immutable OCI backend image: $target_image" >&2
  [[ -z "$previous_sha" ]] || git checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  exit 1
fi

if ! compose "$sha" up -d --no-build --force-recreate backend; then
  rollback "$sha" || true
  exit 1
fi

for _ in $(seq 1 60); do
  if attest "$sha"; then
    if ! /bin/bash "$tunnel_connector"; then
      echo "OCI backend is healthy but Cloudflare tunnel self-heal failed for $sha" >&2
      exit 46
    fi
    record_successful_backend "$sha"
    echo "CHESS_STUDIO_DEPLOY_OK repo_ref=$sha cors_origin=$staging_origin tunnel=managed-process image=pulled"
    exit 0
  fi
  sleep 2
done

echo "new deployment failed readiness/build/CORS attestation: $sha" >&2
rollback "$sha" || true
exit 43
