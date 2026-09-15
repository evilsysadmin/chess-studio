# OCI backend Terraform

Este directorio declara la infraestructura mínima del backend de Chess Studio en Oracle Cloud Infrastructure. El primer objetivo operativo es **staging**; producción sigue fuera de este módulo hasta que el staging OCI haya demostrado estabilidad.

## Qué crea

- VCN dedicada y una subnet.
- Internet Gateway sólo para salida/administración explícita.
- Security List con **cero ingress por defecto** y egress permitido.
- SSH opcional únicamente si `ssh_ingress_cidr` contiene un CIDR concreto; `0.0.0.0/0` está rechazado por precondition.
- Una `VM.Standard.A1.Flex`, por defecto 1 OCPU / 6 GiB.
- IP pública para disponer de egress sin introducir un NAT Gateway de pago; ninguna regla permite tráfico entrante por defecto.
- cloud-init que instala Docker, clona un commit validado y construye la imagen ARM64 del backend.
- Un servicio systemd que sólo puede arrancar cuando exista `/etc/chess-studio/backend.env`.

FastAPI se publica en el host exclusivamente como `127.0.0.1:4000`. El diseño esperado es que Cloudflare Tunnel, configurado después y **fuera de Terraform**, sea quien alcance ese origen local.

## Estado Terraform

El módulo declara el backend nativo `oci`. El state de staging vive en OCI Object Storage y usa locking nativo. El bucket debe existir antes del primer `terraform init`; es el único bootstrap inevitable del backend remoto.

Recomendaciones para ese bucket:

- `NoPublicAccess`.
- versioning activado.
- acceso limitado al principal/API key usado por GitHub Actions.
- permisos mínimos de lectura/escritura/borrado de objetos necesarios para state + lock.
- una key independiente para staging: `chess-studio/staging/terraform.tfstate`.

No guardar state real en Git, artifacts de Actions ni `terraform.tfvars`.

## Pipeline

`.github/workflows/oci-readiness.yml` sigue siendo el gate PR sin credenciales: ARM64 smoke + `fmt/init -backend=false/validate`.

`.github/workflows/oci-staging.yml` es el camino con credenciales y remote state:

1. Espera a `Main · admission`.
2. Descarta automáticamente un SHA ya obsoleto si `main` ha avanzado.
3. Sólo actúa si el commit admitido toca `infra/oci` o los workflows OCI.
4. Serializa ejecuciones con `cancel-in-progress: false`; un apply en vuelo nunca se supersedea.
5. Hace `fmt`, `init` contra Object Storage, `validate` y `plan`.
6. Hace `apply` automático únicamente cuando `OCI_STAGING_ENABLED=true`.
7. `workflow_dispatch` permite `plan` desde cualquier ref, pero `apply` sólo desde `main`.

Esto conserva el contrato del repo: una mutación de staging no puede adelantarse a la admisión de `main`.

### Variables y environment `oci-staging`

Variable de repositorio:

- `OCI_STAGING_ENABLED` (`true` para habilitar el workflow automático tras admisión; ausente/false lo deja dormido).

Variables del environment `oci-staging`:

- `OCI_REGION`
- `OCI_TENANCY_OCID`
- `OCI_USER_OCID`
- `OCI_FINGERPRINT`
- `OCI_COMPARTMENT_OCID`
- `OCI_AVAILABILITY_DOMAIN`
- `OCI_IMAGE_OCID`
- `OCI_SSH_PUBLIC_KEY`
- `OCI_TF_STATE_BUCKET`
- `OCI_TF_STATE_NAMESPACE`

Secretos:

- `OCI_PRIVATE_KEY`: private key PEM de un principal de automatización dedicado.

Conviene proteger el environment `oci-staging` con las reglas de aprobación que queramos antes de activar `OCI_STAGING_ENABLED=true`.

## Uso local

El backend se configura parcialmente porque bucket/namespace dependen de la tenancy:

```bash
cd infra/oci
terraform init \
  -backend-config="bucket=$OCI_TF_STATE_BUCKET" \
  -backend-config="namespace=$OCI_TF_STATE_NAMESPACE" \
  -backend-config="key=chess-studio/staging/terraform.tfstate" \
  -backend-config="region=$OCI_REGION"
terraform fmt -check
terraform validate
terraform plan
```

Para una validación local que no toque el state remoto:

```bash
terraform init -backend=false
terraform validate
```

## Lo que deliberadamente NO entra en Terraform

- `MONGO_URL`, JWT, Resend, OTLP tokens ni ninguna variable de aplicación.
- credenciales/token de Cloudflare Tunnel.
- claves SSH privadas.
- DNS/cutover de producción.

Cualquiera de esos datos en una variable Terraform terminaría potencialmente en state. No se hace.

## Post-provisioning

Después del primer `apply` real:

1. Confirmar que cloud-init deja `/opt/chess-studio/BOOTSTRAP_READY`.
2. Provisionar `/etc/chess-studio/backend.env` por canal seguro y con `0600`.
3. Instalar/autorizar Cloudflare Tunnel fuera de Terraform.
4. Arrancar `chess-studio-backend.service`.
5. Comprobar `curl --fail http://127.0.0.1:4000/api/ready` dentro de la VM.
6. Probar hostname/origen de staging.
7. Mantener Render vivo durante todo el cutover.

El runbook completo y el rollback están en `docs/operations/oci-backend-migration.md`.

## Regla operativa

La VM puede perderse y recrearse. Mongo sigue siendo la fuente de verdad y la VM no debe guardar datos de usuario exclusivos en disco local.
