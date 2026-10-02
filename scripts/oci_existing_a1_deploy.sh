#!/usr/bin/env bash
set -euo pipefail

target=staging
if [[ $# -eq 1 && "$1" =~ ^[0-9a-f]{40}$ ]]; then
  sha="$1"
elif [[ $# -eq 2 && "$1" =~ ^(staging|production)$ && "$2" =~ ^[0-9a-f]{40}$ ]]; then
  target="$1"
  sha="$2"
else
  echo 'usage: oci_existing_a1_deploy.sh [staging|production] <40-char git sha>' >&2
  exit 64
fi
repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
compose_file="$repo/infra/oci/runtime/docker-compose.yml"
source_launcher="$repo/scripts/oci_staging_deploy_launcher.sh"
target_launcher="/usr/local/sbin/chess-studio-deploy"
source_runtime_installer="$repo/scripts/oci_runtime_install.sh"
target_runtime_installer="/usr/local/sbin/chess-studio-install-runtime"
mongo_backup_source="$repo/scripts/oci_production_mongo_backup.sh"
mongo_backup_target="/usr/local/sbin/chess-studio-mongo-backup"
ocarun_sudoers_source="$repo/infra/oci/runtime/ocarun.sudoers"
ocarun_sudoers_target="/etc/sudoers.d/101-chess-studio-ocarun"
tunnel_connector="$repo/scripts/oci_staging_tunnel_connector.sh"
blue_green_edge="$repo/scripts/oci_blue_green_edge.py"
otel_log_probe="$repo/scripts/otel_log_ingest_probe.py"
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
registry_image_prefix="${CHESS_STUDIO_BACKEND_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-backend:oci-}"
pvp_registry_image_prefix="${CHESS_STUDIO_PVP_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-pvp:oci-}"

case "$target" in
  staging)
    env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}"
    state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio}"
    project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-staging}"
    port="${CHESS_STUDIO_BACKEND_PORT:-4000}"
    cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"
    public_api_url="${CHESS_STUDIO_PUBLIC_API_URL:-https://api-staging.chess-studio.shadowops.dpdns.org/api}"
    ;;
  production)
    env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/production/backend.env}"
    state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio-production}"
    project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-production}"
    port="${CHESS_STUDIO_BACKEND_PORT:-4100}"
    cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://chess-studio.shadowops.dpdns.org}"
    public_api_url="${CHESS_STUDIO_PUBLIC_API_URL:-https://api.chess-studio.shadowops.dpdns.org/api}"
    ;;
esac

if [[ "$target" == "staging" ]]; then
  pvp_sparring_enabled=true
else
  pvp_sparring_enabled=false
fi
pvp_sparring_owner="${CHESS_PVP_SPARRING_OWNER:-evilsysadmin}"
pvp_sparring_username="${CHESS_PVP_SPARRING_USERNAME:-sparringmeister}"

state_file="$state_dir/deployed.sha"
active_color_file="$state_dir/active.color"
edge_config_dir="$state_dir/edge"
edge_config_file="$edge_config_dir/default.conf"
observability_dir="$state_dir/observability"
backend_log_link="$observability_dir/backend-json.log"
deploy_watcher_enable_marker="$state_dir/DEPLOY_WATCH_ENABLED"

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
require visudo

docker compose version >/dev/null 2>&1 || { echo 'docker compose v2 is required' >&2; exit 69; }
[[ -d "$repo/.git" ]] || { echo "missing repo checkout: $repo" >&2; exit 66; }
[[ -s "$env_file" ]] || { echo "missing runtime env: $env_file" >&2; exit 42; }

install -d -m 0755 "$state_dir"
install -d -m 0755 "$edge_config_dir"
install -d -m 0755 "$observability_dir"
previous_sha=''
if [[ -s "$state_file" ]]; then
  previous_sha="$(tr -d '\r\n' < "$state_file")"
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] || previous_sha=''
fi

image_ref() {
  printf '%s%s' "$registry_image_prefix" "$1"
}

pvp_image_ref() {
  printf '%s%s' "$pvp_registry_image_prefix" "$1"
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
  if systemctl enable --now chess-studio-deploy-watcher.service >/dev/null 2>&1 && \
     systemctl is-active --quiet chess-studio-deploy-watcher.service; then
    echo 'OCI_DEPLOY_WATCHER state=enabled'
  else
    # Never leave a broken watcher in Restart=always purgatory. The Oracle
    # Run Command fallback remains authoritative until the next successful
    # staging deploy refreshes and starts the watcher cleanly.
    systemctl disable --now chess-studio-deploy-watcher.service >/dev/null 2>&1 || true
    rm -f "$deploy_watcher_enable_marker"
    echo 'OCI_DEPLOY_WATCHER state=fallback-only' >&2
  fi
}

deploy_watcher_diag_summary() {
  local active enabled marker restarts main_status metrics
  active="$(systemctl is-active chess-studio-deploy-watcher.service 2>/dev/null || true)"
  enabled="$(systemctl is-enabled chess-studio-deploy-watcher.service 2>/dev/null || true)"
  restarts="$(systemctl show chess-studio-deploy-watcher.service -p NRestarts --value 2>/dev/null | tr -cd '0-9' || true)"
  main_status="$(systemctl show chess-studio-deploy-watcher.service -p ExecMainStatus --value 2>/dev/null | tr -cd '0-9' || true)"
  marker=0
  if [[ -f "$deploy_watcher_enable_marker" && ! -L "$deploy_watcher_enable_marker" ]]; then
    marker=1
  fi
  [[ -n "$active" ]] || active=unknown
  [[ -n "$enabled" ]] || enabled=unknown
  [[ -n "$restarts" ]] || restarts=unknown
  [[ -n "$main_status" ]] || main_status=unknown
  metrics="$(journalctl -u chess-studio-deploy-watcher.service -n 200 --no-pager -o cat 2>/dev/null | awk '
    /OCI_DEPLOY_WATCH_ERROR/ { errors++ }
    /OCI_DEPLOY_WATCH_IMAGE_PENDING/ { image_pending++ }
    /OCI_DEPLOY_WATCH_TRIGGER/ { triggers++ }
    /OCI_DEPLOY_WATCH_OK/ { ok++ }
    /OCI_DEPLOY_WATCH_SUPERSEDED/ { superseded++ }
    END {
      printf "errors=%d image_pending=%d triggers=%d ok=%d superseded=%d", errors, image_pending, triggers, ok, superseded
    }
  ' || true)"
  [[ -n "$metrics" ]] || metrics='errors=0 image_pending=0 triggers=0 ok=0 superseded=0'
  echo "OCI_DEPLOY_WATCHER_DIAG active=$active enabled=$enabled marker=$marker restarts=$restarts main_status=$main_status $metrics"
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
  CHESS_STUDIO_BLUE_SHA="$target_sha" \
  CHESS_STUDIO_GREEN_SHA="$target_sha" \
  CHESS_STUDIO_LEGACY_SHA="${previous_sha:-$target_sha}" \
  CHESS_STUDIO_ENV_FILE="$env_file" \
  CHESS_STUDIO_BACKEND_PORT="$port" \
  CHESS_STUDIO_BLUE_PORT="$((port + 1))" \
  CHESS_STUDIO_GREEN_PORT="$((port + 2))" \
  CHESS_STUDIO_EDGE_CONFIG_DIR="$edge_config_dir" \
  CHESS_STUDIO_CORS_ORIGINS="$cors_origin" \
  CHESS_STUDIO_STATE_DIR="$state_dir" \
  CHESS_STUDIO_TRUST_CLOUDFLARE_CLIENT_IP="true" \
  CHESS_PVP_SPARRING_ENABLED="$pvp_sparring_enabled" \
  CHESS_PVP_SPARRING_OWNER="$pvp_sparring_owner" \
  CHESS_PVP_SPARRING_USERNAME="$pvp_sparring_username" \
  CHESS_STUDIO_OCI_LOG_SERVICE_NAME="chess-studio-oci-backend-${target}-stdout" \
  docker compose -p "$project" -f "$compose_file" "$@"
}

slot_service() {
  case "$1" in
    blue|green) printf 'backend_%s\n' "$1" ;;
    *) echo "invalid backend color: $1" >&2; return 64 ;;
  esac
}

pvp_service() {
  case "$1" in
    blue|green) printf 'pvp_%s\n' "$1" ;;
    *) echo "invalid PvP color: $1" >&2; return 64 ;;
  esac
}

slot_port() {
  case "$1" in
    blue) printf '%s\n' "$((port + 1))" ;;
    green) printf '%s\n' "$((port + 2))" ;;
    *) echo "invalid backend color: $1" >&2; return 64 ;;
  esac
}

opposite_color() {
  case "$1" in
    blue) printf 'green\n' ;;
    green) printf 'blue\n' ;;
    *) echo "invalid backend color: $1" >&2; return 64 ;;
  esac
}

read_active_color() {
  local value=''
  if [[ -s "$active_color_file" && ! -L "$active_color_file" ]]; then
    value="$(tr -d '\r\n' < "$active_color_file")"
  fi
  case "$value" in
    blue|green) printf '%s\n' "$value" ;;
    *) printf '\n' ;;
  esac
}

write_active_color() {
  local color="$1"
  local tmp
  case "$color" in blue|green) ;; *) return 64 ;; esac
  tmp="$(mktemp "$state_dir/active.color.XXXXXX")"
  printf '%s\n' "$color" >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$active_color_file"
}

render_edge() {
  local color="$1"
  local pvp_mode="${2:-go}"
  python3 -S "$blue_green_edge" --color "$color" --pvp-mode "$pvp_mode" --output "$edge_config_file"
}

edge_container_id() {
  compose "$sha" ps -q edge 2>/dev/null | head -n 1
}

reload_edge() {
  local edge_id
  edge_id="$(edge_container_id)"
  [[ -n "$edge_id" ]] || { echo 'edge container missing' >&2; return 1; }
  docker exec "$edge_id" nginx -t >/dev/null
  docker exec "$edge_id" nginx -s reload >/dev/null
}

remove_service() {
  local service="$1"
  compose "$sha" rm -f -s "$service" >/dev/null 2>&1 || true
}

cors_attest() {
  local target_port="$1"
  local headers rc
  headers="$(mktemp)"
  set +e
  curl --fail --silent --show-error --max-time 8 \
    -X OPTIONS \
    -H "Origin: $cors_origin" \
    -H 'Access-Control-Request-Method: GET' \
    -H 'Access-Control-Request-Headers: authorization,x-client-release' \
    -D "$headers" \
    -o /dev/null \
    "http://127.0.0.1:${target_port}/api/auth/me"
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    rm -f "$headers"
    return "$rc"
  fi
  if ! python3 - "$headers" "$cors_origin" <<'PY'
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
  local target_port="${2:-$port}"
  local ready release rc
  ready="$(mktemp)"
  release="$(mktemp)"

  if ! curl --fail --silent --show-error --max-time 8 \
    "http://127.0.0.1:${target_port}/api/ready" >"$ready"; then
    rm -f "$ready" "$release"
    return 1
  fi
  if ! curl --fail --silent --show-error --max-time 8 \
    "http://127.0.0.1:${target_port}/api/release" >"$release"; then
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
  cors_attest "$target_port"
}

pvp_attest() {
  local service="$1"
  local body
  body="$(mktemp)"
  if ! compose "$sha" exec -T "$service" wget -q -O - http://127.0.0.1:8080/readyz >"$body"; then
    rm -f "$body"
    return 1
  fi
  if python3 - "$body" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
env = __import__('os').environ
expected_native = str(env.get('CHESS_STUDIO_PVP_NATIVE_PULSE_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_roster = str(env.get('CHESS_STUDIO_PVP_NATIVE_ROSTER_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_chat = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHAT_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_challenge_resolution = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHALLENGE_RESOLUTION_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_handoff_cancel = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_HANDOFF_CANCEL_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_ready = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_READY_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
if (
    payload.get('status') != 'ready'
    or payload.get('service') != 'chess-studio-pvp-go'
    or bool(payload.get('nativePulse')) != expected_native
    or bool(payload.get('nativeRoster')) != expected_roster
    or bool(payload.get('nativeChat')) != expected_chat
    or bool(payload.get('nativeChallengeResolution')) != expected_challenge_resolution
    or bool(payload.get('nativeMatchHandoffCancel')) != expected_match_handoff_cancel
    or bool(payload.get('nativeMatchReady')) != expected_match_ready
):
    raise SystemExit(1)
PY
  then
    rm -f "$body"
    return 0
  fi
  rm -f "$body"
  return 1
}

pvp_edge_attest() {
  local target_port="${1:-$port}"
  local headers body status
  headers="$(mktemp)"
  body="$(mktemp)"
  if ! status="$(curl --silent --show-error --max-time 8 \
      -D "$headers" -o "$body" -w "%{http_code}" \
      -H 'Accept: application/json' -H 'Cache-Control: no-cache' \
      "http://127.0.0.1:${target_port}/api/pvp/_edge/ready")"; then
    rm -f "$headers" "$body"
    return 1
  fi
  if [[ "$status" != "200" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$headers" || \
     ! python3 - "$body" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
if payload.get('status') != 'ready' or payload.get('service') != 'chess-studio-pvp-go':
    raise SystemExit(1)
PY
  then
    rm -f "$headers" "$body"
    return 1
  fi
  rm -f "$headers" "$body"
  return 0
}

pvp_browser_cors_attest() {
  local target_port="${1:-$port}"
  local headers status
  headers="$(mktemp)"
  if ! status="$(curl --silent --show-error --max-time 8 \
      -X OPTIONS \
      -H "Origin: $cors_origin" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: authorization,x-client-release' \
      -D "$headers" -o /dev/null -w "%{http_code}" \
      "http://127.0.0.1:${target_port}/api/pvp/roster")"; then
    rm -f "$headers"
    return 1
  fi
  if [[ "$status" != "204" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$headers" || \
     ! python3 - "$headers" "$cors_origin" <<'PY'
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
allowed_headers = ','.join(parsed.get('access-control-allow-headers', [])).lower()
if expected not in origins:
    raise SystemExit(1)
for required_method in ('POST', 'DELETE'):
    if required_method not in methods:
        raise SystemExit(1)
for required_header in ('authorization', 'x-client-release'):
    if required_header not in allowed_headers:
        raise SystemExit(1)
PY
  then
    rm -f "$headers"
    return 1
  fi
  rm -f "$headers"
  return 0
}

wait_pvp_edge_attest() {
  local target_port="${1:-$port}"
  local attempts="${CHESS_STUDIO_PVP_EDGE_ATTEST_ATTEMPTS:-20}"
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if pvp_edge_attest "$target_port"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

public_tunnel_attest() {
  local expected="$1"
  local release
  release="$(mktemp)"

  if ! curl --fail --silent --show-error \
    --connect-timeout 3 --max-time 6 \
    -H 'Accept: application/json' \
    -H 'Cache-Control: no-cache' \
    "${public_api_url}/release?sha=${expected}" >"$release"; then
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
  local candidate_service="${candidate_service:-}"
  local candidate_pvp_service="${candidate_pvp_service:-}"
  echo "rolling back OCI backend after failed candidate $failed_sha" >&2

  if [[ -n "${previous_color:-}" ]]; then
    # Emergency rollback deliberately bypasses Go. The previous deployed SHA
    # may predate the PvP sidecar image entirely during the first migration.
    render_edge "$previous_color" direct
    # Safe both before and after the attempted switch: if edge is still on the
    # old config this is a no-op; if reload partially succeeded, this actively
    # restores the previous upstream.
    reload_edge || true
    write_active_color "$previous_color"
    if [[ -n "$previous_sha" ]]; then
      record_successful_backend "$previous_sha"
    fi
    if [[ -n "$candidate_service" ]]; then
      if [[ "${switch_complete:-0}" == "1" ]]; then
        sleep "${CHESS_STUDIO_BLUE_GREEN_DRAIN_SECONDS:-50}"
      fi
      remove_service "$candidate_service"
      [[ -z "$candidate_pvp_service" ]] || remove_service "$candidate_pvp_service"
    fi
    echo "CHESS_STUDIO_ROLLBACK_OK repo_ref=${previous_sha:-unknown} color=$previous_color pvp=python-direct"
    return 0
  fi

  if [[ "${switch_complete:-0}" == "1" && -n "$previous_sha" ]] && image_available_for_rollback "$previous_sha"; then
    compose "$failed_sha" rm -f -s edge >/dev/null 2>&1 || true
    compose "$previous_sha" up -d --no-build --force-recreate backend_legacy
    for _ in $(seq 1 45); do
      if attest "$previous_sha" "$port"; then
        rm -f "$active_color_file"
        record_successful_backend "$previous_sha"
        [[ -z "$candidate_service" ]] || remove_service "$candidate_service"
        [[ -z "$candidate_pvp_service" ]] || remove_service "$candidate_pvp_service"
        echo "CHESS_STUDIO_ROLLBACK_OK repo_ref=$previous_sha color=legacy pvp=python-direct"
        return 0
      fi
      sleep 2
    done
  fi

  [[ -z "$candidate_service" ]] || remove_service "$candidate_service"
  [[ -z "$candidate_pvp_service" ]] || remove_service "$candidate_pvp_service"
  echo 'rollback could not restore a previous backend' >&2
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

prepare_backend_log_link() {
  local target_sha="$1"
  local container_id log_path

  if [[ -L "$observability_dir" ]]; then
    echo "OCI_LOGS state=degraded target=$target reason=observability-dir-symlink" >&2
    return 1
  fi

  container_id="$(compose "$target_sha" ps -q "${active_backend_service:-backend}" 2>/dev/null | head -n 1)"
  if [[ -z "$container_id" ]]; then
    echo "OCI_LOGS state=degraded target=$target reason=backend-container-missing" >&2
    return 1
  fi

  log_path="$(docker inspect --format '{{.LogPath}}' "$container_id" 2>/dev/null || true)"
  case "$log_path" in
    /var/lib/docker/containers/*/*-json.log) ;;
    *)
      echo "OCI_LOGS state=degraded target=$target reason=unexpected-log-path" >&2
      return 1
      ;;
  esac
  if [[ ! -f "$log_path" || -L "$log_path" ]]; then
    echo "OCI_LOGS state=degraded target=$target reason=backend-log-unreadable" >&2
    return 1
  fi

  rm -f "$backend_log_link"
  ln -s "$log_path" "$backend_log_link"
  echo "CHESS_STUDIO_OCI_LOG_LINK_OK target=$target"
}

prepare_alloy_filelog_probe() {
  local target_sha="$1"
  local stale_probe probe_file

  for stale_probe in "$observability_dir"/alloy-probe-*-json.log; do
    [[ -e "$stale_probe" || -L "$stale_probe" ]] || continue
    if [[ -L "$stale_probe" ]]; then
      echo "OCI_LOGS state=degraded target=$target reason=probe-symlink" >&2
      return 1
    fi
    rm -f -- "$stale_probe"
  done

  probe_file="$observability_dir/alloy-probe-${target_sha}-json.log"
  : >"$probe_file"
  chmod 0644 "$probe_file"
  echo "CHESS_STUDIO_ALLOY_PROBE_READY target=$target repo_ref=$target_sha"
}

emit_alloy_filelog_probe() {
  local target_sha="$1"
  local probe_file="$observability_dir/alloy-probe-${target_sha}-json.log"

  [[ -f "$probe_file" && ! -L "$probe_file" ]] || {
    echo "OCI_LOGS state=degraded target=$target reason=probe-file-missing" >&2
    return 1
  }

  python3 - "$probe_file" "$target_sha" "$target" <<'PY'
import datetime
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
repo_ref = sys.argv[2]
target = sys.argv[3]
body = json.dumps(
    {"event": "oci_alloy_probe", "repo_ref": repo_ref, "target": target},
    separators=(",", ":"),
    sort_keys=True,
)
entry = {
    "log": body + "\n",
    "stream": "stdout",
    "time": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
}
with path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry, separators=(",", ":"), sort_keys=True) + "\n")
    handle.flush()
PY
  echo "CHESS_STUDIO_ALLOY_PROBE_EMITTED target=$target repo_ref=$target_sha"
}

start_observability_best_effort() {
  local target_sha="$1"
  local alloy_image="grafana/alloy:v1.19.2"
  local backend_log_ready=0
  local probe_ready=0
  local direct_log_probe_ready=0

  observability_summary="starting"

  if ! grep -Eq '^OTEL_EXPORTER_OTLP_ENDPOINT=.+' "$env_file" || \
     ! grep -Eq '^OTEL_EXPORTER_OTLP_HEADERS=.+' "$env_file"; then
    observability_summary="skipped-otel-runtime"
    echo "OCI_ALLOY state=skipped target=$target reason=otel-runtime-missing"
    return 0
  fi
  if [[ ! -f "$repo/infra/oci/runtime/alloy.alloy" ]]; then
    observability_summary="config-missing"
    echo "OCI_ALLOY state=degraded target=$target reason=config-missing" >&2
    return 0
  fi

  if python3 -S "$otel_log_probe" \
      --env-file "$env_file" \
      --service-name "chess-studio-oci-log-probe-$target" \
      --environment "$target" \
      --service-version "$target_sha"; then
    direct_log_probe_ready=1
    echo "CHESS_STUDIO_OTLP_LOG_PROBE_OK target=$target repo_ref=$target_sha"
  else
    echo "OCI_LOGS state=degraded target=$target reason=direct-otlp-log-probe-failed" >&2
  fi

  if prepare_backend_log_link "$target_sha"; then
    backend_log_ready=1
  else
    echo "OCI_LOGS state=degraded target=$target reason=backend-log-link-unavailable" >&2
  fi
  if prepare_alloy_filelog_probe "$target_sha"; then
    probe_ready=1
  else
    echo "OCI_LOGS state=degraded target=$target reason=probe-prepare-failed" >&2
  fi

  if ! docker image inspect "$alloy_image" >/dev/null 2>&1; then
    if ! compose "$target_sha" pull alloy >/dev/null; then
      observability_summary="image-pull-failed"
      echo "OCI_ALLOY state=degraded target=$target reason=image-pull-failed" >&2
      return 0
    fi
  fi
  alloy_validate_log="$(mktemp /tmp/chess-studio-alloy-validate.XXXXXX)"
  if ! compose "$target_sha" run --rm --no-deps alloy validate --stability.level=public-preview /etc/alloy/config.alloy >"$alloy_validate_log" 2>&1; then
    observability_summary="config-invalid"
    echo "OCI_ALLOY state=degraded target=$target reason=config-invalid" >&2
    sed -E \
      -e 's/(Authorization=)[^[:space:]]+/\\1[redacted]/Ig' \
      -e 's/(Basic[[:space:]]+)[A-Za-z0-9+\/_=.-]+/\\1[redacted]/Ig' \
      "$alloy_validate_log" | tail -n 40 >&2 || true
    rm -f "$alloy_validate_log"
    return 0
  fi
  rm -f "$alloy_validate_log"
  if ! compose "$target_sha" up -d --no-build --force-recreate alloy >/dev/null 2>&1; then
    observability_summary="start-failed"
    echo "OCI_ALLOY state=degraded target=$target reason=start-failed" >&2
    return 0
  fi

  for _alloy_attempt in $(seq 1 12); do
    if compose "$target_sha" ps --status running --services 2>/dev/null | grep -Fxq alloy; then
      echo "CHESS_STUDIO_ALLOY_OK target=$target repo_ref=$target_sha"
      if [[ "$probe_ready" -eq 1 ]] && emit_alloy_filelog_probe "$target_sha"; then
        if [[ "$direct_log_probe_ready" -ne 1 ]]; then
          observability_summary="direct-log-probe-degraded"
        elif [[ "$backend_log_ready" -eq 1 ]]; then
          observability_summary="ok"
        else
          observability_summary="probe-ok-backend-log-degraded"
        fi
      else
        observability_summary="alloy-running-probe-degraded"
      fi
      return 0
    fi
    sleep 1
  done

  observability_summary="not-running"
  echo "OCI_ALLOY state=degraded target=$target reason=not-running" >&2
  compose "$target_sha" logs --no-color --tail=40 alloy >&2 || true
  return 0
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

deploy_lock_file="/var/lib/chess-studio/deploy.lock"
exec 8>"$deploy_lock_file"
if ! flock -w 120 8; then
  echo 'timed out waiting for host deploy lock' >&2
  exit 75
fi

# GitHub Actions cancellation cannot retract a Run Command already accepted by
# OCI. Re-check main after acquiring the host mutation lock so a late, obsolete
# staging command can never overwrite a newer generation.
if [[ "$target" == staging ]]; then
  if ! current_main="$(git -C "$repo" ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 {print $1}')"; then
    echo 'failed to resolve current origin/main before staging mutation' >&2
    exit 69
  fi
  [[ "$current_main" =~ ^[0-9a-f]{40}$ ]] || {
    echo "invalid current origin/main SHA: ${current_main:-<empty>}" >&2
    exit 69
  }
  if [[ "$sha" != "$current_main" ]]; then
    echo "OCI_DEPLOY_SUPERSEDED repo_ref=$sha current_main=$current_main"
    exit 0
  fi
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
[[ -f "$otel_log_probe" && ! -L "$otel_log_probe" ]] || { echo "missing OTLP log probe in $sha: $otel_log_probe" >&2; exit 66; }
[[ -f "$blue_green_edge" && ! -L "$blue_green_edge" ]] || { echo "missing blue/green edge renderer in $sha" >&2; exit 66; }
python3 -S "$otel_log_probe" --self-test >/dev/null
python3 -S "$blue_green_edge" --self-test >/dev/null
[[ -f "$source_launcher" && ! -L "$source_launcher" ]] || { echo "missing deploy launcher in $sha: $source_launcher" >&2; exit 66; }
[[ -f "$source_runtime_installer" && ! -L "$source_runtime_installer" ]] || { echo "missing runtime installer in $sha: $source_runtime_installer" >&2; exit 66; }
[[ -f "$mongo_backup_source" && ! -L "$mongo_backup_source" ]] || { echo "missing production Mongo backup helper in $sha" >&2; exit 66; }
[[ -f "$ocarun_sudoers_source" && ! -L "$ocarun_sudoers_source" ]] || { echo "missing ocarun sudoers contract in $sha" >&2; exit 66; }
visudo -cf "$ocarun_sudoers_source" >/dev/null
install -o root -g root -m 0755 "$source_launcher" "$target_launcher"
install -o root -g root -m 0755 "$source_runtime_installer" "$target_runtime_installer"
install -o root -g root -m 0755 "$mongo_backup_source" "$mongo_backup_target"
install -o root -g root -m 0440 "$ocarun_sudoers_source" "$ocarun_sudoers_target"
visudo -cf "$ocarun_sudoers_target" >/dev/null

if [[ "$target" == staging ]]; then
  [[ -f "$tunnel_connector" && ! -L "$tunnel_connector" ]] || { echo "missing tunnel connector in $sha: $tunnel_connector" >&2; exit 66; }
  [[ -f "$signal_controller_source" && ! -L "$signal_controller_source" ]] || { echo "missing staging signal controller in $sha" >&2; exit 66; }
  [[ -f "$signal_service_source" && ! -L "$signal_service_source" ]] || { echo "missing staging signal service in $sha" >&2; exit 66; }
  [[ -f "$signal_timer_source" && ! -L "$signal_timer_source" ]] || { echo "missing staging signal timer in $sha" >&2; exit 66; }
  [[ -f "$deploy_watcher_source" && ! -L "$deploy_watcher_source" ]] || { echo "missing zero-cost deploy watcher in $sha" >&2; exit 66; }
  [[ -f "$deploy_watcher_unit_source" && ! -L "$deploy_watcher_unit_source" ]] || { echo "missing zero-cost deploy watcher unit in $sha" >&2; exit 66; }
  prepare_signal_controller_disabled
  prepare_deploy_watcher
  /bin/bash "$tunnel_connector" --self-test >/dev/null
fi
phase_done preflight "$preflight_started_ms"
# CI already built and published the exact linux/arm64 backend image. Pull that
# immutable artifact before touching the serving container; do not invoke
# BuildKit on the A1 merely to retag an image that already exists in GHCR.
target_image="$(image_ref "$sha")"
pvp_target_image="$(pvp_image_ref "$sha")"
image_pull_started_ms="$(now_ms)"
if ! docker pull --quiet "$target_image" >/dev/null; then
  echo "failed to pull immutable OCI backend image: $target_image" >&2
  [[ -z "$previous_sha" ]] || git checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  exit 1
fi
if ! docker pull --quiet "$pvp_target_image" >/dev/null; then
  echo "failed to pull immutable PvP Go image: $pvp_target_image" >&2
  [[ -z "$previous_sha" ]] || git checkout --detach "$previous_sha" >/dev/null 2>&1 || true
  exit 1
fi
phase_done image_pull "$image_pull_started_ms"

recreate_started_ms="$(now_ms)"
previous_color="$(read_active_color)"
if [[ -n "$previous_color" ]]; then
  candidate_color="$(opposite_color "$previous_color")"
else
  candidate_color=blue
fi
candidate_service="$(slot_service "$candidate_color")"
candidate_pvp_service="$(pvp_service "$candidate_color")"
candidate_port="$(slot_port "$candidate_color")"
active_backend_service="$candidate_service"
switch_complete=0

if ! compose "$sha" pull edge >/dev/null; then
  echo 'failed to pull stable blue/green edge image' >&2
  exit 1
fi

compose_log="$(mktemp /tmp/chess-studio-compose-up.XXXXXX)"
if ! compose "$sha" up -d --no-build --force-recreate "$candidate_service" "$candidate_pvp_service" >"$compose_log" 2>&1; then
  cat "$compose_log" >&2
  rm -f "$compose_log"
  rollback "$sha" || true
  exit 1
fi
rm -f "$compose_log"
phase_done recreate "$recreate_started_ms"

readiness_started_ms="$(now_ms)"
candidate_ready=0
for _ in $(seq 1 60); do
  if attest "$sha" "$candidate_port" && pvp_attest "$candidate_pvp_service"; then
    candidate_ready=1
    break
  fi
  sleep 2
done
if [[ "$candidate_ready" != "1" ]]; then
  echo "candidate failed Python/PvP-Go readiness/build/CORS attestation: $sha color=$candidate_color" >&2
  rollback "$sha" || true
  exit 43
fi
phase_done readiness "$readiness_started_ms"

switch_started_ms="$(now_ms)"
render_edge "$candidate_color" go
if [[ -n "$previous_color" ]]; then
  if ! reload_edge; then
    echo "edge reload failed for candidate color=$candidate_color" >&2
    rollback "$sha" || true
    exit 44
  fi
else
  legacy_id="$(docker ps -q \
    --filter "label=com.docker.compose.project=$project" \
    --filter 'label=com.docker.compose.service=backend' | head -n 1)"
  if [[ -z "$legacy_id" ]]; then
    legacy_id="$(docker ps -q \
      --filter "label=com.docker.compose.project=$project" \
      --filter 'label=com.docker.compose.service=backend_legacy' | head -n 1)"
  fi
  if [[ -n "$legacy_id" ]]; then
    docker rm -f "$legacy_id" >/dev/null
  fi
  if ! compose "$sha" up -d --no-build edge >/dev/null 2>&1; then
    echo 'failed to start stable edge during blue/green migration' >&2
    switch_complete=1
    rollback "$sha" || true
    exit 44
  fi
fi
switch_complete=1
if ! wait_pvp_edge_attest "$port"; then
  echo "edge did not route PvP through Go after bounded convergence: color=$candidate_color" >&2
  compose "$sha" ps "$candidate_service" "$candidate_pvp_service" edge >&2 || true
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 45
fi
if ! pvp_browser_cors_attest "$port"; then
  echo "edge PvP browser CORS attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 47
fi
write_active_color "$candidate_color"
phase_done switch "$switch_started_ms"

tunnel_started_ms="$(now_ms)"
tunnel_action="local-only"
if [[ "$target" == staging ]]; then
  tunnel_action="reused"
  if public_tunnel_attest "$sha"; then
    :
  else
    tunnel_action="restarted"
    if ! /bin/bash "$tunnel_connector" || ! public_tunnel_attest "$sha"; then
      echo "OCI staging public path did not converge after blue/green switch for $sha" >&2
      rollback "$sha" || true
      exit 46
    fi
  fi
fi
phase_done tunnel "$tunnel_started_ms"

record_successful_backend "$sha"

drain_started_ms="$(now_ms)"
if [[ -n "$previous_color" ]]; then
  sleep "${CHESS_STUDIO_BLUE_GREEN_DRAIN_SECONDS:-50}"
  remove_service "$(slot_service "$previous_color")"
  remove_service "$(pvp_service "$previous_color")"
fi
phase_done drain "$drain_started_ms"

start_observability_best_effort "$sha"
if [[ "$target" == staging ]]; then
  enable_deploy_watcher
  deploy_watcher_diag_summary
fi
agent_diag_summary || printf '%s\n' 'OCI_AGENT_DIAG unavailable'
phase_done total "$total_started_ms"
printf 'OCI_DEPLOY_TIMINGS target=%s phases=%s tunnel=%s color=%s\n' "$target" "${deploy_phase_summary%,}" "$tunnel_action" "$candidate_color"
echo "CHESS_STUDIO_DEPLOY_OK target=$target repo_ref=$sha color=$candidate_color pvp=go cors_origin=$cors_origin tunnel_action=$tunnel_action image=pulled observability=${observability_summary:-unknown}"
exit 0
