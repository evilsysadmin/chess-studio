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
  description = "Public GitHub Pages frontend URL."
  value       = "https://${cloudflare_dns_record.github_pages.name}"
}

output "api_url" {
  description = "Public Render API base URL."
  value       = "https://${cloudflare_dns_record.render_api.name}/api"
}
