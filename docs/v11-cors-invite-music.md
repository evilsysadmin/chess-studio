# V11 — CORS, invite code y música

## CORS / 400 en OPTIONS

El navegador en `https://evilsysadmin.github.io/chess-studio/` envía `Origin: https://evilsysadmin.github.io`; la ruta `/chess-studio/` nunca forma parte del Origin. V10 podía fallar si `CORS_ORIGINS` estaba configurado con la URL completa de Pages. V11 normaliza cada entrada a `scheme://host[:port]`, incluye explícitamente el origin de GitHub Pages y deja CORS como middleware exterior para responder preflight antes de routing/rate-limit.

Hay un test de regresión que hace `OPTIONS /api/auth/login` con el Origin de GitHub Pages y exige 200.

## JWT viejo

El flujo existente se conserva: cuando `/api/profile` devuelve 401 por JWT expirado/corrupto, el frontend limpia sesión y vuelve a login. El fallo CORS de V10 impedía recibir ese 401 y por eso parecía un error de Mongo/JWT. Al arreglar preflight vuelve a funcionar el flujo correcto.

## Invite code

- `INVITE_CODE` vacío/no definido: registro normal.
- `INVITE_CODE` definido: `POST /api/auth/register` exige `inviteCode` correcto.
- `ALLOW_REGISTRATION=false`: bloquea todas las altas aunque el invite sea correcto.

No se loguea el invite code. La comparación se hace con `hmac.compare_digest`.

## Música / título

Al-Ándalus queda intacto. Los demás temas pasan a un motor estructurado y timbres distintos. El selector se mueve a una fila separada del título para eliminar la superposición.
