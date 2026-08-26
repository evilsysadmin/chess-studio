#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TOOLS="$ROOT/.tools"
DEST="$TOOLS/trivy"
VERSION="${TRIVY_VERSION:-0.74.0}"

if [ -x "$DEST" ] && "$DEST" --version 2>/dev/null | grep -q "Version: $VERSION"; then
  exit 0
fi

case "$(uname -s)" in
  Linux) os="Linux" ;;
  *) echo "ERROR: instalación automática de Trivy soportada aquí solo en Linux." >&2; exit 2 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch="64bit" ;;
  aarch64|arm64) arch="ARM64" ;;
  *) echo "ERROR: arquitectura no soportada automáticamente: $(uname -m)" >&2; exit 2 ;;
esac

mkdir -p "$TOOLS"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
asset="trivy_${VERSION}_${os}-${arch}.tar.gz"
base="https://github.com/aquasecurity/trivy/releases/download/v${VERSION}"

echo "==> Instalando Trivy v${VERSION} en .tools/trivy..."
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/trivy_${VERSION}_checksums.txt" -o "$tmp/checksums.txt"
(
  cd "$tmp"
  grep "  $asset\$" checksums.txt | sha256sum -c -
)
tar -xzf "$tmp/$asset" -C "$tmp" trivy
install -m 0755 "$tmp/trivy" "$DEST"
"$DEST" --version
