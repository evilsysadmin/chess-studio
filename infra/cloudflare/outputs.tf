output "worker_name" {
  description = "Name of the deployed narrative Worker."
  value       = var.worker_name
}

output "custom_domain_url" {
  description = "Stable public URL of the narrative Worker."
  value       = "https://${cloudflare_workers_custom_domain.narrative_ai.hostname}"
}

output "workers_dev_enabled" {
  description = "workers.dev is deliberately disabled; production uses the Custom Domain."
  value       = cloudflare_workers_script_subdomain.narrative_ai.enabled
}

output "frontend_url" {
  description = "Public Cloudflare Pages frontend URL. DNS ownership lives in the two-phase Pages cutover helper."
  value       = "https://chess-studio.shadowops.dpdns.org"
}

output "api_url" {
  description = "Public production API base URL. Backend target routing is managed outside Terraform."
  value       = "https://api.chess-studio.shadowops.dpdns.org/api"
}
