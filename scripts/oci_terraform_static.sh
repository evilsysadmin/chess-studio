#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

terraform fmt -check -diff -recursive "$root/infra/oci"

for stack in bootstrap staging; do
  dir="$root/infra/oci/$stack"
  terraform -chdir="$dir" init -backend=false
  terraform -chdir="$dir" validate -no-color
  terraform -chdir="$dir" test -no-color
done

echo "OCI Terraform bootstrap + staging static contracts passed"
