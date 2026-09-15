mock_provider "oci" {}

variables {
  region              = "eu-frankfurt-1"
  compartment_ocid    = "ocid1.compartment.oc1..chessstudiotest"
  availability_domain = "kIdk:EU-FRANKFURT-1-AD-1"
  image_ocid          = "ocid1.image.oc1.eu-frankfurt-1.chessstudiotest"
  repo_ref            = "0123456789abcdef0123456789abcdef01234567"
}

run "always_free_defaults_and_closed_ingress" {
  command = plan

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

run "reject_mutable_repo_ref" {
  command = plan

  variables {
    repo_ref = "main"
  }

  expect_failures = [var.repo_ref]
}
