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
  echo "==> Trivy image: DB ausente/antigua; se intentará actualizar una vez."
fi

build_image() {
  tag="$1"
  context="$2"
  scope="$3"

  if [ "${GITHUB_ACTIONS:-}" = "true" ] && docker buildx version >/dev/null 2>&1; then
    echo "==> BuildKit GHA cache: $scope"
    docker buildx build \
      --load \
      --cache-from "type=gha,scope=$scope" \
      --cache-to "type=gha,mode=max,scope=$scope" \
      --tag "$tag" \
      "$context"
  else
    docker build -t "$tag" "$context"
  fi
}

run_image_scan() {
  image="$1"
  output="$2"
  skip="$3"
  # shellcheck disable=SC2086
  TRIVY_CACHE_DIR="$CACHE" "$TRIVY" image \
    $skip \
    --skip-version-check \
    --scanners vuln \
    --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
    --format json --output "$output" \
    "$image"
}

scan_image() {
  image="$1"
  output="$2"

  if run_image_scan "$image" "$output" "$skip_db_update"; then
    :
  elif [ -f "$DB" ]; then
    echo "::warning title=Trivy image DB degradada::No se pudo refrescar la DB; se reutiliza la copia cacheada existente."
    rm -f "$output"
    run_image_scan "$image" "$output" "--skip-db-update"
  else
    echo "ERROR: Trivy image no pudo obtener DB y no existe copia cacheada." >&2
    return 2
  fi

  python3 "$ROOT/scripts/security_report.py" "$output"
  # Tras el primer scan la DB ya existe o hemos decidido usar la copia stale.
  # No intentes contactar de nuevo el registry para la segunda imagen.
  skip_db_update="--skip-db-update"
}

echo "==> Construyendo imagen frontend para security scan..."
build_image chess-studio-frontend:security "$ROOT/frontend" chess-studio-security-frontend
echo "==> Construyendo imagen backend para security scan..."
build_image chess-studio-backend:security "$ROOT/backend-python" chess-studio-security-backend

scan_image chess-studio-frontend:security "$SECURITY_DIR/trivy-image-frontend.json"
scan_image chess-studio-backend:security "$SECURITY_DIR/trivy-image-backend.json"

echo "==> Trivy image gate completo: ambas imágenes construidas y escaneadas."
