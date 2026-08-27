variable "metrics_datasource_uid" {
  type        = string
  description = "Grafana Cloud Prometheus datasource UID."
}

variable "logs_datasource_uid" {
  type        = string
  description = "Grafana Cloud Loki datasource UID."
}

variable "traces_datasource_uid" {
  type        = string
  description = "Grafana Cloud Tempo datasource UID."
}

variable "commit_sha" {
  type        = string
  description = "Release/deploy identifier added to dashboard tags."
  default     = "local"
}
