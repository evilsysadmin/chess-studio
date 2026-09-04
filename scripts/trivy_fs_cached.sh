#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TRIVY="${TRIVY:-$ROOT/.tools/trivy}"
CACHE="${TRIVY_CACHE_DIR:-${HOME:-$ROOT}/.cache/trivy}"
TTL_MINUTES="${TRIVY_DB_TTL_MINUTES:-720}"
OUTPUT="${1:-$ROOT/.security/trivy.json}"
SCAN_ROOT="${2:-$ROOT}"
DB="$CACHE/db/trivy.db"

mkdir -p "$CACHE" "$(dirname -- "$OUTPUT")"

run_scan() {
  skip="$1"
  # shellcheck disable=SC2086
  TRIVY_CACHE_DIR="$CACHE" "$TRIVY" fs \
    $skip \
    --skip-version-check \
    --scanners vuln,secret,misconfig \
    --include-dev-deps \
    --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
    --format json --output "$OUTPUT" \
    --skip-dirs node_modules --skip-dirs .venv --skip-dirs .git \
    --skip-dirs .tools --skip-dirs .trivy-cache --skip-dirs .security \
    "$SCAN_ROOT"
}

if [ -f "$DB" ] && find "$DB" -mmin "-$TTL_MINUTES" -print -quit 2>/dev/null | grep -q .; then
  echo "==> Trivy DB cache fresca (<${TTL_MINUTES} min): reutilizando DB local."
  run_scan "--skip-db-update"
  exit 0
fi

echo "==> Trivy DB ausente/antigua: intentando actualizar antes del scan."
if run_scan ""; then
  exit 0
fi

# La disponibilidad del CDN/registry de Trivy no debe convertirse en una caída
# del delivery si existe una DB verificada de una ejecución anterior. La señal
# queda explícitamente degradada y el scan sigue siendo obligatorio.
if [ -f "$DB" ]; then
  echo "::warning title=Trivy DB degradada::No se pudo refrescar la DB; se reutiliza la copia cacheada existente."
  rm -f "$OUTPUT"
  run_scan "--skip-db-update"
  exit 0
fi

echo "ERROR: Trivy no pudo obtener una DB y no existe copia cacheada utilizable." >&2
exit 2
