#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack="$root/infra/oci/bootstrap"
container="chess-studio-floci-oci"
key_file="$(mktemp)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$key_file" "$stack/.terraform.lock.hcl" "$stack/terraform.tfstate" "$stack/terraform.tfstate.backup"; rm -rf "$stack/.terraform"' EXIT

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
terraform -chdir="$stack" plan -detailed-exitcode -no-color
terraform -chdir="$stack" destroy -auto-approve -no-color

echo "OCI bootstrap Floci apply/zero-drift/destroy smoke passed"
