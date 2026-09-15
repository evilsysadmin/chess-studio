output "object_storage_namespace" {
  value       = data.oci_objectstorage_namespace.this.namespace
  description = "Object Storage namespace visible to the authenticated principal."
}

output "availability_domains" {
  value       = [for ad in data.oci_identity_availability_domains.available.availability_domains : ad.name]
  description = "Availability domains visible in the target region."
}

output "latest_a1_ubuntu_image_ocid" {
  value       = try(data.oci_core_images.arm64_ubuntu.images[0].id, "")
  description = "Newest available Canonical Ubuntu 24.04 image compatible with A1."
}

output "latest_a1_ubuntu_image_name" {
  value       = try(data.oci_core_images.arm64_ubuntu.images[0].display_name, "")
  description = "Display name of the selected read-only probe image."
}
