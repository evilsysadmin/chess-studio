#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TRIVY="${TRIVY:-$ROOT/.tools/trivy}"
CACHE="${TRIVY_CACHE_DIR:-$ROOT/.trivy-cache}"
TTL_MINUTES="${TRIVY_DB_TTL_MINUTES:-720}"
OUTPUT="${1:-$ROOT/.security/trivy.json}"
SCAN_ROOT="${2:-$ROOT}"
DB="$CACHE/db/trivy.db"

mkdir -p "$CACHE" "$(dirname -- "$OUTPUT")"

skip_db_update=""
if [ -f "$DB" ] && find "$DB" -mmin "-$TTL_MINUTES" -print -quit 2>/dev/null | grep -q .; then
  skip_db_update="--skip-db-update"
  echo "==> Trivy DB cache fresca (<${TTL_MINUTES} min): reutilizando DB local."
else
  echo "==> Trivy DB ausente/antigua: Trivy actualizará la DB una vez."
fi

# El bundle de checks de misconfiguración ya usa su propia caché de Trivy.
# Solo forzamos skip de la vulnerability DB cuando sabemos que está fresca.
# shellcheck disable=SC2086
TRIVY_CACHE_DIR="$CACHE" "$TRIVY" fs \
  $skip_db_update \
  --skip-version-check \
  --scanners vuln,secret,misconfig \
  --include-dev-deps \
  --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
  --format json --output "$OUTPUT" \
  --skip-dirs node_modules --skip-dirs .venv --skip-dirs .git \
  --skip-dirs .tools --skip-dirs .trivy-cache --skip-dirs .security \
  "$SCAN_ROOT"
