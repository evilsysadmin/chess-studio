"""Envío mínimo de correo transaccional para recuperar contraseñas.

En producción usa Resend mediante su API HTTP, sin añadir otra dependencia al
backend. En desarrollo, si no hay RESEND_API_KEY, imprime el enlace en logs:
permite probar todo el flujo local sin montar SMTP ni cuentas falsas.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("uvicorn.error")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
PASSWORD_RESET_FROM = os.environ.get("PASSWORD_RESET_FROM", "Chess Studio <onboarding@resend.dev>").strip()
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()


def send_password_reset_email(email: str, reset_url: str) -> bool:
    """Envía un enlace de recuperación. Devuelve True si el proveedor aceptó el correo.

    Nunca incluye la contraseña ni datos de partida. Si Resend no está
    configurado en desarrollo, deja el enlace en logs para probar manualmente.
    En producción falla cerrado (False) pero el endpoint público conserva una
    respuesta genérica para no revelar si una dirección está registrada.
    """
    if not RESEND_API_KEY:
        if ENVIRONMENT not in {"production", "prod"}:
            logger.warning("PASSWORD RESET DEV LINK: %s", reset_url)
            return True
        logger.error("Recuperación solicitada pero RESEND_API_KEY no está configurada.")
        return False

    payload = json.dumps({
        "from": PASSWORD_RESET_FROM,
        "to": [email],
        "subject": "Recupera tu contraseña · Chess Studio",
        "html": (
            "<div style='font-family:system-ui,sans-serif;line-height:1.55'>"
            "<h2>Chess Studio</h2>"
            "<p>Se ha solicitado restablecer la contraseña de tu cuenta.</p>"
            f"<p><a href='{reset_url}'>Restablecer contraseña</a></p>"
            "<p>El enlace caduca en 30 minutos. Si no lo pediste, ignora este mensaje.</p>"
            "</div>"
        ),
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Chess-Studio/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return 200 <= int(response.status) < 300
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.error("No se pudo enviar el correo de recuperación: %s", exc)
        return False
