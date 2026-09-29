"""Contrato de forma de la bravuconada de apertura de Matthias (game_opening_banter).

Extraído de narrative_cloudflare.py. Falla cerrado (se sirve el fallback
determinista) cuando el texto de Workers AI:

- cambia de alfabeto;
- menciona un nivel distinto del real;
- menciona el nivel cuando lo ha fijado la calibración de Matthias: burlarse del
  jugador por un nivel que no ha elegido es mentir sobre los hechos (#4409);
- abre ¡ o ¿ sin cerrarlos (#4409: «¡Vaya, el nivel 0 otra vez. Qué cómodo.»).

La comprobación de números inventados sigue en narrative_cloudflare porque
depende de su extractor de hechos numéricos.
"""
from __future__ import annotations

import math
import re
from typing import Any

FOREIGN_SCRIPT_RE = re.compile(
    r"[Ͱ-ԯ؀-ۿ぀-ヿ㐀-䶿一-鿿가-힯]"
)
LEVEL_RE = re.compile(r"\b(?:nivel|dificultad|difficulty)\s*(?:de\s*)?([0-9]{1,3})\b", re.IGNORECASE)
NUMBER_RE = re.compile(r"(?<![\w])([0-9]+(?:[.,][0-9]+)?)(?![\w])")
# Cualquier alusión al nivel, con o sin número («el nivel de siempre», «qué dificultad»).
LEVEL_WORD_RE = re.compile(r"\b(?:nivel(?:es|ito)?|dificultad(?:es)?|difficulty)\b", re.IGNORECASE)

CALIBRATION_SOURCE = "calibration"
_PAIRS = {"¡": "!", "¿": "?"}


def unbalanced_spanish_marks(text: str) -> bool:
    """True si algún ¡ o ¿ no se cierra con su ! o ? antes de que acabe el texto."""
    pending: list[str] = []
    for char in text:
        if char in _PAIRS:
            pending.append(_PAIRS[char])
        elif pending and char == pending[-1]:
            pending.pop()
    return bool(pending)


def expected_level(game: dict[str, Any]) -> int | None:
    difficulty = game.get("difficulty") if isinstance(game, dict) else None
    if isinstance(difficulty, (int, float)) and not isinstance(difficulty, bool) and math.isfinite(float(difficulty)):
        return int(round(float(difficulty)))
    return None


def is_calibrated(game: dict[str, Any]) -> bool:
    return isinstance(game, dict) and game.get("difficulty_source") == CALIBRATION_SOURCE


def opening_banter_shape_violation(text: str, game: dict[str, Any]) -> str | None:
    """Motivo de rechazo o None. `text` ya viene normalizado y no vacío."""
    if FOREIGN_SCRIPT_RE.search(text):
        return "foreign_script"
    if unbalanced_spanish_marks(text):
        return "unbalanced_marks"
    if is_calibrated(game) and LEVEL_WORD_RE.search(text):
        return "calibrated_level"
    level = expected_level(game)
    for match in LEVEL_RE.finditer(text):
        if level is None or int(match.group(1)) != level:
            return "difficulty"
    return None
