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

resource "oci_kms_vault" "staging_secrets" {
  compartment_id = var.compartment_ocid
  display_name   = "chess-studio-staging"
  vault_type     = "DEFAULT"
  freeform_tags  = local.common_tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "oci_kms_key" "staging_secrets" {
  compartment_id      = var.compartment_ocid
  display_name        = "chess-studio-staging-secrets"
  management_endpoint = oci_kms_vault.staging_secrets.management_endpoint
  protection_mode     = "HSM"
  freeform_tags       = local.common_tags

  key_shape {
    algorithm = "AES"
    length    = 32
  }

  lifecycle {
    prevent_destroy = true
  }
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
    "Allow dynamic-group ${oci_identity_dynamic_group.staging_backend.name} to use instance-agent-command-execution-family in compartment id ${var.compartment_ocid} where request.instance.id=target.instance.id",
  ]
}
