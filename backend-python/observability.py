"""Observabilidad agregada y de baja cardinalidad para Chess Studio.

No guarda usernames, bodies, FEN, query strings ni cabeceras. Es una ventana
in-memory que se reinicia al reiniciar el proceso; sirve para diagnóstico del
operador, no como sistema de billing ni histórico permanente.
"""
from __future__ import annotations

import asyncio
import math
import re
import threading
import time
from collections import Counter, defaultdict, deque
from typing import Any


PROCESS_STARTED_AT = time.time()

_CLIENT_RELEASE_RE = re.compile(r"^v?[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")


def sanitize_client_release(value: Any) -> str | None:
    raw = str(value or "").strip()[:40]
    return raw if raw and _CLIENT_RELEASE_RE.fullmatch(raw) else None


MAX_HTTP_EVENTS = 5000
HTTP_WINDOW_SECONDS = 60 * 60
_HTTP_LOCK = threading.Lock()
_HTTP_EVENTS: deque[dict[str, Any]] = deque(maxlen=MAX_HTTP_EVENTS)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(percentile * len(ordered)) - 1)
    return round(float(ordered[index]), 2)


def record_http_request(method: str, route: str, status_code: int, latency_ms: float, *, client_release: str | None = None) -> None:
    """Registra sólo metadatos técnicos agregables y de cardinalidad acotada."""
    clean_route = str(route or "unknown")[:120]
    clean_method = str(method or "?").upper()[:8]
    release = sanitize_client_release(client_release)
    with _HTTP_LOCK:
        _HTTP_EVENTS.append({
            "at": time.time(),
            "method": clean_method,
            "route": clean_route,
            "status": int(status_code or 0),
            "latency_ms": max(0.0, round(float(latency_ms or 0.0), 2)),
            "client_release": release,
        })
    try:
        from observability_history import record_http_event

        record_http_event(clean_method, clean_route, status_code, latency_ms, client_release=release)
    except Exception:
        # El histórico es auxiliar; nunca debe romper una request productiva.
        pass


def reset_http_metrics() -> None:
    with _HTTP_LOCK:
        _HTTP_EVENTS.clear()


def _window_events(seconds: int) -> list[dict[str, Any]]:
    cutoff = time.time() - max(1, int(seconds))
    with _HTTP_LOCK:
        return [event.copy() for event in _HTTP_EVENTS if event["at"] >= cutoff]


def _summarize_http(events: list[dict[str, Any]], window_seconds: int) -> dict[str, Any]:
    latencies = [float(row["latency_ms"]) for row in events]
    statuses = Counter(int(row["status"]) // 100 for row in events if int(row["status"]) > 0)
    route_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in events:
        route_rows[f"{row['method']} {row['route']}"].append(row)

    top_routes = []
    for route, rows in sorted(route_rows.items(), key=lambda item: len(item[1]), reverse=True)[:8]:
        route_latencies = [float(row["latency_ms"]) for row in rows]
        errors = sum(1 for row in rows if int(row["status"]) >= 500)
        top_routes.append({
            "route": route,
            "requests": len(rows),
            "p95_ms": _percentile(route_latencies, 0.95),
            "errors_5xx": errors,
        })

    release_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in events:
        release = sanitize_client_release(row.get("client_release"))
        if release:
            release_rows[release].append(row)
    releases = []
    for release, rows in sorted(release_rows.items(), key=lambda item: len(item[1]), reverse=True)[:8]:
        release_latencies = [float(row["latency_ms"]) for row in rows]
        errors = sum(1 for row in rows if int(row["status"]) >= 500)
        releases.append({
            "release": release,
            "requests": len(rows),
            "errors_5xx": errors,
            "error_5xx_percent": round(errors * 100 / len(rows), 2) if rows else 0.0,
            "p95_ms": _percentile(release_latencies, 0.95),
        })

    total = len(events)
    errors_5xx = statuses.get(5, 0)
    effective_seconds = max(1.0, min(float(window_seconds), time.time() - PROCESS_STARTED_AT))
    return {
        "window_seconds": int(window_seconds),
        "coverage_seconds": round(effective_seconds, 1),
        "samples": total,
        "requests_per_minute": round(total / max(1 / 60, effective_seconds / 60), 2),
        "status_2xx": statuses.get(2, 0),
        "status_4xx": statuses.get(4, 0),
        "status_5xx": errors_5xx,
        "error_5xx_percent": round(errors_5xx * 100 / total, 2) if total else 0.0,
        "p50_ms": _percentile(latencies, 0.50),
        "p95_ms": _percentile(latencies, 0.95),
        "p99_ms": _percentile(latencies, 0.99),
        "top_routes": top_routes,
        "releases": releases,
    }


def get_http_metrics() -> dict[str, Any]:
    return {
        "uptime_seconds": max(0, int(time.time() - PROCESS_STARTED_AT)),
        "last_15m": _summarize_http(_window_events(15 * 60), 15 * 60),
        "last_1h": _summarize_http(_window_events(HTTP_WINDOW_SECONDS), HTTP_WINDOW_SECONDS),
        "capacity": MAX_HTTP_EVENTS,
        "scope": "in_memory_since_process_start",
    }


async def get_database_metrics() -> dict[str, Any]:
    """Comprueba Mongo sólo cuando Admin abre Observabilidad.

    En desarrollo sin MONGO_URL, el modo memoria es un estado válido, no un
    error. En producción con MONGO_URL, no poder resolver/pingar la DB es
    degradado/down y nunca se maquilla como perfil vacío.
    """
    # Import perezoso: las métricas HTTP siguen siendo testeables/utilizables
    # aunque el entorno no tenga el driver Mongo instalado.
    from db import get_db, persistent_storage_required

    started = time.perf_counter()
    required = persistent_storage_required()
    try:
        database = await asyncio.wait_for(get_db(), timeout=3.5)
        if database is None:
            return {
                "status": "down" if required else "memory",
                "mode": "mongo" if required else "memory",
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            }
        await asyncio.wait_for(database.command("ping"), timeout=1.5)
        return {
            "status": "ok",
            "mode": "mongo",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "status": "down" if required else "memory",
            "mode": "mongo" if required else "memory",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": type(exc).__name__[:80],
        }
