variable "region" {
  description = "OCI target region."
  type        = string
}

variable "instance_id" {
  description = "Staging instance OCID to inspect through serial console history."
  type        = string

  validation {
    condition     = can(regex("^ocid1\\.instance\\.", var.instance_id))
    error_message = "instance_id must be an OCI instance OCID."
  }
}
