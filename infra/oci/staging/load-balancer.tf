resource "oci_core_security_list" "load_balancer" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  display_name   = "${var.instance_name}-lb-security"
  freeform_tags  = local.common_tags

  dynamic "ingress_security_rules" {
    for_each = var.load_balancer_ingress_cidr == null ? [] : [var.load_balancer_ingress_cidr]

    content {
      description = "Optional emergency HTTP probe; canonical staging uses Cloudflare Tunnel"
      protocol    = "6"
      source      = ingress_security_rules.value
      source_type = "CIDR_BLOCK"
      stateless   = false

      tcp_options {
        min = 80
        max = 80
      }
    }
  }

  egress_security_rules {
    description      = "Load balancer to Chess Studio backend only"
    destination      = var.subnet_cidr
    destination_type = "CIDR_BLOCK"
    protocol         = "6"
    stateless        = false

    tcp_options {
      min = 4000
      max = 4000
    }
  }
}

resource "oci_core_security_list" "backend_from_load_balancer" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.backend.id
  display_name   = "${var.instance_name}-backend-from-lb"
  freeform_tags  = local.common_tags

  ingress_security_rules {
    description = "Only the OCI load balancer subnet may reach FastAPI"
    protocol    = "6"
    source      = var.load_balancer_subnet_cidr
    source_type = "CIDR_BLOCK"
    stateless   = false

    tcp_options {
      min = 4000
      max = 4000
    }
  }
}

resource "oci_core_subnet" "load_balancer" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.backend.id
  cidr_block                 = var.load_balancer_subnet_cidr
  display_name               = "${var.instance_name}-lb-subnet"
  dns_label                  = "chesslb"
  route_table_id             = oci_core_route_table.backend.id
  security_list_ids          = [oci_core_security_list.load_balancer.id]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.common_tags
}

resource "oci_load_balancer_load_balancer" "backend" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.instance_name}-lb"
  shape          = "flexible"
  subnet_ids     = [oci_core_subnet.load_balancer.id]
  is_private     = false
  freeform_tags  = local.common_tags

  shape_details {
    minimum_bandwidth_in_mbps = 10
    maximum_bandwidth_in_mbps = 10
  }
}

resource "oci_load_balancer_backend_set" "backend" {
  load_balancer_id = oci_load_balancer_load_balancer.backend.id
  name             = "chess-studio-backend"
  policy           = "ROUND_ROBIN"

  health_checker {
    protocol          = "HTTP"
    port              = 4000
    url_path          = "/api/ready"
    return_code       = 200
    interval_ms       = 10000
    timeout_in_millis = 3000
    retries           = 3
  }
}

resource "oci_load_balancer_backend" "primary" {
  load_balancer_id = oci_load_balancer_load_balancer.backend.id
  backendset_name  = oci_load_balancer_backend_set.backend.name
  ip_address       = oci_core_instance.backend.private_ip
  port             = 4000
  backup           = false
  drain            = false
  offline          = false
  weight           = 1
}

resource "oci_load_balancer_listener" "http" {
  load_balancer_id         = oci_load_balancer_load_balancer.backend.id
  name                     = "http"
  default_backend_set_name = oci_load_balancer_backend_set.backend.name
  port                     = 80
  protocol                 = "HTTP"

  connection_configuration {
    idle_timeout_in_seconds = 60
  }
}
