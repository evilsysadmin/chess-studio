mock_provider "oci" {}

variables {
  tenancy_ocid = "ocid1.tenancy.oc1..chessstudiotest"
}

run "private_versioned_state_foundation" {
  command = plan

  assert {
    condition     = oci_objectstorage_bucket.terraform_state.access_type == "NoPublicAccess"
    error_message = "Terraform state bucket must never be public."
  }

  assert {
    condition     = oci_objectstorage_bucket.terraform_state.versioning == "Enabled"
    error_message = "Terraform state bucket must keep versioning enabled for recovery."
  }

  assert {
    condition     = oci_identity_compartment.infra.name != oci_identity_compartment.staging.name
    error_message = "Infra/state and staging compartments must remain distinct."
  }
}
