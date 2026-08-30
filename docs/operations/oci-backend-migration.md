# OCI backend migration runbook

Status: **preparación, no cutover**. Este documento deja el camino reproducible sin cambiar todavía la producción de Render.

## Objetivo

Mover únicamente el backend FastAPI de Chess Studio desde Render Free a una VM OCI Ampere A1 (ARM64), conservando:

- GitHub Pages para el frontend.
- Cloudflare para DNS/edge donde aporte valor.
- La base de datos de producción existente; no se migra Mongo dentro de la VM.
- El mismo contrato público `https://api.chess-studio.shadowops.dpdns.org`.

No se cambia ninguna URL del frontend durante la preparación.

## Supuestos conservadores · verificados 2026-08

Oracle sigue publicando Ampere A1 dentro de OCI Free Tier. Para no diseñar con el máximo más optimista de la tarifa comercial, el sizing base de este runbook es el límite documentado para una tenancy Always Free: **2 OCPU y 12 GB RAM totales** en la home region. También hay **200 GB** de block volume Always Free compartido.

Oracle puede reclamar compute Always Free que considere inactivo durante siete días según CPU, red y, para A1, memoria. Por tanto OCI reduce el cold-start sistemático de Render Free, pero no se trata como HA gratuita ni como infraestructura inmortal.

Render Free continúa apagando un web service después de 15 minutos sin tráfico y el arranque posterior puede rondar un minuto. Ésa es la principal razón operativa para la migración.

Fuentes de referencia:

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/en-us/iaas/Content/Compute/References/arm.htm
- https://render.com/docs/free

## Arquitectura objetivo

```text
Navegador
   |
   v
Cloudflare DNS / edge
   |
   v
api.chess-studio.shadowops.dpdns.org
   |
   v
OCI Ampere A1 · Ubuntu/Oracle Linux ARM64
   |
   +-- backend FastAPI :4000 (Docker, sólo origen)
   |
   +-- agente/ingress elegido para Cloudflare

Mongo de producción: permanece externo e independiente de la VM
```

La VM no debe contener el frontend ni convertirse en una segunda plataforma completa. El objetivo es reemplazar el proceso backend de Render con la menor superficie nueva posible.

## Fase 0 · garantía ARM64 en CI

Antes de crear ninguna VM:

```bash
bash scripts/oci_arm64_smoke.sh
```

El workflow `OCI ARM64 Readiness` instala QEMU + Buildx, construye realmente `backend-python/Dockerfile` para `linux/arm64` y ejecuta dentro de esa imagen los imports críticos (`fastapi`, `uvicorn`, `chess`, `motor`, `pydantic`, `bcrypt`, `jwt`, `httpx`).

Una build que sólo produce capas no es suficiente: el smoke exige que el contenedor AArch64 llegue a ejecutar Python.

## Fase 1 · provisionar sin tocar DNS

Sizing inicial recomendado:

- Shape: `VM.Standard.A1.Flex`.
- Arquitectura: ARM64/AArch64.
- Empezar con **1 OCPU / 6 GB RAM**; sigue dejando margen dentro del suelo Always Free documentado.
- Boot volume dentro del presupuesto Always Free.
- Ubuntu LTS u Oracle Linux soportado por A1.
- SSH sólo mediante clave; contraseña SSH deshabilitada.

La home region se elige por **capacidad A1 disponible**, no por proximidad a España. Chess Studio no necesita latencia de trading de alta frecuencia y un host estable vale más que perseguir 15 ms teóricos.

## Fase 2 · host mínimo

Instalar sólo lo necesario:

1. Docker Engine + Compose plugin.
2. Usuario operativo sin login directo como root.
3. Firewall/NSG con entrada mínima según el método de ingress elegido.
4. Actualizaciones de seguridad del sistema.
5. Directorio `/opt/chess-studio` propiedad del usuario de servicio.
6. Fichero `/etc/chess-studio/backend.env` con modo `0600`.

No copiar secretos a imágenes, Git, cloud-init público ni Terraform state.

Variables mínimas de producción que deben migrarse desde Render como secretos/entorno:

- `MONGO_URL`
- `MONGO_DB_NAME`
- secretos de autenticación/JWT usados por el backend
- `CORS_ORIGINS`
- configuración de recuperación de cuenta/Resend si está habilitada
- configuración de observabilidad/OTLP existente
- cualquier clave narrativa/backend que hoy pertenezca realmente al proceso FastAPI

Antes del cutover, comparar el inventario con las variables reales de Render. No adivinar valores ausentes.

## Fase 3 · desplegar backend en paralelo

Construir desde el commit que haya pasado CI:

```bash
git clone https://github.com/evilsysadmin/chess-studio.git /opt/chess-studio/repo
cd /opt/chess-studio/repo
git checkout <SHA_VALIDADO>
docker build -t chess-studio-backend:oci ./backend-python
```

Arrancar el contenedor con restart policy y el fichero de entorno de producción. El puerto 4000 debe quedar accesible únicamente para el ingress/origen elegido, no abierto alegremente a Internet.

Validaciones locales obligatorias antes de DNS:

```bash
curl --fail --silent http://127.0.0.1:4000/api/ready
curl --fail --silent http://127.0.0.1:4000/api/health
```

Además:

- login real con una cuenta de prueba;
- lectura/escritura de perfil contra Mongo de producción;
- creación/restauración de partida;
- endpoint narrativo si atraviesa el backend;
- logs y métricas llegando al destino esperado.

## Fase 4 · Cloudflare

Hoy Terraform mantiene `api.chess-studio.shadowops.dpdns.org` como CNAME DNS-only hacia Render. El cutover OCI debe sustituir ese origen de forma explícita, no añadir un segundo registro competidor.

Dos diseños válidos:

### Preferido: Cloudflare Tunnel

- La VM inicia conexión saliente hacia Cloudflare.
- FastAPI no necesita puerto público.
- Reduce superficie de firewall y evita gestionar un certificado TLS público en la VM.
- El token/credencial del tunnel vive fuera de Git.

### Alternativa: A/AAAA proxied hacia la VM

- Cloudflare proxy activado.
- Origen limitado a tráfico esperado y TLS de origen configurado correctamente.
- Más piezas de red/certificados que con Tunnel.

No usar `Flexible SSL` ni HTTP de origen expuesto como atajo.

## Fase 5 · cutover reversible

1. Mantener Render funcionando.
2. Verificar OCI desde origen y desde el hostname final de prueba/tunnel.
3. Cambiar únicamente el origen de `api.chess-studio.shadowops.dpdns.org`.
4. Ejecutar smoke funcional externo.
5. Vigilar errores 5xx, latencia, autenticación y Mongo.
6. Si algo falla, devolver DNS/origen a Render. No hay migración de datos que revertir porque Mongo no se movió.
7. Retirar Render sólo cuando OCI lleve un periodo razonable funcionando sin regresiones.

## Fase 6 · operación mínima

La VM debe tener como mínimo:

- restart automático del contenedor;
- healthcheck `/api/ready`;
- logs con rotación;
- alerta de backend no disponible;
- alerta de disco;
- parcheo periódico del host;
- copia documentada de cómo reconstruir la VM desde cero;
- ningún dato de usuario persistente exclusivamente en el filesystem local.

El objetivo SRE es que perder la VM sea molesto, no catastrófico.

## Criterio de salida de Render

La migración está terminada únicamente cuando:

- ARM64 CI sigue verde;
- OCI sirve el hostname productivo;
- login/perfil/partidas/restauración funcionan;
- Mongo sigue siendo la fuente de verdad;
- observabilidad funciona;
- rollback a Render se ha documentado y probado conceptualmente;
- el frontend no necesita conocer que cambió el proveedor del backend.
