mock_provider "oci" {
  override_during = plan

  mock_data "oci_identity_availability_domains" {
    defaults = {
      availability_domains = [
        {
          compartment_id = "ocid1.compartment.oc1..chessstudiotest"
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
          id = "ocid1.image.oc1.eu-frankfurt-1.chessstudioauto"
        },
      ]
    }
  }
}

variables {
  region           = "eu-frankfurt-1"
  compartment_ocid = "ocid1.compartment.oc1..chessstudiotest"
  repo_ref         = "0123456789abcdef0123456789abcdef01234567"
}

run "discovers_ad_and_latest_a1_ubuntu_image" {
  command = plan

  assert {
    condition     = oci_core_instance.backend.availability_domain == "kIdk:EU-FRANKFURT-1-AD-1"
    error_message = "Default staging should use the first discovered availability domain."
  }

  assert {
    condition     = oci_core_instance.backend.source_details[0].source_id == "ocid1.image.oc1.eu-frankfurt-1.chessstudioauto"
    error_message = "Default staging should use the discovered A1-compatible Ubuntu image."
  }

  assert {
    condition     = oci_core_instance.backend.shape == "VM.Standard.A1.Flex"
    error_message = "OCI staging must remain on Ampere A1."
  }

  assert {
    condition     = oci_core_instance.backend.shape_config[0].ocpus == 1
    error_message = "Default staging OCPU allocation drifted."
  }

  assert {
    condition     = oci_core_instance.backend.shape_config[0].memory_in_gbs == 6
    error_message = "Default staging memory allocation drifted."
  }

  assert {
    condition     = length(oci_core_security_list.backend.ingress_security_rules) == 0
    error_message = "OCI staging must have zero inbound rules by default."
  }

  assert {
    condition     = !contains(keys(oci_core_instance.backend.metadata), "ssh_authorized_keys")
    error_message = "Closed-by-default staging must not require or inject an SSH key."
  }
}

run "explicit_discovery_overrides_win" {
  command = plan

  variables {
    availability_domain = "kIdk:EU-FRANKFURT-1-AD-3"
    image_ocid          = "ocid1.image.oc1.eu-frankfurt-1.manualoverride"
  }

  assert {
    condition     = oci_core_instance.backend.availability_domain == "kIdk:EU-FRANKFURT-1-AD-3"
    error_message = "Explicit availability_domain must override discovery."
  }

  assert {
    condition     = oci_core_instance.backend.source_details[0].source_id == "ocid1.image.oc1.eu-frankfurt-1.manualoverride"
    error_message = "Explicit image_ocid must override discovery."
  }
}

run "reject_world_open_ssh" {
  command = plan

  variables {
    ssh_ingress_cidr = "0.0.0.0/0"
  }

  expect_failures = [var.ssh_ingress_cidr]
}

run "reject_ssh_ingress_without_key" {
  command = plan

  variables {
    ssh_ingress_cidr = "198.51.100.10/32"
  }

  expect_failures = [oci_core_instance.backend]
}

run "allow_narrow_ssh_with_public_key" {
  command = plan

  variables {
    ssh_ingress_cidr   = "198.51.100.10/32"
    ssh_authorized_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestOnly chess-studio"
  }

  assert {
    condition     = length(oci_core_security_list.backend.ingress_security_rules) == 1
    error_message = "Explicit narrow SSH CIDR must create exactly one inbound rule."
  }

  assert {
    condition     = contains(keys(oci_core_instance.backend.metadata), "ssh_authorized_keys")
    error_message = "An explicit SSH key must be injected when operator SSH is enabled."
  }
}

run "reject_invalid_image_override" {
  command = plan

  variables {
    image_ocid = "not-an-ocid"
  }

  expect_failures = [var.image_ocid]
}

run "reject_mutable_repo_ref" {
  command = plan

  variables {
    repo_ref = "main"
  }

  expect_failures = [var.repo_ref]
}
