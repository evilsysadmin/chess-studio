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
signal_controller_source="$repo/scripts/oci_staging_signal_controller.sh"
signal_service_source="$repo/infra/oci/runtime/chess-studio-staging-signal.service"
signal_timer_source="$repo/infra/oci/runtime/chess-studio-staging-signal.timer"
signal_controller_target="/usr/local/sbin/chess-studio-staging-signal"
signal_service_target="/etc/systemd/system/chess-studio-staging-signal.service"
signal_timer_target="/etc/systemd/system/chess-studio-staging-signal.timer"
deploy_watcher_source="$repo/scripts/oci_staging_deploy_watcher.py"
deploy_watcher_unit_source="$repo/infra/oci/runtime/chess-studio-deploy-watcher.service"
deploy_watcher_target="/usr/local/libexec/chess-studio-deploy-watcher"
deploy_watcher_unit_target="/etc/systemd/system/chess-studio-deploy-watcher.service"
env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}"
state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio}"
state_file="$state_dir/deployed.sha"
deploy_watcher_enable_marker="$state_dir/DEPLOY_WATCH_ENABLED"
k3s_contract_state_file="$state_dir/k3s-deploy-contract.sha256"
k3s_start_approval="/var/lib/chess-studio/K3S_START_APPROVED"
project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-staging}"
port="${CHESS_STUDIO_BACKEND_PORT:-4000}"
staging_origin="${CHESS_STUDIO_STAGING_ORIGIN:-https://staging.chess-studio.shadowops.dpdns.org}"
staging_api_url="${CHESS_STUDIO_STAGING_API_URL:-https://api-staging.chess-studio.shadowops.dpdns.org/api}"
registry_image_prefix="${CHESS_STUDIO_BACKEND_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-backend:oci-}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 69; }
}

now_ms() {
  local seconds micros
  seconds="${EPOCHREALTIME%.*}"
  micros="${EPOCHREALTIME#*.}"
  printf '%s%s\n' "$seconds" "${micros:0:3}"
}

phase_done() {
  local name="$1"
  local started_ms="$2"
  local ended_ms duration_ms
  ended_ms="$(now_ms)"
  duration_ms="$((ended_ms - started_ms))"
  deploy_phase_summary="${deploy_phase_summary:-}${name}:${duration_ms},"
}

require git
require docker
require curl
require python3
require sha256sum
require systemctl
require flock

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

prepare_signal_controller_disabled() {
  install -o root -g root -m 0755 "$signal_controller_source" "$signal_controller_target"
  install -o root -g root -m 0644 "$signal_service_source" "$signal_service_target"
  install -o root -g root -m 0644 "$signal_timer_source" "$signal_timer_target"
  systemctl daemon-reload
  systemctl disable --now chess-studio-staging-signal.timer >/dev/null 2>&1 || true
}

prepare_deploy_watcher() {
  python3 -S "$deploy_watcher_source" --self-test >/dev/null
  install -d -o root -g root -m 0755 /usr/local/libexec
  install -o root -g root -m 0755 "$deploy_watcher_source" "$deploy_watcher_target"
  install -o root -g root -m 0644 "$deploy_watcher_unit_source" "$deploy_watcher_unit_target"
  systemctl daemon-reload
}

enable_deploy_watcher() {
  local marker_tmp
  marker_tmp="$(mktemp "$state_dir/DEPLOY_WATCH_ENABLED.XXXXXX")"
  : >"$marker_tmp"
  chmod 0644 "$marker_tmp"
  mv -f "$marker_tmp" "$deploy_watcher_enable_marker"
  if systemctl enable --now chess-studio-deploy-watcher.service >/dev/null 2>&1; then
    echo 'OCI_DEPLOY_WATCHER state=enabled'
  else
    rm -f "$deploy_watcher_enable_marker"
    echo 'OCI_DEPLOY_WATCHER state=fallback-only' >&2
  fi
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
    "$repo/scripts/oci_k3s_staging2_root.py"
    "$repo/scripts/oci_k3s_service_prepare.py"
    "$repo/infra/oci/runtime/ocarun.sudoers"
    "$repo/infra/oci/k3s/config.yaml"
    "$repo/infra/oci/k3s/k3s.service"
    "$repo/infra/oci/gitops/staging2/backend.yaml.tmpl"
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

run_k3s_reconcile_steps() {
  local log rc
  log="$(mktemp /tmp/chess-studio-k3s-reconcile.XXXXXX)"
  set +e
  { /bin/bash "$k3s_capability_provision" && python3 -S "$k3s_service_prepare"; } >"$log" 2>&1
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    cat "$log" >&2
    rm -f "$log"
    return "$rc"
  fi
  k3s_success_summary="$(awk '
    /^OCI_K3S_ASSET_INTEGRITY_REUSED / {integrity="reused"}
    /^OCI_K3S_ASSET_INTEGRITY_REFRESHED / {integrity="refreshed"}
    /^OCI_K3S_SERVICE_ARMED_UNCHANGED / {service="armed"}
    /^OCI_K3S_SERVICE_PREPARED / {service="prepared"}
    END {printf "integrity=%s,service=%s", integrity ? integrity : "unknown", service ? service : "unknown"}
  ' "$log")"
  rm -f "$log"
}

reconcile_k3s_contract() {
  local digest cached=''
  digest="$(k3s_contract_digest)"
  if [[ -s "$k3s_contract_state_file" ]]; then
    cached="$(tr -d '\r\n' < "$k3s_contract_state_file")"
  fi

  if ! k3s_is_armed && [[ "$cached" == "$digest" ]]; then
    k3s_contract_action="reused"
    return 0
  fi

  run_k3s_reconcile_steps
  record_k3s_contract_digest "$digest"
  k3s_contract_action="refreshed"
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

public_tunnel_attest() {
  local expected="$1"
  local release
  release="$(mktemp)"

  if ! curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 6 \
    -H 'Accept: application/json' \
    -H 'Cache-Control: no-cache' \
    "${staging_api_url}/release?sha=${expected}" >"$release"; then
    rm -f "$release"
    return 1
  fi

  if python3 - "$release" "$expected" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
expected = sys.argv[2].lower()
raise SystemExit(0 if str(payload.get('build') or '').lower() == expected else 1)
PY
  then
    rm -f "$release"
    return 0
  fi
  rm -f "$release"
  return 1
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

agent_diag_summary() {
  local service log version active restarts bytes mtime age now metrics
  local recent_lines poll_errors backoff throttled transport_errors

  service="snap.oracle-cloud-agent.oracle-cloud-agent.service"
  log="/var/log/oracle-cloud-agent/plugins/runcommand/runcommand.log"
  version="unknown"
  if command -v snap >/dev/null 2>&1; then
    version="$(snap list oracle-cloud-agent 2>/dev/null | awk 'NR == 2 {print $2}' | tr -cd 'A-Za-z0-9._+~-' || true)"
    [[ -n "$version" ]] || version="unknown"
  fi

  active="$(systemctl is-active "$service" 2>/dev/null || true)"
  active="$(printf '%s' "$active" | tr -cd 'A-Za-z0-9._-' || true)"
  [[ -n "$active" ]] || active="unknown"

  restarts="$(systemctl show "$service" -p NRestarts --value 2>/dev/null | tr -cd '0-9' || true)"
  [[ -n "$restarts" ]] || restarts="unknown"

  bytes="0"
  age="-1"
  recent_lines="0"
  poll_errors="0"
  backoff="0"
  throttled="0"
  transport_errors="0"

  if [[ -f "$log" && ! -L "$log" ]]; then
    bytes="$(stat -c '%s' "$log" 2>/dev/null || printf '0')"
    mtime="$(stat -c '%Y' "$log" 2>/dev/null || printf '0')"
    now="$(date +%s)"
    if [[ "$mtime" =~ ^[0-9]+$ && "$now" =~ ^[0-9]+$ && "$mtime" -gt 0 ]]; then
      if [[ "$now" -ge "$mtime" ]]; then
        age="$((now - mtime))"
      else
        age="0"
      fi
    fi
    metrics="$(tail -n 2000 "$log" 2>/dev/null | awk '
      BEGIN { IGNORECASE=1 }
      {
        lines++
        if ($0 ~ /poll/ && $0 ~ /(error|fail|timeout)/) poll_errors++
        if ($0 ~ /(circuit.?breaker|backoff)/) backoff++
        if ($0 ~ /(^|[^0-9])429([^0-9]|$)|throttl/) throttled++
        if ($0 ~ /(502|503|504|connection reset|connection refused|temporary failure|service unavailable)/) transport_errors++
      }
      END {
        printf "%d,%d,%d,%d,%d", lines+0, poll_errors+0, backoff+0, throttled+0, transport_errors+0
      }
    ' || printf '0,0,0,0,0')"
    IFS=',' read -r recent_lines poll_errors backoff throttled transport_errors <<<"$metrics"
  fi

  printf 'OCI_AGENT_DIAG version=%s active=%s restarts=%s log_bytes=%s log_age_s=%s recent_lines=%s poll_errors=%s backoff=%s throttled=%s transport_errors=%s\n' \
    "$version" "$active" "$restarts" "$bytes" "$age" "$recent_lines" "$poll_errors" "$backoff" "$throttled" "$transport_errors"
}

deploy_lock_file="$state_dir/deploy.lock"
exec 8>"$deploy_lock_file"
if ! flock -w 120 8; then
  echo 'timed out waiting for host deploy lock' >&2
  exit 75
fi

previous_sha=''
if [[ -s "$state_file" ]]; then
  previous_sha="$(tr -d '\r\n' < "$state_file")"
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || previous_sha=''
fi
total_started_ms="$(now_ms)"
checkout_started_ms="$total_started_ms"
cd "$repo"
if [[ "${CHESS_STUDIO_CHECKOUT_READY:-0}" == "1" ]]; then
  current_sha="$(git rev-parse HEAD)"
  [[ "$current_sha" == "$sha" ]] || { echo "launcher checkout mismatch: expected $sha, found $current_sha" >&2; exit 66; }
else
  git fetch --no-tags --depth=1 origin "$sha"
  git checkout --detach "$sha"
fi
phase_done checkout "$checkout_started_ms"
preflight_started_ms="$(now_ms)"
[[ -f "$compose_file" ]] || { echo "missing compose runtime in $sha: $compose_file" >&2; exit 66; }
[[ -f "$tunnel_connector" && ! -L "$tunnel_connector" ]] || { echo "missing tunnel connector in $sha: $tunnel_connector" >&2; exit 66; }
[[ -f "$k3s_capability_provision" && ! -L "$k3s_capability_provision" ]] || { echo "missing K3s capability provisioner in $sha" >&2; exit 66; }
[[ -f "$k3s_service_prepare" && ! -L "$k3s_service_prepare" ]] || { echo "missing K3s service preparer in $sha" >&2; exit 66; }
[[ -f "$signal_controller_source" && ! -L "$signal_controller_source" ]] || { echo "missing staging signal controller in $sha" >&2; exit 66; }
[[ -f "$signal_service_source" && ! -L "$signal_service_source" ]] || { echo "missing staging signal service in $sha" >&2; exit 66; }
[[ -f "$signal_timer_source" && ! -L "$signal_timer_source" ]] || { echo "missing staging signal timer in $sha" >&2; exit 66; }
[[ -f "$deploy_watcher_source" && ! -L "$deploy_watcher_source" ]] || { echo "missing zero-cost deploy watcher in $sha" >&2; exit 66; }
[[ -f "$deploy_watcher_unit_source" && ! -L "$deploy_watcher_unit_source" ]] || { echo "missing zero-cost deploy watcher unit in $sha" >&2; exit 66; }
prepare_signal_controller_disabled
prepare_deploy_watcher
/bin/bash "$tunnel_connector" --self-test >/dev/null
phase_done preflight "$preflight_started_ms"
k3s_started_ms="$(now_ms)"
reconcile_k3s_contract
phase_done k3s "$k3s_started_ms"

# CI already built and published the exact linux/arm64 backend image. Pull that
# immutable artifact before touching the serving container; do not invoke
# BuildKit on the A1 merely to retag an image that already exists in GHCR.
target_image="$(image_ref "$sha")"
image_pull_started_ms="$(now_ms)"
if ! docker pull --quiet "$target_image" >/dev/null; then
  echo "failed to pull immutable OCI backend image: $target_image" >&2
  [[ -z "$previous_sha" ]] || git checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  exit 1
fi
phase_done image_pull "$image_pull_started_ms"

recreate_started_ms="$(now_ms)"
compose_log="$(mktemp /tmp/chess-studio-compose-up.XXXXXX)"
if ! compose "$sha" up -d --no-build --force-recreate backend >"$compose_log" 2>&1; then
  cat "$compose_log" >&2
  rm -f "$compose_log"
  rollback "$sha" || true
  exit 1
fi
rm -f "$compose_log"
phase_done recreate "$recreate_started_ms"

readiness_started_ms="$(now_ms)"
for _ in $(seq 1 60); do
  if attest "$sha"; then
    phase_done readiness "$readiness_started_ms"
    tunnel_started_ms="$(now_ms)"
    tunnel_action="reused"
    if public_tunnel_attest "$sha"; then
      :
    else
      tunnel_action="restarted"
      if ! /bin/bash "$tunnel_connector"; then
        echo "OCI backend is healthy but Cloudflare tunnel self-heal failed for $sha" >&2
        exit 46
      fi
    fi
    phase_done tunnel "$tunnel_started_ms"
    record_successful_backend "$sha"
    enable_deploy_watcher
    agent_diag_summary || printf '%s\n' 'OCI_AGENT_DIAG unavailable'
    phase_done total "$total_started_ms"
    printf 'OCI_DEPLOY_TIMINGS phases=%s k3s=%s,contract=%s tunnel=%s\n' "${deploy_phase_summary%,}" "${k3s_success_summary:-integrity=unknown,service=unknown}" "${k3s_contract_action:-unknown}" "$tunnel_action"
    echo "CHESS_STUDIO_DEPLOY_OK repo_ref=$sha cors_origin=$staging_origin tunnel=managed-process tunnel_action=$tunnel_action image=pulled"
    exit 0
  fi
  sleep 2
done

echo "new deployment failed readiness/build/CORS attestation: $sha" >&2
rollback "$sha" || true
exit 43
