"""Feature flags públicos y de baja complejidad para Chess Studio.

Los flags sólo controlan capacidades de producto no sensibles. Se resuelven en
backend para poder apagar una función sin reconstruir ni desplegar el frontend.
Cambiar la variable de entorno puede requerir reiniciar el proceso según el
proveedor, pero no exige una nueva release del cliente.
"""
from __future__ import annotations

import os

PUBLIC_FEATURE_DEFAULTS = {
    "homeGuide": True,
    "postGameFeedback": True,
    "rivalGhost": True,
    "spectator": True,
}


def public_feature_flags(raw_disabled: str | None = None) -> dict[str, bool]:
    raw = os.getenv("CHESS_DISABLED_FEATURES", "") if raw_disabled is None else raw_disabled
    disabled = {part.strip().lower() for part in str(raw or "").split(",") if part.strip()}
    return {
        name: enabled and name.lower() not in disabled
        for name, enabled in PUBLIC_FEATURE_DEFAULTS.items()
    }
