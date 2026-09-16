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
  description    = "Chess Studio OCI staging backend instances allowed to read runtime configuration and execute their own Run Commands."
  matching_rule  = "instance.compartment.id = '${var.compartment_ocid}'"
}

resource "oci_identity_policy" "staging_runtime_config" {
  compartment_id = var.tenancy_ocid
  name           = "chess-studio-staging-runtime-read"
  description    = "Least-privilege runtime access for Chess Studio staging instances."
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.staging_backend.name} to read objects in compartment id ${var.compartment_ocid} where target.bucket.name='${oci_objectstorage_bucket.runtime_config.name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.staging_backend.name} to read secret-bundles in compartment id ${var.compartment_ocid}",
    "Allow dynamic-group ${oci_identity_dynamic_group.staging_backend.name} to use instance-agent-command-execution-family in compartment id ${var.compartment_ocid} where request.instance.id=target.instance.id",
  ]
}
