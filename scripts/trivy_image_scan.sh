#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TRIVY="${TRIVY:-$ROOT/.tools/trivy}"
CACHE="${TRIVY_CACHE_DIR:-${HOME:-$ROOT}/.cache/trivy}"
TTL_MINUTES="${TRIVY_DB_TTL_MINUTES:-720}"
SECURITY_DIR="${SECURITY_DIR:-$ROOT/.security}"
DB="$CACHE/db/trivy.db"

mkdir -p "$CACHE" "$SECURITY_DIR"

skip_db_update=""
if [ -f "$DB" ] && find "$DB" -mmin "-$TTL_MINUTES" -print -quit 2>/dev/null | grep -q .; then
  skip_db_update="--skip-db-update"
  echo "==> Trivy image: reutilizando DB local fresca (<${TTL_MINUTES} min)."
else
  echo "==> Trivy image: DB ausente/antigua; se actualizará una vez."
fi

scan_image() {
  image="$1"
  output="$2"
  # shellcheck disable=SC2086
  TRIVY_CACHE_DIR="$CACHE" "$TRIVY" image \
    $skip_db_update \
    --skip-version-check \
    --scanners vuln \
    --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
    --format json --output "$output" \
    "$image"
  python3 "$ROOT/scripts/security_report.py" "$output"
  # Después del primer scan la DB ya existe; no intentes refrescarla otra vez
  # para la segunda imagen dentro de la misma ejecución.
  skip_db_update="--skip-db-update"
}

echo "==> Construyendo imagen frontend para security scan..."
docker build -t chess-studio-frontend:security "$ROOT/frontend"
echo "==> Construyendo imagen backend para security scan..."
docker build -t chess-studio-backend:security "$ROOT/backend-python"

scan_image chess-studio-frontend:security "$SECURITY_DIR/trivy-image-frontend.json"
scan_image chess-studio-backend:security "$SECURITY_DIR/trivy-image-backend.json"

echo "==> Trivy image gate completo: ambas imágenes construidas y escaneadas."
