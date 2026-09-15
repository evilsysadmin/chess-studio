output "state_bucket" {
  value       = oci_objectstorage_bucket.terraform_state.name
  description = "Bucket name for OCI Terraform backends."
}

output "object_storage_namespace" {
  value       = data.oci_objectstorage_namespace.this.namespace
  description = "OCI Object Storage namespace required by the native backend."
}

output "region" {
  value       = var.region
  description = "OCI region used by bootstrap and remote-state configuration."
}

output "infra_compartment_ocid" {
  value = oci_identity_compartment.infra.id
}

output "staging_compartment_ocid" {
  value = oci_identity_compartment.staging.id
}
