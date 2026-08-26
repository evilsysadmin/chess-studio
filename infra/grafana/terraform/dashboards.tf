resource "grafana_folder" "chess_studio" {
  title = "Chess Studio"
}

resource "grafana_dashboard" "chess_studio_overview" {
  folder = grafana_folder.chess_studio.uid
  # El JSON sigue pudiendo importarse desde la UI. Terraform sustituye sólo el
  # placeholder del datasource por el UID real de este stack.
  config_json = replace(
    file("${path.module}/../chess-studio-overview.dashboard.json"),
    "$${DS_PROMETHEUS}",
    var.metrics_datasource_uid,
  )
  overwrite = true
  message   = "Chess Studio dashboard · ${var.commit_sha}"
}

output "dashboard_url" {
  description = "URL estable del dashboard publicado."
  value       = grafana_dashboard.chess_studio_overview.url
}
