# Backend con dominio propio: Cloudflare + Render

Dominio público deseado para la API:

- Render directo: `https://chess-studio.onrender.com/`
- Dominio propio: `https://chess-studio.shadowops.dpdns.org/`
- Base de API para el frontend: `https://chess-studio.shadowops.dpdns.org/api`

## Por qué aparece un 404 aunque el CNAME resuelva

Un CNAME solo hace que DNS lleve el navegador hasta la infraestructura de
Render. Render también necesita saber que el `Host: chess-studio.shadowops.dpdns.org`
pertenece a este servicio. Si el dominio no está asociado al servicio como
**Custom Domain**, Render puede contestar 404 aunque `chess-studio.onrender.com`
funcione perfectamente.

## Configuración correcta

### 1. Render

En el servicio que actualmente responde en `chess-studio.onrender.com`:

1. `Settings` -> `Custom Domains`.
2. `Add Custom Domain`.
3. Añadir exactamente `chess-studio.shadowops.dpdns.org`.
4. Dejar la pantalla abierta para comprobar después el estado de verificación y
   del certificado TLS.

`render.yaml` incluye también ese dominio en `domains:` para instalaciones que
usen Blueprint. Si el servicio actual se creó a mano o no está gestionado por
ese Blueprint, el alta en el Dashboard sigue siendo necesaria.

### 2. Cloudflare DNS

Crear/ajustar el registro:

- **Type:** `CNAME`
- **Name:** `chess-studio`
- **Target:** `chess-studio.onrender.com`
- **Proxy status durante la verificación:** `DNS only` (nube gris)

El target es un hostname DNS: **no** lleva `https://`, `/api`, ni `/` final.

Eliminar cualquier registro `AAAA` conflictivo para ese hostname mientras se
configura Render.

### 3. Cloudflare SSL/TLS

En `SSL/TLS -> Overview`, usar modo **Full**.

### 4. Verificar en Render

Volver a `Settings -> Custom Domains` y pulsar `Verify` si no se ha verificado
automáticamente. Esperar a que Render muestre el certificado válido.

Pruebas recomendadas:

```bash
curl -i https://chess-studio.shadowops.dpdns.org/
curl -i https://chess-studio.shadowops.dpdns.org/api/health
```

La raíz de esta versión ya responde con identificación del servicio en vez del
404 que daba FastAPI cuando no existía ninguna ruta `/`. `/api/health` debe
responder HTTP 200 y `{"ok":true}`.

Esto permite distinguir dos fallos:

- Si la raíz devuelve `Chess Studio API`, DNS/Render están llegando a nuestra app.
- Si sigue apareciendo un 404 ajeno a esa respuesta, revisar la asociación del
  Custom Domain en Render antes de tocar FastAPI.

Cuando el dominio ya esté verificado y el certificado emitido, Cloudflare puede
pasarse opcionalmente a **Proxied** (nube naranja). Para descartar problemas de
proxy durante una incidencia, volver temporalmente a `DNS only` es la prueba más
simple.

### 5. GitHub Pages

En el repo del frontend:

`Settings -> Secrets and variables -> Actions -> Variables -> VITE_API_URL`

Valor recomendado una vez validado el dominio:

```text
https://chess-studio.shadowops.dpdns.org/api
```

Después hay que relanzar el workflow de GitHub Pages (o hacer un push que toque
el frontend), porque Vite incrusta `VITE_API_URL` durante el build.

## Diagnóstico rápido

- `onrender.com` funciona y dominio propio da **404**: revisar primero que el
  Custom Domain esté añadido al **mismo servicio** de Render.
- Render no verifica el dominio: CNAME en `DNS only`, target sin `https://`, sin
  `AAAA` conflictivo y esperar propagación DNS.
- Dominio verificado pero GitHub Pages sigue llamando a `onrender.com`: actualizar
  `VITE_API_URL` y reconstruir el frontend.
- 502 tras verificar: normalmente Render todavía está actualizando el routing;
  comprobar estado del servicio y logs.
