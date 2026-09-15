#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bootstrap="$root/infra/oci/bootstrap"
staging="$root/infra/oci/staging"
bootstrap_key="chess-studio/bootstrap/terraform.tfstate"
staging_key="chess-studio/staging/terraform.tfstate"

die() { echo "OCI staging lifecycle: FAIL · $*" >&2; exit 1; }

valid_operation() {
  case "${1:-}" in bootstrap|plan|apply|destroy) return 0 ;; *) return 1 ;; esac
}

valid_sha() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }
valid_image_override() { [[ -z "${1:-}" || "${1:-}" == ocid1.image.* ]]; }

validate_backend_value() {
  [[ "${1:-}" =~ ^[A-Za-z0-9._:/-]+$ ]] || die "backend value contains unsupported characters"
}

render_backend() {
  local bucket="$1" namespace="$2" key="$3" region="$4"
  validate_backend_value "$bucket"
  validate_backend_value "$namespace"
  validate_backend_value "$key"
  validate_backend_value "$region"
  printf 'bucket = "%s"\nnamespace = "%s"\nkey = "%s"\nregion = "%s"\n' \
    "$bucket" "$namespace" "$key" "$region"
}

require_current_main() {
  [[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || die "mutations are allowed only from refs/heads/main"
  valid_sha "${GITHUB_SHA:-}" || die "GITHUB_SHA must be an immutable 40-character SHA"
  local remote_sha
  remote_sha="$(git ls-remote origin refs/heads/main | awk 'NR==1 {print $1}')"
  valid_sha "$remote_sha" || die "could not resolve current origin/main"
  [[ "$remote_sha" == "$GITHUB_SHA" ]] || die "stale SHA: workflow=$GITHUB_SHA current-main=$remote_sha"
}

require_auth() {
  local name
  for name in OCI_TENANCY_OCID OCI_USER_OCID OCI_FINGERPRINT OCI_PRIVATE_KEY; do
    [[ -n "${!name:-}" ]] || die "missing GitHub secret: $name"
  done
  [[ "$OCI_TENANCY_OCID" == ocid1.tenancy.* ]] || die "OCI_TENANCY_OCID does not look like a tenancy OCID"
  [[ "$OCI_USER_OCID" == ocid1.user.* ]] || die "OCI_USER_OCID does not look like a user OCID"
  grep -q 'BEGIN .*PRIVATE KEY' <<<"$OCI_PRIVATE_KEY" || die "OCI_PRIVATE_KEY does not look like a PEM private key"
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

clean_bootstrap_local_backend() {
  rm -rf "$bootstrap/.terraform"
  rm -f "$bootstrap/backend.generated.tf" "$bootstrap/backend.hcl"
}

cleanup() {
  rm -f "${api_key:-}" "$HOME/.oci/config" "$staging/backend.hcl"
  rm -rf "$bootstrap/.terraform" "$staging/.terraform"
}

namespace_from_provider() {
  local plan namespace
  plan="${RUNNER_TEMP:-/tmp}/oci-namespace.tfplan"
  clean_bootstrap_local_backend
  terraform -chdir="$bootstrap" init -backend=false -no-color >/dev/null
  TF_VAR_tenancy_ocid="$OCI_TENANCY_OCID" TF_VAR_region="$OCI_REGION" \
    terraform -chdir="$bootstrap" plan -no-color \
      -target=data.oci_objectstorage_namespace.this -out="$plan" >/dev/null
  namespace="$(terraform -chdir="$bootstrap" show -json "$plan" | python3 -c '
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

connect_bootstrap_remote() {
  local namespace="$1"
  export OCI_TFSTATE_NAMESPACE="$namespace"
  export OCI_BOOTSTRAP_STATE_KEY="$bootstrap_key"
  python3 -S "$root/scripts/oci_bootstrap_state.py" init >/dev/null
  terraform -chdir="$bootstrap" state pull >/dev/null || die "bootstrap remote state is not readable; run bootstrap first"
}

staging_compartment() {
  local value
  value="$(terraform -chdir="$bootstrap" output -raw staging_compartment_ocid)"
  [[ "$value" == ocid1.compartment.* ]] || die "bootstrap output staging_compartment_ocid is invalid"
  printf '%s' "$value"
}

write_staging_backend() {
  local namespace="$1"
  render_backend "$OCI_TFSTATE_BUCKET" "$namespace" "$staging_key" "$OCI_REGION" > "$staging/backend.hcl"
  chmod 600 "$staging/backend.hcl"
}

validate_staging_overrides() {
  valid_image_override "${OCI_IMAGE_OCID:-}" || die "OCI_IMAGE_OCID does not look like an image OCID"
  if [[ -n "${OCI_AVAILABILITY_DOMAIN:-}" ]]; then
    validate_backend_value "$OCI_AVAILABILITY_DOMAIN"
  fi
}

prepare_staging() {
  local namespace="$1" compartment="$2"
  write_staging_backend "$namespace"
  rm -rf "$staging/.terraform"
  terraform -chdir="$staging" init -no-color -reconfigure -backend-config=backend.hcl >/dev/null
  export TF_VAR_region="$OCI_REGION"
  export TF_VAR_compartment_ocid="$compartment"
  export TF_VAR_repo_ref="$GITHUB_SHA"
  unset TF_VAR_availability_domain TF_VAR_image_ocid
  if [[ -n "${OCI_AVAILABILITY_DOMAIN:-}" ]]; then
    export TF_VAR_availability_domain="$OCI_AVAILABILITY_DOMAIN"
  fi
  if [[ -n "${OCI_IMAGE_OCID:-}" ]]; then
    export TF_VAR_image_ocid="$OCI_IMAGE_OCID"
  fi
  terraform -chdir="$staging" validate -no-color
}

bootstrap_foundation() {
  local namespace="$1" plan rc
  require_current_main
  plan="${RUNNER_TEMP:-/tmp}/oci-bootstrap.tfplan"
  clean_bootstrap_local_backend
  terraform -chdir="$bootstrap" init -backend=false -no-color >/dev/null
  export TF_VAR_tenancy_ocid="$OCI_TENANCY_OCID"
  export TF_VAR_region="$OCI_REGION"
  export TF_VAR_state_bucket_name="$OCI_TFSTATE_BUCKET"
  terraform -chdir="$bootstrap" plan -no-color -out="$plan"
  require_current_main
  terraform -chdir="$bootstrap" apply -no-color -auto-approve "$plan"
  export OCI_TFSTATE_NAMESPACE="$namespace"
  export OCI_BOOTSTRAP_STATE_KEY="$bootstrap_key"
  python3 -S "$root/scripts/oci_bootstrap_state.py" migrate
  set +e
  terraform -chdir="$bootstrap" plan -no-color -detailed-exitcode >/dev/null
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || die "bootstrap remote state is not zero-drift after migration (terraform rc=$rc)"
  echo "OCI bootstrap foundation created, migrated and zero-drift verified"
}

run_staging() {
  local operation="$1" namespace="$2" compartment plan
  validate_staging_overrides
  prepare_staging "$namespace" "$compartment"
  plan="${RUNNER_TEMP:-/tmp}/oci-staging.tfplan"
  case "$operation" in
    plan)
      terraform -chdir="$staging" plan -no-color -out="$plan"
      ;;
    apply)
      terraform -chdir="$staging" plan -no-color -out="$plan"
      require_current_main
      terraform -chdir="$staging" apply -no-color -auto-approve "$plan"
      terraform -chdir="$staging" output -no-color
      ;;
    destroy)
      [[ "${OCI_CONFIRM_DESTROY:-false}" == "true" ]] || die "destroy requires confirm_destroy=true"
      terraform -chdir="$staging" plan -destroy -no-color -out="$plan"
      require_current_main
      terraform -chdir="$staging" apply -no-color -auto-approve "$plan"
      ;;
  esac
}

self_test() {
  for op in bootstrap plan apply destroy; do valid_operation "$op" || exit 1; done
  ! valid_operation explode || exit 1
  valid_sha 0123456789abcdef0123456789abcdef01234567 || exit 1
  ! valid_sha main || exit 1
  valid_image_override "" || exit 1
  valid_image_override ocid1.image.oc1.eu-frankfurt-1.test || exit 1
  ! valid_image_override nope || exit 1
  local text
  text="$(render_backend chess-studio-tfstate namespace123 "$staging_key" eu-frankfurt-1)"
  for marker in chess-studio-tfstate namespace123 "$staging_key" eu-frankfurt-1; do
    grep -Fq "$marker" <<<"$text" || exit 1
  done
  ! grep -Eq 'private_key|fingerprint|user_ocid|tenancy_ocid' <<<"$text" || exit 1
  echo "OCI staging lifecycle self-test: OK"
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

operation="${1:-}"
valid_operation "$operation" || die "operation must be bootstrap, plan, apply or destroy"
[[ -n "${OCI_REGION:-}" ]] || export OCI_REGION="eu-frankfurt-1"
[[ -n "${OCI_TFSTATE_BUCKET:-}" ]] || export OCI_TFSTATE_BUCKET="chess-studio-tfstate"
validate_backend_value "$OCI_REGION"
validate_backend_value "$OCI_TFSTATE_BUCKET"
require_auth
configure_auth
trap cleanup EXIT

namespace="$(namespace_from_provider)"
if [[ "$operation" == "bootstrap" ]]; then
  bootstrap_foundation "$namespace"
  exit 0
fi

connect_bootstrap_remote "$namespace"
compartment="$(staging_compartment)"
run_staging "$operation" "$namespace" "$compartment"
