# OCI staging/lab

**Producción sigue en Render. OCI es staging/laboratorio experimental hasta superar los drills de shadow.**

La infraestructura OCI se divide deliberadamente por responsabilidad:

- `probe/`: sólo data sources; valida credenciales, región, Object Storage, ADs e imagen A1/Ubuntu sin crear recursos.
- `bootstrap/`: foundation persistente; crea compartments de infraestructura/staging y el bucket Object Storage privado/versionado para tfstate.
- `staging/`: VCN + subnet + Ampere A1 ARM64 + cloud-init. Usa el backend `oci` remoto y locking nativo de Object Storage.
- `tests/` viven junto al stack que protegen.
- Floci ejecuta el `bootstrap/` real contra IAM + Object Storage en CI; Compute/VCN se cubren con `terraform test` hasta llegar a OCI real.

## Primer encendido desde GitHub Actions

La consola OCI se usa una vez para crear la API signing key. Después, la ruta normal es `.github/workflows/oci-staging-lab.yml`.

Secrets de repositorio obligatorios:

- `OCI_TENANCY_OCID`
- `OCI_USER_OCID`
- `OCI_FINGERPRINT`
- `OCI_PRIVATE_KEY`

El workflow valida los cuatro juntos antes de instalar Terraform y nunca imprime sus valores. `OCI_REGION` y `OCI_TFSTATE_BUCKET` son variables opcionales; por defecto usa `eu-frankfurt-1` y `chess-studio-tfstate`.

`OCI_AVAILABILITY_DOMAIN` es el único override de descubrimiento permitido. Sin él Terraform descubre el primer AD visible; la imagen se resuelve siempre como la Canonical Ubuntu 24.04 platform image más reciente compatible con `VM.Standard.A1.Flex`. No se acepta `OCI_IMAGE_OCID`: un override arbitrario podría apuntar a una Custom Image cuyo almacenamiento no forma parte del contrato zero-cost. El override de AD sirve especialmente para repetir un apply en otro AD si Oracle devuelve `out of host capacity`.

Secuencia de adopción:

1. `probe`: operación por defecto y read-only. Comprueba firma/API, Frankfurt, namespace Object Storage, ADs e imagen A1 sin state remoto ni mutaciones.
2. `bootstrap`: crea una sola vez la foundation y migra el seed state local al backend OCI nativo.
3. `plan`: conecta bootstrap/state y calcula staging sin mutar.
4. `apply`: crea el staging shadow desde el SHA inmutable seleccionado, sólo si ese SHA sigue siendo el `main` actual.
5. Validar arranque, servicio, persistencia separada de producción y observabilidad del shadow.
6. `destroy` + `apply` dos veces, demostrando recuperación sin abrir la consola.
7. Sólo después de esos drills se puede plantear retirar Render staging. **Render producción no entra en esta decisión.**

No hay auto-apply por push a `main`. GitHub Actions orquesta; Terraform provisiona.

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

El key del bootstrap es `chess-studio/bootstrap/terraform.tfstate` salvo override explícito con `OCI_BOOTSTRAP_STATE_KEY`.

La foundation tiene `prevent_destroy` en ambos compartments y en el bucket de tfstate. Un `terraform destroy` accidental de `bootstrap/` debe fallar durante el plan; CI lo comprueba contra Floci. Para retirar deliberadamente la foundation hay que eliminar primero esos guards en código. El state separado de `staging/` sigue siendo destruible/recreable.

## Lifecycle desde GitHub Actions

`.github/workflows/oci-staging-lab.yml` es manual (`workflow_dispatch`) y nunca toca Render. Serializa todas las operaciones del laboratorio y usa siempre el SHA seleccionado como `repo_ref`; `bootstrap`, `apply` y `destroy` vuelven a comprobar inmediatamente antes de mutar que ese SHA sigue siendo el `main` actual.

Operaciones:

- `probe`: data-only; no state remoto y cero mutaciones.
- `bootstrap`: crea compartments + bucket, migra el seed state al backend OCI y exige zero drift después.
- `plan`: conecta el state remoto y sólo calcula el plan.
- `apply`: calcula un plan y lo aplica únicamente si `main` no ha avanzado.
- `destroy`: destruye **sólo** `staging/`, exige `confirm_destroy=true` y conserva bootstrap/state.

El workflow obtiene el Object Storage namespace mediante el provider Terraform y lee el compartment de staging desde el state remoto de bootstrap. No usa OCI CLI para provisionar ni obliga a copiar AD/image OCIDs a GitHub. Los planes no se publican como artifacts.

## Contratos

- Frankfurt (`eu-frankfurt-1`) por defecto, configurable.
- `VM.Standard.A1.Flex` únicamente; techo conservador zero-cost de 2 OCPU / 12 GiB.
- boot volume limitado a 50–100 GiB dentro del presupuesto combinado de volúmenes Always Free.
- AD descubierto por provider con override explícito disponible.
- imagen ARM64 obligatoriamente descubierta como Canonical Ubuntu 24.04 platform image; Custom Image e `image_ocid` arbitrario quedan fuera del contrato.
- OCI Flexible Load Balancer fijado a 10 Mbps mientras siga siendo la ruta de ingress del staging actual.
- cero ingress por defecto; `0.0.0.0/0` para SSH está rechazado.
- SSH no requiere ni inyecta public key mientras el ingress siga cerrado.
- `repo_ref` debe ser SHA Git completo de 40 caracteres.
- FastAPI liga a `127.0.0.1:4000`; la VM es reemplazable y Mongo sigue fuera.
- ningún secreto de aplicación ni private key entra en Terraform state/backend config.
- bucket de tfstate privado, versionado y protegido de destroy accidental.
- backend OCI usa locking nativo; no se desactiva con `-lock=false`.
- el state bootstrap conserva lineage y conjunto de recursos al migrarse.
- cambios IaC puros ejecutan OCI readiness pero no despiertan Trivy/Docker/Compose.
- futuras capas K3s/GitOps no pueden introducir builders A1 temporales, Custom Images facturables ni otros recursos OCI fuera del presupuesto zero-cost sin cambiar explícitamente este contrato.

## Gate para sustituir Render staging

OCI permanece en **shadow** hasta demostrar, con la cuenta real:

- `probe` verde con la identidad configurada en GitHub;
- bootstrap remoto zero-drift;
- `plan` y `apply` verdes;
- backend de staging usable con datos/secrets separados de producción;
- observabilidad y recovery suficientes para diagnosticar una A1 reclamada;
- dos ciclos consecutivos `destroy → apply` verdes sin abrir la consola;
- reconstrucción satisfactoria tras simular o sufrir pérdida de VM.

Hasta cumplir ese gate, Render staging sigue siendo la referencia operativa. Producción permanece en Render en cualquier caso.
