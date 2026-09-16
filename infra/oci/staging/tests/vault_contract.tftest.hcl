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

run "staging_vault_is_reproducible_without_secret_plaintext" {
  command = plan

  assert {
    condition     = oci_kms_vault.staging_secrets.compartment_id == var.compartment_ocid
    error_message = "The staging Vault must live in the staging compartment."
  }

  assert {
    condition     = oci_kms_vault.staging_secrets.display_name == "chess-studio-staging"
    error_message = "The staging Vault needs a stable operator-facing name."
  }

  assert {
    condition     = oci_kms_vault.staging_secrets.vault_type == "DEFAULT"
    error_message = "Staging must use the shared DEFAULT Vault, not a costly Virtual Private Vault."
  }

  assert {
    condition     = oci_kms_key.staging_secrets.compartment_id == var.compartment_ocid
    error_message = "The staging secret encryption key must live in the staging compartment."
  }

  assert {
    condition     = oci_kms_key.staging_secrets.display_name == "chess-studio-staging-secrets"
    error_message = "The staging secret encryption key needs a stable operator-facing name."
  }

  assert {
    condition     = oci_kms_key.staging_secrets.protection_mode == "HSM"
    error_message = "Staging secret encryption must remain HSM-backed."
  }

  assert {
    condition = (
      oci_kms_key.staging_secrets.key_shape[0].algorithm == "AES" &&
      oci_kms_key.staging_secrets.key_shape[0].length == 32
    )
    error_message = "Staging secret encryption must remain AES-256."
  }

  assert {
    condition     = length(oci_identity_policy.staging_runtime_config.statements) == 2
    error_message = "A1 runtime IAM must remain limited to runtime-object read and self Run Command."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[0], "to read objects")
    error_message = "The A1 must retain read-only access to the private runtime-config object."
  }

  assert {
    condition     = strcontains(oci_identity_policy.staging_runtime_config.statements[1], "to use instance-agent-command-execution-family")
    error_message = "The A1 must retain self-scoped Run Command execution access."
  }

  assert {
    condition = alltrue([
      for statement in oci_identity_policy.staging_runtime_config.statements :
      !strcontains(statement, "secret-bundles")
    ])
    error_message = "A1 runtime IAM must not grant secret-bundle access until OCI Secrets is actually consumed."
  }
}
