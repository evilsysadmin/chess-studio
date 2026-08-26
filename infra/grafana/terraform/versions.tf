terraform {
  required_version = ">= 1.7, < 2.0"

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 4.45"
    }
  }
}

# El provider toma GRAFANA_URL y GRAFANA_AUTH del entorno. Así ningún token
# entra en Terraform, el state ni el repositorio.
provider "grafana" {}
