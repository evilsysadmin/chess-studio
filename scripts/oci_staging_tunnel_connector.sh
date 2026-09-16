#!/usr/bin/env bash
set -euo pipefail

CLOUDFLARED_VERSION="2026.9.1"
CLOUDFLARED_SHA256="3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-arm64"
RUNTIME_BUCKET="chess-studio-staging-runtime"
TOKEN_OBJECT="cloudflared.token"
RUNTIME_USER="${SUDO_USER:-ocarun}"
TOKEN_DIR="/etc/chess-studio"
TOKEN_PATH="${TOKEN_DIR}/cloudflared.token"
BIN_DIR="/usr/local/libexec/chess-studio"
BIN_PATH="${BIN_DIR}/cloudflared-${CLOUDFLARED_VERSION}"
UNIT_NAME="chess-studio-cloudflared.service"
UNIT_PATH="/etc/systemd/system/${UNIT_NAME}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 69; }
}

self_test() {
  [[ "$CLOUDFLARED_VERSION" =~ ^[0-9]{4}\.[0-9]+\.[0-9]+$ ]]
  [[ "$CLOUDFLARED_SHA256" =~ ^[0-9a-f]{64}$ ]]
  [[ "$CLOUDFLARED_URL" == https://github.com/cloudflare/cloudflared/releases/download/*/cloudflared-linux-arm64 ]]
  [[ "$RUNTIME_BUCKET" == "chess-studio-staging-runtime" ]]
  [[ "$TOKEN_OBJECT" == "cloudflared.token" ]]
  echo 'OCI staging tunnel connector self-test: OK'
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'usage: oci_staging_tunnel_connector.sh [--self-test]' >&2
  exit 64
fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'run as root (through chess-studio deploy wrapper)' >&2
  exit 77
fi

require curl
require getent
require install
require sha256sum
require systemctl

runtime_home="$(getent passwd "$RUNTIME_USER" | awk -F: 'NR == 1 {print $6}')"
[[ -n "$runtime_home" ]] || { echo "unable to resolve home for $RUNTIME_USER" >&2; exit 67; }
runtime_python="${runtime_home}/.cache/chess-studio-oci-runtime/bin/python"
[[ -x "$runtime_python" ]] || { echo "missing OCI runtime python: $runtime_python" >&2; exit 69; }
"$runtime_python" -c 'import oci' >/dev/null 2>&1 || { echo 'OCI SDK missing from runtime python' >&2; exit 69; }

install -d -o root -g root -m 0755 "$TOKEN_DIR" "$BIN_DIR"
tmp_token="$(mktemp /tmp/chess-studio-cloudflared-token.XXXXXX)"
tmp_bin=''
tmp_unit="$(mktemp /tmp/chess-studio-cloudflared-unit.XXXXXX)"
cleanup() {
  rm -f "$tmp_token" "$tmp_unit"
  [[ -z "$tmp_bin" ]] || rm -f "$tmp_bin"
}
trap cleanup EXIT

TUNNEL_TOKEN_FILE="$tmp_token" TUNNEL_BUCKET="$RUNTIME_BUCKET" TUNNEL_OBJECT="$TOKEN_OBJECT" "$runtime_python" - <<'PY'
import os
from pathlib import Path
import oci

path = Path(os.environ['TUNNEL_TOKEN_FILE'])
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={}, signer=signer)
namespace = str(client.get_namespace(retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY).data or '')
if not namespace:
    raise SystemExit('empty OCI Object Storage namespace')
response = client.get_object(
    namespace,
    os.environ['TUNNEL_BUCKET'],
    os.environ['TUNNEL_OBJECT'],
    retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
)
data = response.data.content
if len(data) < 80 or len(data) > 4096:
    raise SystemExit('invalid tunnel token object size')
text = data.decode('utf-8').strip()
if not text or any(ch.isspace() for ch in text):
    raise SystemExit('invalid tunnel token object')
path.write_text(text + '\n', encoding='utf-8')
os.chmod(path, 0o600)
PY

install -o root -g "$RUNTIME_USER" -m 0640 "$tmp_token" "$TOKEN_PATH"

if [[ ! -x "$BIN_PATH" ]] || ! printf '%s  %s\n' "$CLOUDFLARED_SHA256" "$BIN_PATH" | sha256sum --check --status; then
  tmp_bin="$(mktemp /tmp/cloudflared-${CLOUDFLARED_VERSION}.XXXXXX)"
  curl --fail --location --silent --show-error --retry 3 --retry-all-errors --max-time 120 \
    "$CLOUDFLARED_URL" -o "$tmp_bin"
  printf '%s  %s\n' "$CLOUDFLARED_SHA256" "$tmp_bin" | sha256sum --check --status
  install -o root -g root -m 0755 "$tmp_bin" "$BIN_PATH"
fi

cat >"$tmp_unit" <<EOF_UNIT
[Unit]
Description=Chess Studio OCI staging Cloudflare Tunnel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${RUNTIME_USER}
Group=${RUNTIME_USER}
ExecStart=${BIN_PATH} tunnel --no-autoupdate --loglevel info run --token-file ${TOKEN_PATH}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
EOF_UNIT
install -o root -g root -m 0644 "$tmp_unit" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$UNIT_NAME" >/dev/null
systemctl restart "$UNIT_NAME"

for _ in $(seq 1 20); do
  if systemctl is-active --quiet "$UNIT_NAME"; then
    echo "CHESS_STUDIO_CLOUDFLARED_READY unit=$UNIT_NAME version=$CLOUDFLARED_VERSION"
    exit 0
  fi
  sleep 0.5
done
systemctl status "$UNIT_NAME" --no-pager >&2 || true
exit 70
