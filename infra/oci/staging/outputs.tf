output "instance_id" {
  description = "OCI compute instance OCID."
  value       = oci_core_instance.backend.id
}

output "public_ip" {
  description = "Ephemeral/public IPv4 used only for egress and optional tightly-scoped SSH. FastAPI itself is not publicly bound."
  value       = oci_core_instance.backend.public_ip
}

output "reserved_public_ips" {
  description = "Read-only inventory of pre-existing regional reserved public IPv4s in the staging compartment; used to adopt the operator-created egress reservation without creating a duplicate."
  value = [
    for ip in data.oci_core_public_ips.reserved.public_ips : {
      id                 = ip.id
      ip_address         = ip.ip_address
      display_name       = ip.display_name
      assigned_entity_id = ip.assigned_entity_id
    }
  ]
}

output "load_balancer_ip" {
  description = "Inventory IPv4 of the dormant OCI emergency load balancer. It is unreachable from the Internet unless load_balancer_ingress_cidr is explicitly set."
  value       = oci_load_balancer_load_balancer.backend.ip_address_details[0].ip_address
}

output "load_balancer_http_origin" {
  description = "Emergency HTTP probe origin. Its security list denies public ingress by default; canonical staging uses Cloudflare Tunnel."
  value       = "http://${oci_load_balancer_load_balancer.backend.ip_address_details[0].ip_address}"
}

output "vcn_id" {
  description = "Backend VCN OCID."
  value       = oci_core_vcn.backend.id
}

output "subnet_id" {
  description = "Backend subnet OCID."
  value       = oci_core_subnet.backend.id
}

output "load_balancer_subnet_id" {
  description = "Dedicated public subnet OCID for the OCI load balancer."
  value       = oci_core_subnet.load_balancer.id
}

output "runtime_config_bucket" {
  description = "Private Object Storage bucket used to deliver OCI staging runtime configuration out-of-band from Terraform."
  value       = oci_objectstorage_bucket.runtime_config.name
}

output "runtime_config_namespace" {
  description = "Object Storage namespace containing the private staging runtime configuration bucket."
  value       = data.oci_objectstorage_namespace.runtime.namespace
}

output "staging_vault_id" {
  description = "OCID of the Terraform-managed staging Vault. Secret values themselves are never managed by Terraform."
  value       = oci_kms_vault.staging_secrets.id
}

output "staging_vault_key_id" {
  description = "OCID of the AES-256 HSM master encryption key used when operators create staging secrets manually."
  value       = oci_kms_key.staging_secrets.id
}

output "backend_origin" {
  description = "Current host-local backend origin; expose port 4000 only to the LB subnet before DNS cutover."
  value       = "http://127.0.0.1:4000"
}

output "post_apply_checklist" {
  description = "No-secret handoff after provisioning."
  value = [
    "Create or rotate staging secret values manually in the Terraform-managed Vault; never pass secret plaintext through Terraform variables.",
    "Keep /etc/chess-studio/backend.env as a generated root-only runtime artifact, not a human-maintained secret store.",
    "Keep the private runtime bucket free of Terraform-managed secret objects.",
    "Keep load_balancer_ingress_cidr null during normal operation; canonical staging enters through Cloudflare Tunnel.",
    "Verify the Cloudflare Tunnel targets http://127.0.0.1:4000 and the public api-staging /api/ready endpoint is green.",
    "Keep Render production serving until the reversible OCI cutover is validated."
  ]
}