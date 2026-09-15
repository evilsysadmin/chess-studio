#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$root/infra/oci/test-fixtures/floci-bootstrap"
container="chess-studio-floci-oci"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$fixture/test_key.pem" "$fixture/.terraform.lock.hcl"
  rm -rf "$fixture/.terraform" "$fixture/terraform.tfstate" "$fixture/terraform.tfstate.backup"
}
trap cleanup EXIT

docker run -d --rm --name "$container" -p 4599:4599 floci/floci-oci:latest >/dev/null

for _ in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:4599/_floci-oci/health >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:4599/_floci-oci/health >/dev/null

openssl genrsa -out "$fixture/test_key.pem" 2048 >/dev/null 2>&1

export TF_VAR_CLIENT_HOST_OVERRIDES="oci_identity.IdentityClient=http://127.0.0.1:4599;oci_object_storage.ObjectStorageClient=http://127.0.0.1:4599"
export TF_VAR_private_key_path="$fixture/test_key.pem"
export TF_IN_AUTOMATION=true
export TF_INPUT=false

terraform -chdir="$fixture" init -backend=false
terraform -chdir="$fixture" apply -auto-approve -no-color
terraform -chdir="$fixture" plan -detailed-exitcode -no-color
terraform -chdir="$fixture" destroy -auto-approve -no-color

echo "OCI Floci apply/zero-drift/destroy smoke passed"
