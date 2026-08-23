output "worker_name" {
  description = "Name of the deployed narrative Worker."
  value       = var.worker_name
}

output "workers_dev_enabled" {
  description = "Whether workers.dev is enabled for the narrative Worker."
  value       = cloudflare_workers_script_subdomain.narrative_ai.enabled
}
