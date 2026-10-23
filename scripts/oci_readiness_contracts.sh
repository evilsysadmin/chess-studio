#!/usr/bin/env bash
# One reusable fail-closed local suite; keep the OCI readiness workflow concise.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

python3 -S scripts/oci_staging_cors_contract.py
python3 -S scripts/oci_blue_green_edge.py --self-test
python3 -S scripts/oci_service_contracts.py --self-test
python3 -S scripts/oci_staging_deploy_watcher.py --self-test
bash scripts/oci_staging_signal_controller.sh --self-test
python3 -S scripts/oci_release_deploy.py --self-test
python3 -S scripts/oci_runtime_manifest.py --self-test
python3 -S scripts/oci_vault_compare.py --self-test
python3 -S scripts/oci_vault_preview.py --self-test
python3 scripts/oci_runtime_bundle.py
bash -n scripts/oci_existing_a1_deploy.sh
