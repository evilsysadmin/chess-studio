#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${OCI_ARM64_IMAGE_TAG:-chess-studio-backend:oci-arm64-smoke}"

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker no está disponible." >&2; exit 2; }
docker buildx version >/dev/null 2>&1 || { echo "ERROR: docker buildx no está disponible." >&2; exit 2; }

echo "==> OCI ARM64 · construyendo backend linux/arm64"
docker buildx build \
  --platform linux/arm64 \
  --load \
  --tag "$TAG" \
  "$ROOT/backend-python"

echo "==> OCI ARM64 · ejecutando imports críticos dentro de la imagen"
docker run --rm \
  --platform linux/arm64 \
  --entrypoint python \
  "$TAG" \
  -c "import platform; import fastapi, uvicorn, chess, motor, pydantic, bcrypt, jwt, httpx; machine=platform.machine().lower(); assert machine in {'aarch64','arm64'}, machine; print(f'OCI ARM64 smoke OK · arch={machine} · FastAPI={fastapi.__version__} · Pydantic={pydantic.__version__}')"

echo "==> OCI ARM64 OK · imagen backend construible y ejecutable en Ampere/AArch64"
