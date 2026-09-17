#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'K3s capability provisioning requires root' >&2
  exit 77
fi

repo="${CHESS_STUDIO_REPO:-/opt/chess-studio/repo}"
installer="$repo/scripts/oci_k3s_assets_root.py"
controller="$repo/scripts/oci_k3s_control_root.py"
sudoers="$repo/infra/oci/runtime/ocarun.sudoers"
asset_target=/usr/local/sbin/chess-studio-k3s-assets
control_target=/usr/local/sbin/chess-studio-k3s-control
source_copy=/etc/chess-studio/ocarun.sudoers
active=/etc/sudoers.d/101-chess-studio-ocarun

command -v python3 >/dev/null 2>&1 || { echo 'python3 is required' >&2; exit 69; }
command -v visudo >/dev/null 2>&1 || { echo 'visudo is required' >&2; exit 69; }
[[ -f "$installer" && ! -L "$installer" ]] || { echo 'missing K3s root asset installer' >&2; exit 66; }
[[ -f "$controller" && ! -L "$controller" ]] || { echo 'missing K3s root lifecycle controller' >&2; exit 66; }
[[ -f "$sudoers" && ! -L "$sudoers" ]] || { echo 'missing OCI runtime sudoers contract' >&2; exit 66; }

python3 -S "$installer" self-test
python3 -S "$controller" self-test
visudo -cf "$sudoers" >/dev/null
install -o root -g root -m 0755 "$installer" "$asset_target"
install -o root -g root -m 0755 "$controller" "$control_target"
install -d -o root -g root -m 0755 /etc/chess-studio /etc/sudoers.d
install -o root -g root -m 0440 "$sudoers" "$source_copy"
install -o root -g root -m 0440 "$sudoers" "$active"
visudo -cf "$active" >/dev/null

echo 'OCI_K3S_CAPABILITIES_READY assets=true lifecycle=true'
