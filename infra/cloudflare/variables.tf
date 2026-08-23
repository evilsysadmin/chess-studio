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

variable "worker_name" {
  description = "Workers AI narrative Worker name."
  type        = string
  default     = "chess-studio-narrative-ai"
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
