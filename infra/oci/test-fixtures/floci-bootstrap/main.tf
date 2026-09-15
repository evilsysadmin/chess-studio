variable "tenancy_ocid" {
  type    = string
  default = "ocid1.tenancy.oc1..flocilocaltenancy0000000000000000000000000000000000000000"
}

variable "user_ocid" {
  type    = string
  default = "ocid1.user.oc1..flociiacuser00000000000000000000000000000000000000000000000"
}

variable "private_key_path" {
  type = string
}

provider "oci" {
  tenancy_ocid         = var.tenancy_ocid
  user_ocid            = var.user_ocid
  fingerprint          = "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99"
  private_key_path     = var.private_key_path
  region               = "us-ashburn-1"
  disable_auto_retries = true
}

data "oci_objectstorage_namespace" "this" {
  compartment_id = var.tenancy_ocid
}

resource "oci_identity_compartment" "smoke" {
  compartment_id = var.tenancy_ocid
  name           = "chess-studio-floci-smoke"
  description    = "Ephemeral Chess Studio Terraform/Floci compatibility smoke"
  enable_delete  = true
}

resource "oci_objectstorage_bucket" "smoke" {
  compartment_id = oci_identity_compartment.smoke.id
  namespace      = data.oci_objectstorage_namespace.this.namespace
  name           = "chess-studio-floci-smoke"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"
}
