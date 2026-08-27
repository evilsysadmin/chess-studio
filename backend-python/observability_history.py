"""Histórico agregado de observabilidad para Chess Studio.

Guarda buckets de 5 minutos de baja cardinalidad. Nunca persiste usernames, IPs,
FEN, bodies, prompts, texto AI ni cabeceras. Las escrituras se acumulan en
memoria y se vacían a Mongo fuera del camino crítico de la request.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import math
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

BUCKET_SECONDS = 5 * 60
DEFAULT_RANGE_SECONDS = 24 * 60 * 60
MAX_RANGE_SECONDS = 90 * 24 * 60 * 60
RETENTION_SECONDS = 100 * 24 * 60 * 60
FLUSH_INTERVAL_SECONDS = 30.0
COLLECTION_NAME = "observability_5min_v2"
LEGACY_COLLECTION_NAME = "observability_hourly_v1"
_LATENCY_BOUNDS_MS = (25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000)
_FRONTEND_MS_BOUNDS = (50, 100, 200, 500, 800, 1000, 1500, 2000, 2500, 4000, 6000, 10000, 20000)
_FRONTEND_CLS_MILLI_BOUNDS = (10, 50, 100, 150, 250, 500, 1000, 2000, 5000)

_PENDING_LOCK = threading.Lock()
_PENDING: dict[int, dict[str, Any]] = {}
_SCHEDULE_LOCK = threading.Lock()
_FLUSH_SCHEDULED = False
_LAST_FLUSH_SCHEDULED_AT = 0.0
_FLUSH_ASYNC_LOCK: asyncio.Lock | None = None
_FLUSH_ASYNC_LOCK_LOOP: asyncio.AbstractEventLoop | None = None
_INDEX_READY = False


def _bucket_start(timestamp: float) -> int:
    value = max(0, int(timestamp))
    return value - (value % BUCKET_SECONDS)


def _safe_key(value: Any) -> str:
    raw = str(value or "unknown")[:160].encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") or "dW5rbm93bg"


def _unsafe_key(value: str) -> str:
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return "unknown"


def _hist_key(latency_ms: float) -> str:
    value = max(0.0, float(latency_ms or 0.0))
    for boundary in _LATENCY_BOUNDS_MS:
        if value <= boundary:
            return f"le_{boundary}"
    return "inf"


def _frontend_scaled_value(metric_name: str, value: float) -> tuple[float, tuple[int, ...]]:
    numeric = max(0.0, float(value or 0.0))
    if str(metric_name or '').upper() == 'CLS':
        return numeric * 1000.0, _FRONTEND_CLS_MILLI_BOUNDS
    return numeric, _FRONTEND_MS_BOUNDS


def _frontend_hist_key(metric_name: str, value: float) -> tuple[str, float]:
    scaled, bounds = _frontend_scaled_value(metric_name, value)
    for boundary in bounds:
        if scaled <= boundary:
            return f"le_{boundary}", scaled
    return "inf", scaled


def _fresh_bucket() -> dict[str, Any]:
    return {
        "http": {
            "samples": 0,
            "status_2xx": 0,
            "status_4xx": 0,
            "status_5xx": 0,
            "latency_hist": {},
            "latency_max_ms": 0.0,
            "routes": {},
            "releases": {},
        },
        "ai": {
            "samples": 0,
            "cloudflare": 0,
            "local": 0,
            "latency_hist": {},
            "latency_max_ms": 0.0,
            "input_tokens": 0,
            "output_tokens": 0,
            "reasons": {},
            "event_types": {},
            "request_kinds": {},
            "models": {},
            "worker_errors": {},
            "channels": {},
        },
        "presence": {"samples": 0, "online_sum": 0, "online_max": 0},
        "frontend": {
            "samples": 0,
            "errors": 0,
            "event_types": {},
            "error_names": {},
            "contexts": {},
            "releases": {},
            "metrics": {},
        },
    }


def _inc(mapping: dict[str, Any], key: str, amount: int | float = 1) -> None:
    mapping[key] = mapping.get(key, 0) + amount


def _restore_missing_schema(target: dict[str, Any], template: dict[str, Any]) -> dict[str, Any]:
    """Hydrate sparse in-memory buckets after a flush without resetting counters.

    `_subtract_delta` deliberately removes zeroed branches. A new sample can arrive
    in that same 5-minute bucket afterwards, so recorders must not assume every
    branch from `_fresh_bucket()` is still present.
    """
    for key, default in template.items():
        if key not in target or not isinstance(target.get(key), type(default)):
            target[key] = copy.deepcopy(default)
        elif isinstance(default, dict):
            _restore_missing_schema(target[key], default)
    return target


def _pending_bucket(bucket_key: int) -> dict[str, Any]:
    bucket = _PENDING.setdefault(bucket_key, _fresh_bucket())
    return _restore_missing_schema(bucket, _fresh_bucket())


def record_http_event(method: str, route: str, status_code: int, latency_ms: float, *, client_release: str | None = None, timestamp: float | None = None) -> None:
    at = time.time() if timestamp is None else float(timestamp)
    bucket_key = _bucket_start(at)
    route_label = f"{str(method or '?').upper()[:8]} {str(route or 'unknown')[:120]}"
    encoded_route = _safe_key(route_label)
    latency = max(0.0, float(latency_ms or 0.0))
    status = int(status_code or 0)

    with _PENDING_LOCK:
        bucket = _pending_bucket(bucket_key)
        http = bucket["http"]
        http["samples"] += 1
        family = status // 100 if status > 0 else 0
        if family in {2, 4, 5}:
            http[f"status_{family}xx"] += 1
        hist_key = _hist_key(latency)
        _inc(http["latency_hist"], hist_key)
        http["latency_max_ms"] = max(float(http.get("latency_max_ms") or 0.0), latency)

        route_defaults = {
            "requests": 0,
            "errors_5xx": 0,
            "latency_hist": {},
            "latency_max_ms": 0.0,
        }
        route_row = _restore_missing_schema(
            http["routes"].setdefault(encoded_route, copy.deepcopy(route_defaults)),
            route_defaults,
        )
        route_row["requests"] += 1
        if family == 5:
            route_row["errors_5xx"] += 1
        _inc(route_row["latency_hist"], hist_key)
        route_row["latency_max_ms"] = max(float(route_row.get("latency_max_ms") or 0.0), latency)

        release = str(client_release or "").strip()[:40]
        if release:
            release_defaults = {
                "requests": 0,
                "errors_5xx": 0,
                "latency_hist": {},
                "latency_max_ms": 0.0,
            }
            release_row = _restore_missing_schema(
                http["releases"].setdefault(_safe_key(release), copy.deepcopy(release_defaults)),
                release_defaults,
            )
            release_row["requests"] += 1
            if family == 5:
                release_row["errors_5xx"] += 1
            _inc(release_row["latency_hist"], hist_key)
            release_row["latency_max_ms"] = max(float(release_row.get("latency_max_ms") or 0.0), latency)


def record_ai_event(event: dict[str, Any], *, timestamp: float | None = None) -> None:
    at = float(event.get("at") or (time.time() if timestamp is None else timestamp))
    bucket_key = _bucket_start(at)
    latency = max(0.0, float(event.get("latency_ms") or 0.0))
    provider = str(event.get("provider") or "local")[:32]

    with _PENDING_LOCK:
        bucket = _pending_bucket(bucket_key)
        ai = bucket["ai"]
        ai["samples"] += 1
        ai["cloudflare" if provider == "cloudflare" else "local"] += 1
        _inc(ai["latency_hist"], _hist_key(latency))
        ai["latency_max_ms"] = max(float(ai.get("latency_max_ms") or 0.0), latency)
        ai["input_tokens"] += max(0, int(event.get("input_tokens") or 0))
        ai["output_tokens"] += max(0, int(event.get("output_tokens") or 0))
        _inc(ai["reasons"], _safe_key(str(event.get("reason") or "unknown")[:64]))
        _inc(ai["event_types"], _safe_key(str(event.get("event_type") or "generic")[:48]))
        _inc(ai["request_kinds"], _safe_key(str(event.get("request_kind") or "default")[:32]))
        model = str(event.get("model") or "")[:96]
        if model:
            _inc(ai["models"], _safe_key(model))
        worker_error = str(event.get("worker_error") or "")[:80]
        if worker_error:
            _inc(ai["worker_errors"], _safe_key(worker_error))

        channel = str(event.get("channel") or "comments")[:32]
        channel_key = _safe_key(channel)
        channel_defaults = {
            "samples": 0,
            "cloudflare": 0,
            "local": 0,
            "latency_hist": {},
            "latency_max_ms": 0.0,
            "reasons": {},
        }
        channel_row = _restore_missing_schema(
            ai["channels"].setdefault(channel_key, copy.deepcopy(channel_defaults)),
            channel_defaults,
        )
        channel_row["samples"] += 1
        channel_row["cloudflare" if provider == "cloudflare" else "local"] += 1
        _inc(channel_row["latency_hist"], _hist_key(latency))
        channel_row["latency_max_ms"] = max(float(channel_row.get("latency_max_ms") or 0.0), latency)
        _inc(channel_row["reasons"], _safe_key(str(event.get("reason") or "unknown")[:64]))


def record_presence_snapshot(online_users: int, *, timestamp: float | None = None) -> None:
    """Record one anonymous concurrency sample; never stores user identity."""
    at = time.time() if timestamp is None else float(timestamp)
    bucket_key = _bucket_start(at)
    online = max(0, int(online_users or 0))
    with _PENDING_LOCK:
        presence = _pending_bucket(bucket_key)["presence"]
        presence["samples"] += 1
        presence["online_sum"] += online
        presence["online_max"] = max(int(presence.get("online_max") or 0), online)


def record_frontend_event(
    event_type: str,
    *,
    metric_name: str | None = None,
    value: float | None = None,
    error_name: str | None = None,
    context: str | None = None,
    release: str | None = None,
    timestamp: float | None = None,
) -> None:
    """Persist only coarse, identity-free frontend telemetry aggregates.

    This intentionally mirrors the already-sanitized client telemetry contract:
    no username, URL, stack, input, FEN or free-form text reaches Mongo.
    """
    at = time.time() if timestamp is None else float(timestamp)
    bucket_key = _bucket_start(at)
    clean_event = str(event_type or "unknown")[:32]
    clean_metric = str(metric_name or "")[:16].upper() or None
    clean_error = str(error_name or "")[:80] or None
    clean_context = str(context or "unknown")[:48]
    clean_release = str(release or "unknown")[:40]

    with _PENDING_LOCK:
        frontend = _pending_bucket(bucket_key)["frontend"]
        frontend["samples"] += 1
        _inc(frontend["event_types"], _safe_key(clean_event))
        _inc(frontend["contexts"], _safe_key(clean_context))
        _inc(frontend["releases"], _safe_key(clean_release))

        if clean_event != "web_vital":
            frontend["errors"] += 1
            if clean_error:
                _inc(frontend["error_names"], _safe_key(clean_error))

        if clean_event == "web_vital" and clean_metric and value is not None:
            hist_key, scaled = _frontend_hist_key(clean_metric, float(value))
            metric_defaults = {"samples": 0, "hist": {}, "value_max": 0.0}
            row = _restore_missing_schema(
                frontend["metrics"].setdefault(_safe_key(clean_metric), copy.deepcopy(metric_defaults)),
                metric_defaults,
            )
            row["samples"] += 1
            _inc(row["hist"], hist_key)
            row["value_max"] = max(float(row.get("value_max") or 0.0), scaled)


def _is_max_key(key: str) -> bool:
    return key.endswith("_max_ms") or key.endswith("_max")


def _subtract_delta(target: dict[str, Any], sent: dict[str, Any]) -> None:
    for key, value in sent.items():
        if key not in target:
            continue
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _subtract_delta(target[key], value)
            if not target[key]:
                target.pop(key, None)
            continue
        if isinstance(value, (int, float)) and isinstance(target.get(key), (int, float)):
            # Maxima are not additive. Leaving the current max in pending after a
            # flush is harmless but would double-count only if treated as $inc;
            # maxima are persisted separately with $max, so remove the sent max
            # only when no newer/larger value replaced it.
            if _is_max_key(key):
                if float(target[key]) <= float(value):
                    target[key] = 0.0
            else:
                target[key] = target[key] - value
            if not target[key]:
                target.pop(key, None)


def _mongo_update(bucket: dict[str, Any]) -> tuple[dict[str, int | float], dict[str, float]]:
    incs: dict[str, int | float] = {}
    maxima: dict[str, float] = {}

    def walk(prefix: str, value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                path = f"{prefix}.{key}" if prefix else str(key)
                walk(path, item)
            return
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return
        if _is_max_key(prefix):
            if float(value) > 0:
                maxima[prefix] = float(value)
        elif value:
            incs[prefix] = value

    walk("", bucket)
    return incs, maxima


def _get_flush_lock() -> asyncio.Lock:
    # Tests may create more than one event loop in the same interpreter. Keep
    # the production single-flight guarantee without binding a stale lock to a
    # loop that has already been closed.
    global _FLUSH_ASYNC_LOCK, _FLUSH_ASYNC_LOCK_LOOP
    loop = asyncio.get_running_loop()
    if _FLUSH_ASYNC_LOCK is None or _FLUSH_ASYNC_LOCK_LOOP is not loop:
        _FLUSH_ASYNC_LOCK = asyncio.Lock()
        _FLUSH_ASYNC_LOCK_LOOP = loop
    return _FLUSH_ASYNC_LOCK


async def _ensure_retention_index(collection: Any) -> None:
    """Create one TTL index per process; failure never blocks observability writes."""
    global _INDEX_READY
    if _INDEX_READY:
        return
    try:
        await collection.create_index(
            "bucket_start",
            expireAfterSeconds=RETENTION_SECONDS,
            name="observability_bucket_ttl_v2",
        )
    except Exception:
        return
    _INDEX_READY = True


async def flush_pending() -> bool:
    """Persist pending aggregate deltas once, even if Admin and timer flush together."""
    from db import get_db

    async with _get_flush_lock():
        with _PENDING_LOCK:
            snapshots = {key: copy.deepcopy(value) for key, value in _PENDING.items() if value}
        if not snapshots:
            return True

        database = await get_db()
        if database is None:
            return False
        collection = database[COLLECTION_NAME]
        await _ensure_retention_index(collection)

        for bucket_key, snapshot in sorted(snapshots.items()):
            incs, maxima = _mongo_update(snapshot)
            update: dict[str, Any] = {
                "$setOnInsert": {
                    "bucket_start": datetime.fromtimestamp(bucket_key, tz=timezone.utc),
                    "schema": 1,
                },
            }
            if incs:
                update["$inc"] = incs
            if maxima:
                update["$max"] = maxima
            try:
                await collection.update_one({"_id": bucket_key}, update, upsert=True)
            except Exception:
                return False
            with _PENDING_LOCK:
                current = _PENDING.get(bucket_key)
                if current is not None:
                    _subtract_delta(current, snapshot)
                    if not current:
                        _PENDING.pop(bucket_key, None)
        return True


async def _scheduled_flush() -> None:
    global _FLUSH_SCHEDULED
    try:
        await flush_pending()
    finally:
        with _SCHEDULE_LOCK:
            _FLUSH_SCHEDULED = False


def schedule_history_flush() -> None:
    """Schedule a flush at most every 30 s without delaying the request."""
    global _FLUSH_SCHEDULED, _LAST_FLUSH_SCHEDULED_AT
    now = time.monotonic()
    with _SCHEDULE_LOCK:
        if _FLUSH_SCHEDULED or now - _LAST_FLUSH_SCHEDULED_AT < FLUSH_INTERVAL_SECONDS:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        _FLUSH_SCHEDULED = True
        _LAST_FLUSH_SCHEDULED_AT = now
        loop.create_task(_scheduled_flush())


def _hist_percentile(hist: dict[str, Any], percentile: float, max_value: float = 0.0) -> float | None:
    counts: list[tuple[float, int]] = []
    total = 0
    for boundary in _LATENCY_BOUNDS_MS:
        count = max(0, int(hist.get(f"le_{boundary}") or 0))
        if count:
            counts.append((float(boundary), count))
            total += count
    inf_count = max(0, int(hist.get("inf") or 0))
    if inf_count:
        counts.append((max(float(max_value or 0.0), float(_LATENCY_BOUNDS_MS[-1])), inf_count))
        total += inf_count
    if not total:
        return None
    target = max(1, math.ceil(total * percentile))
    seen = 0
    for boundary, count in counts:
        seen += count
        if seen >= target:
            return round(boundary, 2)
    return round(counts[-1][0], 2)


def _merge_numeric(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, dict):
            row = target.setdefault(key, {})
            if isinstance(row, dict):
                _merge_numeric(row, value)
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            if _is_max_key(key):
                target[key] = max(float(target.get(key) or 0.0), float(value))
            else:
                target[key] = target.get(key, 0) + value


def _decoded_counter(mapping: dict[str, Any], limit: int = 12) -> dict[str, int]:
    rows = Counter()
    for key, value in (mapping or {}).items():
        rows[_unsafe_key(str(key))] += max(0, int(value or 0))
    return dict(rows.most_common(limit))


def _summarize_http(http: dict[str, Any], range_seconds: int) -> dict[str, Any]:
    total = max(0, int(http.get("samples") or 0))
    status_5xx = max(0, int(http.get("status_5xx") or 0))
    routes = []
    for encoded, row in (http.get("routes") or {}).items():
        if not isinstance(row, dict):
            continue
        routes.append({
            "route": _unsafe_key(str(encoded)),
            "requests": max(0, int(row.get("requests") or 0)),
            "errors_5xx": max(0, int(row.get("errors_5xx") or 0)),
            "p95_ms": _hist_percentile(row.get("latency_hist") or {}, 0.95, float(row.get("latency_max_ms") or 0.0)),
        })
    routes.sort(key=lambda row: row["requests"], reverse=True)
    releases = []
    for encoded, row in (http.get("releases") or {}).items():
        if not isinstance(row, dict):
            continue
        requests = max(0, int(row.get("requests") or 0))
        errors = max(0, int(row.get("errors_5xx") or 0))
        releases.append({
            "release": _unsafe_key(str(encoded)),
            "requests": requests,
            "errors_5xx": errors,
            "error_5xx_percent": round(errors * 100 / requests, 2) if requests else 0.0,
            "p95_ms": _hist_percentile(row.get("latency_hist") or {}, 0.95, float(row.get("latency_max_ms") or 0.0)),
        })
    releases.sort(key=lambda row: row["requests"], reverse=True)
    return {
        "samples": total,
        "requests_per_minute": round(total / max(1 / 60, range_seconds / 60), 2),
        "status_2xx": max(0, int(http.get("status_2xx") or 0)),
        "status_4xx": max(0, int(http.get("status_4xx") or 0)),
        "status_5xx": status_5xx,
        "error_5xx_percent": round(status_5xx * 100 / total, 2) if total else 0.0,
        "p50_ms": _hist_percentile(http.get("latency_hist") or {}, 0.50, float(http.get("latency_max_ms") or 0.0)),
        "p95_ms": _hist_percentile(http.get("latency_hist") or {}, 0.95, float(http.get("latency_max_ms") or 0.0)),
        "p99_ms": _hist_percentile(http.get("latency_hist") or {}, 0.99, float(http.get("latency_max_ms") or 0.0)),
        "top_routes": routes[:8],
        "releases": releases[:8],
    }


def _summarize_presence(presence: dict[str, Any]) -> dict[str, Any]:
    samples = max(0, int(presence.get("samples") or 0))
    total = max(0, int(presence.get("online_sum") or 0))
    return {
        "samples": samples,
        "average_online": round(total / samples, 1) if samples else None,
        "peak_online": max(0, int(presence.get("online_max") or 0)) if samples else None,
    }


def _summarize_ai_channel(row: dict[str, Any]) -> dict[str, Any]:
    total = max(0, int(row.get("samples") or 0))
    cloud = max(0, int(row.get("cloudflare") or 0))
    local = max(0, int(row.get("local") or 0))
    return {
        "samples": total,
        "cloudflare_percent": round(cloud * 100 / total, 1) if total else None,
        "fallback_percent": round(local * 100 / total, 1) if total else None,
        "p50_ms": _hist_percentile(row.get("latency_hist") or {}, 0.50, float(row.get("latency_max_ms") or 0.0)),
        "p95_ms": _hist_percentile(row.get("latency_hist") or {}, 0.95, float(row.get("latency_max_ms") or 0.0)),
        "p99_ms": _hist_percentile(row.get("latency_hist") or {}, 0.99, float(row.get("latency_max_ms") or 0.0)),
        "reasons": _decoded_counter(row.get("reasons") or {}, 6),
    }


def _summarize_ai(ai: dict[str, Any]) -> dict[str, Any]:
    total = max(0, int(ai.get("samples") or 0))
    cloud = max(0, int(ai.get("cloudflare") or 0))
    local = max(0, int(ai.get("local") or 0))
    input_tokens = max(0, int(ai.get("input_tokens") or 0))
    output_tokens = max(0, int(ai.get("output_tokens") or 0))
    estimated_neurons = (input_tokens * 4625 + output_tokens * 30475) / 1_000_000
    estimated_cost_usd = (input_tokens * 0.051 + output_tokens * 0.34) / 1_000_000
    return {
        "samples": total,
        "cloudflare": cloud,
        "local_fallback": local,
        "cloudflare_percent": round(cloud * 100 / total, 1) if total else None,
        "fallback_percent": round(local * 100 / total, 1) if total else None,
        "p50_ms": _hist_percentile(ai.get("latency_hist") or {}, 0.50, float(ai.get("latency_max_ms") or 0.0)),
        "p95_ms": _hist_percentile(ai.get("latency_hist") or {}, 0.95, float(ai.get("latency_max_ms") or 0.0)),
        "p99_ms": _hist_percentile(ai.get("latency_hist") or {}, 0.99, float(ai.get("latency_max_ms") or 0.0)),
        "reasons": _decoded_counter(ai.get("reasons") or {}, 10),
        "event_types": _decoded_counter(ai.get("event_types") or {}, 12),
        "request_kinds": _decoded_counter(ai.get("request_kinds") or {}, 8),
        "models": _decoded_counter(ai.get("models") or {}, 6),
        "worker_errors": _decoded_counter(ai.get("worker_errors") or {}, 8),
        "channels": {
            _unsafe_key(str(encoded)): _summarize_ai_channel(row)
            for encoded, row in (ai.get("channels") or {}).items()
            if isinstance(row, dict)
        },
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_neurons": round(estimated_neurons, 3),
            "estimated_cost_usd": round(estimated_cost_usd, 6),
        },
    }


def _hist_percentile_for_bounds(hist: dict[str, Any], bounds: tuple[int, ...], percentile: float, max_value: float = 0.0) -> float | None:
    counts: list[tuple[float, int]] = []
    total = 0
    for boundary in bounds:
        count = max(0, int(hist.get(f"le_{boundary}") or 0))
        if count:
            counts.append((float(boundary), count))
            total += count
    inf_count = max(0, int(hist.get("inf") or 0))
    if inf_count:
        counts.append((max(float(max_value or 0.0), float(bounds[-1])), inf_count))
        total += inf_count
    if not total:
        return None
    target = max(1, math.ceil(total * percentile))
    seen = 0
    for boundary, count in counts:
        seen += count
        if seen >= target:
            return round(boundary, 3)
    return round(counts[-1][0], 3)


def _summarize_frontend(frontend: dict[str, Any]) -> dict[str, Any]:
    vitals_p75: dict[str, float] = {}
    vital_samples: dict[str, int] = {}
    for encoded, row in (frontend.get("metrics") or {}).items():
        if not isinstance(row, dict):
            continue
        metric = _unsafe_key(str(encoded)).upper()
        bounds = _FRONTEND_CLS_MILLI_BOUNDS if metric == "CLS" else _FRONTEND_MS_BOUNDS
        p75 = _hist_percentile_for_bounds(row.get("hist") or {}, bounds, 0.75, float(row.get("value_max") or 0.0))
        if p75 is not None:
            vitals_p75[metric] = round(p75 / 1000.0, 3) if metric == "CLS" else p75
        vital_samples[metric] = max(0, int(row.get("samples") or 0))
    return {
        "samples": max(0, int(frontend.get("samples") or 0)),
        "errors": max(0, int(frontend.get("errors") or 0)),
        "error_names": _decoded_counter(frontend.get("error_names") or {}, 8),
        "event_types": _decoded_counter(frontend.get("event_types") or {}, 8),
        "contexts": _decoded_counter(frontend.get("contexts") or {}, 8),
        "releases": _decoded_counter(frontend.get("releases") or {}, 8),
        "vitals_p75": vitals_p75,
        "vital_samples": vital_samples,
        "scope": "persistent_identity_free",
    }


def _parse_iso(value: str | None) -> float | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).timestamp()


def normalize_range(from_value: str | None, to_value: str | None, *, now: float | None = None) -> tuple[int, int]:
    current = float(time.time() if now is None else now)
    end = _parse_iso(to_value) if to_value else current
    start = _parse_iso(from_value) if from_value else end - DEFAULT_RANGE_SECONDS
    if end <= start:
        raise ValueError("El final del rango debe ser posterior al inicio.")
    if end - start > MAX_RANGE_SECONDS:
        raise ValueError("El rango máximo de observabilidad es de 90 días.")
    # No tiene sentido consultar futuro lejano; permitimos un pequeño margen de reloj.
    end = min(end, current + 300)
    if end <= start:
        raise ValueError("El rango solicitado está fuera del histórico disponible.")
    return int(start), int(end)


def _group_series(rows: list[tuple[int, dict[str, Any]]], start: int, end: int) -> list[dict[str, Any]]:
    span = max(1, end - start)
    if span <= 2 * 60 * 60:
        group_seconds = 5 * 60
    elif span <= 12 * 60 * 60:
        group_seconds = 15 * 60
    elif span <= 48 * 60 * 60:
        group_seconds = 60 * 60
    else:
        group_seconds = 24 * 60 * 60
    groups: dict[int, dict[str, Any]] = {}
    for bucket_key, payload in rows:
        group_key = bucket_key - (bucket_key % group_seconds)
        target = groups.setdefault(group_key, _fresh_bucket())
        _merge_numeric(target, payload)
    series = []
    for group_key in sorted(groups):
        payload = groups[group_key]
        http = _summarize_http(payload.get("http") or {}, group_seconds)
        ai = _summarize_ai(payload.get("ai") or {})
        series.append({
            "at": datetime.fromtimestamp(group_key, tz=timezone.utc).isoformat(),
            "http_requests": http["samples"],
            "http_4xx": http["status_4xx"],
            "http_5xx": http["status_5xx"],
            "http_p50_ms": http["p50_ms"],
            "http_p95_ms": http["p95_ms"],
            "http_p99_ms": http["p99_ms"],
            "ai_samples": ai["samples"],
            "ai_cloudflare_percent": ai["cloudflare_percent"],
            "ai_fallback_percent": ai["fallback_percent"],
            "ai_p50_ms": ai["p50_ms"],
            "ai_p95_ms": ai["p95_ms"],
            "ai_p99_ms": ai["p99_ms"],
            "online_average": _summarize_presence(payload.get("presence") or {})["average_online"],
            "online_peak": _summarize_presence(payload.get("presence") or {})["peak_online"],
            "frontend_samples": _summarize_frontend(payload.get("frontend") or {})["samples"],
            "frontend_errors": _summarize_frontend(payload.get("frontend") or {})["errors"],
            "frontend_lcp_p75_ms": _summarize_frontend(payload.get("frontend") or {})["vitals_p75"].get("LCP"),
            "frontend_cls_p75": _summarize_frontend(payload.get("frontend") or {})["vitals_p75"].get("CLS"),
            "frontend_inp_p75_ms": _summarize_frontend(payload.get("frontend") or {})["vitals_p75"].get("INP"),
        })
    return series


async def get_history(from_value: str | None = None, to_value: str | None = None) -> dict[str, Any]:
    start, end = normalize_range(from_value, to_value)
    await flush_pending()

    rows_by_bucket: dict[int, dict[str, Any]] = {}
    bucket_spans: dict[int, int] = {}
    persistent = False
    try:
        from db import get_db

        database = await get_db()
        if database is not None:
            persistent = True
            # Lee tanto el histórico horario legado como los buckets actuales
            # de 5 minutos. La colección legacy queda sólo en lectura; toda
            # escritura nueva va a observability_5min_v2.
            for collection_name, bucket_size in ((LEGACY_COLLECTION_NAME, 60 * 60), (COLLECTION_NAME, BUCKET_SECONDS)):
                lower = start - (start % bucket_size)
                upper = end - (end % bucket_size)
                cursor = database[collection_name].find({"_id": {"$gte": lower, "$lte": upper}})
                async for document in cursor:
                    bucket_key = int(document.get("_id") or 0)
                    target = rows_by_bucket.setdefault(bucket_key, _fresh_bucket())
                    bucket_spans[bucket_key] = max(bucket_spans.get(bucket_key, 0), bucket_size)
                    _merge_numeric(target, {
                        "http": document.get("http") or {},
                        "ai": document.get("ai") or {},
                        "presence": document.get("presence") or {},
                        "frontend": document.get("frontend") or {},
                    })
    except Exception:
        persistent = False

    # Include any deltas that could not be flushed (local dev / transient Mongo
    # outage). They are process-local but still useful and remain aggregate-only.
    with _PENDING_LOCK:
        pending_rows = {key: copy.deepcopy(value) for key, value in _PENDING.items()}
    for bucket_key, payload in pending_rows.items():
        if bucket_key < _bucket_start(start) or bucket_key > _bucket_start(end):
            continue
        target = rows_by_bucket.setdefault(bucket_key, _fresh_bucket())
        bucket_spans[bucket_key] = max(bucket_spans.get(bucket_key, 0), BUCKET_SECONDS)
        _merge_numeric(target, payload)

    selected = [
        (key, value)
        for key, value in sorted(rows_by_bucket.items())
        if key <= end and key + bucket_spans.get(key, BUCKET_SECONDS) >= start
    ]
    total = _fresh_bucket()
    for _, payload in selected:
        _merge_numeric(total, payload)

    range_seconds = max(1, end - start)
    return {
        "range": {
            "from": datetime.fromtimestamp(start, tz=timezone.utc).isoformat(),
            "to": datetime.fromtimestamp(end, tz=timezone.utc).isoformat(),
            "seconds": range_seconds,
            "persistent": persistent,
            "resolution": (
                "5min" if range_seconds <= 2 * 60 * 60
                else "15min" if range_seconds <= 12 * 60 * 60
                else "hour" if range_seconds <= 48 * 60 * 60
                else "day"
            ),
        },
        "http": _summarize_http(total.get("http") or {}, range_seconds),
        "ai": _summarize_ai(total.get("ai") or {}),
        "presence": _summarize_presence(total.get("presence") or {}),
        "frontend": _summarize_frontend(total.get("frontend") or {}),
        "series": _group_series(selected, start, end),
    }


def reset_history_for_tests() -> None:
    global _FLUSH_SCHEDULED, _LAST_FLUSH_SCHEDULED_AT, _FLUSH_ASYNC_LOCK, _FLUSH_ASYNC_LOCK_LOOP, _INDEX_READY
    with _PENDING_LOCK:
        _PENDING.clear()
    with _SCHEDULE_LOCK:
        _FLUSH_SCHEDULED = False
        _LAST_FLUSH_SCHEDULED_AT = 0.0
    _FLUSH_ASYNC_LOCK = None
    _FLUSH_ASYNC_LOCK_LOOP = None
    _INDEX_READY = False
