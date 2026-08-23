"""Cloudflare Workers AI narrative provider + bounded telemetry.

The chess engine remains the factual authority. Provider failure is always
non-fatal and falls back to a local line that uses only supplied facts.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_TIMEOUT_SECONDS = 12.0
DEFAULT_MAX_OUTPUT_CHARS = 420
PLAYER_PORTRAIT_MAX_OUTPUT_CHARS = 900
MAX_FACT_DEPTH = 3
MAX_FACT_STRING = 240
MAX_FACT_ARRAY = 12
MAX_FACT_KEYS = 30
MAX_TELEMETRY_EVENTS = 500
DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 5
DEFAULT_CIRCUIT_RESET_SECONDS = 90.0

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


def build_payload(event_type: str, facts: dict[str, Any], *, tone: str = "friendly_sarcastic", locale: str = "es-ES") -> dict[str, Any]:
    return {
        "event_type": str(event_type or "generic")[:48],
        "facts": _sanitize(facts or {}),
        "tone": str(tone or "sarcastic")[:32],
        "locale": str(locale or "es-ES")[:16],
    }


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")


def sign_request(secret: str, timestamp: str, body: bytes) -> str:
    message = timestamp.encode("ascii") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _timeout_seconds() -> float:
    raw = _env("CF_AI_TIMEOUT_SECONDS")
    if not raw:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        return max(1.0, min(float(raw), 20.0))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _max_output_chars(event_type: str) -> int:
    return PLAYER_PORTRAIT_MAX_OUTPUT_CHARS if event_type == "player_portrait" else DEFAULT_MAX_OUTPUT_CHARS


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
    return "El tablero ha hablado. Yo, por una vez, no voy a inventarle detalles."


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


@dataclass(frozen=True)
class ProviderOutcome:
    text: str | None
    reason: str
    latency_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    model: str | None = None


_TELEMETRY_LOCK = threading.Lock()
_TELEMETRY: deque[dict[str, Any]] = deque(maxlen=MAX_TELEMETRY_EVENTS)

_CIRCUIT_LOCK = threading.Lock()
_CIRCUIT_CONSECUTIVE_FAILURES = 0
_CIRCUIT_OPENED_UNTIL = 0.0
_CIRCUIT_OPEN_COUNT = 0
_CIRCUIT_HALF_OPEN = False


def reset_ai_circuit_breaker() -> None:
    global _CIRCUIT_CONSECUTIVE_FAILURES, _CIRCUIT_OPENED_UNTIL, _CIRCUIT_OPEN_COUNT, _CIRCUIT_HALF_OPEN
    with _CIRCUIT_LOCK:
        _CIRCUIT_CONSECUTIVE_FAILURES = 0
        _CIRCUIT_OPENED_UNTIL = 0.0
        _CIRCUIT_OPEN_COUNT = 0
        _CIRCUIT_HALF_OPEN = False


def _circuit_snapshot() -> dict[str, Any]:
    now = time.monotonic()
    with _CIRCUIT_LOCK:
        remaining = max(0.0, _CIRCUIT_OPENED_UNTIL - now)
        return {
            "open": remaining > 0,
            "seconds_remaining": round(remaining, 1),
            "consecutive_failures": _CIRCUIT_CONSECUTIVE_FAILURES,
            "open_count": _CIRCUIT_OPEN_COUNT,
            "half_open": _CIRCUIT_HALF_OPEN,
            "failure_threshold": _circuit_failure_threshold(),
            "reset_seconds": _circuit_reset_seconds(),
        }


def _circuit_before_request() -> tuple[bool, str | None]:
    global _CIRCUIT_OPENED_UNTIL, _CIRCUIT_HALF_OPEN
    now = time.monotonic()
    with _CIRCUIT_LOCK:
        if _CIRCUIT_OPENED_UNTIL > now:
            return False, "circuit_open"
        if _CIRCUIT_HALF_OPEN:
            return False, "circuit_half_open"
        if _CIRCUIT_OPENED_UNTIL:
            # Permit exactly one recovery probe after the reset window.
            _CIRCUIT_OPENED_UNTIL = 0.0
            _CIRCUIT_HALF_OPEN = True
    return True, None


def _circuit_success() -> None:
    global _CIRCUIT_CONSECUTIVE_FAILURES, _CIRCUIT_OPENED_UNTIL, _CIRCUIT_HALF_OPEN
    with _CIRCUIT_LOCK:
        _CIRCUIT_CONSECUTIVE_FAILURES = 0
        _CIRCUIT_OPENED_UNTIL = 0.0
        _CIRCUIT_HALF_OPEN = False


def _circuit_failure() -> None:
    global _CIRCUIT_CONSECUTIVE_FAILURES, _CIRCUIT_OPENED_UNTIL, _CIRCUIT_OPEN_COUNT, _CIRCUIT_HALF_OPEN
    with _CIRCUIT_LOCK:
        if _CIRCUIT_HALF_OPEN:
            # A failed recovery probe re-opens immediately; do not hammer the
            # provider with another full threshold of requests.
            _CIRCUIT_CONSECUTIVE_FAILURES = _circuit_failure_threshold()
            _CIRCUIT_OPENED_UNTIL = time.monotonic() + _circuit_reset_seconds()
            _CIRCUIT_OPEN_COUNT += 1
            _CIRCUIT_HALF_OPEN = False
            return

        _CIRCUIT_CONSECUTIVE_FAILURES += 1
        if _CIRCUIT_CONSECUTIVE_FAILURES >= _circuit_failure_threshold():
            _CIRCUIT_OPENED_UNTIL = time.monotonic() + _circuit_reset_seconds()
            _CIRCUIT_OPEN_COUNT += 1


def _provider_failure(reason: str, latency_ms: float) -> ProviderOutcome:
    _circuit_failure()
    return ProviderOutcome(None, reason, latency_ms)


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
) -> None:
    with _TELEMETRY_LOCK:
        _TELEMETRY.append({
            "at": int(time.time()),
            "provider": provider,
            "event_type": str(event_type or "generic")[:48],
            "request_kind": str(request_kind or "default")[:32],
            "latency_ms": max(0.0, round(float(latency_ms), 2)),
            "reason": str(reason or "unknown")[:64],
            "chars": len(text or ""),
            "input_tokens": max(0, int(input_tokens or 0)),
            "output_tokens": max(0, int(output_tokens or 0)),
            "model": str(model or "")[:96] or None,
        })


def reset_ai_metrics() -> None:
    with _TELEMETRY_LOCK:
        _TELEMETRY.clear()


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, math.ceil(percentile * len(ordered)) - 1)
    return round(float(ordered[idx]), 2)


def get_ai_metrics() -> dict[str, Any]:
    with _TELEMETRY_LOCK:
        events = list(_TELEMETRY)
    total = len(events)
    providers = Counter(e["provider"] for e in events)
    reasons = Counter(e["reason"] for e in events)
    event_types = Counter(e["event_type"] for e in events)
    request_kinds = Counter(e.get("request_kind") or "default" for e in events)
    cloud_latencies = [e["latency_ms"] for e in events if e["provider"] == "cloudflare"]
    cloud = providers.get("cloudflare", 0)
    local = providers.get("local", 0)
    input_tokens = sum(int(e.get("input_tokens") or 0) for e in events if e["provider"] == "cloudflare")
    output_tokens = sum(int(e.get("output_tokens") or 0) for e in events if e["provider"] == "cloudflare")
    # Pricing published by Cloudflare for @cf/meta/llama-3.2-3b-instruct
    # (Aug 2026). These are estimates for the bounded in-process telemetry
    # window, not a billing source of truth.
    estimated_neurons = (input_tokens * 4625 + output_tokens * 30475) / 1_000_000
    estimated_cost_usd = (input_tokens * 0.051 + output_tokens * 0.335) / 1_000_000
    models = Counter(e.get("model") for e in events if e.get("model"))
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
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_neurons": round(estimated_neurons, 3),
            "estimated_cost_usd": round(estimated_cost_usd, 6),
            "pricing_note": "Estimación de la ventana reciente; Cloudflare billing es la fuente de verdad.",
        },
        "models": dict(models.most_common(4)),
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
    client: httpx.AsyncClient | None = None,
) -> ProviderOutcome:
    if not ai_narrative_enabled():
        return ProviderOutcome(None, "disabled", 0.0)

    allowed, blocked_reason = _circuit_before_request()
    if not allowed:
        return ProviderOutcome(None, blocked_reason or "circuit_open", 0.0)

    worker_url = _env("CF_AI_WORKER_URL").rstrip("/")
    secret = _env("CHESS_AI_SHARED_SECRET")
    if not worker_url or not secret:
        return ProviderOutcome(None, "not_configured", 0.0)

    payload = build_payload(event_type, facts, tone=tone, locale=locale)
    body = canonical_json(payload)
    timestamp = str(int(time.time()))
    headers = {
        "content-type": "application/json",
        "accept": "application/json",
        "x-chess-ai-timestamp": timestamp,
        "x-chess-ai-signature": sign_request(secret, timestamp, body),
    }

    owns_client = client is None
    if client is None:
        timeout_s = _timeout_seconds()
        client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_s, connect=min(3.0, timeout_s)))

    started = time.perf_counter()
    try:
        response = await client.post(f"{worker_url}/narrative", content=body, headers=headers)
        elapsed = (time.perf_counter() - started) * 1000
        if response.status_code != 200:
            return _provider_failure(f"http_{response.status_code}", elapsed)
        data = response.json()
        text = data.get("text") if isinstance(data, dict) else None
        if not isinstance(text, str):
            return _provider_failure("invalid_payload", elapsed)
        usage = data.get("usage") if isinstance(data, dict) and isinstance(data.get("usage"), dict) else {}
        input_tokens = max(0, int(usage.get("inputTokens") or usage.get("prompt_tokens") or 0))
        output_tokens = max(0, int(usage.get("outputTokens") or usage.get("completion_tokens") or 0))
        model = str(data.get("model") or "")[:96] if isinstance(data, dict) else ""
        text = _trim_complete_output(text, _max_output_chars(event_type))
        if not text:
            return _provider_failure("empty_response", elapsed)
        grounded, concept = validate_grounded_output(text, event_type, facts)
        if not grounded:
            return _provider_failure(f"ungrounded_{concept}", elapsed)
        _circuit_success()
        return ProviderOutcome(text, "ok", elapsed, input_tokens, output_tokens, model or None)
    except httpx.TimeoutException:
        return _provider_failure("timeout", (time.perf_counter() - started) * 1000)
    except (httpx.HTTPError, ValueError, TypeError):
        return _provider_failure("transport_error", (time.perf_counter() - started) * 1000)
    finally:
        if owns_client:
            await client.aclose()


async def generate_narrative(
    event_type: str,
    facts: dict[str, Any],
    *,
    tone: str = "friendly_sarcastic",
    locale: str = "es-ES",
    request_kind: str = "default",
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    outcome = await request_cloud_narrative(event_type, facts, tone=tone, locale=locale, client=client)
    if outcome.text:
        _record(
            "cloudflare", event_type, outcome.latency_ms, outcome.reason, outcome.text,
            request_kind=request_kind, input_tokens=outcome.input_tokens,
            output_tokens=outcome.output_tokens, model=outcome.model,
        )
        return {"text": outcome.text, "provider": "cloudflare", "latencyMs": round(outcome.latency_ms, 1)}

    text = _fallback(event_type, facts)
    _record("local", event_type, outcome.latency_ms, outcome.reason, text, request_kind=request_kind)
    return {"text": text, "provider": "local", "latencyMs": round(outcome.latency_ms, 1)}
