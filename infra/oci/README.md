# OCI backend Terraform · preparación

Este directorio **no hace cutover** y no contiene secretos de producción. Su único objetivo es dejar reproducible la infraestructura mínima de la futura VM Ampere A1 que sustituirá a Render cuando llegue el momento.

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

## Lo que deliberadamente NO entra en Terraform

- `MONGO_URL`, JWT, Resend, OTLP tokens ni ninguna variable de producción.
- credenciales/token de Cloudflare Tunnel.
- claves SSH privadas.
- DNS/cutover de producción.
- estado remoto improvisado.

Cualquiera de esos datos en una variable Terraform terminaría potencialmente en state. No se hace.

## Uso de preparación

```bash
cd infra/oci
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
terraform init
terraform fmt -check
terraform validate
terraform plan -out=tfplan
```

Antes de cualquier `apply`, `repo_ref` debe ser un SHA concreto que ya haya pasado CI y el workflow `OCI ARM64 Readiness`.

## Autenticación OCI

El provider usa los mecanismos normales del provider OCI (config file, variables de entorno, instance principal, etc.). No hay variables Terraform para la private key/API key.

No guardar credenciales OCI en `terraform.tfvars`.

## Post-provisioning

Cuando algún día se ejecute un `apply` real:

1. Confirmar que cloud-init deja `/opt/chess-studio/BOOTSTRAP_READY`.
2. Provisionar `/etc/chess-studio/backend.env` por canal seguro y con `0600`.
3. Instalar/autorizar Cloudflare Tunnel fuera de Terraform.
4. Arrancar `chess-studio-backend.service`.
5. Comprobar `curl --fail http://127.0.0.1:4000/api/ready` dentro de la VM.
6. Probar hostname/origen de preproducción.
7. Mantener Render vivo durante todo el cutover.

El runbook completo y el rollback están en `docs/operations/oci-backend-migration.md`.

## Regla operativa

Este módulo puede perderse y recrearse. Mongo sigue siendo la fuente de verdad y la VM no debe guardar datos de usuario exclusivos en disco local.
