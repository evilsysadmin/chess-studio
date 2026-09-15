resource "oci_core_console_history" "capture" {
  instance_id  = var.instance_id
  display_name = "chess-studio-staging-verify"
}

data "oci_core_console_history_data" "capture" {
  console_history_id = oci_core_console_history.capture.id
}

output "console_data" {
  value     = data.oci_core_console_history_data.capture.data
  sensitive = true
}
