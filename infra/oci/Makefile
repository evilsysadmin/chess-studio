SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT := $(abspath ../..)
TERRAFORM ?= terraform
PYTHON ?= python3

export TF_VAR_tenancy_ocid := $(OCI_TENANCY_OCID)
export TF_VAR_region := $(if $(OCI_REGION),$(OCI_REGION),eu-frankfurt-1)
export TF_VAR_state_bucket_name := $(if $(OCI_TFSTATE_BUCKET),$(OCI_TFSTATE_BUCKET),chess-studio-tfstate)

.PHONY: help auth probe bootstrap plan apply vault-iam destroy fmt fmt-check validate static secret-guard floci test

help:
	@printf '%s\n' \
		'OCI Terraform operations:' \
		'  make probe       read-only account/provider probe' \
		'  make bootstrap   create/recover persistent foundation + remote state' \
		'  make plan        plan replaceable OCI staging' \
		'  make apply       apply replaceable OCI staging' \
		'  make vault-iam   apply only the staging runtime Vault read policy' \
		'  make destroy     destroy staging only (OCI_CONFIRM_DESTROY=true required)' \
		'  make test        static Terraform contracts + secret guard + Floci' \
		'  make fmt-check   check Terraform formatting' \
		'  make validate    init/validate all OCI stacks without remote backends'

auth:
	@cd "$(ROOT)" && $(PYTHON) -S scripts/oci_auth_contract.py

probe bootstrap plan apply vault-iam: auth
	@cd "$(ROOT)" && bash scripts/oci_staging_lifecycle.sh "$@"

destroy: auth
	@test "$(OCI_CONFIRM_DESTROY)" = "true" || { echo 'ERROR: destroy requires OCI_CONFIRM_DESTROY=true'; exit 2; }
	@cd "$(ROOT)" && bash scripts/oci_staging_lifecycle.sh destroy

fmt:
	@cd "$(ROOT)" && $(TERRAFORM) fmt -recursive infra/oci

fmt-check:
	@cd "$(ROOT)" && $(TERRAFORM) fmt -check -diff -recursive infra/oci

validate:
	@for stack in bootstrap probe staging; do \
		$(TERRAFORM) -chdir="$(CURDIR)/$$stack" init -backend=false -no-color >/dev/null; \
		$(TERRAFORM) -chdir="$(CURDIR)/$$stack" validate -no-color; \
	done

static:
	@cd "$(ROOT)" && bash scripts/oci_terraform_static.sh

secret-guard:
	@cd "$(ROOT)" && ! grep -REn '(MONGO_URL|JWT_SECRET|RESEND_API_KEY|OTLP.*TOKEN|cloudflare_tunnel_token|private_key[[:space:]]*=)' infra/oci --include='*.tf' --include='*.tfvars' --include='*.tftpl'

floci:
	@cd "$(ROOT)" && bash scripts/oci_floci_smoke.sh

test: static secret-guard floci
	@echo 'OCI Terraform ops test suite: OK'
