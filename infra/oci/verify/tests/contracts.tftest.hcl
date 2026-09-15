mock_provider "oci" {
  override_during = plan

  mock_data "oci_core_console_history_data" {
    defaults = {
      data = "Cloud-init v. 24.1 finished at 2026-09-15T18:34:00Z"
    }
  }
}

variables {
  region           = "eu-frankfurt-1"
  compartment_ocid = "ocid1.compartment.oc1..chessstudiotest"
  instance_id      = "ocid1.instance.oc1.eu-frankfurt-1.chessstudiotest"
  console_public_key = "unused"
}

run "captures_console_history_for_target_instance" {
  command = plan

  assert {
    condition     = oci_core_console_history.capture.instance_id == var.instance_id
    error_message = "Console verification must inspect only the requested staging instance."
  }
}
