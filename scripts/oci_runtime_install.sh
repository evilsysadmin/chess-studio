#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (sudo)' >&2
  exit 77
fi
if [[ $# -ne 1 ]]; then
  echo 'runtime source path required' >&2
  exit 64
fi

src="$1"
[[ "$src" == /tmp/* ]] || { echo 'runtime source must live in /tmp' >&2; exit 64; }
base="${src#/tmp/}"
if [[ "$base" =~ ^chess-studio-backend\.env\.production\.[A-Za-z0-9]+$ ]]; then
  target=production
  destination=/etc/chess-studio/production/backend.env
elif [[ "$base" =~ ^chess-studio-backend\.env\.[A-Za-z0-9]+$ ]]; then
  target=staging
  destination=/etc/chess-studio/backend.env
else
  echo 'refusing unexpected runtime source path' >&2
  exit 64
fi
[[ -f "$src" && ! -L "$src" ]] || { echo 'runtime source must be a regular non-symlink file' >&2; exit 65; }
[[ -s "$src" ]] || { echo 'runtime source is empty' >&2; exit 65; }

install -d -o root -g root -m 0755 "$(dirname "$destination")"
install -o root -g root -m 0600 "$src" "$destination"
rm -f "$src"
printf '%s\n' "CHESS_STUDIO_RUNTIME_ENV_READY target=$target"
