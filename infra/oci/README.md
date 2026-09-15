# OCI staging/lab

**Producción sigue en Render. OCI es staging/laboratorio experimental.**

La infraestructura OCI se divide en dos estados deliberadamente pequeños:

- `bootstrap/`: seed Terraform que crea los compartments de infraestructura/staging y el bucket Object Storage versionado para tfstate.
- `staging/`: VCN + subnet + Ampere A1 ARM64 + cloud-init. Usa el backend `oci` remoto y locking nativo de Object Storage.
- `tests/` viven junto al stack que protegen.
- Floci ejecuta el `bootstrap/` real contra IAM + Object Storage en CI; Compute/VCN se cubren con `terraform test` hasta llegar a OCI real.

## Bootstrap real y migración del state

El bucket de state no existe al empezar, así que `bootstrap/` nace una sola vez con state local. En cuanto el seed crea el bucket privado/versionado, el helper migra **ese mismo lineage** al backend `oci` nativo y verifica que no se pierdan recursos. Credenciales, fingerprint y private key nunca se escriben en `backend.hcl`; el backend las recibe por entorno/config OCI.

```bash
cd infra/oci/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
cd ../../..
python3 scripts/oci_bootstrap_state.py migrate
```

`migrate` deja un backup local ignorado (`terraform.tfstate.pre-migrate.*.bak`), genera `backend.generated.tf` + `backend.hcl`, ejecuta `terraform init -migrate-state -force-copy` y compara lineage, serial y direcciones de recursos con `terraform state pull`.

En una máquina/runner nuevo, el bootstrap ya se abre directamente contra Object Storage:

```bash
export OCI_TFSTATE_BUCKET='chess-studio-tfstate'
export OCI_TFSTATE_NAMESPACE='<namespace OCI>'
export OCI_REGION='eu-frankfurt-1'
python3 scripts/oci_bootstrap_state.py init
terraform -chdir=infra/oci/bootstrap plan
```

Los cuatro valores del backend no son secretos. Las credenciales OCI siguen entrando sólo por variables de entorno/configuración OCI. El key del bootstrap es `chess-studio/bootstrap/terraform.tfstate` salvo override explícito con `OCI_BOOTSTRAP_STATE_KEY`.

Con `state_bucket`, `object_storage_namespace` y `staging_compartment_ocid` ya disponibles, `staging/` usa el mismo bucket pero otro key:

```bash
cd infra/oci/staging
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
# completar backend.hcl + terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
```

CI prueba el parser/verificador de migración sin credenciales y Floci prueba el lifecycle real de IAM + Object Storage. La migración del backend OCI nativo se ejecuta sólo contra OCI real porque Floci no documenta un endpoint custom para ese backend incorporado de Terraform.

## Contratos

- Frankfurt (`eu-frankfurt-1`) por defecto, configurable.
- `VM.Standard.A1.Flex` únicamente; límites conservadores Always Free.
- cero ingress por defecto; `0.0.0.0/0` para SSH está rechazado.
- `repo_ref` debe ser SHA Git completo de 40 caracteres.
- FastAPI liga a `127.0.0.1:4000`; la VM es reemplazable y Mongo sigue fuera.
- ningún secreto de aplicación ni private key entra en Terraform state/backend config.
- bucket de tfstate privado y con versionado habilitado.
- backend OCI usa locking nativo; no se desactiva con `-lock=false`.
- el state bootstrap conserva lineage y conjunto de recursos al migrarse.

La API signing key inicial se crea en consola una vez. Después, la meta es operar Terraform/CI sin volver a depender de la consola OCI.
