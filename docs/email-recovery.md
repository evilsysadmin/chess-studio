# Recuperación de contraseña por email (V16.6b)

## Arquitectura

Frontend (GitHub Pages) -> FastAPI (Render) -> API HTTPS de Resend -> buzón del usuario.

No se gestiona SMTP en Chess Studio. La API key de Resend vive sólo en Render.

## Configuración inicial de prueba

1. Crear una cuenta de Resend.
2. Copiar la API key en Render como `RESEND_API_KEY`.
3. Mantener temporalmente `PASSWORD_RESET_FROM=Chess Studio <onboarding@resend.dev>`.
4. `ENABLE_EMAIL_RECOVERY=true`.
5. `PASSWORD_RESET_URL=https://evilsysadmin.github.io/chess-studio/`.

El remitente de prueba de Resend tiene restricciones propias. Para usuarios reales, verificar `shadowops.dpdns.org` y cambiar `PASSWORD_RESET_FROM` por algo como `Chess Studio <noreply@shadowops.dpdns.org>`.

## Cloudflare / dominio

`shadowops.dpdns.org` está delegado a Cloudflare, por lo que se pueden añadir los registros DNS que entregue Resend sin tocar el forwarding web actual. No inventar valores: copiar exactamente DKIM/SPF/MX del panel de Resend.

## Flujo

- Altas nuevas: email obligatorio.
- Cuentas antiguas: pueden añadir/cambiar email desde Mi cuenta, confirmando la contraseña actual.
- Login: `He olvidado la contraseña` pide email. La respuesta es siempre genérica para no enumerar cuentas.
- Resend envía un enlace `?resetToken=...` válido durante 30 minutos.
- El enlace abre la pantalla de nueva contraseña.
- Al usarlo, cambia la contraseña, inicia sesión e invalida automáticamente el enlace anterior mediante el fingerprint del hash viejo.

## Seguridad

- Email normalizado a minúsculas.
- Índice único parcial en Mongo para impedir carreras/duplicados entre cuentas.
- Rate limit en forgot/reset.
- La API key nunca llega al frontend.
- La contraseña actual es necesaria para cambiar el email desde una sesión ya abierta.

## Siguiente micro-iteración opcional

Verificación de propiedad del email (email_verified) antes de permitir recuperación. Se deja fuera de V16.6b a propósito para probar primero el camino completo Resend -> enlace -> reset con la mínima superficie posible.
