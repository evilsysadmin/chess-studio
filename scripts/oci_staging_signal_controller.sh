#!/usr/bin/env bash
set -euo pipefail

signal_image="${CHESS_STUDIO_SIGNAL_IMAGE:-ghcr.io/evilsysadmin/chess-studio-backend:oci-staging-approved}"
immutable_prefix="${CHESS_STUDIO_BACKEND_IMAGE_PREFIX:-ghcr.io/evilsysadmin/chess-studio-backend:oci-}"
expected_source="https://github.com/evilsysadmin/chess-studio"
deploy_wrapper="/usr/local/sbin/chess-studio-deploy"
state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio}"
state_file="${CHESS_STUDIO_STATE_FILE:-$state_dir/deployed.sha}"
failure_file="$state_dir/staging-signal-failure"
failure_cooldown_s=60
lock_file="/run/chess-studio-staging-signal.lock"

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
  rm -f "$failure_file"
  exit 0
fi

if [[ -s "$failure_file" ]]; then
  failed_sha=''
  failed_at=''
  read -r failed_sha failed_at <"$failure_file" || true
  now="$(date +%s)"
  if [[ "$failed_sha" == "$sha" && "$failed_at" =~ ^[0-9]+$ && "$now" =~ ^[0-9]+$ ]]; then
    age="$((now - failed_at))"
    if (( age >= 0 && age < failure_cooldown_s )); then
      exit 0
    fi
  fi
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

echo "CHESS_STUDIO_SIGNAL_DEPLOY repo_ref=$sha"
set +e
"$deploy_wrapper" "$sha"
deploy_rc=$?
set -e
if [[ "$deploy_rc" -eq 0 ]]; then
  rm -f "$failure_file"
  exit 0
fi

now="$(date +%s)"
tmp="$(mktemp "$state_dir/staging-signal-failure.XXXXXX")"
printf '%s %s\n' "$sha" "$now" >"$tmp"
chmod 0644 "$tmp"
mv -f "$tmp" "$failure_file"
exit "$deploy_rc"
