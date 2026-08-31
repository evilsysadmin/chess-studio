variable "cloudflare_api_token" {
  description = "Cloudflare API token used only by Terraform/CI."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Worker."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the public Chess Studio DNS records. CI resolves it from the zone name."
  type        = string
}

variable "render_api_hostname" {
  description = "Public API hostname delegated to the Render web service."
  type        = string
  default     = "api.chess-studio.shadowops.dpdns.org"
}

variable "render_api_cname_target" {
  description = "Render service hostname shown in the Render dashboard."
  type        = string
  default     = "chess-study-backend.onrender.com"
}

variable "worker_name" {
  description = "Workers AI narrative Worker name."
  type        = string
  default     = "chess-studio-narrative-ai"
}

variable "custom_domain_hostname" {
  description = "Public Custom Domain routed directly to the narrative Worker."
  type        = string
  default     = "ai.shadowops.dpdns.org"
}

variable "custom_domain_zone_name" {
  description = "Cloudflare zone containing the Worker Custom Domain."
  type        = string
  default     = "shadowops.dpdns.org"
}

variable "compatibility_date" {
  description = "Cloudflare Worker compatibility date."
  type        = string
  default     = "2026-08-22"
}

variable "rate_limit_namespace_id" {
  description = "Positive integer namespace ID for the Workers Rate Limiting binding."
  type        = string
  default     = "1606601"
}
