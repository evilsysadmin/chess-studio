"""Registro de Matthias: siempre trata al jugador de usted.

Contrato: docs/operations/matthias-runtime.md ("Matthias siempre trata al jugador
de usted. Cordialidad teutona").

El prompt del Worker es orientativo; este detector es la frontera de enforcement
para texto generado por Workers AI. Busca marcas INEQUÍVOCAS de tuteo dirigidas al
jugador. No intenta detectar imperativos de tú ("revisa", "entrena"), porque son
idénticos a la 3.ª persona del presente ("Matthias revisa...") y darían falsos
positivos. Un falso positivo es seguro: la respuesta se descarta y se sirve el
fallback determinista, que ya está redactado de usted.
"""
from __future__ import annotations

import re

_TUTEO_PATTERNS: tuple[tuple[str, str], ...] = (
    ("pronombre", r"\b(?:tú|contigo|ti)\b"),
    ("posesivo", r"\btus?\b"),
    ("clitico", r"\bte\b"),
    (
        "verbo_2sg",
        r"\b(?:tienes|puedes|quieres|eres|estás|sabes|haces|juegas|vas|debes|deberías|"
        r"necesitas|sigues|llevas|empiezas|pierdes|mueves|cometes|repites|conviertes|"
        r"entrenas|revisas|piensas|crees|recuerdas|consigues|vuelves|acabas)\b",
    ),
    ("perfecto_2sg", r"\bhas\s+[a-záéíóúñ]+(?:ado|ido|to|cho|sto|lto|rto)\b"),
    ("imperativo_pronominal", r"\b(?:céntrate|fíjate|tómate|olvídate|acuérdate|date|mírate|ponte|vete)\b"),
)

# Imperativos/perífrasis de usted que cuentan como "acción concreta" en el retrato.
USTED_ACTION_TERMS: tuple[str, ...] = (
    "entrene", "practique", "revise", "trabaje", "céntrese", "centrese", "priorice",
    "evite", "compruebe", "vigile", "busque", "intente", "mejore", "corrija",
    "refuerce", "dedique", "repase", "fíjese", "fijese", "debería", "deberia",
    "le conviene", "procure", "mantenga", "haga",
)

_COMPILED = tuple((name, re.compile(pattern, re.IGNORECASE)) for name, pattern in _TUTEO_PATTERNS)

# Eventos donde Matthias NO se dirige al jugador (JSON estructurado, biografías en
# tercera persona, paneles internos). El resto debe ir de usted.
REGISTER_EXEMPT_EVENTS = frozenset({"chronicles_planner", "personal_puzzle_batch", "unit_bio", "observability_summary"})


def tuteo_markers(text: str) -> list[str]:
    """Devuelve las marcas de tuteo encontradas (vacío si el texto respeta el usted)."""
    clean = " ".join(str(text or "").split())
    found: list[str] = []
    for name, regex in _COMPILED:
        for match in regex.finditer(clean):
            found.append(f"{name}:{match.group(0).lower()}")
    return found


def validate_matthias_register(text: str, event_type: str) -> tuple[bool, str | None]:
    if event_type in REGISTER_EXEMPT_EVENTS:
        return True, None
    markers = tuteo_markers(text)
    if markers:
        return False, markers[0]
    return True, None
