resource "grafana_folder" "chess_studio" {
  title = "Chess Studio"
}

resource "grafana_dashboard" "chess_studio_overview" {
  folder = grafana_folder.chess_studio.uid
  # El JSON sigue pudiendo importarse desde la UI. Terraform sustituye los
  # placeholders por los UID reales de métricas, logs y trazas del stack.
  config_json = replace(
    replace(
      replace(
        file("${path.module}/../chess-studio-overview.dashboard.json"),
        "$${DS_PROMETHEUS}",
        var.metrics_datasource_uid,
      ),
      "$${DS_LOKI}",
      var.logs_datasource_uid,
    ),
    "$${DS_TEMPO}",
    var.traces_datasource_uid,
  )
  overwrite = true
  message   = "Chess Studio dashboard · ${var.commit_sha}"
}

output "dashboard_url" {
  description = "URL estable del dashboard publicado."
  value       = grafana_dashboard.chess_studio_overview.url
}
