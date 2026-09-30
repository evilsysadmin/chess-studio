#!/usr/bin/env python3
"""Measure Chess Studio engine/API capacity without mutating game state.

The probe exercises /api/analyze because it crosses the same single bounded
engine executor used by gameplay while avoiding save-game writes. Production
hosts are refused unless --allow-production is explicit.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

PRODUCTION_HOST = "api.chess-studio.shadowops.dpdns.org"
DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


@dataclass(frozen=True)
class Sample:
    status: int
    latency_ms: float
    request_id: str
    error: str | None = None


def api_base(raw: str) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value:
        raise ValueError("base URL vacía")
    parsed = urlsplit(value if "://" in value else f"https://{value}")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base URL inválida")
    path = parsed.path.rstrip("/")
    if not path.endswith("/api"):
        path = f"{path}/api" if path else "/api"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def require_non_production(base: str, allow_production: bool) -> None:
    host = (urlsplit(base).hostname or "").lower()
    if host == PRODUCTION_HOST and not allow_production:
        raise ValueError(
            "el probe de capacidad rechaza producción por defecto; usa --allow-production sólo durante una ventana controlada"
        )


def parse_levels(raw: str) -> tuple[int, ...]:
    levels: list[int] = []
    for part in str(raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            value = int(part)
        except ValueError as exc:
            raise ValueError(f"concurrencia inválida: {part!r}") from exc
        if value < 1 or value > 32:
            raise ValueError("cada nivel de concurrencia debe estar entre 1 y 32")
        if value not in levels:
            levels.append(value)
    if not levels:
        raise ValueError("falta al menos un nivel de concurrencia")
    if levels != sorted(levels):
        raise ValueError("los niveles de concurrencia deben estar en orden ascendente")
    return tuple(levels)


def percentile(values: list[float], q: float) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def request_json(
    base: str,
    path: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    token: str = "",
    api_key: str = "",
    timeout: float = 15.0,
) -> tuple[int, dict, float, str]:
    request_id = f"capacity-{uuid.uuid4().hex[:16]}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "ChessStudioCapacityProbe/1",
        "X-Request-ID": request_id,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if api_key:
        headers["X-API-Key"] = api_key
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
    started = time.perf_counter()
    try:
        with urlopen(Request(f"{base}{path}", data=data, headers=headers, method=method), timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw or "{}")
            return int(response.status), payload, (time.perf_counter() - started) * 1000, response.headers.get("X-Request-ID") or request_id
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            payload = {"detail": raw[:200]}
        return int(exc.code), payload, (time.perf_counter() - started) * 1000, (exc.headers.get("X-Request-ID") if exc.headers else None) or request_id


def resolve_auth(base: str, args: argparse.Namespace) -> tuple[str, str]:
    api_key = str(args.api_key or "").strip()
    token = str(args.token or "").strip()
    username = str(args.username or "").strip()
    password = str(args.password or "")
    methods = sum(bool(value) for value in (api_key, token, username or password))
    if methods != 1:
        raise ValueError("configura exactamente uno: API key, token o username+password")
    if bool(username) != bool(password):
        raise ValueError("username y password deben configurarse juntos")
    if api_key:
        return "", api_key
    if token:
        return token, ""
    status, payload, _, _ = request_json(
        base,
        "/auth/login",
        method="POST",
        body={"username": username, "password": password},
        timeout=args.timeout,
    )
    if status != 200 or not isinstance(payload, dict) or not payload.get("token"):
        raise ValueError(f"login del probe falló con HTTP {status}")
    return str(payload["token"]), ""


def one_engine_request(base: str, token: str, api_key: str, level: float, timeout: float, fen: str) -> Sample:
    try:
        status, payload, latency, request_id = request_json(
            base,
            "/analyze",
            method="POST",
            body={"fen": fen, "level": level},
            token=token,
            api_key=api_key,
            timeout=timeout,
        )
        detail = None
        if status != 200:
            detail = str(payload.get("detail") or payload.get("error") or "unexpected status")[:160]
        return Sample(status=status, latency_ms=latency, request_id=request_id, error=detail)
    except (URLError, TimeoutError, OSError) as exc:
        return Sample(status=0, latency_ms=timeout * 1000, request_id="", error=type(exc).__name__)


def run_level(
    base: str,
    *,
    concurrency: int,
    samples: int,
    token: str,
    api_key: str,
    engine_level: float,
    timeout: float,
    fen: str,
) -> dict:
    total = max(samples, concurrency)
    started = time.perf_counter()
    rows: list[Sample] = []
    with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="capacity-probe") as pool:
        futures = [
            pool.submit(one_engine_request, base, token, api_key, engine_level, timeout, fen)
            for _ in range(total)
        ]
        for future in as_completed(futures):
            rows.append(future.result())
    elapsed = max(time.perf_counter() - started, 1e-9)
    ok = [row for row in rows if row.status == 200]
    latencies = [row.latency_ms for row in ok]
    status_counts: dict[str, int] = {}
    for row in rows:
        key = str(row.status)
        status_counts[key] = status_counts.get(key, 0) + 1
    return {
        "concurrency": concurrency,
        "samples": len(rows),
        "successes": len(ok),
        "errors": len(rows) - len(ok),
        "error_rate": round((len(rows) - len(ok)) / len(rows), 4),
        "elapsed_ms": round(elapsed * 1000, 2),
        "throughput_rps": round(len(ok) / elapsed, 3),
        "latency_ms": {
            "p50": round(percentile(latencies, 0.50), 2) if latencies else None,
            "p95": round(percentile(latencies, 0.95), 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
            "mean": round(statistics.fmean(latencies), 2) if latencies else None,
        },
        "status_counts": status_counts,
        "sample_request_ids": [row.request_id for row in rows if row.request_id][:3],
    }


def self_test() -> None:
    assert api_base("https://example.test") == "https://example.test/api"
    assert api_base("https://example.test/api") == "https://example.test/api"
    assert parse_levels("1,2,4,8") == (1, 2, 4, 8)
    assert percentile([10, 20, 30, 40], 0.50) == 25
    assert percentile([10], 0.95) == 10
    try:
        require_non_production(f"https://{PRODUCTION_HOST}/api", False)
    except ValueError:
        pass
    else:
        raise AssertionError("production must be refused without explicit opt-in")
    require_non_production("https://api-staging.chess-studio.shadowops.dpdns.org/api", False)
    try:
        parse_levels("4,2")
    except ValueError:
        pass
    else:
        raise AssertionError("unordered concurrency levels must be rejected")
    print("Production capacity probe self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("CHESS_CAPACITY_BASE_URL", ""))
    parser.add_argument("--api-key", default=os.getenv("CHESS_CAPACITY_API_KEY", ""))
    parser.add_argument("--token", default=os.getenv("CHESS_CAPACITY_TOKEN", ""))
    parser.add_argument("--username", default=os.getenv("CHESS_CAPACITY_USERNAME", ""))
    parser.add_argument("--password", default=os.getenv("CHESS_CAPACITY_PASSWORD", ""))
    parser.add_argument("--concurrency", default=os.getenv("CHESS_CAPACITY_CONCURRENCY", "1,2,4,8"))
    parser.add_argument("--samples-per-level", type=int, default=8)
    parser.add_argument("--engine-level", type=float, default=50)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--fen", default=DEFAULT_FEN)
    parser.add_argument("--allow-production", action="store_true")
    parser.add_argument("--max-p95-ms", type=float, default=0)
    parser.add_argument("--max-error-rate", type=float, default=0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if args.samples_per_level < 1 or args.samples_per_level > 200:
        parser.error("--samples-per-level must be between 1 and 200")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        base = api_base(args.base_url)
        require_non_production(base, args.allow_production)
        levels = parse_levels(args.concurrency)
        token, api_key = resolve_auth(base, args)
    except ValueError as exc:
        print(f"capacity-probe: {exc}", file=sys.stderr)
        return 2

    results = []
    baseline_p95 = None
    failed = False
    for concurrency in levels:
        row = run_level(
            base,
            concurrency=concurrency,
            samples=args.samples_per_level,
            token=token,
            api_key=api_key,
            engine_level=args.engine_level,
            timeout=args.timeout,
            fen=args.fen,
        )
        p95 = row["latency_ms"]["p95"]
        if baseline_p95 is None and p95:
            baseline_p95 = p95
        row["p95_amplification_vs_c1"] = (
            round(p95 / baseline_p95, 2) if p95 and baseline_p95 else None
        )
        print(json.dumps({"capacity_level": row}, sort_keys=True, separators=(",", ":")))
        results.append(row)
        if row["errors"]:
            failed = True
        if args.max_p95_ms and (p95 is None or p95 > args.max_p95_ms):
            failed = True
        if args.max_error_rate and row["error_rate"] > args.max_error_rate:
            failed = True

    summary = {
        "base_host": urlsplit(base).hostname,
        "engine_level": args.engine_level,
        "levels": results,
        "note": "Correlate request ids/time window with host CPU/RAM and backend queue telemetry; do not raise engine workers from this client-side probe alone.",
    }
    print(json.dumps({"capacity_summary": summary}, sort_keys=True, separators=(",", ":")))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
