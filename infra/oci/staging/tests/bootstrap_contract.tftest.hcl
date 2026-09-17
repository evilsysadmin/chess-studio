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

  mock_data "oci_identity_region_subscriptions" {
    defaults = {
      region_subscriptions = [
        {
          is_home_region = true
          region_key     = "FRA"
          region_name    = "eu-frankfurt-1"
          status         = "READY"
        },
      ]
    }
  }

  mock_data "oci_core_images" {
    defaults = {
      images = [{ id = "ocid1.image.oc1.eu-frankfurt-1.chessstudioauto" }]
    }
  }

  mock_data "oci_objectstorage_namespace" {
    defaults = { namespace = "chessstudiotestnamespace" }
  }
}

variables {
  region           = "eu-frankfurt-1"
  tenancy_ocid     = "ocid1.tenancy.oc1..chessstudiotest"
  compartment_ocid = "ocid1.compartment.oc1..chessstudiotest"
  repo_ref         = "0123456789abcdef0123456789abcdef01234567"
}

run "bootstrap_contract_is_privileged_without_open_ended_sudo" {
  command = plan

  assert {
    condition = (
      startswith(terraform_data.bootstrap_contract.triggers_replace, "v2:") &&
      length(terraform_data.bootstrap_contract.triggers_replace) == 67
    )
    error_message = "Bootstrap replacement trigger must be a versioned SHA-256 cloud-init fingerprint."
  }

  assert {
    condition     = strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "ocarun ALL=(root) NOPASSWD: CHESS_STUDIO_DEPLOY, CHESS_STUDIO_RUNTIME")
    error_message = "Run Command must receive only the two root-owned Chess Studio wrapper capabilities."
  }

  assert {
    condition     = !strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "NOPASSWD:ALL")
    error_message = "Never grant the OCI Run Command user unrestricted passwordless sudo."
  }

  assert {
    condition = (
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "/usr/local/sbin/chess-studio-deploy") &&
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "/opt/chess-studio/repo/scripts/oci_staging_deploy_launcher.sh")
    )
    error_message = "Cloud-init must install the stable root-owned launcher from the immutable bootstrap checkout."
  }

  assert {
    condition = (
      !strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "OCI Alloy failed to start") &&
      !strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "new deployment failed readiness/build attestation")
    )
    error_message = "Cloud-init must contain host bootstrap only; release/rollback behavior belongs to the versioned deploy payload."
  }

  assert {
    condition     = strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "/usr/local/sbin/chess-studio-install-runtime")
    error_message = "Cloud-init must install the narrow runtime-config installer wrapper."
  }

  assert {
    condition = (
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "/etc/chess-studio/ocarun.sudoers") &&
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "  - path: /etc/sudoers.d/101-chess-studio-ocarun") &&
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "permissions: '0440'") &&
      strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "visudo, -cf, /etc/sudoers.d/101-chess-studio-ocarun")
    )
    error_message = "Cloud-init must materialize the active ocarun sudoers drop-in before Run Command starts and validate it during runcmd."
  }

  assert {
    condition     = strcontains(base64decode(oci_core_instance.backend.metadata["user_data"]), "python3-venv")
    error_message = "Future instance-principal runtime fetches require an isolated Python venv."
  }
}
