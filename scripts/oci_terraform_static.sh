#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

terraform fmt -check -diff -recursive "$root/infra/oci"
python3 -S "$root/scripts/oci_auth_contract.py" --self-test
python3 -S "$root/scripts/oci_bootstrap_state.py" --self-test
python3 -S "$root/scripts/oci_bootstrap_recover.py" --self-test
bash "$root/scripts/oci_staging_lifecycle.sh" --self-test
bash "$root/scripts/oci_staging_verify.sh" --self-test

for stack in bootstrap probe staging verify; do
  dir="$root/infra/oci/$stack"
  terraform -chdir="$dir" init -backend=false
  terraform -chdir="$dir" validate -no-color
  terraform -chdir="$dir" test -no-color
done

echo "OCI Terraform bootstrap + probe + staging + verify static contracts passed"
