variable "tenancy_ocid" {
  description = "Root tenancy OCID. The seed creates only free control-plane resources beneath it."
  type        = string

  validation {
    condition     = can(regex("^ocid1\\.tenancy\\.", var.tenancy_ocid))
    error_message = "tenancy_ocid must be an OCI tenancy OCID."
  }
}

variable "region" {
  description = "OCI home/target region."
  type        = string
  default     = "eu-frankfurt-1"
}

variable "infra_compartment_name" {
  type    = string
  default = "chess-studio-infra"
}

variable "staging_compartment_name" {
  type    = string
  default = "chess-studio-staging"
}

variable "state_bucket_name" {
  description = "Private Object Storage bucket used by Terraform remote state."
  type        = string
  default     = "chess-studio-tfstate"

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]{1,256}$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid OCI Object Storage bucket name."
  }
}

variable "freeform_tags" {
  type = map(string)
  default = {
    project    = "chess-studio"
    managed-by = "terraform"
    purpose    = "staging-lab"
  }
}
