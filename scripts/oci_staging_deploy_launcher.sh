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
git -C "$repo" fetch --no-tags --depth=1 origin "$sha"
git -C "$repo" checkout --detach "$sha"
[[ -f "$payload" && ! -L "$payload" ]] || { echo "missing deploy payload in $sha: $payload" >&2; exit 66; }

CHESS_STUDIO_CHECKOUT_READY=1 exec /bin/bash "$payload" "$target" "$sha"
