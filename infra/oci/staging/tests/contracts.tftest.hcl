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

  mock_data "oci_objectstorage_namespace" {
    defaults = {
      namespace = "chessstudiotestnamespace"
    }
  }
}

variables {
  region           = "eu-frankfurt-1"
  tenancy_ocid     = "ocid1.tenancy.oc1..chessstudiotest"
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
    error_message = "Default staging should use the discovered A1-compatible Ubuntu platform image."
  }

  assert {
    condition = (
      data.oci_core_images.arm64_ubuntu.operating_system == "Canonical Ubuntu" &&
      data.oci_core_images.arm64_ubuntu.operating_system_version == "24.04" &&
      data.oci_core_images.arm64_ubuntu.shape == "VM.Standard.A1.Flex"
    )
    error_message = "Zero-cost staging must discover the Canonical Ubuntu A1 platform image rather than accept a custom image override."
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
    error_message = "Base backend security list must keep zero public inbound rules by default."
  }

  assert {
    condition     = !contains(keys(oci_core_instance.backend.metadata), "ssh_authorized_keys")
    error_message = "Closed-by-default staging must not require or inject an SSH key."
  }

  assert {
    condition     = oci_core_instance.backend.agent_config[0].are_all_plugins_disabled == false
    error_message = "Oracle Cloud Agent plugins must remain enabled on staging."
  }

  assert {
    condition     = oci_core_instance.backend.agent_config[0].is_management_disabled == false
    error_message = "Oracle Cloud Agent management plugins must remain enabled for no-SSH service control."
  }

  assert {
    condition = (
      oci_core_instance.backend.agent_config[0].plugins_config[0].name == "Compute Instance Run Command" &&
      oci_core_instance.backend.agent_config[0].plugins_config[0].desired_state == "ENABLED"
    )
    error_message = "Compute Instance Run Command must be explicitly enabled for no-SSH staging operations."
  }
}

run "always_free_load_balancer_contract" {
  command = plan

  assert {
    condition     = oci_load_balancer_load_balancer.backend.shape == "flexible"
    error_message = "Staging ingress must use the OCI Flexible Load Balancer shape."
  }

  assert {
    condition = (
      oci_load_balancer_load_balancer.backend.shape_details[0].minimum_bandwidth_in_mbps == 10 &&
      oci_load_balancer_load_balancer.backend.shape_details[0].maximum_bandwidth_in_mbps == 10
    )
    error_message = "The staging load balancer must remain pinned to the Always Free 10 Mbps budget."
  }

  assert {
    condition     = oci_core_subnet.load_balancer.cidr_block == "10.42.20.0/24"
    error_message = "Load balancer must stay on its dedicated subnet by default."
  }

  assert {
    condition = one([
      for rule in oci_core_security_list.backend_from_load_balancer.ingress_security_rules : rule
      if rule.source == var.load_balancer_subnet_cidr
    ]).source == var.load_balancer_subnet_cidr
    error_message = "Backend ingress must be restricted to the load balancer subnet."
  }

  assert {
    condition = one([
      for rule in oci_core_security_list.backend_from_load_balancer.ingress_security_rules : rule
      if rule.source == var.load_balancer_subnet_cidr
    ]).tcp_options[0].min == 4000
    error_message = "Load balancer backend ingress must target FastAPI port 4000 only."
  }

  assert {
    condition     = oci_load_balancer_backend_set.backend.health_checker[0].url_path == "/api/ready"
    error_message = "The OCI load balancer must health-check the real backend readiness endpoint."
  }

  assert {
    condition     = oci_load_balancer_listener.http.port == 80
    error_message = "Initial emergency listener must remain explicit HTTP until Cloudflare/TLS cutover is separately gated."
  }
}

run "runtime_config_channel_is_private_and_least_privilege" {
  command = plan

  assert {
    condition     = oci_objectstorage_bucket.runtime_config.access_type == "NoPublicAccess"
    error_message = "OCI staging runtime configuration must never be publicly readable."
  }

  assert {
    condition     = oci_objectstorage_bucket.runtime_config.versioning == "Disabled"
    error_message = "Runtime secret rotation should overwrite the private object rather than retain old secret versions."
  }

  assert {
    condition     = oci_identity_dynamic_group.staging_backend.compartment_id == var.tenancy_ocid
    error_message = "OCI dynamic groups must live at tenancy scope."
  }

  assert {
    condition     = oci_identity_dynamic_group.staging_backend.matching_rule == "instance.compartment.id = '${var.compartment_ocid}'"
    error_message = "Runtime access must be restricted to instances in the staging compartment."
  }

  assert {
    condition     = length(oci_identity_policy.staging_runtime_config.statements) == 2
    error_message = "Runtime IAM should contain only Object Storage read and self-scoped Run Command execution permissions."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[0], "to read objects")
    error_message = "Staging instances need read-only object access, never object management."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[0], "target.bucket.name='chess-studio-staging-runtime'")
    error_message = "Instance-principal policy must be restricted to the dedicated runtime bucket."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[1], "to use instance-agent-command-execution-family")
    error_message = "Staging instances need the OCI Run Command execution-family permission to poll accepted commands."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[1], "request.instance.id=target.instance.id")
    error_message = "Run Command execution permission must be restricted to the target instance itself."
  }

  assert {
    condition = alltrue([
      for statement in oci_identity_policy.staging_runtime_config.statements :
      !strcontains(statement, "secret-bundles")
    ])
    error_message = "Runtime IAM must not grant secret-bundle access until OCI Secrets is actually consumed."
  }
}

run "explicit_availability_domain_override_wins" {
  command = plan

  variables {
    availability_domain = "kIdk:EU-FRANKFURT-1-AD-3"
  }

  assert {
    condition     = oci_core_instance.backend.availability_domain == "kIdk:EU-FRANKFURT-1-AD-3"
    error_message = "Explicit availability_domain must override discovery."
  }

  assert {
    condition     = oci_core_instance.backend.source_details[0].source_id == "ocid1.image.oc1.eu-frankfurt-1.chessstudioauto"
    error_message = "Image discovery must remain active even when the availability domain is overridden."
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

run "reject_invalid_tenancy_ocid" {
  command = plan

  variables {
    tenancy_ocid = "not-a-tenancy-ocid"
  }

  expect_failures = [var.tenancy_ocid]
}

run "reject_mutable_repo_ref" {
  command = plan

  variables {
    repo_ref = "main"
  }

  expect_failures = [var.repo_ref]
}
