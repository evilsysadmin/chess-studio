data "oci_identity_compartments" "existing_infra" {
  compartment_id = var.tenancy_ocid
  access_level   = "ANY"
  name           = var.infra_compartment_name
  state          = "ACTIVE"
}

data "oci_identity_compartments" "existing_staging" {
  compartment_id = var.tenancy_ocid
  access_level   = "ANY"
  name           = var.staging_compartment_name
  state          = "ACTIVE"
}

locals {
  existing_infra_compartments   = [for item in data.oci_identity_compartments.existing_infra.compartments : item.id]
  existing_staging_compartments = [for item in data.oci_identity_compartments.existing_staging.compartments : item.id]
}

check "unique_existing_infra_compartment" {
  assert {
    condition     = length(local.existing_infra_compartments) <= 1
    error_message = "Expected at most one existing infra compartment with the configured name."
  }
}

check "unique_existing_staging_compartment" {
  assert {
    condition     = length(local.existing_staging_compartments) <= 1
    error_message = "Expected at most one existing staging compartment with the configured name."
  }
}

output "existing_infra_compartment_ocid" {
  value = length(local.existing_infra_compartments) == 1 ? local.existing_infra_compartments[0] : ""
}

output "existing_staging_compartment_ocid" {
  value = length(local.existing_staging_compartments) == 1 ? local.existing_staging_compartments[0] : ""
}
