data "oci_identity_availability_domains" "available" {
  count = var.availability_domain == null ? 1 : 0

  compartment_id = var.compartment_ocid
}

data "oci_identity_region_subscriptions" "tenancy" {
  tenancy_id = var.tenancy_ocid
}

data "oci_core_images" "arm64_ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "oci_core_public_ips" "reserved" {
  compartment_id = var.compartment_ocid
  scope          = "REGION"
  lifetime       = "RESERVED"
}

locals {
  selected_availability_domain = var.availability_domain != null ? trimspace(var.availability_domain) : try(
    data.oci_identity_availability_domains.available[0].availability_domains[0].name,
    "",
  )
  selected_image_ocid = try(
    data.oci_core_images.arm64_ubuntu.images[0].id,
    "",
  )
  home_regions = [
    for subscription in data.oci_identity_region_subscriptions.tenancy.region_subscriptions :
    subscription.region_name if subscription.is_home_region
  ]
  home_region = length(local.home_regions) == 1 ? local.home_regions[0] : ""
  common_tags = merge({
    service    = "chess-studio"
    component  = "backend"
    managed_by = "terraform"
  }, var.freeform_tags)
}

resource "terraform_data" "bootstrap_contract" {
  # v2 intentionally rolls the pre-contract A1 once. After that migration,
  # only a cloud-init byte change updates this fingerprint and recycles the
  # disposable staging host.
  triggers_replace = format("v2:%s", filesha256("${path.module}/cloud-init.yaml.tftpl"))
}

resource "oci_core_vcn" "backend" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.instance_name}-vcn"
  dns_label      = "chessvcn"
  freeform_tags  = local.common_tags
}

resource "oci_core_internet_gateway" "backend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  display_name   = "${var.instance_name}-igw"
  enabled        = true
  freeform_tags  = local.common_tags
}

resource "oci_core_route_table" "backend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  display_name   = "${var.instance_name}-routes"
  freeform_tags  = local.common_tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.backend.id
  }
}

resource "oci_core_security_list" "backend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  display_name   = "${var.instance_name}-security"
  freeform_tags  = local.common_tags

  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
    stateless        = false
  }

  dynamic "ingress_security_rules" {
    for_each = var.ssh_ingress_cidr == null ? [] : [var.ssh_ingress_cidr]

    content {
      description = "Optional operator SSH; disabled by default"
      protocol    = "6"
      source      = ingress_security_rules.value
      source_type = "CIDR_BLOCK"
      stateless   = false

      tcp_options {
        min = 22
        max = 22
      }
    }
  }
}

resource "oci_core_subnet" "backend" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  cidr_block     = var.subnet_cidr
  display_name   = "${var.instance_name}-subnet"
  dns_label      = "backend"
  route_table_id = oci_core_route_table.backend.id
  security_list_ids = [
    oci_core_security_list.backend.id,
    oci_core_security_list.backend_from_load_balancer.id,
  ]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.common_tags
}

resource "oci_core_instance" "backend" {
  availability_domain = local.selected_availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = var.instance_name
  shape               = var.shape
  freeform_tags       = local.common_tags

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  agent_config {
    are_all_plugins_disabled = false
    is_management_disabled   = false

    plugins_config {
      name          = "Compute Instance Run Command"
      desired_state = "ENABLED"
    }
  }

  create_vnic_details {
    assign_public_ip = true
    display_name     = "${var.instance_name}-primary"
    hostname_label   = "chessbackend"
    subnet_id        = oci_core_subnet.backend.id
  }

  source_details {
    source_type             = "image"
    source_id               = local.selected_image_ocid
    boot_volume_size_in_gbs = var.boot_volume_size_gb
  }

  metadata = merge(
    {
      user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
        repo_url = var.repo_url
        repo_ref = var.repo_ref
      }))
    },
    var.ssh_authorized_key == null ? {} : {
      ssh_authorized_keys = trimspace(var.ssh_authorized_key)
    }
  )

  lifecycle {
    # Application release is not infrastructure desired state: repo_ref changes
    # stay ignored. A bootstrap-template change is different: it changes the
    # host contract, so the disposable A1 is intentionally replaced once.
    ignore_changes       = [metadata["user_data"]]
    replace_triggered_by = [terraform_data.bootstrap_contract]

    precondition {
      condition     = local.home_region != ""
      error_message = "OCI returned no unique tenancy home region; refusing a potentially billable staging plan."
    }

    precondition {
      condition     = var.region == local.home_region
      error_message = "Zero-cost staging is home-region-only. Set OCI_REGION to the tenancy home region before planning or applying."
    }

    precondition {
      condition     = local.selected_availability_domain != ""
      error_message = "OCI returned no availability domains. Set availability_domain explicitly if discovery is unavailable."
    }

    precondition {
      condition     = can(regex("^ocid1\\.image\\.", local.selected_image_ocid))
      error_message = "OCI returned no Canonical Ubuntu 24.04 platform image compatible with VM.Standard.A1.Flex."
    }

    precondition {
      condition     = var.ssh_ingress_cidr == null || var.ssh_ingress_cidr != "0.0.0.0/0"
      error_message = "Refusing to expose SSH to 0.0.0.0/0. Use an operator CIDR or leave SSH closed."
    }

    precondition {
      condition     = var.ssh_ingress_cidr == null || var.ssh_authorized_key != null
      error_message = "ssh_authorized_key is required when ssh_ingress_cidr opens operator SSH."
    }
  }
}
