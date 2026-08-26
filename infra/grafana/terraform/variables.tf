variable "metrics_datasource_uid" {
  description = "UID del datasource Prometheus/Mimir de Grafana Cloud."
  type        = string
  default     = "grafanacloud-humbletoucan355-prom"
}

variable "commit_sha" {
  description = "Commit que publica esta revisión del dashboard."
  type        = string
  default     = "local"
}
