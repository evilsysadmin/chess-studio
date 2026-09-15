# OCI staging/lab · preparación

OCI es un **staging/laboratorio experimental**. Producción permanece en Render.

Este módulo mantiene la VM A1 reproducible y deliberadamente reemplazable: VCN/subnet, ingress cerrado
por defecto, Ampere A1 ARM64 y cloud-init para construir el backend desde un SHA inmutable ya admitido
por CI. Mongo y los secretos de aplicación quedan fuera de Terraform.

## Contrato de seguridad

- `VM.Standard.A1.Flex` únicamente, con límites conservadores de OCPU/RAM/boot volume.
- cero ingress por defecto; SSH a `0.0.0.0/0` está rechazado.
- `repo_ref` debe ser un SHA Git completo de 40 caracteres, nunca `main`.
- FastAPI sólo escucha en `127.0.0.1:4000` en el host.
- ningún secreto de aplicación ni private key entra en Terraform state.
- Frankfurt (`eu-frankfurt-1`) es el objetivo; AD e image OCID siguen siendo explícitos para poder
  cambiar de AD cuando no exista capacidad A1.

## Validación sin OCI real

`OCI readiness` ejecuta tres niveles sin credenciales Oracle:

1. `terraform fmt`, `init -backend=false` y `validate`;
2. `terraform test` con `mock_provider "oci"` para los contratos A1/ingress/SHA;
3. `floci-oci` para un apply → plan sin drift → destroy real del provider oficial sobre IAM +
   Object Storage.

floci-oci no emula Compute ni VCN actualmente; esos recursos quedan cubiertos por `terraform test`
hasta el plan/apply autenticado contra OCI real.

## Uso real

```bash
cd infra/oci
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
terraform init
terraform plan
```

La autenticación OCI vive fuera de Terraform (config/env/GitHub secret). Tras crear la API signing key
inicial, la meta operativa es no necesitar la consola OCI para el día a día.

No hay cutover de producción implícito: **Render = prod; OCI = staging/lab**.
