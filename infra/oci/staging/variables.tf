variable "region" {
  description = "OCI home/target region, e.g. eu-frankfurt-1."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID that will own the VCN and instance."
  type        = string
}

variable "availability_domain" {
  description = "Availability domain name selected after confirming A1 capacity."
  type        = string
}

variable "image_ocid" {
  description = "ARM64 Ubuntu image OCID for the selected region."
  type        = string
}

variable "ssh_authorized_key" {
  description = "Optional public SSH key. Keep null while SSH ingress is disabled. Private key material must never be passed to Terraform."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.ssh_authorized_key == null || can(regex("^(ssh-|ecdsa-|sk-)", trimspace(var.ssh_authorized_key)))
    error_message = "ssh_authorized_key must be null or contain an OpenSSH public key, never a private key."
  }
}

variable "ssh_ingress_cidr" {
  description = "Optional operator CIDR allowed to SSH. Null keeps zero inbound rules."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.ssh_ingress_cidr == null ||
      (can(cidrhost(var.ssh_ingress_cidr, 0)) && var.ssh_ingress_cidr != "0.0.0.0/0")
    )
    error_message = "ssh_ingress_cidr must be null or a valid CIDR other than 0.0.0.0/0."
  }
}

variable "instance_name" {
  description = "Display name for the backend VM."
  type        = string
  default     = "chess-studio-staging"
}

variable "shape" {
  description = "OCI compute shape locked to Ampere A1."
  type        = string
  default     = "VM.Standard.A1.Flex"

  validation {
    condition     = var.shape == "VM.Standard.A1.Flex"
    error_message = "This module is intentionally constrained to VM.Standard.A1.Flex."
  }
}

variable "ocpus" {
  description = "A1 OCPUs."
  type        = number
  default     = 1

  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 2
    error_message = "Keep ocpus between 1 and 2 for the conservative Always Free design."
  }
}

variable "memory_gb" {
  description = "A1 RAM in GiB."
  type        = number
  default     = 6

  validation {
    condition     = var.memory_gb >= 6 && var.memory_gb <= 12
    error_message = "Keep memory_gb between 6 and 12 GiB for this conservative design."
  }
}

variable "boot_volume_size_gb" {
  description = "Boot volume size."
  type        = number
  default     = 50

  validation {
    condition     = var.boot_volume_size_gb >= 50 && var.boot_volume_size_gb <= 100
    error_message = "boot_volume_size_gb must stay between 50 and 100 GiB."
  }
}

variable "vcn_cidr" {
  description = "Dedicated VCN CIDR."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrhost(var.vcn_cidr, 0))
    error_message = "vcn_cidr must be a valid CIDR."
  }
}

variable "subnet_cidr" {
  description = "Backend subnet CIDR."
  type        = string
  default     = "10.42.10.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_cidr, 0))
    error_message = "subnet_cidr must be a valid CIDR."
  }
}

variable "repo_url" {
  description = "Repository cloned by cloud-init."
  type        = string
  default     = "https://github.com/evilsysadmin/chess-studio.git"
}

variable "repo_ref" {
  description = "Immutable commit SHA built during bootstrap."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{40}$", var.repo_ref))
    error_message = "repo_ref must be an immutable 40-character commit SHA."
  }
}

variable "freeform_tags" {
  description = "Additional non-sensitive OCI freeform tags."
  type        = map(string)
  default     = {}
}
