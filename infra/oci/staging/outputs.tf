output "instance_id" {
  description = "OCI compute instance OCID."
  value       = oci_core_instance.backend.id
}

output "public_ip" {
  description = "Ephemeral/public IPv4 used only for egress and optional tightly-scoped SSH. FastAPI itself is not publicly bound."
  value       = oci_core_instance.backend.public_ip
}

output "vcn_id" {
  description = "Backend VCN OCID."
  value       = oci_core_vcn.backend.id
}

output "subnet_id" {
  description = "Backend subnet OCID."
  value       = oci_core_subnet.backend.id
}

output "runtime_config_bucket" {
  description = "Private Object Storage bucket used to deliver OCI staging runtime configuration out-of-band from Terraform."
  value       = oci_objectstorage_bucket.runtime_config.name
}

output "runtime_config_namespace" {
  description = "Object Storage namespace containing the private staging runtime configuration bucket."
  value       = data.oci_objectstorage_namespace.runtime.namespace
}

output "backend_origin" {
  description = "Origin Cloudflare Tunnel should target on the VM."
  value       = "http://127.0.0.1:4000"
}

output "post_apply_checklist" {
  description = "No-secret handoff after provisioning."
  value = [
    "Keep the private runtime bucket free of Terraform-managed secret objects.",
    "Publish /etc/chess-studio/backend.env out-of-band through the runtime channel before starting the backend.",
    "Install/configure Cloudflare Tunnel credentials out-of-band.",
    "Start chess-studio-backend.service and verify /api/ready locally.",
    "Keep Render serving production until the reversible cutover is validated."
  ]
}
