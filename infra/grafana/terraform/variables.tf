variable "metrics_datasource_uid" {
  description = "UID del datasource Prometheus/Mimir de Grafana Cloud."
  type        = string
  default     = "grafanacloud-humbletoucan355-prom"
}

variable "logs_datasource_uid" {
  description = "UID del datasource Loki de Grafana Cloud."
  type        = string
  default     = "grafanacloud-humbletoucan355-logs"
}

variable "traces_datasource_uid" {
  description = "UID del datasource Tempo de Grafana Cloud."
  type        = string
  default     = "grafanacloud-humbletoucan355-traces"
}

variable "commit_sha" {
  description = "Commit que publica esta revisión del dashboard."
  type        = string
  default     = "local"
}
