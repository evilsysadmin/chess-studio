"""Cloudflare Workers AI narrative provider + bounded telemetry.

The chess engine remains the factual authority. Provider failure is always
non-fatal and falls back to a local line that uses only supplied facts.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import math
import os
import re
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass
from typing import Any

import httpx

from resilience import adaptive_ai_mode, try_enter_ai_bulkhead, leave_ai_bulkhead

ai_logger = logging.getLogger("uvicorn.error")

DEFAULT_TIMEOUT_SECONDS = 5.0
DEFAULT_COMMENT_TIMEOUT_SECONDS = 2.0
DEFAULT_MAX_OUTPUT_CHARS = 420
PLAYER_PORTRAIT_MAX_OUTPUT_CHARS = 900
RICH_ANALYSIS_MAX_OUTPUT_CHARS = 900
RICH_ANALYSIS_EVENT_TYPES = frozenset({"post_game_autopsy", "combat_briefing", "combat_debrief", "observability_summary", "training_plan"})
MAX_FACT_DEPTH = 3
MAX_FACT_STRING = 240
MAX_FACT_ARRAY = 12
MAX_FACT_KEYS = 30
MAX_TELEMETRY_EVENTS = 500
DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 5
DEFAULT_COMMENT_CIRCUIT_FAILURE_THRESHOLD = 3
DEFAULT_CIRCUIT_RESET_SECONDS = 90.0
DEFAULT_COMMENT_CIRCUIT_RESET_SECONDS = 60.0

# Narrative facts are intentionally data-only. These keys can never be useful to
# write a chess quip and must never leave Render even if a buggy/malicious client
# puts them in the dossier.
SENSITIVE_FACT_KEY_PARTS = frozenset({
    "password", "passwd", "secret", "token", "jwt", "authorization",
    "cookie", "session", "email", "api_key", "apikey", "bearer",
})

# Strong factual concepts that an LLM must not introduce unless the dossier
# actually grounds them. Generic words such as "jugada", "posición" and
# "tablero" are deliberately not restricted.
_GROUNDED_CONCEPTS = {
    "mate": ("mate", "checkmate", "#"),
    "jaque": ("jaque", "check", "+"),
    "captura": ("captur", "capture", "takes", "x"),
    "dama": ("dama", "queen", '"q"'),
    "torre": ("torre", "rook", '"r"'),
    "alfil": ("alfil", "bishop", '"b"'),
    "caballo": ("caballo", "knight", '"n"'),
    "peon": ("peón", "peon", "pawn", '"p"'),
    "promocion": ("promoc", "promotion", "promote"),
    "enroque": ("enroque", "castle", "castling", "o-o"),
    "ahogado": ("ahog", "stalemate"),
    "apertura": ("apertura", "opening"),
    "rating": ("elo", "rating"),
    "racha": ("racha", "streak"),
    "victoria": ("victoria", "win", "won"),
    "derrota": ("derrota", "loss", "lost"),
    "tablas": ("tablas", "draw"),
}


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _env_bool(name: str, default: bool = True) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off", "disabled"}


def ai_narrative_enabled() -> bool:
    return _env_bool("AI_NARRATIVE_ENABLED", True)


def _circuit_failure_threshold() -> int:
    raw = _env("AI_NARRATIVE_CIRCUIT_FAILURES")
    try:
        return max(1, min(int(raw), 20)) if raw else DEFAULT_CIRCUIT_FAILURE_THRESHOLD
    except ValueError:
        return DEFAULT_CIRCUIT_FAILURE_THRESHOLD


def _circuit_reset_seconds() -> float:
    raw = _env("AI_NARRATIVE_CIRCUIT_RESET_SECONDS")
    try:
        return max(5.0, min(float(raw), 600.0)) if raw else DEFAULT_CIRCUIT_RESET_SECONDS
    except ValueError:
        return DEFAULT_CIRCUIT_RESET_SECONDS


def _sanitize(value: Any, depth: int = 0) -> Any:
    if depth > MAX_FACT_DEPTH:
        return None
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value if not isinstance(value, float) or math.isfinite(value) else None
    if isinstance(value, str):
        return "".join(ch for ch in value if ch >= " " or ch in "\n\t")[:MAX_FACT_STRING]
    if isinstance(value, (list, tuple)):
        return [_sanitize(item, depth + 1) for item in value[:MAX_FACT_ARRAY]]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        accepted = 0
        for key, item in value.items():
            clean_key = str(key)[:60]
            lowered = clean_key.lower().replace("-", "_")
            if any(part in lowered for part in SENSITIVE_FACT_KEY_PARTS):
                continue
            if not clean_key:
                continue
            out[clean_key] = _sanitize(item, depth + 1)
            accepted += 1
            if accepted >= MAX_FACT_KEYS:
                break
        return out
    return None


def build_payload(
    event_type: str,
    facts: dict[str, Any],
    *,
    tone: str = "friendly_sarcastic",
    locale: str = "es-ES",
    request_id: str | None = None,
) -> dict[str, Any]:
    payload = {
        "event_type": str(event_type or "generic")[:48],
        "facts": _sanitize(facts or {}),
        "tone": str(tone or "sarcastic")[:32],
        "locale": str(locale or "es-ES")[:16],
    }
    if request_id:
        payload["request_id"] = re.sub(r"[^A-Za-z0-9._:-]", "", str(request_id))[:80]
    return payload


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")


def sign_request(secret: str, timestamp: str, body: bytes) -> str:
    message = timestamp.encode("ascii") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _timeout_seconds(channel: str | None = None) -> float:
    if channel == "comments":
        raw = _env("CF_AI_COMMENT_TIMEOUT_SECONDS")
        default = DEFAULT_COMMENT_TIMEOUT_SECONDS
        try:
            return max(0.5, min(float(raw), 5.0)) if raw else default
        except ValueError:
            return default
    raw = _env("CF_AI_TIMEOUT_SECONDS")
    if not raw:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        return max(1.0, min(float(raw), 20.0))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _circuit_failure_threshold_for(channel: str) -> int:
    if channel == "comments":
        raw = _env("AI_NARRATIVE_COMMENT_CIRCUIT_FAILURES")
        inherited = _env("AI_NARRATIVE_CIRCUIT_FAILURES")
        default = DEFAULT_COMMENT_CIRCUIT_FAILURE_THRESHOLD
        try:
            value = raw or inherited
            return max(1, min(int(value), 20)) if value else default
        except ValueError:
            return default
    return _circuit_failure_threshold()


def _circuit_reset_seconds_for(channel: str) -> float:
    if channel == "comments":
        raw = _env("AI_NARRATIVE_COMMENT_CIRCUIT_RESET_SECONDS")
        inherited = _env("AI_NARRATIVE_CIRCUIT_RESET_SECONDS")
        default = DEFAULT_COMMENT_CIRCUIT_RESET_SECONDS
        try:
            value = raw or inherited
            return max(5.0, min(float(value), 600.0)) if value else default
        except ValueError:
            return default
    return _circuit_reset_seconds()


def _max_output_chars(event_type: str) -> int:
    if event_type == "player_portrait":
        return PLAYER_PORTRAIT_MAX_OUTPUT_CHARS
    if event_type in RICH_ANALYSIS_EVENT_TYPES:
        return RICH_ANALYSIS_MAX_OUTPUT_CHARS
    return DEFAULT_MAX_OUTPUT_CHARS


def _trim_complete_output(text: str, max_chars: int) -> str:
    clean = " ".join(str(text or "").split()).strip()
    if len(clean) <= max_chars:
        return clean

    head = clean[: max_chars + 1]
    minimum = int(max_chars * 0.55)
    sentence_end = -1
    for index in range(minimum, min(len(head), max_chars)):
        if head[index] in ".!?…" and (index + 1 >= len(head) or head[index + 1].isspace()):
            sentence_end = index
    if sentence_end >= minimum:
        return head[: sentence_end + 1].strip()

    word_end = head[: max(1, max_chars - 1)].rfind(" ")
    safe_end = word_end if word_end > 0 else max(1, max_chars - 1)
    return head[:safe_end].rstrip() + "…"


def _fallback(event_type: str, facts: dict[str, Any]) -> str:
    clean = _sanitize(facts or {})
    san = clean.get("san") if isinstance(clean, dict) else None
    result = clean.get("result") if isinstance(clean, dict) else None
    if isinstance(san, str) and san:
        if event_type in {"blunder", "mistake", "catastrophic_blunder"}:
            return f"{san}. Una forma bastante ornamental de empeorar la posición."
        if event_type in {"brilliant", "tactic", "great_move"}:
            return f"{san}. Eso sí merecía tocar una pieza."
        return f"{san}. Queda registrado."
    if isinstance(result, str) and result:
        return f"Resultado: {result}. El tablero ya ha presentado su informe."
    if event_type == "player_portrait":
        overall = clean.get("overall", {}) if isinstance(clean, dict) else {}
        losses = overall.get("losses", 0) if isinstance(overall, dict) else 0
        draws = overall.get("draws", 0) if isinstance(overall, dict) else 0
        if isinstance(losses, (int, float)) and losses > 0:
            return "Objetivo para la próxima partida: antes de cada jugada rival, revisa jaques, capturas y amenazas; anota la primera ocasión en que esa pausa evita perder material."
        if isinstance(draws, (int, float)) and draws > 0:
            return "Objetivo para la próxima partida: cuando tengas ventaja, simplifica una sola vez cambiando piezas y conserva los peones; comprueba después si el final fue más fácil de convertir."
        return "Objetivo para la próxima partida: antes de mover, identifica la amenaza rival y compara dos jugadas candidatas; elige sólo después de esa comprobación."
    if event_type == "unit_bio":
        # El cliente no muestra ni persiste este fallback: una bio de unidad
        # sólo se considera válida cuando procede realmente de Workers AI.
        return "Expediente pendiente de redacción por el archivo de campaña."
    if event_type in RICH_ANALYSIS_EVENT_TYPES:
        return "Siguiente paso: revisa la posición crítica, compara dos jugadas candidatas y practica una vez el patrón que decidió la partida."
    return "Antes de tu próxima jugada, revisa jaques, capturas y amenazas; esa pausa de diez segundos evita más errores que mover por intuición."


def _grounding_haystack(event_type: str, facts: dict[str, Any]) -> str:
    clean = _sanitize(facts or {})
    return (
        str(event_type or "generic")
        + " "
        + json.dumps(clean, ensure_ascii=False, sort_keys=True, default=str)
    ).lower()


def validate_grounded_output(text: str, event_type: str, facts: dict[str, Any]) -> tuple[bool, str | None]:
    """Reject strong chess claims that are absent from the factual dossier.

    This is intentionally conservative rather than a full semantic verifier:
    the model may be creative, but named pieces/results/tactical facts need a
    corresponding signal in the event type or facts. Rejection falls back to
    the local deterministic writer, so a false positive is harmless.
    """
    candidate = str(text or "").lower()
    haystack = _grounding_haystack(event_type, facts)

    output_terms = {
        "mate": ("mate", "jaque mate", "checkmate"),
        "jaque": ("jaque", "check"),
        "captura": ("captur",),
        "dama": ("dama", "reina"),
        "torre": ("torre",),
        "alfil": ("alfil",),
        "caballo": ("caballo",),
        "peon": ("peón", "peon"),
        "promocion": ("promoc",),
        "enroque": ("enroque",),
        "ahogado": ("ahog",),
        "apertura": ("apertura",),
        "rating": (" elo", "rating"),
        "racha": ("racha",),
        "victoria": ("victoria",),
        "derrota": ("derrota",),
        "tablas": ("tablas",),
    }

    for concept, terms in output_terms.items():
        if not any(term in candidate for term in terms):
            continue
        grounding_terms = _GROUNDED_CONCEPTS[concept]
        if not any(term in haystack for term in grounding_terms):
            return False, concept
    return True, None


_PORTRAIT_FORBIDDEN_PATTERNS = (
    r"\bsaludos?\b",
    r"\bestimad[oa]s?\b",
    r"\batentamente\b",
    r"\bcordialmente\b",
    r"\bquedo a la espera\b",
    r"\ba sus pies\b",
    r"\ba tus pies\b",
    r"\bverá usted\b",
    r"\busted(?:es)?\b",
    r"\bby the way\b",
    r"\bcomo ia\b",
    r"\bla ia dice\b",
)

_PORTRAIT_ACTION_TERMS = (
    "entrena", "entrenar", "practica", "practicar", "revisa", "revisar",
    "trabaja", "trabajar", "céntrate", "centrate", "centrarte",
    "prioriza", "priorizar", "evita", "evitar", "comprueba", "comprobar",
    "vigila", "vigilar", "busca", "buscar", "intenta", "intentar",
    "mejora", "mejorar", "corrige", "corregir", "refuerza", "reforzar",
    "dedica", "dedicar", "repasa", "repasar", "fíjate", "fijate",
    "deberías", "deberias", "te conviene", "procura", "mantén", "manten", "haz",
    "en las próximas", "en las proximas", "próximas partidas",
    "proximas partidas", "la próxima partida", "la proxima partida", "antes de",
)


def _sentence_parts(text: str) -> list[str]:
    clean = " ".join(str(text or "").split()).strip()
    if not clean:
        return []
    # El contrato del retrato prohíbe listas/encabezados y exige tres frases.
    # Separar por terminadores es suficiente porque además evitamos tratamientos
    # formales/abreviaturas que suelen falsear este conteo.
    return [part.strip() for part in re.split(r"(?<=[.!?…])\s+", clean) if part.strip()]


def _numeric_facts(facts: dict[str, Any]) -> set[str]:
    values: set[str] = set()

    def walk(value: Any, depth: int = 0) -> None:
        if depth > MAX_FACT_DEPTH:
            return
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            number = float(value)
            values.add(str(int(number)) if number.is_integer() else str(number).rstrip("0").rstrip("."))
            return
        if isinstance(value, dict):
            for item in value.values():
                walk(item, depth + 1)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item, depth + 1)

    walk(_sanitize(facts or {}))
    return values


def _opening_names(facts: dict[str, Any]) -> list[str]:
    clean = _sanitize(facts or {})
    if not isinstance(clean, dict):
        return []
    names: list[str] = []
    favorite = clean.get("favorite_opening")
    if isinstance(favorite, dict) and isinstance(favorite.get("name"), str):
        names.append(favorite["name"].strip())
    openings = clean.get("openings")
    if isinstance(openings, list):
        for row in openings:
            if isinstance(row, dict) and isinstance(row.get("name"), str):
                names.append(row["name"].strip())
    return [name for name in names if name]


def validate_player_portrait_contract(text: str, facts: dict[str, Any]) -> tuple[bool, str | None]:
    """Fail closed when a model drifts away from the compact grounded portrait.

    Prompting is advisory; this validator is the enforcement boundary. A false
    positive is safe because Chess Studio already has a deterministic local
    portrait and manual cooldown is committed only after a cloud success.
    """
    clean = " ".join(str(text or "").split()).strip()
    lowered = clean.lower()
    if len(clean) < 70:
        return False, "too_short"
    if len(clean) > PLAYER_PORTRAIT_MAX_OUTPUT_CHARS:
        return False, "too_long"
    if clean.startswith(("-", "*", "#")) or "```" in clean or lowered.startswith(("cpu:", "narrador:")):
        return False, "format"
    for pattern in _PORTRAIT_FORBIDDEN_PATTERNS:
        if re.search(pattern, lowered, flags=re.IGNORECASE):
            return False, "formal_or_meta"

    sentences = _sentence_parts(clean)
    if len(sentences) != 3:
        return False, "sentence_count"

    # Al menos una ancla verificable debe sobrevivir al texto: una cifra real
    # del dossier o el nombre literal de una apertura medida. Esto evita que una
    # carta teatral genérica pase sólo por sonar ajedrecística.
    numbers = _numeric_facts(facts)
    number_tokens = set(re.findall(r"(?<![\w])\d+(?:[.,]\d+)?", clean))
    normalized_output_numbers: set[str] = set()
    for token in number_tokens:
        try:
            number = float(token.replace(",", "."))
        except ValueError:
            continue
        normalized_output_numbers.add(str(int(number)) if number.is_integer() else str(number).rstrip("0").rstrip("."))
    has_number_anchor = any(number in normalized_output_numbers for number in numbers)
    has_opening_anchor = any(name.lower() in lowered for name in _opening_names(facts))
    if not (has_number_anchor or has_opening_anchor):
        return False, "missing_evidence_anchor"

    if not any(term in sentences[-1].lower() for term in _PORTRAIT_ACTION_TERMS):
        return False, "missing_action"
    return True, None


@dataclass(frozen=True)
class ProviderOutcome:
    text: str | None
    reason: str
    latency_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    model: str | None = None
    worker_error: str | None = None


_TELEMETRY_LOCK = threading.Lock()
_TELEMETRY: deque[dict[str, Any]] = deque(maxlen=MAX_TELEMETRY_EVENTS)

_CIRCUIT_LOCK = threading.Lock()
_CIRCUIT_CHANNELS = ("comments", "player_portrait", "analysis")
_CIRCUIT_STATE: dict[str, dict[str, Any]] = {
    channel: {
        "consecutive_failures": 0,
        "opened_until": 0.0,
        "open_count": 0,
        "half_open": False,
    }
    for channel in _CIRCUIT_CHANNELS
}


def _circuit_channel(event_type: str) -> str:
    if event_type == "player_portrait":
        return "player_portrait"
    if event_type in RICH_ANALYSIS_EVENT_TYPES:
        return "analysis"
    return "comments"


def reset_ai_circuit_breaker() -> None:
    with _CIRCUIT_LOCK:
        for channel in _CIRCUIT_CHANNELS:
            _CIRCUIT_STATE[channel] = {
                "consecutive_failures": 0,
                "opened_until": 0.0,
                "open_count": 0,
                "half_open": False,
            }


def _circuit_snapshot() -> dict[str, Any]:
    now = time.monotonic()
    with _CIRCUIT_LOCK:
        channels: dict[str, dict[str, Any]] = {}
        for channel in _CIRCUIT_CHANNELS:
            state = _CIRCUIT_STATE[channel]
            remaining = max(0.0, float(state["opened_until"]) - now)
            channels[channel] = {
                "open": remaining > 0,
                "seconds_remaining": round(remaining, 1),
                "consecutive_failures": int(state["consecutive_failures"]),
                "open_count": int(state["open_count"]),
                "half_open": bool(state["half_open"]),
                "failure_threshold": _circuit_failure_threshold_for(channel),
                "reset_seconds": _circuit_reset_seconds_for(channel),
            }
        return {
            "open": any(row["open"] for row in channels.values()),
            "seconds_remaining": max((row["seconds_remaining"] for row in channels.values()), default=0.0),
            "consecutive_failures": max((row["consecutive_failures"] for row in channels.values()), default=0),
            "open_count": sum(row["open_count"] for row in channels.values()),
            "half_open": any(row["half_open"] for row in channels.values()),
            "failure_threshold": _circuit_failure_threshold(),
            "reset_seconds": _circuit_reset_seconds(),
            "channels": channels,
        }


def _circuit_before_request(channel: str) -> tuple[bool, str | None]:
    now = time.monotonic()
    with _CIRCUIT_LOCK:
        state = _CIRCUIT_STATE[channel]
        if float(state["opened_until"]) > now:
            return False, "circuit_open"
        if bool(state["half_open"]):
            return False, "circuit_half_open"
        if float(state["opened_until"]):
            # Permit exactly one recovery probe after the reset window.
            state["opened_until"] = 0.0
            state["half_open"] = True
    return True, None


def _circuit_success(channel: str) -> None:
    with _CIRCUIT_LOCK:
        state = _CIRCUIT_STATE[channel]
        state["consecutive_failures"] = 0
        state["opened_until"] = 0.0
        state["half_open"] = False


def _circuit_failure(channel: str) -> None:
    with _CIRCUIT_LOCK:
        state = _CIRCUIT_STATE[channel]
        if bool(state["half_open"]):
            # A failed recovery probe re-opens immediately; do not hammer the
            # provider with another full threshold of requests.
            state["consecutive_failures"] = _circuit_failure_threshold_for(channel)
            state["opened_until"] = time.monotonic() + _circuit_reset_seconds_for(channel)
            state["open_count"] = int(state["open_count"]) + 1
            state["half_open"] = False
            return

        state["consecutive_failures"] = int(state["consecutive_failures"]) + 1
        if int(state["consecutive_failures"]) >= _circuit_failure_threshold_for(channel):
            state["opened_until"] = time.monotonic() + _circuit_reset_seconds_for(channel)
            state["open_count"] = int(state["open_count"]) + 1


def _provider_failure(
    reason: str,
    latency_ms: float,
    *,
    channel: str,
    worker_error: str | None = None,
) -> ProviderOutcome:
    _circuit_failure(channel)
    return ProviderOutcome(None, reason, latency_ms, worker_error=worker_error)


def _record(
    provider: str,
    event_type: str,
    latency_ms: float,
    reason: str,
    text: str,
    *,
    request_kind: str = "default",
    input_tokens: int = 0,
    output_tokens: int = 0,
    model: str | None = None,
    worker_error: str | None = None,
) -> None:
    event = {
        "at": int(time.time()),
        "provider": provider,
        "event_type": str(event_type or "generic")[:48],
        "request_kind": str(request_kind or "default")[:32],
        "channel": _circuit_channel(event_type),
        "latency_ms": max(0.0, round(float(latency_ms), 2)),
        "reason": str(reason or "unknown")[:64],
        "chars": len(text or ""),
        "input_tokens": max(0, int(input_tokens or 0)),
        "output_tokens": max(0, int(output_tokens or 0)),
        "model": str(model or "")[:96] or None,
        "worker_error": str(worker_error or "")[:80] or None,
    }
    with _TELEMETRY_LOCK:
        _TELEMETRY.append(event)
    # Import local para que la narrativa siga siendo utilizable y testeable de
    # forma aislada. El histórico persiste sólo agregados técnicos, nunca texto
    # ni dossier/HECHOS.
    try:
        from observability_history import record_ai_event

        record_ai_event(event)
    except Exception:
        # Observabilidad jamás debe romper una partida ni una respuesta AI.
        pass
    try:
        from grafana_telemetry import record_ai_request

        record_ai_request(provider, event["channel"], float(event["latency_ms"]) / 1000)
    except Exception:
        pass


def reset_ai_metrics() -> None:
    with _TELEMETRY_LOCK:
        _TELEMETRY.clear()


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, math.ceil(percentile * len(ordered)) - 1)
    return round(float(ordered[idx]), 2)


def get_ai_dependency_health() -> dict[str, Any]:
    enabled = ai_narrative_enabled()
    configured = bool(_env("CF_AI_WORKER_URL") and _env("CHESS_AI_SHARED_SECRET"))
    circuit = _circuit_snapshot()
    if not enabled:
        status = "disabled"
    elif not configured:
        status = "unconfigured"
    elif circuit.get("open"):
        status = "degraded"
    else:
        status = "ok"
    return {
        "status": status,
        "enabled": enabled,
        "configured": configured,
        "circuitOpen": bool(circuit.get("open")),
        "channels": {
            name: {
                "open": bool(row.get("open")),
                "secondsRemaining": row.get("seconds_remaining"),
                "failures": row.get("consecutive_failures", 0),
            }
            for name, row in (circuit.get("channels") or {}).items()
        },
    }


def get_ai_metrics() -> dict[str, Any]:
    with _TELEMETRY_LOCK:
        events = list(_TELEMETRY)
    total = len(events)
    providers = Counter(e["provider"] for e in events)
    reasons = Counter(e["reason"] for e in events)
    event_types = Counter(e["event_type"] for e in events)
    request_kinds = Counter(e.get("request_kind") or "default" for e in events)
    worker_errors = Counter(e.get("worker_error") for e in events if e.get("worker_error"))
    cloud_latencies = [e["latency_ms"] for e in events if e["provider"] == "cloudflare"]
    cloud = providers.get("cloudflare", 0)
    local = providers.get("local", 0)
    input_tokens = sum(int(e.get("input_tokens") or 0) for e in events if e["provider"] == "cloudflare")
    output_tokens = sum(int(e.get("output_tokens") or 0) for e in events if e["provider"] == "cloudflare")
    # Qwen3 30B-A3B es el primary de todos los canales (Aug 2026).
    # Son estimaciones de la ventana en memoria, no la fuente de billing.
    estimated_neurons = (input_tokens * 4625 + output_tokens * 30475) / 1_000_000
    estimated_cost_usd = (input_tokens * 0.051 + output_tokens * 0.34) / 1_000_000
    models = Counter(e.get("model") for e in events if e.get("model"))
    channels: dict[str, dict[str, Any]] = {}
    for channel in _CIRCUIT_CHANNELS:
        rows = [e for e in events if (e.get("channel") or _circuit_channel(e.get("event_type") or "generic")) == channel]
        row_total = len(rows)
        row_cloud = sum(1 for e in rows if e.get("provider") == "cloudflare")
        row_local = sum(1 for e in rows if e.get("provider") == "local")
        row_latencies = [float(e.get("latency_ms") or 0.0) for e in rows if e.get("provider") == "cloudflare"]
        channels[channel] = {
            "samples": row_total,
            "cloudflare_percent": round(row_cloud * 100 / row_total, 1) if row_total else None,
            "fallback_percent": round(row_local * 100 / row_total, 1) if row_total else None,
            "p50_ms": _percentile(row_latencies, 0.50),
            "p95_ms": _percentile(row_latencies, 0.95),
            "p99_ms": _percentile(row_latencies, 0.99),
        }
    return {
        "window": MAX_TELEMETRY_EVENTS,
        "samples": total,
        "cloudflare": cloud,
        "local_fallback": local,
        "cloudflare_percent": round(cloud * 100 / total, 1) if total else None,
        "fallback_percent": round(local * 100 / total, 1) if total else None,
        "cloudflare_p50_ms": _percentile(cloud_latencies, 0.50),
        "cloudflare_p95_ms": _percentile(cloud_latencies, 0.95),
        "cloudflare_p99_ms": _percentile(cloud_latencies, 0.99),
        "reasons": dict(reasons.most_common(8)),
        "event_types": dict(event_types.most_common(12)),
        "request_kinds": dict(request_kinds.most_common(8)),
        "worker_errors": dict(worker_errors.most_common(8)),
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_neurons": round(estimated_neurons, 3),
            "estimated_cost_usd": round(estimated_cost_usd, 6),
            "pricing_note": "Estimación de la ventana reciente; Cloudflare billing es la fuente de verdad.",
        },
        "models": dict(models.most_common(4)),
        "channels": channels,
        "last_event_at": events[-1]["at"] if events else None,
        "enabled": ai_narrative_enabled(),
        "circuit": _circuit_snapshot(),
    }


async def request_cloud_narrative(
    event_type: str,
    facts: dict[str, Any],
    *,
    tone: str = "friendly_sarcastic",
    locale: str = "es-ES",
    request_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> ProviderOutcome:
    channel = _circuit_channel(event_type)
    if not ai_narrative_enabled():
        return ProviderOutcome(None, "disabled", 0.0)

    adaptive_mode = adaptive_ai_mode(channel)
    if adaptive_mode != "normal":
        # Load pressure is not a provider failure: do not poison the circuit.
        return ProviderOutcome(None, f"adaptive_{adaptive_mode}", 0.0)

    allowed, blocked_reason = _circuit_before_request(channel)
    if not allowed:
        return ProviderOutcome(None, blocked_reason or "circuit_open", 0.0)

    worker_url = _env("CF_AI_WORKER_URL").rstrip("/")
    secret = _env("CHESS_AI_SHARED_SECRET")
    if not worker_url or not secret:
        return ProviderOutcome(None, "not_configured", 0.0)

    payload = build_payload(event_type, facts, tone=tone, locale=locale, request_id=request_id)
    body = canonical_json(payload)
    timestamp = str(int(time.time()))
    headers = {
        "content-type": "application/json",
        "accept": "application/json",
        "x-chess-ai-timestamp": timestamp,
        "x-chess-ai-signature": sign_request(secret, timestamp, body),
    }

    bulkhead = await try_enter_ai_bulkhead(channel)
    if bulkhead is None:
        # Saturation of one AI class must not consume capacity from the others.
        return ProviderOutcome(None, "bulkhead_full", 0.0)

    timeout_s = _timeout_seconds(channel)
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_s, connect=min(2.0, timeout_s)))

    started = time.perf_counter()
    try:
        response = await asyncio.wait_for(
            client.post(f"{worker_url}/narrative", content=body, headers=headers),
            timeout=timeout_s,
        )
        elapsed = (time.perf_counter() - started) * 1000
        if response.status_code != 200:
            worker_error = None
            try:
                error_payload = response.json()
                if isinstance(error_payload, dict) and error_payload.get("error"):
                    parts = [str(error_payload.get("error"))[:48]]
                    error_name = str(error_payload.get("error_name") or "")[:32]
                    error_code = str(error_payload.get("error_code") or "")[:32]
                    if error_name:
                        parts.append(error_name)
                    if error_code:
                        parts.append(error_code)
                    worker_error = ":".join(parts)[:80]
            except (ValueError, TypeError):
                worker_error = None
            return _provider_failure(
                f"http_{response.status_code}",
                elapsed,
                channel=channel,
                worker_error=worker_error,
            )
        data = response.json()
        text = data.get("text") if isinstance(data, dict) else None
        if not isinstance(text, str):
            return _provider_failure("invalid_payload", elapsed, channel=channel)
        usage = data.get("usage") if isinstance(data, dict) and isinstance(data.get("usage"), dict) else {}
        input_tokens = max(0, int(usage.get("inputTokens") or usage.get("prompt_tokens") or 0))
        output_tokens = max(0, int(usage.get("outputTokens") or usage.get("completion_tokens") or 0))
        model = str(data.get("model") or "")[:96] if isinstance(data, dict) else ""
        text = _trim_complete_output(text, _max_output_chars(event_type))
        if not text:
            return _provider_failure("empty_response", elapsed, channel=channel)
        if event_type == "player_portrait":
            valid_portrait, portrait_reason = validate_player_portrait_contract(text, facts)
            if not valid_portrait:
                return _provider_failure(
                    f"portrait_contract_rejected:{portrait_reason or 'unknown'}",
                    elapsed,
                    channel=channel,
                )
        grounded, concept = validate_grounded_output(text, event_type, facts)
        if not grounded:
            return _provider_failure(f"ungrounded_{concept}", elapsed, channel=channel)
        _circuit_success(channel)
        return ProviderOutcome(text, "ok", elapsed, input_tokens, output_tokens, model or None)
    except (httpx.TimeoutException, asyncio.TimeoutError):
        return _provider_failure("timeout", (time.perf_counter() - started) * 1000, channel=channel)
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        return _provider_failure(
            "transport_error",
            (time.perf_counter() - started) * 1000,
            channel=channel,
            worker_error=type(exc).__name__,
        )
    finally:
        if owns_client:
            await client.aclose()
        leave_ai_bulkhead(bulkhead)


async def generate_narrative(
    event_type: str,
    facts: dict[str, Any],
    *,
    tone: str = "friendly_sarcastic",
    locale: str = "es-ES",
    request_kind: str = "default",
    request_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    outcome = await request_cloud_narrative(
        event_type, facts, tone=tone, locale=locale, request_id=request_id, client=client
    )
    if outcome.text:
        _record(
            "cloudflare", event_type, outcome.latency_ms, outcome.reason, outcome.text,
            request_kind=request_kind, input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens, model=outcome.model,
        )
        ai_logger.info(
            "workers_ai_ok request_id=%s event_type=%s request_kind=%s channel=%s model=%s latency_ms=%.1f input_tokens=%s output_tokens=%s",
            request_id or "-",
            str(event_type or "generic")[:48],
            str(request_kind or "default")[:32],
            _circuit_channel(event_type),
            outcome.model or "-",
            outcome.latency_ms,
            outcome.input_tokens,
            outcome.output_tokens,
        )
        return {
            "text": outcome.text,
            "provider": "cloudflare",
            "latencyMs": round(outcome.latency_ms, 1),
            "model": outcome.model,
        }

    text = _fallback(event_type, facts)
    _record(
        "local",
        event_type,
        outcome.latency_ms,
        outcome.reason,
        text,
        request_kind=request_kind,
        worker_error=outcome.worker_error,
    )
    circuit = _circuit_snapshot()
    ai_logger.warning(
        "workers_ai_fallback request_id=%s event_type=%s request_kind=%s channel=%s reason=%s worker_error=%s latency_ms=%.1f circuit_open=%s failures=%s",
        request_id or "-",
        str(event_type or "generic")[:48],
        str(request_kind or "default")[:32],
        _circuit_channel(event_type),
        outcome.reason,
        outcome.worker_error or "-",
        outcome.latency_ms,
        circuit.get("open", False),
        circuit.get("channels", {}).get(_circuit_channel(event_type), {}).get("consecutive_failures", 0),
    )
    return {"text": text, "provider": "local", "latencyMs": round(outcome.latency_ms, 1)}
