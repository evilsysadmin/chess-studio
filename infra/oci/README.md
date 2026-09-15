# OCI staging/lab

**Producción sigue en Render. OCI es staging/laboratorio experimental.**

La infraestructura OCI se divide en dos estados deliberadamente pequeños:

- `bootstrap/`: seed Terraform que crea los compartments de infraestructura/staging y el bucket Object Storage versionado para tfstate.
- `staging/`: VCN + subnet + Ampere A1 ARM64 + cloud-init. Usa el backend `oci` remoto y locking nativo de Object Storage.
- `tests/` viven junto al stack que protegen.
- Floci ejecuta el `bootstrap/` real contra IAM + Object Storage en CI; Compute/VCN se cubren con `terraform test` hasta llegar a OCI real.

## Orden de bootstrap real

El seed de `bootstrap/` usa state local **sólo durante el primer apply**, porque el bucket remoto todavía no existe. Ese state no se comparte, no se commitea y no se reutiliza como estado operativo.

```bash
cd infra/oci/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
terraform output
```

Con los outputs `state_bucket`, `object_storage_namespace` y `staging_compartment_ocid`, se inicializa `staging/`:

```bash
cd ../staging
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
# completar backend.hcl + terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
```

El siguiente slice automatiza la migración del propio state seed de `bootstrap/` al mismo backend OCI. Hasta entonces **no se ejecuta apply real del bootstrap desde CI**.

## Contratos

- Frankfurt (`eu-frankfurt-1`) por defecto, configurable.
- `VM.Standard.A1.Flex` únicamente; límites conservadores Always Free.
- cero ingress por defecto; `0.0.0.0/0` para SSH está rechazado.
- `repo_ref` debe ser SHA Git completo de 40 caracteres.
- FastAPI liga a `127.0.0.1:4000`; la VM es reemplazable y Mongo sigue fuera.
- ningún secreto de aplicación ni private key entra en Terraform state.
- bucket de tfstate privado y con versionado habilitado.
- backend OCI usa locking nativo; no se desactiva con `-lock=false`.

La API signing key inicial se crea en consola una vez. Después, la meta es operar Terraform/CI sin volver a depender de la consola OCI.
