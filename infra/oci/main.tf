locals {
  common_tags = merge({
    service    = "chess-studio"
    component  = "backend"
    managed_by = "terraform"
  }, var.freeform_tags)
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
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.backend.id
  cidr_block                 = var.subnet_cidr
  display_name               = "${var.instance_name}-subnet"
  dns_label                  = "backend"
  route_table_id             = oci_core_route_table.backend.id
  security_list_ids          = [oci_core_security_list.backend.id]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.common_tags
}

resource "oci_core_instance" "backend" {
  availability_domain = var.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = var.instance_name
  shape               = var.shape
  freeform_tags       = local.common_tags

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  create_vnic_details {
    assign_public_ip = true
    display_name     = "${var.instance_name}-primary"
    hostname_label   = "chessbackend"
    subnet_id        = oci_core_subnet.backend.id
  }

  source_details {
    source_type             = "image"
    source_id               = var.image_ocid
    boot_volume_size_in_gbs = var.boot_volume_size_gb
  }

  metadata = {
    ssh_authorized_keys = trimspace(var.ssh_authorized_key)
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      repo_url = var.repo_url
      repo_ref = var.repo_ref
    }))
  }

  lifecycle {
    precondition {
      condition     = var.ssh_ingress_cidr == null || var.ssh_ingress_cidr != "0.0.0.0/0"
      error_message = "Refusing to expose SSH to 0.0.0.0/0. Use an operator CIDR or leave SSH closed."
    }
  }
}
