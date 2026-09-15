data "oci_objectstorage_namespace" "runtime" {
  compartment_id = var.tenancy_ocid
}

resource "oci_objectstorage_bucket" "runtime_config" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.runtime.namespace
  name           = var.runtime_config_bucket_name
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
  versioning     = "Disabled"
  freeform_tags  = local.common_tags
}

resource "oci_identity_dynamic_group" "staging_backend" {
  compartment_id = var.tenancy_ocid
  name           = "chess-studio-staging-backend"
  description    = "Chess Studio OCI staging backend instances allowed to read their private runtime configuration."
  matching_rule  = "instance.compartment.id = '${var.compartment_ocid}'"
}

resource "oci_identity_policy" "staging_runtime_config" {
  compartment_id = var.tenancy_ocid
  name           = "chess-studio-staging-runtime-read"
  description    = "Least-privilege read access from Chess Studio staging instances to the private runtime bucket."
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.staging_backend.name} to read objects in compartment id ${var.compartment_ocid} where target.bucket.name='${oci_objectstorage_bucket.runtime_config.name}'",
  ]
}
