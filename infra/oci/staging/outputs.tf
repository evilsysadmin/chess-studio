output "instance_id" {
  description = "OCI compute instance OCID."
  value       = oci_core_instance.backend.id
}

output "public_ip" {
  description = "Ephemeral/public IPv4 used only for egress and optional tightly-scoped SSH. FastAPI itself is not publicly bound."
  value       = oci_core_instance.backend.public_ip
}

output "load_balancer_ip" {
  description = "Public IPv4 of the OCI Always Free 10 Mbps load balancer. DNS cutover is a separate gate."
  value       = oci_load_balancer_load_balancer.backend.ip_address_details[0].ip_address
}

output "load_balancer_http_origin" {
  description = "Temporary public HTTP origin for readiness validation before Cloudflare/TLS cutover."
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
    "Verify the backend is reachable on port 4000 only from the load balancer subnet before DNS cutover.",
    "Require OCI LB /api/ready health to be green before moving api-staging DNS.",
    "Keep Render production serving until the reversible OCI cutover is validated."
  ]
}
