variable "tenancy_ocid" {
  description = "Root tenancy OCID used only for read-only account discovery."
  type        = string

  validation {
    condition     = can(regex("^ocid1\\.tenancy\\.", var.tenancy_ocid))
    error_message = "tenancy_ocid must be an OCI tenancy OCID."
  }
}

variable "region" {
  description = "OCI region to probe."
  type        = string
  default     = "eu-frankfurt-1"
}
