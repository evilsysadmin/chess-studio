# V10 — Backend security hardening

## Política de acceso

Públicos únicamente:

- `POST /api/auth/register` — necesario para crear una cuenta; rate limit 5/hora/IP.
- `POST /api/auth/login` — necesario para obtener JWT; rate limit 10/minuto/IP.
- `GET /api/health` — necesario para Render/Docker health checks.
- Preflight CORS `OPTIONS`, gestionado por middleware.

Todo lo demás exige autenticación:

- Juego, perfil, admin y `/` requieren JWT Bearer válido.
- `/api/analyze` y `/api/analyze-move` requieren JWT o una `X-API-Key` incluida en `M2M_API_KEYS`.
- `/docs`, `/redoc` y `/openapi.json` están deshabilitados salvo que se configure explícitamente `EXPOSE_API_DOCS=true`.

## Ownership de partidas

Desde V10 cada partida guarda `owner=<username>` al crearse. Todas las operaciones sobre una partida verifican que el username del JWT coincida con ese owner. Ante un UUID ajeno se devuelve 404 para no confirmar que la partida existe.

Las partidas activas creadas con V9 o anterior no tenían owner. V10 no intenta "reclamarlas" automáticamente porque eso permitiría que el primer usuario que conozca el UUID se la adjudique; responde 409 y se debe iniciar una partida nueva.

## Producción

`render.yaml` fija:

- `ENVIRONMENT=production`
- `EXPOSE_API_DOCS=false`
- `CORS_ORIGINS=https://evilsysadmin.github.io`
- `JWT_SECRET` como secreto (`sync: false`)

Con `ENVIRONMENT=production`, el backend aborta el arranque si `JWT_SECRET` es la clave de desarrollo o tiene menos de 32 caracteres.

## Lo que auth no resuelve por sí sola

Una cuenta autenticada sigue consumiendo CPU legítimamente, por eso se mantiene rate limiting. Registro y login deben ser públicos por definición si se permite auto-registro. Si el proyecto pasa a ser privado, el siguiente endurecimiento recomendable es cerrar el registro público o exigir invitación.

## Cerrar nuevas altas

`ALLOW_REGISTRATION=false` hace que `POST /api/auth/register` responda 403. Login de cuentas existentes sigue funcionando. El `render.yaml` lo deja en `true` para no cambiar el comportamiento de despliegues existentes; cuando ya estén creadas las cuentas deseadas, se puede cambiar a `false` en Render.


## Nota V11

V11 restaura `INVITE_CODE` como gate opcional de registro y corrige el 400 de preflight de GitHub Pages: `CORS_ORIGINS` normaliza URLs con ruta al Origin real. `ALLOW_REGISTRATION` sigue como interruptor maestro independiente.
