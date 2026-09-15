#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
probe="$root/infra/oci/probe"
bootstrap="$root/infra/oci/bootstrap"
staging="$root/infra/oci/staging"
verify="$root/infra/oci/verify"
bootstrap_key="chess-studio/bootstrap/terraform.tfstate"
staging_key="chess-studio/staging/terraform.tfstate"
verify_applied=0
api_key=""

fail() { echo "OCI staging verify: FAIL · $*" >&2; exit 1; }

validate_backend_value() {
  [[ "${1:-}" =~ ^[A-Za-z0-9._:/-]+$ ]] || fail "backend value contains unsupported characters"
}

configure_auth() {
  umask 077
  mkdir -p "$HOME/.oci"
  api_key="${RUNNER_TEMP:-/tmp}/chess-studio-oci-api-key.pem"
  printf '%s\n' "$OCI_PRIVATE_KEY" | sed 's/\r$//' > "$api_key"
  chmod 600 "$api_key"
  cat > "$HOME/.oci/config" <<EOF
[DEFAULT]
user=$OCI_USER_OCID
fingerprint=$OCI_FINGERPRINT
tenancy=$OCI_TENANCY_OCID
region=$OCI_REGION
key_file=$api_key
EOF
  chmod 600 "$HOME/.oci/config"
}

cleanup_verify_resource() {
  [[ "$verify_applied" -eq 1 ]] || return 0
  set +e
  terraform -chdir="$verify" destroy -no-color -auto-approve >/dev/null 2>&1
  local rc=$?
  set -e
  verify_applied=0
  return "$rc"
}

cleanup() {
  local rc=$?
  trap - EXIT
  if ! cleanup_verify_resource; then
    echo "OCI staging verify: WARN · failed to remove temporary console-history resource" >&2
    rc=1
  fi
  rm -f "$api_key" "$HOME/.oci/config" "$staging/backend.hcl" \
    "$verify/terraform.tfstate" "$verify/terraform.tfstate.backup"
  rm -rf "$probe/.terraform" "$bootstrap/.terraform" "$staging/.terraform" "$verify/.terraform"
  exit "$rc"
}

namespace_from_provider() {
  local plan namespace
  plan="${RUNNER_TEMP:-/tmp}/oci-verify-namespace.tfplan"
  rm -rf "$probe/.terraform"
  terraform -chdir="$probe" init -backend=false -no-color >/dev/null
  TF_VAR_tenancy_ocid="$OCI_TENANCY_OCID" TF_VAR_region="$OCI_REGION" \
    terraform -chdir="$probe" plan -no-color -out="$plan" >/dev/null
  namespace="$(terraform -chdir="$probe" show -json "$plan" | python3 -c '
import json, sys
value = json.load(sys.stdin).get("planned_values", {}).get("outputs", {}).get("object_storage_namespace", {}).get("value")
if not isinstance(value, str) or not value:
    raise SystemExit("object_storage_namespace was not resolved")
print(value)
')"
  rm -f "$plan"
  validate_backend_value "$namespace"
  printf '%s' "$namespace"
}

connect_states() {
  local namespace="$1"
  export OCI_TFSTATE_NAMESPACE="$namespace"
  export OCI_BOOTSTRAP_STATE_KEY="$bootstrap_key"
  export OCI_TFSTATE_BUCKET
  export OCI_REGION
  rm -rf "$bootstrap/.terraform"
  python3 -S "$root/scripts/oci_bootstrap_state.py" init >/dev/null
  terraform -chdir="$bootstrap" state pull >/dev/null || fail "bootstrap remote state is unreadable"

  cat > "$staging/backend.hcl" <<EOF
bucket = "$OCI_TFSTATE_BUCKET"
namespace = "$namespace"
key = "$staging_key"
region = "$OCI_REGION"
EOF
  chmod 600 "$staging/backend.hcl"
  rm -rf "$staging/.terraform"
  terraform -chdir="$staging" init -no-color -reconfigure -backend-config=backend.hcl >/dev/null
}

deployed_repo_ref() {
  terraform -chdir="$staging" show -json | python3 -c '
import base64, json, re, sys
payload = json.load(sys.stdin)
resources = payload.get("values", {}).get("root_module", {}).get("resources", [])
for item in resources:
    if item.get("address") != "oci_core_instance.backend":
        continue
    encoded = item.get("values", {}).get("metadata", {}).get("user_data", "")
    try:
        text = base64.b64decode(encoded).decode("utf-8", "replace")
    except Exception:
        break
    match = re.search(r"git checkout --detach .([0-9a-f]{40}).", text)
    if match:
        print(match.group(1))
        raise SystemExit(0)
raise SystemExit("could not recover deployed repo_ref from staging state")
'
}

validate_console_capture() {
  local file="$1" deployed_sha="$2"
  python3 - "$file" "$deployed_sha" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace").replace("\x00", "")
sha = sys.argv[2]
explicit = "CHESS_STUDIO_BOOTSTRAP_READY" in text
cloud_done = bool(re.search(r"Cloud-init .*finished at", text, re.IGNORECASE))
sha_seen = sha in text or sha[:7] in text
image_seen = "chess-studio-backend:oci" in text
if explicit or (cloud_done and sha_seen and image_seen):
    mode = "explicit marker" if explicit else "legacy boot evidence"
    print(f"OCI staging verify OK · {mode} · repo_ref={sha[:12]}")
    raise SystemExit(0)
print("OCI staging serial history did not prove bootstrap completion", file=sys.stderr)
print(f"signals: cloud_done={cloud_done} sha_seen={sha_seen} image_seen={image_seen} explicit={explicit}", file=sys.stderr)
lines = [line for line in text.splitlines() if line.strip()]
for line in lines[-80:]:
    print(line, file=sys.stderr)
raise SystemExit(1)
PY
}

self_test() {
  local sample="${RUNNER_TEMP:-/tmp}/oci-verify-self-test.log"
  cat > "$sample" <<'EOF'
HEAD is now at 0123456 test
naming to docker.io/library/chess-studio-backend:oci done
Cloud-init v. 24.1 finished at Mon, 15 Sep 2026 18:34:00 +0000
EOF
  validate_console_capture "$sample" 0123456789abcdef0123456789abcdef01234567 >/dev/null
  printf '%s\n' 'CHESS_STUDIO_BOOTSTRAP_READY repo_ref=0123456789abcdef0123456789abcdef01234567' > "$sample"
  validate_console_capture "$sample" 0123456789abcdef0123456789abcdef01234567 >/dev/null
  rm -f "$sample"
  echo "OCI staging verify self-test: OK"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

[[ -n "${OCI_REGION:-}" ]] || export OCI_REGION="eu-frankfurt-1"
[[ -n "${OCI_TFSTATE_BUCKET:-}" ]] || export OCI_TFSTATE_BUCKET="chess-studio-tfstate"
for name in OCI_TENANCY_OCID OCI_USER_OCID OCI_FINGERPRINT OCI_PRIVATE_KEY; do
  [[ -n "${!name:-}" ]] || fail "missing GitHub secret: $name"
done
validate_backend_value "$OCI_REGION"
validate_backend_value "$OCI_TFSTATE_BUCKET"
configure_auth
trap cleanup EXIT

namespace="$(namespace_from_provider)"
connect_states "$namespace"
instance_id="$(terraform -chdir="$staging" output -raw instance_id)"
[[ "$instance_id" == ocid1.instance.* ]] || fail "staging state has no valid instance_id"
deployed_sha="$(deployed_repo_ref)"
[[ "$deployed_sha" =~ ^[0-9a-f]{40}$ ]] || fail "staging state has no immutable deployed repo_ref"

rm -rf "$verify/.terraform"
rm -f "$verify/terraform.tfstate" "$verify/terraform.tfstate.backup"
terraform -chdir="$verify" init -backend=false -no-color >/dev/null
export TF_VAR_region="$OCI_REGION"
export TF_VAR_instance_id="$instance_id"
terraform -chdir="$verify" validate -no-color
terraform -chdir="$verify" apply -no-color -auto-approve
verify_applied=1
console_file="${RUNNER_TEMP:-/tmp}/oci-staging-console-history.log"
terraform -chdir="$verify" output -raw console_data > "$console_file"
cleanup_verify_resource || fail "failed to remove temporary console-history resource"
validate_console_capture "$console_file" "$deployed_sha"
rm -f "$console_file"
