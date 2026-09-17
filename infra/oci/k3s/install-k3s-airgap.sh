#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo 'install-k3s-airgap: root required' >&2
  exit 77
fi

bundle_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
binary="$bundle_root/bin/k3s"
images="$bundle_root/images/k3s-airgap-images-arm64.tar.zst"

[[ -f "$binary" && ! -L "$binary" ]] || { echo 'install-k3s-airgap: missing regular k3s binary' >&2; exit 66; }
[[ -f "$images" && ! -L "$images" ]] || { echo 'install-k3s-airgap: missing regular arm64 airgap archive' >&2; exit 66; }

install -o root -g root -m 0755 "$binary" /usr/local/bin/k3s
install -d -o root -g root -m 0755 /var/lib/rancher/k3s/agent/images
install -o root -g root -m 0644 "$images" /var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst
install -d -o root -g root -m 0755 /var/lib/chess-studio
printf '%s\n' 'K3S_AIRGAP_ASSETS_READY' > /var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY
chmod 0644 /var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY

echo 'install-k3s-airgap: assets installed; cluster intentionally not initialized'
