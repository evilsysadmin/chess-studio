#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack="$root/infra/oci/bootstrap"
container="chess-studio-floci-oci"
key_file="$(mktemp)"
plan_file="$stack/floci.plan"
plan_json="$stack/floci.plan.json"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$key_file" "$plan_file" "$plan_json" "$stack/.terraform.lock.hcl" "$stack/terraform.tfstate" "$stack/terraform.tfstate.backup"; rm -rf "$stack/.terraform"' EXIT

docker run -d --rm --name "$container" -p 4599:4599 floci/floci-oci:latest >/dev/null
for _ in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:4599/_floci-oci/health >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:4599/_floci-oci/health >/dev/null

openssl genrsa -out "$key_file" 2048 >/dev/null 2>&1
export OCI_TENANCY_OCID="ocid1.tenancy.oc1..flocilocaltenancy0000000000000000000000000000000000000000"
export OCI_USER_OCID="ocid1.user.oc1..flociiacuser00000000000000000000000000000000000000000000000"
export OCI_FINGERPRINT="aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99"
export OCI_PRIVATE_KEY_PATH="$key_file"
export TF_VAR_tenancy_ocid="$OCI_TENANCY_OCID"
export TF_VAR_state_bucket_name="chess-studio-floci-state"
export TF_VAR_CLIENT_HOST_OVERRIDES="oci_identity.IdentityClient=http://127.0.0.1:4599;oci_object_storage.ObjectStorageClient=http://127.0.0.1:4599"
export TF_IN_AUTOMATION=true
export TF_INPUT=false

terraform -chdir="$stack" init
terraform -chdir="$stack" apply -auto-approve -no-color

set +e
terraform -chdir="$stack" plan -out="$plan_file" -detailed-exitcode -no-color
plan_rc=$?
set -e
case "$plan_rc" in
  0)
    echo "Floci reports zero drift"
    ;;
  2)
    terraform -chdir="$stack" show -json "$plan_file" > "$plan_json"
    python3 - "$plan_json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    plan = json.load(fh)
changes = [
    item for item in plan.get("resource_changes", [])
    if item.get("change", {}).get("actions") != ["no-op"]
]
if len(changes) != 1:
    summary = [(item.get("address"), item.get("change", {}).get("actions")) for item in changes]
    raise SystemExit(f"unexpected Floci drift: effective changes={summary}")
change = changes[0]
delta = change.get("change", {})
before = delta.get("before") or {}
after = delta.get("after") or {}
if change.get("address") != "oci_objectstorage_bucket.terraform_state":
    raise SystemExit(f"unexpected Floci drift resource: {change.get('address')}")
if delta.get("actions") != ["update"]:
    raise SystemExit(f"unexpected Floci drift actions: {delta.get('actions')}")
changed_keys = {key for key in set(before) | set(after) if before.get(key) != after.get(key)}
if changed_keys != {"versioning"} or before.get("versioning") != "Disabled" or after.get("versioning") != "Enabled":
    raise SystemExit(f"unexpected Floci drift payload: changed={sorted(changed_keys)} before={before.get('versioning')} after={after.get('versioning')}")
print("Accepted known Floci limitation: bucket versioning reads back Disabled after creation")
PY
    ;;
  *)
    echo "terraform plan failed with exit code $plan_rc" >&2
    exit "$plan_rc"
    ;;
esac

terraform -chdir="$stack" destroy -auto-approve -no-color

echo "OCI bootstrap Floci apply/drift-guard/destroy smoke passed"
