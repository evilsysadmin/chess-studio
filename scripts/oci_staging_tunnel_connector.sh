#!/usr/bin/env bash
set -euo pipefail

CLOUDFLARED_VERSION="2026.9.1"
CLOUDFLARED_SHA256="3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-arm64"
RUNTIME_BUCKET="chess-studio-staging-runtime"
TOKEN_OBJECT="cloudflared.token"
RUNTIME_USER="${SUDO_USER:-ocarun}"

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

require chown
require curl
require getent
require install
require runuser
require sha256sum
require setsid

runtime_home="$(getent passwd "$RUNTIME_USER" | awk -F: 'NR == 1 {print $6}')"
[[ -n "$runtime_home" ]] || { echo "unable to resolve home for $RUNTIME_USER" >&2; exit 67; }
runtime_python="${runtime_home}/.cache/chess-studio-oci-runtime/bin/python"
[[ -x "$runtime_python" ]] || { echo "missing OCI runtime python: $runtime_python" >&2; exit 69; }
"$runtime_python" -c 'import oci' >/dev/null 2>&1 || { echo 'OCI SDK missing from runtime python' >&2; exit 69; }

root="${runtime_home}/.cache/chess-studio-cloudflared"
token_file="$root/token"
bin="$root/cloudflared-${CLOUDFLARED_VERSION}"
pid_file="$root/pid"
log_file="$root/cloudflared.log"
install -d -o "$RUNTIME_USER" -m 0700 "$root"

TUNNEL_TOKEN_FILE="$token_file" TUNNEL_BUCKET="$RUNTIME_BUCKET" TUNNEL_OBJECT="$TOKEN_OBJECT" "$runtime_python" - <<'PY'
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
chown "$RUNTIME_USER" "$token_file"

if [[ ! -x "$bin" ]] || ! printf '%s  %s\n' "$CLOUDFLARED_SHA256" "$bin" | sha256sum --check --status; then
  tmp="$(mktemp /tmp/cloudflared-${CLOUDFLARED_VERSION}.XXXXXX)"
  trap 'rm -f "$tmp"' EXIT
  curl --fail --location --silent --show-error --retry 3 --retry-all-errors --max-time 120 \
    "$CLOUDFLARED_URL" -o "$tmp"
  printf '%s  %s\n' "$CLOUDFLARED_SHA256" "$tmp" | sha256sum --check --status
  install -o "$RUNTIME_USER" -m 0755 "$tmp" "$bin"
  rm -f "$tmp"
  trap - EXIT
fi

if [[ -s "$pid_file" ]]; then
  old_pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" || true
    for _ in $(seq 1 20); do
      kill -0 "$old_pid" 2>/dev/null || break
      sleep 0.25
    done
  fi
fi

: >"$log_file"
chown "$RUNTIME_USER" "$log_file"
rm -f "$pid_file"
runuser -u "$RUNTIME_USER" -- env HOME="$runtime_home" /bin/bash -c '
  set -euo pipefail
  nohup setsid "$1" tunnel --no-autoupdate --loglevel info --logfile "$2" run --token-file "$3" </dev/null >/dev/null 2>&1 &
  printf "%s\n" "$!" >"$4"
' bash "$bin" "$log_file" "$token_file" "$pid_file"

new_pid="$(cat "$pid_file" 2>/dev/null || true)"
[[ "$new_pid" =~ ^[0-9]+$ ]] || { echo 'cloudflared did not publish a valid pid' >&2; exit 70; }
sleep 3
if ! kill -0 "$new_pid" 2>/dev/null; then
  tail -n 40 "$log_file" >&2 || true
  exit 70
fi
printf '%s\n' "CHESS_STUDIO_CLOUDFLARED_READY pid=$new_pid version=$CLOUDFLARED_VERSION"
