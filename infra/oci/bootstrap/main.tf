data "oci_objectstorage_namespace" "this" {
  compartment_id = var.tenancy_ocid
}

resource "oci_identity_compartment" "infra" {
  compartment_id = var.tenancy_ocid
  name           = var.infra_compartment_name
  description    = "Chess Studio Terraform state and shared OCI lab foundation"
  enable_delete  = true
  freeform_tags  = var.freeform_tags
}

resource "oci_identity_compartment" "staging" {
  compartment_id = var.tenancy_ocid
  name           = var.staging_compartment_name
  description    = "Replaceable Chess Studio OCI staging/lab resources"
  enable_delete  = true
  freeform_tags  = var.freeform_tags
}

resource "oci_objectstorage_bucket" "terraform_state" {
  compartment_id = oci_identity_compartment.infra.id
  namespace      = data.oci_objectstorage_namespace.this.namespace
  name           = var.state_bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Enabled"
  freeform_tags  = var.freeform_tags
}
