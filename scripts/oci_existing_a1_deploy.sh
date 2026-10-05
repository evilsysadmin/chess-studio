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
ssh_authorize_source="$repo/scripts/oci_ssh_authorize_root.py"
ssh_authorize_target="/usr/local/sbin/chess-studio-ssh-authorize"
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
    canonical_cors_origin="https://staging.chess-studio.shadowops.dpdns.org"
    cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"
    public_api_url="${CHESS_STUDIO_PUBLIC_API_URL:-https://api-staging.chess-studio.shadowops.dpdns.org/api}"
    ;;
  production)
    env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/production/backend.env}"
    state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio-production}"
    project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-production}"
    port="${CHESS_STUDIO_BACKEND_PORT:-4100}"
    canonical_cors_origin="https://chess-studio.shadowops.dpdns.org"
    cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://chess-studio.shadowops.dpdns.org}"
    public_api_url="${CHESS_STUDIO_PUBLIC_API_URL:-https://api.chess-studio.shadowops.dpdns.org/api}"
    ;;
esac

# The browser contract is credentialed/authenticated. Never accredit "*" or an
# alternate origin here: that can make OPTIONS look green while the real fetch
# is rejected by the browser. Runtime and deploy accreditation must agree on
# the one canonical frontend origin for the selected environment.
if [[ "$cors_origin" != "$canonical_cors_origin" ]]; then
  echo "refusing non-canonical browser CORS origin: target=$target expected=$canonical_cors_origin observed=$cors_origin" >&2
  exit 64
fi

if [[ "$target" == "staging" ]]; then
  pvp_sparring_enabled=true
else
  pvp_sparring_enabled=false
fi
pvp_sparring_owner="${CHESS_PVP_SPARRING_OWNER:-evilsysadmin}"
# Strangler front for the Python -> Go migration. "direct": nginx sends only
# /api/pvp to the Go sidecar. "go": nginx sends the whole API to the sidecar,
# which serves what is native and forwards the rest to Python. Versioned here
# per target so enabling or reverting it is a reviewed one-line change.
case "$target" in
  staging) api_edge_mode="${CHESS_STUDIO_API_EDGE_MODE:-go}" ;;
  *) api_edge_mode="${CHESS_STUDIO_API_EDGE_MODE:-direct}" ;;
esac
case "$api_edge_mode" in
  direct|go) ;;
  *) echo "invalid CHESS_STUDIO_API_EDGE_MODE: $api_edge_mode" >&2; exit 2 ;;
esac
# Native Go routes for games vs the CPU (GET/DELETE /api/games*). They only
# receive traffic in API "go" mode; staging first, production stays off.
case "$target" in
  staging) go_native_games_read="${CHESS_STUDIO_GO_NATIVE_GAMES_READ_ENABLED:-true}" ;;
  *) go_native_games_read="${CHESS_STUDIO_GO_NATIVE_GAMES_READ_ENABLED:-false}" ;;
esac
case "${go_native_games_read,,}" in
  true|false) go_native_games_read="${go_native_games_read,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_GAMES_READ_ENABLED: $go_native_games_read" >&2; exit 2 ;;
esac
# Native Go writes for games vs the CPU (POST /api/games, .../move, .../undo):
# same rule as the reads, staging first, production stays off.
case "$target" in
  staging) go_native_games_write="${CHESS_STUDIO_GO_NATIVE_GAMES_WRITE_ENABLED:-true}" ;;
  *) go_native_games_write="${CHESS_STUDIO_GO_NATIVE_GAMES_WRITE_ENABLED:-false}" ;;
esac
case "${go_native_games_write,,}" in
  true|false) go_native_games_write="${go_native_games_write,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_GAMES_WRITE_ENABLED: $go_native_games_write" >&2; exit 2 ;;
esac
# Native Go hint for games vs the CPU (GET /api/games/{id}/hint).
case "$target" in
  staging) go_native_games_hint="${CHESS_STUDIO_GO_NATIVE_GAMES_HINT_ENABLED:-true}" ;;
  *) go_native_games_hint="${CHESS_STUDIO_GO_NATIVE_GAMES_HINT_ENABLED:-false}" ;;
esac
case "${go_native_games_hint,,}" in
  true|false) go_native_games_hint="${go_native_games_hint,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_GAMES_HINT_ENABLED: $go_native_games_hint" >&2; exit 2 ;;
esac
# Native Go analysis (POST /api/analyze and /api/analyze-move), optional engine work.
case "$target" in
  staging) go_native_analyze="${CHESS_STUDIO_GO_NATIVE_ANALYZE_ENABLED:-true}" ;;
  *) go_native_analyze="${CHESS_STUDIO_GO_NATIVE_ANALYZE_ENABLED:-false}" ;;
esac
case "${go_native_analyze,,}" in
  true|false) go_native_analyze="${go_native_analyze,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_ANALYZE_ENABLED: $go_native_analyze" >&2; exit 2 ;;
esac
# Native Go system routes (GET /api/status, GET /api/features, POST /api/client-telemetry).
case "$target" in
  staging) go_native_system="${CHESS_STUDIO_GO_NATIVE_SYSTEM_ENABLED:-true}" ;;
  *) go_native_system="${CHESS_STUDIO_GO_NATIVE_SYSTEM_ENABLED:-false}" ;;
esac
case "${go_native_system,,}" in
  true|false) go_native_system="${go_native_system,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_SYSTEM_ENABLED: $go_native_system" >&2; exit 2 ;;
esac
# Native Go profile (GET, PUT and PATCH /api/profile).
case "$target" in
  staging) go_native_profile="${CHESS_STUDIO_GO_NATIVE_PROFILE_ENABLED:-true}" ;;
  *) go_native_profile="${CHESS_STUDIO_GO_NATIVE_PROFILE_ENABLED:-false}" ;;
esac
case "${go_native_profile,,}" in
  true|false) go_native_profile="${go_native_profile,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_PROFILE_ENABLED: $go_native_profile" >&2; exit 2 ;;
esac
# Native Go session routes (GET /api/auth/me, POST /api/auth/activity and /logout).
case "$target" in
  staging) go_native_auth_session="${CHESS_STUDIO_GO_NATIVE_AUTH_SESSION_ENABLED:-true}" ;;
  *) go_native_auth_session="${CHESS_STUDIO_GO_NATIVE_AUTH_SESSION_ENABLED:-false}" ;;
esac
case "${go_native_auth_session,,}" in
  true|false) go_native_auth_session="${go_native_auth_session,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_AUTH_SESSION_ENABLED: $go_native_auth_session" >&2; exit 2 ;;
esac
# Native Go login (POST /api/auth/login).
case "$target" in
  staging) go_native_login="${CHESS_STUDIO_GO_NATIVE_LOGIN_ENABLED:-true}" ;;
  *) go_native_login="${CHESS_STUDIO_GO_NATIVE_LOGIN_ENABLED:-false}" ;;
esac
case "${go_native_login,,}" in
  true|false) go_native_login="${go_native_login,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_LOGIN_ENABLED: $go_native_login" >&2; exit 2 ;;
esac
# Native Go account routes (register, password and email changes, delete-account).
case "$target" in
  staging) go_native_account="${CHESS_STUDIO_GO_NATIVE_ACCOUNT_ENABLED:-true}" ;;
  *) go_native_account="${CHESS_STUDIO_GO_NATIVE_ACCOUNT_ENABLED:-false}" ;;
esac
case "${go_native_account,,}" in
  true|false) go_native_account="${go_native_account,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_ACCOUNT_ENABLED: $go_native_account" >&2; exit 2 ;;
esac
# Native Go password recovery (forgot-password, reset-password).
case "$target" in
  staging) go_native_recovery="${CHESS_STUDIO_GO_NATIVE_RECOVERY_ENABLED:-true}" ;;
  *) go_native_recovery="${CHESS_STUDIO_GO_NATIVE_RECOVERY_ENABLED:-false}" ;;
esac
case "${go_native_recovery,,}" in
  true|false) go_native_recovery="${go_native_recovery,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_RECOVERY_ENABLED: $go_native_recovery" >&2; exit 2 ;;
esac
# Native Go user feedback (submit, mine, delete own).
case "$target" in
  staging) go_native_feedback="${CHESS_STUDIO_GO_NATIVE_FEEDBACK_ENABLED:-true}" ;;
  *) go_native_feedback="${CHESS_STUDIO_GO_NATIVE_FEEDBACK_ENABLED:-false}" ;;
esac
case "${go_native_feedback,,}" in
  true|false) go_native_feedback="${go_native_feedback,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_FEEDBACK_ENABLED: $go_native_feedback" >&2; exit 2 ;;
esac
# Native Go Matthias read side (daily status, briefing, memory reset).
case "$target" in
  staging) go_native_matthias_read="${CHESS_STUDIO_GO_NATIVE_MATTHIAS_READ_ENABLED:-true}" ;;
  *) go_native_matthias_read="${CHESS_STUDIO_GO_NATIVE_MATTHIAS_READ_ENABLED:-false}" ;;
esac
case "${go_native_matthias_read,,}" in
  true|false) go_native_matthias_read="${go_native_matthias_read,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_MATTHIAS_READ_ENABLED: $go_native_matthias_read" >&2; exit 2 ;;
esac
# Native Go narrative (/api/narrative, Matthias' audience, admin AI reads).
case "$target" in
  staging) go_native_narrative="${CHESS_STUDIO_GO_NATIVE_NARRATIVE_ENABLED:-true}" ;;
  *) go_native_narrative="${CHESS_STUDIO_GO_NATIVE_NARRATIVE_ENABLED:-false}" ;;
esac
case "${go_native_narrative,,}" in
  true|false) go_native_narrative="${go_native_narrative,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_NARRATIVE_ENABLED: $go_native_narrative" >&2; exit 2 ;;
esac
# Native Go Pawn Slug stage content.
case "$target" in
  staging) go_native_pawn_slug="${CHESS_STUDIO_GO_NATIVE_PAWN_SLUG_ENABLED:-true}" ;;
  *) go_native_pawn_slug="${CHESS_STUDIO_GO_NATIVE_PAWN_SLUG_ENABLED:-false}" ;;
esac
case "${go_native_pawn_slug,,}" in
  true|false) go_native_pawn_slug="${go_native_pawn_slug,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_PAWN_SLUG_ENABLED: $go_native_pawn_slug" >&2; exit 2 ;;
esac
# Native Go Chronicles area content and MapCode previews.
case "$target" in
  staging) go_native_chronicles="${CHESS_STUDIO_GO_NATIVE_CHRONICLES_ENABLED:-true}" ;;
  *) go_native_chronicles="${CHESS_STUDIO_GO_NATIVE_CHRONICLES_ENABLED:-false}" ;;
esac
case "${go_native_chronicles,,}" in
  true|false) go_native_chronicles="${go_native_chronicles,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_CHRONICLES_ENABLED: $go_native_chronicles" >&2; exit 2 ;;
esac
# Native Go Chronicles runs (create, read, checkpoint).
case "$target" in
  staging) go_native_chronicles_runs="${CHESS_STUDIO_GO_NATIVE_CHRONICLES_RUNS_ENABLED:-true}" ;;
  *) go_native_chronicles_runs="${CHESS_STUDIO_GO_NATIVE_CHRONICLES_RUNS_ENABLED:-false}" ;;
esac
case "${go_native_chronicles_runs,,}" in
  true|false) go_native_chronicles_runs="${go_native_chronicles_runs,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_CHRONICLES_RUNS_ENABLED: $go_native_chronicles_runs" >&2; exit 2 ;;
esac
# Native Go Admin feedback management.
case "$target" in
  staging) go_native_admin_feedback="${CHESS_STUDIO_GO_NATIVE_ADMIN_FEEDBACK_ENABLED:-true}" ;;
  *) go_native_admin_feedback="${CHESS_STUDIO_GO_NATIVE_ADMIN_FEEDBACK_ENABLED:-false}" ;;
esac
case "${go_native_admin_feedback,,}" in
  true|false) go_native_admin_feedback="${go_native_admin_feedback,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_ADMIN_FEEDBACK_ENABLED: $go_native_admin_feedback" >&2; exit 2 ;;
esac
# Native Go Admin user tools.
case "$target" in
  staging) go_native_admin_users="${CHESS_STUDIO_GO_NATIVE_ADMIN_USERS_ENABLED:-true}" ;;
  *) go_native_admin_users="${CHESS_STUDIO_GO_NATIVE_ADMIN_USERS_ENABLED:-false}" ;;
esac
case "${go_native_admin_users,,}" in
  true|false) go_native_admin_users="${go_native_admin_users,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_ADMIN_USERS_ENABLED: $go_native_admin_users" >&2; exit 2 ;;
esac
# Native Go Admin observability panel.
case "$target" in
  staging) go_native_admin_observability="${CHESS_STUDIO_GO_NATIVE_ADMIN_OBSERVABILITY_ENABLED:-true}" ;;
  *) go_native_admin_observability="${CHESS_STUDIO_GO_NATIVE_ADMIN_OBSERVABILITY_ENABLED:-false}" ;;
esac
case "${go_native_admin_observability,,}" in
  true|false) go_native_admin_observability="${go_native_admin_observability,,}" ;;
  *) echo "invalid CHESS_STUDIO_GO_NATIVE_ADMIN_OBSERVABILITY_ENABLED: $go_native_admin_observability" >&2; exit 2 ;;
esac
# Python retirement (GO_PYTHON_RETIRED in the Go sidecar): no backend_* slot is
# started, the Go sidecar serves every route itself, including /api/ready and
# /api/release, and every native flag is forced on. It needs API "go" mode.
case "$target" in
  staging) python_retired="${CHESS_STUDIO_PYTHON_RETIRED:-false}" ;;
  *) python_retired="${CHESS_STUDIO_PYTHON_RETIRED:-false}" ;;
esac
case "${python_retired,,}" in
  true|false) python_retired="${python_retired,,}" ;;
  *) echo "invalid CHESS_STUDIO_PYTHON_RETIRED: $python_retired" >&2; exit 2 ;;
esac
if [[ "$python_retired" == "true" ]]; then
  if [[ "$api_edge_mode" != "go" ]]; then
    echo "CHESS_STUDIO_PYTHON_RETIRED=true requires CHESS_STUDIO_API_EDGE_MODE=go" >&2
    exit 2
  fi
  go_native_games_read=true
  go_native_games_write=true
  go_native_games_hint=true
  go_native_analyze=true
  go_native_system=true
  go_native_profile=true
  go_native_auth_session=true
  go_native_login=true
  go_native_account=true
  go_native_recovery=true
  go_native_feedback=true
  go_native_matthias_read=true
  go_native_narrative=true
  go_native_pawn_slug=true
  go_native_chronicles=true
  go_native_chronicles_runs=true
  go_native_admin_feedback=true
  go_native_admin_users=true
  go_native_admin_observability=true
fi
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

ensure_operator_docker_access() {
  id ubuntu >/dev/null 2>&1 || { echo 'missing operator user: ubuntu' >&2; exit 66; }
  getent group docker >/dev/null 2>&1 || { echo 'missing docker group' >&2; exit 69; }
  if id -nG ubuntu | grep -qw docker; then
    echo 'OCI_OPERATOR_DOCKER_ACCESS state=already'
    return
  fi
  usermod -aG docker ubuntu
  id -nG ubuntu | grep -qw docker || { echo 'failed to grant ubuntu docker group membership' >&2; exit 70; }
  echo 'OCI_OPERATOR_DOCKER_ACCESS state=added'
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
require id
require getent
require grep
require usermod

docker compose version >/dev/null 2>&1 || { echo 'docker compose v2 is required' >&2; exit 69; }
ensure_operator_docker_access
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
  CHESS_STUDIO_GO_NATIVE_GAMES_READ_ENABLED="$go_native_games_read" \
  CHESS_STUDIO_GO_NATIVE_GAMES_WRITE_ENABLED="$go_native_games_write" \
  CHESS_STUDIO_GO_NATIVE_GAMES_HINT_ENABLED="$go_native_games_hint" \
  CHESS_STUDIO_GO_NATIVE_ANALYZE_ENABLED="$go_native_analyze" \
  CHESS_STUDIO_GO_NATIVE_SYSTEM_ENABLED="$go_native_system" \
  CHESS_STUDIO_GO_NATIVE_PROFILE_ENABLED="$go_native_profile" \
  CHESS_STUDIO_GO_NATIVE_AUTH_SESSION_ENABLED="$go_native_auth_session" \
  CHESS_STUDIO_GO_NATIVE_LOGIN_ENABLED="$go_native_login" \
  CHESS_STUDIO_GO_NATIVE_ACCOUNT_ENABLED="$go_native_account" \
  CHESS_STUDIO_GO_NATIVE_RECOVERY_ENABLED="$go_native_recovery" \
  CHESS_STUDIO_GO_NATIVE_FEEDBACK_ENABLED="$go_native_feedback" \
  CHESS_STUDIO_GO_NATIVE_MATTHIAS_READ_ENABLED="$go_native_matthias_read" \
  CHESS_STUDIO_GO_NATIVE_NARRATIVE_ENABLED="$go_native_narrative" \
  CHESS_STUDIO_GO_NATIVE_PAWN_SLUG_ENABLED="$go_native_pawn_slug" \
  CHESS_STUDIO_GO_NATIVE_CHRONICLES_ENABLED="$go_native_chronicles" \
  CHESS_STUDIO_GO_NATIVE_CHRONICLES_RUNS_ENABLED="$go_native_chronicles_runs" \
  CHESS_STUDIO_GO_NATIVE_ADMIN_FEEDBACK_ENABLED="$go_native_admin_feedback" \
  CHESS_STUDIO_GO_NATIVE_ADMIN_USERS_ENABLED="$go_native_admin_users" \
  CHESS_STUDIO_GO_NATIVE_ADMIN_OBSERVABILITY_ENABLED="$go_native_admin_observability" \
  CHESS_STUDIO_PYTHON_RETIRED="$python_retired" \
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
  local committed_sha="${3:-${previous_sha:-}}"
  # Only the candidate cutover passes the configured API mode. Rollbacks keep
  # "direct": an older Go sidecar may not be able to front the whole API.
  local api_mode="${4:-direct}"
  python3 -S "$blue_green_edge" \
    --color "$color" \
    --pvp-mode "$pvp_mode" \
    --committed-sha "$committed_sha" \
    --api-mode "$api_mode" \
    --output "$edge_config_file"
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

# attest's Python-free twin: /api/ready and /api/release come from the Go
# sidecar itself (identity routes), read from inside its container because the
# sidecars publish no host port. CORS is accredited through the edge after the
# cutover (cors_attest "$port").
go_attest() {
  local expected="$1"
  local service="$2"
  local ready release rc
  ready="$(mktemp)"
  release="$(mktemp)"
  if ! compose "$sha" exec -T "$service" wget -q -O - http://127.0.0.1:8080/api/ready >"$ready" || \
     ! compose "$sha" exec -T "$service" wget -q -O - http://127.0.0.1:8080/api/release >"$release"; then
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

candidate_attest() {
  if [[ "$python_retired" == "true" ]]; then
    go_attest "$sha" "$candidate_pvp_service"
  else
    attest "$sha" "$candidate_port"
  fi
}

# The staging owner's session token, minted by the Go sidecar
# (`api-edge mint-token`) once Python is retired.
go_owner_token() {
  local pvp_service="$1"
  local fail_prefix="$2"
  compose "$sha" exec -T -e "MINT_TOKEN_FAIL_PREFIX=$fail_prefix" "$pvp_service" /app/api-edge mint-token
}

pvp_attest() {
  local service="$1"
  local deployment_target="${2:-$target}"
  local body
  body="$(mktemp)"
  if ! compose "$sha" exec -T "$service" wget -q -O - http://127.0.0.1:8080/readyz >"$body"; then
    rm -f "$body"
    return 1
  fi
  if python3 - "$body" "$pvp_sparring_enabled" "$deployment_target" "$sha" "$go_native_games_read" "$go_native_games_write" "$go_native_games_hint" "$go_native_analyze" "$go_native_system" "$go_native_profile" "$go_native_auth_session" "$go_native_login" "$go_native_account" "$go_native_recovery" "$go_native_feedback" "$go_native_matthias_read" "$go_native_narrative" "$go_native_pawn_slug" "$go_native_chronicles" "$go_native_chronicles_runs" "$go_native_admin_feedback" "$go_native_admin_users" "$go_native_admin_observability" "$python_retired" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
env = __import__('os').environ
deployment_target = str(sys.argv[3]).strip().lower()
expected_release = str(sys.argv[4]).strip().lower()
allow_staging_fallback = str(env.get('CHESS_STUDIO_PVP_ALLOW_PYTHON_FALLBACK_STAGING', 'false')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_native = str(env.get('CHESS_STUDIO_PVP_NATIVE_PULSE_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_lobby_read = str(env.get('CHESS_STUDIO_PVP_NATIVE_LOBBY_READ_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_virtual_players = str(sys.argv[2]).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_roster = str(env.get('CHESS_STUDIO_PVP_NATIVE_ROSTER_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_chat = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHAT_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_challenge_resolution = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHALLENGE_RESOLUTION_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_challenge_accept = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHALLENGE_ACCEPT_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_challenge_create = str(env.get('CHESS_STUDIO_PVP_NATIVE_CHALLENGE_CREATE_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_handoff_cancel = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_HANDOFF_CANCEL_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_ready = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_READY_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_resign = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_RESIGN_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_read = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_READ_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_match_move = str(env.get('CHESS_STUDIO_PVP_NATIVE_MATCH_MOVE_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
expected_resident_move = str(env.get('CHESS_STUDIO_PVP_NATIVE_RESIDENT_MOVE_ENABLED', 'true')).strip().lower() in {'1', 'true', 'yes', 'on'}
if (
    payload.get('status') != 'ready'
    or payload.get('service') != 'chess-studio-pvp-go'
    or str(payload.get('release') or '').strip().lower() != expected_release
    or bool(payload.get('nativePulse')) != expected_native
    or bool(payload.get('nativeLobbyRead')) != expected_lobby_read
    or bool(payload.get('virtualPlayersEnabled')) != expected_virtual_players
    or bool(payload.get('nativeRoster')) != expected_roster
    or bool(payload.get('nativeChat')) != expected_chat
    or bool(payload.get('nativeChallengeResolution')) != expected_challenge_resolution
    or bool(payload.get('nativeChallengeAccept')) != expected_challenge_accept
    or bool(payload.get('nativeChallengeCreate')) != expected_challenge_create
    or bool(payload.get('nativeMatchHandoffCancel')) != expected_match_handoff_cancel
    or bool(payload.get('nativeMatchReady')) != expected_match_ready
    or bool(payload.get('nativeMatchResign')) != expected_match_resign
    or bool(payload.get('nativeMatchRead')) != expected_match_read
    or bool(payload.get('nativeMatchMove')) != expected_match_move
    or bool(payload.get('nativeResidentMove')) != expected_resident_move
    or bool(payload.get('nativeGamesRead')) != (str(sys.argv[5]).strip().lower() == 'true')
    or bool(payload.get('nativeGamesWrite')) != (str(sys.argv[6]).strip().lower() == 'true')
    or bool(payload.get('nativeGamesHint')) != (str(sys.argv[7]).strip().lower() == 'true')
    or bool(payload.get('nativeGamesAnalyze')) != (str(sys.argv[8]).strip().lower() == 'true')
    or bool(payload.get('nativeSystem')) != (str(sys.argv[9]).strip().lower() == 'true')
    or bool(payload.get('nativeProfile')) != (str(sys.argv[10]).strip().lower() == 'true')
    or bool(payload.get('nativeAuthSession')) != (str(sys.argv[11]).strip().lower() == 'true')
    or bool(payload.get('nativeLogin')) != (str(sys.argv[12]).strip().lower() == 'true')
    or bool(payload.get('nativeAccount')) != (str(sys.argv[13]).strip().lower() == 'true')
    or bool(payload.get('nativeRecovery')) != (str(sys.argv[14]).strip().lower() == 'true')
    or bool(payload.get('nativeFeedback')) != (str(sys.argv[15]).strip().lower() == 'true')
    or bool(payload.get('nativeMatthias')) != (str(sys.argv[16]).strip().lower() == 'true')
    or bool(payload.get('nativeNarrative')) != (str(sys.argv[17]).strip().lower() == 'true')
    or bool(payload.get('nativePawnSlug')) != (str(sys.argv[18]).strip().lower() == 'true')
    or bool(payload.get('nativeChronicles')) != (str(sys.argv[19]).strip().lower() == 'true')
    or bool(payload.get('nativeChroniclesRuns')) != (str(sys.argv[20]).strip().lower() == 'true')
    or bool(payload.get('nativeAdminFeedback')) != (str(sys.argv[21]).strip().lower() == 'true')
    or bool(payload.get('nativeAdminUsers')) != (str(sys.argv[22]).strip().lower() == 'true')
    or bool(payload.get('nativeAdminObservability')) != (str(sys.argv[23]).strip().lower() == 'true')
    or bool(payload.get('pythonRetired')) != (str(sys.argv[24]).strip().lower() == 'true')
):
    raise SystemExit(1)

if deployment_target == 'staging' and not allow_staging_fallback:
    required_native = (
        'nativePulse',
        'nativeLobbyRead',
        'nativeRoster',
        'nativeChat',
        'nativeChallengeResolution',
        'nativeChallengeAccept',
        'nativeChallengeCreate',
        'nativeMatchHandoffCancel',
        'nativeMatchReady',
        'nativeMatchResign',
        'nativeMatchRead',
        'nativeMatchMove',
        'nativeResidentMove',
    )
    if any(payload.get(key) is not True for key in required_native):
        raise SystemExit(1)
    if payload.get('virtualPlayersEnabled') is not True:
        raise SystemExit(1)
PY
  then
    rm -f "$body"
    return 0
  fi
  rm -f "$body"
  return 1
}

pvp_virtual_roster_attest() {
  local backend_service="$1"
  local pvp_service="$2"
  local deployment_target="${3:-$target}"
  local enabled="${pvp_sparring_enabled,,}"

  if [[ "$deployment_target" != "staging" ]] || [[ ! "$enabled" =~ ^(1|true|yes|on)$ ]]; then
    return 0
  fi

  if [[ "$python_retired" == "true" ]]; then
    go_virtual_roster_attest "$pvp_service"
    return
  fi

  compose "$sha" exec -T "$backend_service" python - "$pvp_service" <<'PY'
import asyncio
import json
import os
import sys
import urllib.request

from auth import create_token
from db import close_db
from users_store import get_auth_state

pvp_service = str(sys.argv[1]).strip()
owner = str(os.environ.get("CHESS_PVP_SPARRING_OWNER") or "evilsysadmin").strip().lower()
sparring = str(os.environ.get("CHESS_PVP_SPARRING_USERNAME") or "sparringmeister").strip().lower()


async def load_owner_state():
    try:
        return await get_auth_state(owner, force=True)
    finally:
        await close_db()


try:
    exists, session_version = asyncio.run(load_owner_state())
except Exception:
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=owner-auth-state-unavailable")

if not exists:
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=owner-account-missing")

token = create_token(owner, session_version)
request = urllib.request.Request(
    f"http://{pvp_service}:8080/api/pvp/lobby",
    headers={
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "Cache-Control": "no-cache",
    },
)
try:
    with urllib.request.urlopen(request, timeout=8) as response:
        payload = json.load(response)
except Exception:
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=lobby-request-failed")

rows = payload.get("roster")
if not isinstance(rows, list):
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=roster-not-list")

by_name = {
    str(row.get("username") or "").strip().lower(): row
    for row in rows
    if isinstance(row, dict)
}
required = (
    sparring,
    "otto_falk",
    "marta_stein",
    "viktor_kraus",
)
for username in required:
    row = by_name.get(username)
    if row is None:
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=missing-rival rival={username}")
    if row.get("isSelf") is True:
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=virtual-rival-marked-self rival={username}")

for username in ("otto_falk", "marta_stein", "viktor_kraus"):
    row = by_name[username]
    if str(row.get("actorKind") or "").strip().lower() != "resident":
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=wrong-actor-kind rival={username}")

print(
    "PVP_VIRTUAL_ROSTER_OK "
    f"sparring={sparring} residents=otto_falk,marta_stein,viktor_kraus"
)
PY
}
# pvp_virtual_roster_attest without Python: Go mints the owner token, the
# lobby is read inside the sidecar (the token travels in the exec environment,
# never on a command line) and the roster is judged here.
go_virtual_roster_attest() {
  local pvp_service="$1"
  local token_line token body rc
  if ! token_line="$(go_owner_token "$pvp_service" PVP_VIRTUAL_ROSTER)"; then
    return 1
  fi
  token="${token_line#PVP_BROWSER_TOKEN=}"
  if [[ -z "$token" || "$token" == "$token_line" ]]; then
    echo "PVP_VIRTUAL_ROSTER_FAIL reason=owner-token-missing" >&2
    return 1
  fi
  body="$(mktemp)"
  if ! compose "$sha" exec -T -e "PVP_ATTEST_TOKEN=$token" "$pvp_service" \
      sh -c 'wget -q -T 8 -O - --header "Accept: application/json" --header "Cache-Control: no-cache" --header "Authorization: Bearer $PVP_ATTEST_TOKEN" http://127.0.0.1:8080/api/pvp/lobby' >"$body"; then
    rm -f "$body"
    echo "PVP_VIRTUAL_ROSTER_FAIL reason=lobby-request-failed" >&2
    return 1
  fi
  if python3 - "$body" "$pvp_sparring_username" <<'PY'
import json
import pathlib
import sys

try:
    payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
except Exception:
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=lobby-request-failed")
sparring = str(sys.argv[2] or "sparringmeister").strip().lower()
rows = payload.get("roster") if isinstance(payload, dict) else None
if not isinstance(rows, list):
    raise SystemExit("PVP_VIRTUAL_ROSTER_FAIL reason=roster-not-list")
by_name = {
    str(row.get("username") or "").strip().lower(): row
    for row in rows
    if isinstance(row, dict)
}
residents = ("otto_falk", "marta_stein", "viktor_kraus")
for username in (sparring, *residents):
    row = by_name.get(username)
    if row is None:
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=missing-rival rival={username}")
    if row.get("isSelf") is True:
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=virtual-rival-marked-self rival={username}")
for username in residents:
    if str(by_name[username].get("actorKind") or "").strip().lower() != "resident":
        raise SystemExit(f"PVP_VIRTUAL_ROSTER_FAIL reason=wrong-actor-kind rival={username}")
print(f"PVP_VIRTUAL_ROSTER_OK sparring={sparring} residents=otto_falk,marta_stein,viktor_kraus")
PY
  then
    rc=0
  else
    rc=1
  fi
  rm -f "$body"
  return "$rc"
}

pvp_browser_token() {
  local backend_service="$1"
  if [[ "$python_retired" == "true" ]]; then
    go_owner_token "$candidate_pvp_service" PVP_BROWSER_AUTH
    return
  fi
  compose "$sha" exec -T "$backend_service" python - <<'PY'
import asyncio
import os

from auth import create_token
from db import close_db
from users_store import get_auth_state

owner = str(os.environ.get("CHESS_PVP_SPARRING_OWNER") or "evilsysadmin").strip().lower()


async def load_owner_state():
    try:
        return await get_auth_state(owner, force=True)
    finally:
        await close_db()


try:
    exists, session_version = asyncio.run(load_owner_state())
except Exception:
    raise SystemExit("PVP_BROWSER_AUTH_FAIL reason=owner-auth-state-unavailable")
if not exists:
    raise SystemExit("PVP_BROWSER_AUTH_FAIL reason=owner-account-missing")
print(f"PVP_BROWSER_TOKEN={create_token(owner, session_version)}")
PY
}

pvp_authenticated_browser_attest() {
  local backend_service="$1"
  local api_base="${2%/}"
  local deployment_target="${3:-$target}"
  local token token_output token_line line probe endpoint expected_native request_id
  local preflight_headers preflight_status headers body status

  if [[ "$deployment_target" != "staging" ]]; then
    return 0
  fi

  if ! token_output="$(pvp_browser_token "$backend_service")"; then
    echo "authenticated PvP browser probe could not mint a staging owner token" >&2
    return 1
  fi
  token_line=""
  while IFS= read -r line; do
    if [[ "$line" == PVP_BROWSER_TOKEN=* ]]; then
      if [[ -n "$token_line" ]]; then
        echo "authenticated PvP browser probe received multiple token sentinels" >&2
        return 1
      fi
      token_line="${line#PVP_BROWSER_TOKEN=}"
    fi
  done <<< "$token_output"
  token="$token_line"
  if [[ ! "$token" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    echo "authenticated PvP browser probe did not receive one framed JWT" >&2
    return 1
  fi

  for probe in lobby pulse; do
    case "$probe" in
      lobby)
        endpoint="$api_base/pvp/lobby"
        expected_native="lobby-read"
        ;;
      pulse)
        endpoint="$api_base/pvp/lobby/pulse"
        expected_native="lobby-pulse"
        ;;
    esac
    request_id="staging-authenticated-${probe}-${sha:0:12}"
    preflight_headers="$(mktemp)"
    headers="$(mktemp)"
    body="$(mktemp)"

    # Reproduce the browser's non-simple authenticated GET before sending it.
    # A direct curl GET can look healthy while Chromium refuses to dispatch the
    # request because the OPTIONS response does not authorize one of its headers.
    if ! preflight_status="$(curl --silent --show-error --max-time 10 \
        -X OPTIONS \
        -H "Origin: $cors_origin" \
        -H 'Access-Control-Request-Method: GET' \
        -H 'Access-Control-Request-Headers: authorization,x-request-id,x-client-release,x-presence-session' \
        -D "$preflight_headers" -o /dev/null -w "%{http_code}" \
        "$endpoint")"; then
      rm -f "$preflight_headers" "$headers" "$body"
      return 1
    fi

    if [[ "$preflight_status" != "204" ]] || ! python3 - "$preflight_headers" "$cors_origin" "$expected_native" <<'PY'
import pathlib
import sys

headers_path, expected_origin, expected_native = sys.argv[1:]
raw_headers = pathlib.Path(headers_path).read_text(encoding="utf-8", errors="replace")
parsed = {}
for line in raw_headers.replace("\r\n", "\n").split("\n"):
    if ":" not in line:
        continue
    name, value = line.split(":", 1)
    parsed.setdefault(name.strip().lower(), []).append(value.strip())

origins = [value.lower() for value in parsed.get("access-control-allow-origin", [])]
if origins != [expected_origin.strip().lower()]:
    raise SystemExit("authenticated preflight must expose exactly one canonical ACAO")
methods = ",".join(parsed.get("access-control-allow-methods", [])).upper()
if "GET" not in methods:
    raise SystemExit("authenticated preflight does not allow GET")
allowed_headers = ",".join(parsed.get("access-control-allow-headers", [])).lower()
for required in ("authorization", "x-request-id", "x-client-release", "x-presence-session"):
    if required not in allowed_headers:
        raise SystemExit(f"authenticated preflight does not allow {required}")
if [value.lower() for value in parsed.get("x-chess-pvp-edge", [])] != ["go"]:
    raise SystemExit("authenticated preflight did not traverse Go edge")
if [value.lower() for value in parsed.get("x-chess-pvp-native", [])] != [expected_native.lower()]:
    raise SystemExit("authenticated preflight hit the wrong native route")
PY
    then
      echo "authenticated PvP browser preflight failed: probe=$probe endpoint=$endpoint http=$preflight_status" >&2
      rm -f "$preflight_headers" "$headers" "$body"
      return 1
    fi

    if ! status="$(curl --silent --show-error --max-time 10 \
        -X GET \
        -H "Origin: $cors_origin" \
        -H 'Accept: application/json' \
        -H "Authorization: Bearer $token" \
        -H "X-Request-ID: $request_id" \
        -H 'X-Client-Release: staging-authenticated-verifier' \
        -H 'Cache-Control: no-cache, no-store' \
        -D "$headers" -o "$body" -w "%{http_code}" \
        "$endpoint")"; then
      rm -f "$preflight_headers" "$headers" "$body"
      return 1
    fi

    if [[ "$status" != "200" ]] || ! python3 - "$headers" "$body" "$cors_origin" "$request_id" "$expected_native" "$probe" <<'PY'
import json
import pathlib
import sys

headers_path, body_path, expected_origin, expected_request_id, expected_native, probe = sys.argv[1:]
raw_headers = pathlib.Path(headers_path).read_text(encoding="utf-8", errors="replace")
parsed = {}
for line in raw_headers.replace("\r\n", "\n").split("\n"):
    if ":" not in line:
        continue
    name, value = line.split(":", 1)
    parsed.setdefault(name.strip().lower(), []).append(value.strip())

origins = [value.lower() for value in parsed.get("access-control-allow-origin", [])]
if origins != [expected_origin.strip().lower()]:
    raise SystemExit("authenticated response must expose exactly one canonical ACAO")
if [value.lower() for value in parsed.get("x-chess-pvp-edge", [])] != ["go"]:
    raise SystemExit("authenticated response did not traverse Go edge")
if [value.lower() for value in parsed.get("x-chess-pvp-native", [])] != [expected_native.lower()]:
    raise SystemExit("authenticated response hit the wrong native route")
if parsed.get("x-request-id", []) != [expected_request_id]:
    raise SystemExit("authenticated response did not echo request id")

payload = json.loads(pathlib.Path(body_path).read_text(encoding="utf-8"))
if not isinstance(payload, dict):
    raise SystemExit("authenticated response is not an object")
if probe == "lobby":
    if not isinstance(payload.get("roster"), list):
        raise SystemExit("authenticated lobby response has no roster list")
elif probe == "pulse":
    if payload.get("source") != "go":
        raise SystemExit("authenticated pulse response is not Go-native")
    if "revision" not in payload:
        raise SystemExit("authenticated pulse response has no revision")
    poll_after = payload.get("pollAfterMs")
    if not isinstance(poll_after, (int, float)) or poll_after <= 0:
        raise SystemExit("authenticated pulse response has invalid pollAfterMs")
else:
    raise SystemExit("unknown authenticated browser probe")
PY
    then
      echo "authenticated PvP browser probe failed: probe=$probe endpoint=$endpoint http=$status" >&2
      rm -f "$preflight_headers" "$headers" "$body"
      return 1
    fi
    rm -f "$preflight_headers" "$headers" "$body"
  done

  echo "PVP_AUTHENTICATED_BROWSER_OK base=$api_base origin=$cors_origin"
  return 0
}

pvp_edge_attest() {
  local target_port="${1:-$port}"
  local expected_release="${2:-$sha}"
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
     ! python3 - "$body" "$expected_release" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
expected_release = str(sys.argv[2]).strip().lower()
if (
    payload.get('status') != 'ready'
    or payload.get('service') != 'chess-studio-pvp-go'
    or str(payload.get('release') or '').strip().lower() != expected_release
):
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
  local endpoint="${1:-http://127.0.0.1:${port}/api/pvp/roster}"
  local preflight_headers response_headers status response_status request_id
  preflight_headers="$(mktemp)"
  response_headers="$(mktemp)"
  request_id="staging-roster-probe-${sha:0:12}"

  if ! status="$(curl --silent --show-error --max-time 8 \
      -X OPTIONS \
      -H "Origin: $cors_origin" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: authorization,x-request-id,x-client-release' \
      -D "$preflight_headers" -o /dev/null -w "%{http_code}" \
      "$endpoint")"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi
  if [[ "$status" != "204" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$preflight_headers" || \
     ! grep -Eiq "^X-Chess-Pvp-Native:[[:space:]]*roster[[:space:]]*$" "$preflight_headers" || \
     ! python3 - "$preflight_headers" "$cors_origin" <<'PY'
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
for required_header in ('authorization', 'x-request-id', 'x-client-release'):
    if required_header not in allowed_headers:
        raise SystemExit(1)
PY
  then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  if ! response_status="$(curl --silent --show-error --max-time 8 \
      -X POST \
      -H "Origin: $cors_origin" \
      -H 'Accept: application/json' \
      -H 'Authorization: Bearer deliberately-invalid' \
      -H "X-Request-ID: $request_id" \
      -H 'X-Client-Release: staging-verifier' \
      -D "$response_headers" -o /dev/null -w "%{http_code}" \
      "$endpoint")"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi
  if [[ "$response_status" != "401" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$response_headers" || \
     ! grep -Eiq "^X-Chess-Pvp-Native:[[:space:]]*roster[[:space:]]*$" "$response_headers" || \
     ! grep -Eiq "^X-Request-ID:[[:space:]]*$request_id[[:space:]]*$" "$response_headers" || \
     ! python3 - "$response_headers" "$cors_origin" <<'PY'
import pathlib
import sys
headers = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
expected = sys.argv[2].strip().lower()
origins = []
for line in headers.replace('\r\n', '\n').split('\n'):
    if ':' not in line:
        continue
    name, value = line.split(':', 1)
    if name.strip().lower() == 'access-control-allow-origin':
        origins.append(value.strip().lower())
raise SystemExit(0 if expected in origins else 1)
PY
  then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  rm -f "$preflight_headers" "$response_headers"
  return 0
}

pvp_lobby_read_attest() {
  local endpoint="${1:-http://127.0.0.1:${port}/api/pvp/lobby}"
  local headers status request_id native_expected
  headers="$(mktemp)"
  request_id="staging-lobby-read-probe-${sha:0:12}"
  native_expected="${CHESS_STUDIO_PVP_NATIVE_LOBBY_READ_ENABLED:-true}"
  native_expected="${native_expected,,}"

  if ! status="$(curl --silent --show-error --max-time 8 \
      -X GET \
      -H "Origin: $cors_origin" \
      -H 'Accept: application/json' \
      -H 'Authorization: Bearer deliberately-invalid' \
      -H "X-Request-ID: $request_id" \
      -H 'X-Client-Release: staging-verifier' \
      -D "$headers" -o /dev/null -w "%{http_code}" \
      "$endpoint")"; then
    rm -f "$headers"
    return 1
  fi

  if [[ "$status" != "401" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$headers" || \
     ! grep -Eiq "^X-Request-ID:[[:space:]]*$request_id[[:space:]]*$" "$headers" || \
     ! python3 - "$headers" "$cors_origin" <<'PY'
import pathlib
import sys
headers = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
expected = sys.argv[2].strip().lower()
origins = []
for line in headers.replace('\r\n', '\n').split('\n'):
    if ':' not in line:
        continue
    name, value = line.split(':', 1)
    if name.strip().lower() == 'access-control-allow-origin':
        origins.append(value.strip().lower())
raise SystemExit(0 if expected in origins else 1)
PY
  then
    rm -f "$headers"
    return 1
  fi

  if [[ "$native_expected" =~ ^(1|true|yes|on)$ ]] && \
     ! grep -Eiq "^X-Chess-Pvp-Native:[[:space:]]*lobby-read[[:space:]]*$" "$headers"; then
    rm -f "$headers"
    return 1
  fi

  rm -f "$headers"
  return 0
}


pvp_challenge_browser_attest() {
  local endpoint="${1:-http://127.0.0.1:${port}/api/pvp/challenges}"
  local preflight_headers response_headers status response_status request_id
  # Same default as docker-compose.yml: native creation is on unless the
  # emergency fallback turns it off, so the marker is required by default.
  local native_expected="${CHESS_STUDIO_PVP_NATIVE_CHALLENGE_CREATE_ENABLED:-true}"
  preflight_headers="$(mktemp)"
  response_headers="$(mktemp)"
  request_id="staging-challenge-probe-${sha:0:12}"

  if ! status="$(curl --silent --show-error --max-time 8 \
      -X OPTIONS \
      -H "Origin: $cors_origin" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: authorization,content-type,x-request-id,x-client-release' \
      -D "$preflight_headers" -o /dev/null -w "%{http_code}" \
      "$endpoint")"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi
  # Go-native challenge creation returns 204, while the deliberate Python
  # compatibility fallback is served by FastAPI/Starlette and returns 200.
  # Both are valid successful preflights; the CORS/header contract below is
  # still required before the deploy may commit.
  if [[ "$status" != "200" && "$status" != "204" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$preflight_headers" || \
     ! python3 - "$preflight_headers" "$cors_origin" <<'PY'
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
if expected not in origins or 'POST' not in methods:
    raise SystemExit(1)
for required_header in ('authorization', 'content-type', 'x-request-id', 'x-client-release'):
    if required_header not in allowed_headers:
        raise SystemExit(1)
PY
  then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  if [[ "$native_expected" =~ ^(1|true|yes|on)$ ]] && \
     ! grep -Eiq "^X-Chess-Pvp-Native:[[:space:]]*challenge-create[[:space:]]*$" "$preflight_headers"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  if ! response_status="$(curl --silent --show-error --max-time 8 \
      -X POST \
      -H "Origin: $cors_origin" \
      -H 'Accept: application/json' \
      -H 'Authorization: Bearer deliberately-invalid' \
      -H 'Content-Type: application/json' \
      -H "X-Request-ID: $request_id" \
      -H 'X-Client-Release: staging-verifier' \
      --data '{"opponent":"otto_falk"}' \
      -D "$response_headers" -o /dev/null -w "%{http_code}" \
      "$endpoint")"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi
  if [[ "$response_status" != "401" ]] || \
     ! grep -Eiq "^X-Chess-Pvp-Edge:[[:space:]]*go[[:space:]]*$" "$response_headers" || \
     ! grep -Eiq "^X-Request-ID:[[:space:]]*$request_id[[:space:]]*$" "$response_headers" || \
     ! python3 - "$response_headers" "$cors_origin" <<'PY'
import pathlib
import sys
headers = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
expected = sys.argv[2].strip().lower()
origins = []
for line in headers.replace('\r\n', '\n').split('\n'):
    if ':' not in line:
        continue
    name, value = line.split(':', 1)
    if name.strip().lower() == 'access-control-allow-origin':
        origins.append(value.strip().lower())
raise SystemExit(0 if expected in origins else 1)
PY
  then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  if [[ "$native_expected" =~ ^(1|true|yes|on)$ ]] && \
     ! grep -Eiq "^X-Chess-Pvp-Native:[[:space:]]*challenge-create[[:space:]]*$" "$response_headers"; then
    rm -f "$preflight_headers" "$response_headers"
    return 1
  fi

  rm -f "$preflight_headers" "$response_headers"
  return 0
}

wait_pvp_edge_attest() {
  local target_port="${1:-$port}"
  local expected_release="${2:-$sha}"
  local attempts="${CHESS_STUDIO_PVP_EDGE_ATTEST_ATTEMPTS:-20}"
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if pvp_edge_attest "$target_port" "$expected_release"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_pvp_browser_attest() {
  local attest_fn="$1"
  local endpoint="$2"
  local attempts="${CHESS_STUDIO_PVP_BROWSER_ATTEST_ATTEMPTS:-12}"
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if "$attest_fn" "$endpoint" "${@:3}"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}


api_edge_attest() {
  # In api "go" mode a non-PvP route must be answered through the Go sidecar.
  local endpoint="$1"
  local headers status
  headers="$(mktemp)"
  if ! status="$(curl --silent --show-error --max-time 8 -D "$headers" -o /dev/null -w "%{http_code}" "$endpoint")"; then
    rm -f "$headers"
    return 1
  fi
  if [[ "$status" != "200" ]] || ! grep -Eiq "^X-Chess-Edge:[[:space:]]*go[[:space:]]*$" "$headers"; then
    rm -f "$headers"
    return 1
  fi
  rm -f "$headers"
  return 0
}

games_native_attest() {
  # The native games routes answer before auth: an anonymous request must come
  # back 401 from Go (X-Chess-Games-Native, or the marker named by $3), never
  # from the Python fallback.
  local endpoint="$1"
  local method="${2:-GET}"
  local marker="${3:-X-Chess-Games-Native}"
  local expected_status="${4:-401}"
  local headers status
  headers="$(mktemp)"
  if ! status="$(curl --silent --show-error --max-time 8 -X "$method" -D "$headers" -o /dev/null -w "%{http_code}" "$endpoint")"; then
    rm -f "$headers"
    return 1
  fi
  if [[ "$status" != "$expected_status" ]] || ! grep -Eiq "^${marker}:[[:space:]]*go[[:space:]]*$" "$headers"; then
    rm -f "$headers"
    return 1
  fi
  rm -f "$headers"
  return 0
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
    local rollback_pvp_mode="python-direct"
    # Once Python is retired the previous slot has no backend_* container, so
    # nginx must not name one: the previous sidecar fronts the whole API.
    local rollback_api_mode=direct
    [[ "${python_retired:-false}" != "true" ]] || rollback_api_mode=go
    # Preserve the previously accredited full-Go PvP authority whenever its
    # paired sidecar is still healthy. Python-direct is only a compatibility
    # escape hatch for a pre-sidecar generation or a genuinely unhealthy
    # previous sidecar; a failed candidate must not silently downgrade PvP.
    if [[ -n "$previous_sha" ]]; then
      render_edge "$previous_color" go "$previous_sha" "$rollback_api_mode"
      if reload_edge && wait_pvp_edge_attest "$port" "$previous_sha"; then
        rollback_pvp_mode="go"
      elif [[ "$rollback_api_mode" == "go" ]]; then
        rollback_pvp_mode="go-unverified"
      else
        render_edge "$previous_color" direct "$previous_sha"
        reload_edge || true
      fi
    elif [[ "$rollback_api_mode" == "go" ]]; then
      render_edge "$previous_color" go "" go
      reload_edge || true
      rollback_pvp_mode="go-unverified"
    else
      render_edge "$previous_color" direct
      reload_edge || true
    fi
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
    echo "CHESS_STUDIO_ROLLBACK_OK repo_ref=${previous_sha:-unknown} color=$previous_color pvp=$rollback_pvp_mode"
    return 0
  fi

  if [[ "${python_retired:-false}" != "true" && "${switch_complete:-0}" == "1" && -n "$previous_sha" ]] && image_available_for_rollback "$previous_sha"; then
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
[[ -f "$ssh_authorize_source" && ! -L "$ssh_authorize_source" ]] || { echo "missing SSH authorize helper in $sha" >&2; exit 66; }
[[ -f "$ocarun_sudoers_source" && ! -L "$ocarun_sudoers_source" ]] || { echo "missing ocarun sudoers contract in $sha" >&2; exit 66; }
visudo -cf "$ocarun_sudoers_source" >/dev/null
install -o root -g root -m 0755 "$source_launcher" "$target_launcher"
install -o root -g root -m 0755 "$source_runtime_installer" "$target_runtime_installer"
install -o root -g root -m 0755 "$mongo_backup_source" "$mongo_backup_target"
install -o root -g root -m 0755 "$ssh_authorize_source" "$ssh_authorize_target"
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
if [[ "$python_retired" != "true" ]] && ! docker pull --quiet "$target_image" >/dev/null; then
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
candidate_services=("$candidate_service" "$candidate_pvp_service")
if [[ "$python_retired" == "true" ]]; then
  # Only the Go sidecar runs; its container is also the backend log source.
  active_backend_service="$candidate_pvp_service"
  candidate_services=("$candidate_pvp_service")
fi
switch_complete=0

if ! compose "$sha" pull edge >/dev/null; then
  echo 'failed to pull stable blue/green edge image' >&2
  exit 1
fi

compose_log="$(mktemp /tmp/chess-studio-compose-up.XXXXXX)"
if ! compose "$sha" up -d --no-build --force-recreate "${candidate_services[@]}" >"$compose_log" 2>&1; then
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
  if candidate_attest && pvp_attest "$candidate_pvp_service" "$target"; then
    candidate_ready=1
    break
  fi
  sleep 2
done
if [[ "$candidate_ready" != "1" ]]; then
  echo "candidate failed Python/PvP-Go readiness/build/CORS attestation: $sha color=$candidate_color python_retired=$python_retired" >&2
  rollback "$sha" || true
  exit 43
fi
if ! pvp_virtual_roster_attest "$candidate_service" "$candidate_pvp_service" "$target"; then
  echo "candidate failed authenticated staging virtual-roster attestation: $sha color=$candidate_color" >&2
  rollback "$sha" || true
  exit 53
fi
phase_done readiness "$readiness_started_ms"

switch_started_ms="$(now_ms)"
render_edge "$candidate_color" go "${previous_sha:-}" "$api_edge_mode"
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
if ! wait_pvp_browser_attest pvp_browser_cors_attest "http://127.0.0.1:${port}/api/pvp/roster"; then
  echo "edge PvP browser CORS attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 47
fi
if ! wait_pvp_browser_attest pvp_lobby_read_attest "http://127.0.0.1:${port}/api/pvp/lobby"; then
  echo "edge PvP full lobby read attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 51
fi
if ! pvp_authenticated_browser_attest "$candidate_service" "http://127.0.0.1:${port}/api" "$target"; then
  echo "edge PvP authenticated browser lobby/pulse attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=60 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 56
fi
if ! wait_pvp_browser_attest pvp_challenge_browser_attest "http://127.0.0.1:${port}/api/pvp/challenges"; then
  echo "edge PvP challenge browser transport attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 49
fi
if [[ "$api_edge_mode" == "go" ]] && ! wait_pvp_browser_attest api_edge_attest "http://127.0.0.1:${port}/api/release"; then
  echo "edge did not front the API through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 58
fi
if [[ "$api_edge_mode" == "go" && "$go_native_games_read" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/games"; then
  echo "native games routes did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 59
fi
if [[ "$api_edge_mode" == "go" && "$go_native_games_write" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/games/deploy-attest/move" POST; then
  echo "native games writes did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 60
fi
if [[ "$api_edge_mode" == "go" && "$go_native_games_hint" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/games/deploy-attest/hint"; then
  echo "native games hint did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 61
fi
if [[ "$api_edge_mode" == "go" && "$go_native_analyze" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/analyze" POST; then
  echo "native analysis did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 62
fi
if [[ "$api_edge_mode" == "go" && "$go_native_analyze" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/analyze-move" POST; then
  echo "native move analysis did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 63
fi
if [[ "$api_edge_mode" == "go" && "$go_native_system" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/status" GET X-Chess-System-Native; then
  echo "native system routes did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 65
fi
if [[ "$api_edge_mode" == "go" && "$go_native_profile" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/profile" GET X-Chess-Profile-Native; then
  echo "native profile did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 67
fi
if [[ "$api_edge_mode" == "go" && "$go_native_auth_session" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/auth/me" GET X-Chess-Session-Native; then
  echo "native session routes did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 68
fi
# An empty login body is Go's 422: it reads no credentials and feeds no guard.
if [[ "$api_edge_mode" == "go" && "$go_native_login" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/auth/login" POST X-Chess-Auth-Native 422; then
  echo "native login did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 71
fi
if [[ "$api_edge_mode" == "go" && "$go_native_account" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/auth/password" PUT X-Chess-Auth-Native; then
  echo "native account routes did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 72
fi
# An empty reset body is Go's 422: no token is read, no mail is sent.
if [[ "$api_edge_mode" == "go" && "$go_native_recovery" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/auth/reset-password" POST X-Chess-Auth-Native 422; then
  echo "native recovery did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 73
fi
# Anonymous GET /api/feedback/mine is Go's 401: nothing is read or written.
if [[ "$api_edge_mode" == "go" && "$go_native_feedback" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/feedback/mine" GET X-Chess-Feedback-Native 401; then
  echo "native feedback did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 74
fi
# Anonymous GET /api/matthias/briefing is Go's 401: no memory is read.
if [[ "$api_edge_mode" == "go" && "$go_native_matthias_read" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/matthias/briefing" GET X-Chess-Matthias-Native 401; then
  echo "native matthias did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 76
fi
# Anonymous GET /api/admin/ai-metrics is Go's 401: no model is called.
if [[ "$api_edge_mode" == "go" && "$go_native_narrative" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/admin/ai-metrics" GET X-Chess-Narrative-Native 401; then
  echo "native narrative did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 77
fi
# Anonymous GET of a Pawn Slug stage is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_pawn_slug" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/pawn-slug/stages/pawn-slug-v1" GET X-Chess-PawnSlug-Native 401; then
  echo "native pawn slug did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 78
fi
# Anonymous GET of a Chronicles area is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_chronicles" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/chronicles/maps/ash-vault" GET X-Chess-Chronicles-Native 401; then
  echo "native chronicles did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 79
fi
# Anonymous GET of a Chronicles run is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_chronicles_runs" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/chronicles/runs/attest" GET X-Chess-Chronicles-Native 401; then
  echo "native chronicles runs did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 80
fi
# Anonymous GET of Admin's feedback summary is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_admin_feedback" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/admin/feedback/summary" GET X-Chess-Admin-Native 401; then
  echo "native admin feedback did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 81
fi
# Anonymous GET of Admin's user list is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_admin_users" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/admin/users" GET X-Chess-Admin-Native 401; then
  echo "native admin users did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 82
fi
# Anonymous GET of Admin's observability panel is Go's 401.
if [[ "$api_edge_mode" == "go" && "$go_native_admin_observability" == "true" ]] && ! wait_pvp_browser_attest games_native_attest "http://127.0.0.1:${port}/api/admin/observability" GET X-Chess-Admin-Native 401; then
  echo "native admin observability did not answer through Go after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 83
fi
# Without Python the candidate exposes no host port, so the browser CORS
# contract of the API (not only /api/pvp) is accredited through the edge.
if [[ "$python_retired" == "true" ]] && ! wait_pvp_browser_attest cors_attest "$port"; then
  echo "Go API browser CORS attestation failed after cutover: color=$candidate_color" >&2
  compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge >&2 || true
  rollback "$sha" || true
  exit 84
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
  if ! pvp_browser_cors_attest "${public_api_url}/pvp/roster"; then
    echo "OCI staging public PvP roster did not prove native Go browser response semantics for $sha" >&2
    rollback "$sha" || true
    exit 48
  fi
  if ! pvp_lobby_read_attest "${public_api_url}/pvp/lobby"; then
    echo "OCI staging public PvP lobby did not prove native Go read semantics for $sha" >&2
    rollback "$sha" || true
    exit 52
  fi
  if ! pvp_authenticated_browser_attest "$candidate_service" "$public_api_url" "$target"; then
    echo "OCI staging public PvP authenticated browser lobby/pulse contract failed for $sha" >&2
    rollback "$sha" || true
    exit 57
  fi
  if ! pvp_challenge_browser_attest "${public_api_url}/pvp/challenges"; then
    echo "OCI staging public PvP challenge transport did not prove browser JSON/CORS semantics for $sha" >&2
    rollback "$sha" || true
    exit 50
  fi
fi
phase_done tunnel "$tunnel_started_ms"

record_successful_backend "$sha"
if ! render_edge "$candidate_color" go "$sha" "$api_edge_mode" || ! reload_edge; then
  echo "failed to publish committed OCI generation marker: $sha color=$candidate_color" >&2
  rollback "$sha" || true
  exit 55
fi

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
echo "CHESS_STUDIO_DEPLOY_OK target=$target repo_ref=$sha color=$candidate_color pvp=go api_edge=$api_edge_mode python_retired=$python_retired games_native=$go_native_games_read games_native_write=$go_native_games_write games_native_hint=$go_native_games_hint analyze_native=$go_native_analyze system_native=$go_native_system profile_native=$go_native_profile auth_session_native=$go_native_auth_session login_native=$go_native_login account_native=$go_native_account recovery_native=$go_native_recovery feedback_native=$go_native_feedback matthias_read_native=$go_native_matthias_read narrative_native=$go_native_narrative pawn_slug_native=$go_native_pawn_slug chronicles_native=$go_native_chronicles chronicles_runs_native=$go_native_chronicles_runs admin_feedback_native=$go_native_admin_feedback admin_users_native=$go_native_admin_users admin_observability_native=$go_native_admin_observability cors_origin=$cors_origin tunnel_action=$tunnel_action image=pulled observability=${observability_summary:-unknown}"
exit 0
