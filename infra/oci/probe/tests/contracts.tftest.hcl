mock_provider "oci" {
  override_during = plan

  mock_data "oci_objectstorage_namespace" {
    defaults = {
      namespace = "chessstudio-test"
    }
  }

  mock_data "oci_identity_availability_domains" {
    defaults = {
      availability_domains = [
        {
          compartment_id = "ocid1.tenancy.oc1..chessstudiotest"
          id             = "ocid1.availabilitydomain.oc1..chessstudioad1"
          name           = "kIdk:EU-FRANKFURT-1-AD-1"
        },
      ]
    }
  }

  mock_data "oci_core_images" {
    defaults = {
      images = [
        {
          display_name = "Canonical-Ubuntu-24.04-aarch64-2026.09.01-0"
          id           = "ocid1.image.oc1.eu-frankfurt-1.chessstudiotest"
        },
      ]
    }
  }
}

variables {
  tenancy_ocid = "ocid1.tenancy.oc1..chessstudiotest"
  region       = "eu-frankfurt-1"
}

run "probe_is_read_only_and_resolves_runtime_inputs" {
  command = plan

  assert {
    condition     = output.object_storage_namespace == "chessstudio-test"
    error_message = "Probe must resolve the Object Storage namespace."
  }

  assert {
    condition     = output.availability_domains == ["kIdk:EU-FRANKFURT-1-AD-1"]
    error_message = "Probe must expose discovered availability domains."
  }

  assert {
    condition     = output.latest_a1_ubuntu_image_ocid == "ocid1.image.oc1.eu-frankfurt-1.chessstudiotest"
    error_message = "Probe must resolve an A1-compatible Ubuntu image."
  }
}

run "reject_invalid_tenancy" {
  command = plan

  variables {
    tenancy_ocid = "nope"
  }

  expect_failures = [var.tenancy_ocid]
}
