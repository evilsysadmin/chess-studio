provider "grafana" {}

resource "grafana_folder" "chess_studio" {
  title = "Chess Studio"
}

locals {
  dashboard_vars = {
    metrics_datasource_uid = var.metrics_datasource_uid
    logs_datasource_uid    = var.logs_datasource_uid
    traces_datasource_uid  = var.traces_datasource_uid
    commit_sha             = substr(var.commit_sha, 0, 12)
  }
}

resource "grafana_dashboard" "chess_studio_overview" {
  folder      = grafana_folder.chess_studio.uid
  overwrite   = true
  config_json = templatefile("${path.module}/../dashboards/chess-studio-overview.json", local.dashboard_vars)
}

resource "grafana_dashboard" "chess_studio_logs" {
  folder      = grafana_folder.chess_studio.uid
  overwrite   = true
  config_json = templatefile("${path.module}/../dashboards/chess-studio-logs.json", local.dashboard_vars)
}

resource "grafana_dashboard" "chess_studio_traces" {
  folder      = grafana_folder.chess_studio.uid
  overwrite   = true
  config_json = templatefile("${path.module}/../dashboards/chess-studio-traces.json", local.dashboard_vars)
}
