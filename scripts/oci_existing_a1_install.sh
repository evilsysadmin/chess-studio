#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (sudo)' >&2
  exit 77
fi
if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'usage: oci_existing_a1_install.sh <40-char git sha>' >&2
  exit 64
fi

sha="$1"
repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}"
source_deploy="$repo/scripts/oci_staging_deploy_launcher.sh"
target_deploy=/usr/local/sbin/chess-studio-deploy

[[ -d "$repo/.git" ]] || { echo "missing repo checkout: $repo" >&2; exit 66; }
[[ -s "$env_file" ]] || { echo "missing runtime env: $env_file" >&2; exit 42; }

cd "$repo"
git fetch --no-tags --depth=1 origin "$sha"
git checkout --detach "$sha"
[[ -f "$source_deploy" && ! -L "$source_deploy" ]] || { echo "missing installer payload in $sha" >&2; exit 66; }

if ! docker compose version >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  if apt-cache show docker-compose-v2 >/dev/null 2>&1; then
    apt-get install -y docker-compose-v2
  elif apt-cache show docker-compose-plugin >/dev/null 2>&1; then
    apt-get install -y docker-compose-plugin
  else
    echo 'no Docker Compose v2 package available from configured apt repositories' >&2
    exit 69
  fi
fi

docker compose version >/dev/null 2>&1 || { echo 'Docker Compose v2 installation failed' >&2; exit 69; }
install -o root -g root -m 0755 "$source_deploy" "$target_deploy"
install -d -o root -g root -m 0755 /var/lib/chess-studio
chmod 0600 "$env_file"

# Preserve the last known build identity before replacing the legacy systemd
# docker-run wrapper. This gives the first Compose deployment a rollback target
# whenever the old image was built from an identifiable commit.
current_build="$(curl --silent --show-error --max-time 5 http://127.0.0.1:4000/api/release 2>/dev/null | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("build") or ""))' 2>/dev/null || true)"
if [[ "$current_build" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' "$current_build" >/var/lib/chess-studio/deployed.sha
  chmod 0644 /var/lib/chess-studio/deployed.sha
  if docker image inspect chess-studio-backend:oci >/dev/null 2>&1; then
    docker image tag chess-studio-backend:oci "chess-studio-backend:oci-$current_build"
  fi
fi

# The old unit owns a container named chess-studio-backend. Disable it before
# Compose takes ownership so it cannot resurrect a competing container later.
if systemctl list-unit-files chess-studio-backend.service >/dev/null 2>&1; then
  systemctl disable --now chess-studio-backend.service || true
fi
docker rm -f chess-studio-backend >/dev/null 2>&1 || true

"$target_deploy" "$sha"
printf '%s\n' "CHESS_STUDIO_EXISTING_A1_COMPOSE_READY repo_ref=$sha"
