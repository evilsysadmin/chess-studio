#!/usr/bin/env python3
"""Measure Chess Studio service capacity with bounded, explicit workloads.

Scenarios isolate the main free-tier bottlenecks:
- engine: CPU/engine executor through /api/analyze;
- mongo-read: authenticated profile/savegame reads;
- mongo-write: create/delete a disposable game for write-path latency;
- game-turn: one real human move, Matthias reply and persistence;
- mixed: a deterministic blend of engine + Mongo read/write operations.

Production hosts are refused unless --allow-production is explicit. Ephemeral
accounts are supported so staging runs can exercise Mongo without leaving data.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import secrets
import statistics
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen

PRODUCTION_HOST = "api.chess-studio.shadowops.dpdns.org"
DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
SCENARIOS = ("engine", "mongo-read", "mongo-write", "game-turn", "mixed")


@dataclass(frozen=True)
class Sample:
    status: int
    latency_ms: float
    request_id: str
    operation: str
    http_requests: int = 1
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
        "User-Agent": "ChessStudioCapacityProbe/2",
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
            return (
                int(response.status),
                payload,
                (time.perf_counter() - started) * 1000,
                response.headers.get("X-Request-ID") or request_id,
            )
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            payload = {"detail": raw[:200]}
        return (
            int(exc.code),
            payload,
            (time.perf_counter() - started) * 1000,
            (exc.headers.get("X-Request-ID") if exc.headers else None) or request_id,
        )


def _detail(payload: dict, fallback: str = "unexpected status") -> str:
    return str(payload.get("detail") or payload.get("error") or fallback)[:160]


def ephemeral_credentials() -> tuple[str, str]:
    return f"ci_smoke_{secrets.token_hex(8)}", f"CS!{secrets.token_urlsafe(32)}"


def register_ephemeral(base: str, invite_code: str, timeout: float) -> tuple[str, str, str]:
    username, password = ephemeral_credentials()
    body = {"username": username, "password": password}
    invite = str(invite_code or "").strip()
    if invite:
        body["inviteCode"] = invite
    status, payload, _, _ = request_json(base, "/auth/register", method="POST", body=body, timeout=timeout)
    token = str(payload.get("token") or "") if isinstance(payload, dict) else ""
    if status != 201 or not token:
        raise ValueError(f"registro efímero del probe falló con HTTP {status}: {_detail(payload)}")
    return username, password, token


def cleanup_ephemeral(base: str, token: str, password: str, timeout: float) -> None:
    status, payload, _, _ = request_json(
        base,
        "/auth/delete-account",
        method="POST",
        token=token,
        body={"password": password},
        timeout=timeout,
    )
    if status != 200:
        raise RuntimeError(f"cleanup de cuenta efímera falló con HTTP {status}: {_detail(payload)}")


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


def scenario_requires_jwt(scenario: str) -> bool:
    return scenario in {"mongo-read", "mongo-write", "game-turn", "mixed"}


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
        return Sample(
            status=status,
            latency_ms=latency,
            request_id=request_id,
            operation="engine.analyze",
            error=None if status == 200 else _detail(payload),
        )
    except (URLError, TimeoutError, OSError) as exc:
        return Sample(
            status=0,
            latency_ms=timeout * 1000,
            request_id="",
            operation="engine.analyze",
            error=type(exc).__name__,
        )


def one_mongo_read_request(base: str, token: str, timeout: float, index: int) -> Sample:
    path, operation = (("/profile", "mongo.profile_read") if index % 2 == 0 else ("/games", "mongo.games_read"))
    try:
        status, payload, latency, request_id = request_json(base, path, token=token, timeout=timeout)
        return Sample(
            status=status,
            latency_ms=latency,
            request_id=request_id,
            operation=operation,
            error=None if status == 200 else _detail(payload),
        )
    except (URLError, TimeoutError, OSError) as exc:
        return Sample(
            status=0,
            latency_ms=timeout * 1000,
            request_id="",
            operation=operation,
            error=type(exc).__name__,
        )


def one_mongo_write_request(base: str, token: str, timeout: float) -> Sample:
    started = time.perf_counter()
    game_id = ""
    request_ids: list[str] = []
    try:
        status, created, _, request_id = request_json(
            base,
            "/games",
            method="POST",
            token=token,
            body={"difficulty": 0, "color": "w"},
            timeout=timeout,
        )
        request_ids.append(request_id)
        if status != 201:
            return Sample(
                status=status,
                latency_ms=(time.perf_counter() - started) * 1000,
                request_id=request_id,
                operation="mongo.game_write_cycle",
                http_requests=1,
                error=_detail(created, "create failed"),
            )
        game_id = str(created.get("id") or "").strip()
        if not game_id:
            return Sample(
                status=0,
                latency_ms=(time.perf_counter() - started) * 1000,
                request_id=request_id,
                operation="mongo.game_write_cycle",
                http_requests=1,
                error="create response missing game id",
            )
        delete_status, deleted, _, delete_request_id = request_json(
            base,
            f"/games/{quote(game_id, safe='')}",
            method="DELETE",
            token=token,
            timeout=timeout,
        )
        request_ids.append(delete_request_id)
        return Sample(
            status=200 if delete_status == 204 else delete_status,
            latency_ms=(time.perf_counter() - started) * 1000,
            request_id=",".join(item for item in request_ids if item),
            operation="mongo.game_write_cycle",
            http_requests=2,
            error=None if delete_status == 204 else _detail(deleted, "delete failed"),
        )
    except (URLError, TimeoutError, OSError) as exc:
        return Sample(
            status=0,
            latency_ms=(time.perf_counter() - started) * 1000,
            request_id=",".join(item for item in request_ids if item),
            operation="mongo.game_write_cycle",
            http_requests=2 if game_id else 1,
            error=type(exc).__name__,
        )


def one_game_turn_request(base: str, token: str, timeout: float, difficulty: float) -> Sample:
    """Measure the user-visible move path while keeping setup/cleanup outside latency.

    Each sample gets its own disposable game so concurrent workers never race on
    one savegame. Throughput still includes create + delete overhead, making the
    rate conservative; latency_ms is only the human move -> Matthias reply path.
    """
    game_id = ""
    request_ids: list[str] = []
    try:
        status, created, _, create_request_id = request_json(
            base,
            "/games",
            method="POST",
            token=token,
            body={"difficulty": difficulty, "color": "w"},
            timeout=timeout,
        )
        request_ids.append(create_request_id)
        if status != 201:
            return Sample(
                status=status,
                latency_ms=0,
                request_id=create_request_id,
                operation="game.turn",
                http_requests=1,
                error=_detail(created, "game create failed"),
            )
        game_id = str(created.get("id") or "").strip()
        if not game_id:
            return Sample(
                status=0,
                latency_ms=0,
                request_id=create_request_id,
                operation="game.turn",
                http_requests=1,
                error="create response missing game id",
            )

        game_path = f"/games/{quote(game_id, safe='')}"
        move_status, moved, move_latency, move_request_id = request_json(
            base,
            f"{game_path}/move",
            method="POST",
            token=token,
            body={"from": "e2", "to": "e4"},
            timeout=timeout,
        )
        request_ids.append(move_request_id)

        delete_status, deleted, _, delete_request_id = request_json(
            base,
            game_path,
            method="DELETE",
            token=token,
            timeout=timeout,
        )
        request_ids.append(delete_request_id)

        if move_status != 200:
            return Sample(
                status=move_status,
                latency_ms=move_latency,
                request_id=",".join(item for item in request_ids if item),
                operation="game.turn",
                http_requests=3,
                error=_detail(moved, "game move failed"),
            )
        if delete_status != 204:
            return Sample(
                status=delete_status,
                latency_ms=move_latency,
                request_id=",".join(item for item in request_ids if item),
                operation="game.turn",
                http_requests=3,
                error=_detail(deleted, "game cleanup failed"),
            )
        return Sample(
            status=200,
            latency_ms=move_latency,
            request_id=",".join(item for item in request_ids if item),
            operation="game.turn",
            http_requests=3,
        )
    except (URLError, TimeoutError, OSError) as exc:
        return Sample(
            status=0,
            latency_ms=timeout * 1000,
            request_id=",".join(item for item in request_ids if item),
            operation="game.turn",
            http_requests=3 if game_id else 1,
            error=type(exc).__name__,
        )


def one_scenario_request(
    base: str,
    *,
    scenario: str,
    index: int,
    token: str,
    api_key: str,
    engine_level: float,
    game_difficulty: float,
    timeout: float,
    fen: str,
) -> Sample:
    if scenario == "engine":
        return one_engine_request(base, token, api_key, engine_level, timeout, fen)
    if scenario == "mongo-read":
        return one_mongo_read_request(base, token, timeout, index)
    if scenario == "mongo-write":
        return one_mongo_write_request(base, token, timeout)
    if scenario == "game-turn":
        return one_game_turn_request(base, token, timeout, game_difficulty)
    mixed_slot = index % 5
    if mixed_slot in {0, 3}:
        return one_engine_request(base, token, api_key, engine_level, timeout, fen)
    if mixed_slot in {1, 4}:
        return one_mongo_read_request(base, token, timeout, index)
    return one_mongo_write_request(base, token, timeout)


def operation_summary(rows: list[Sample]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for operation in sorted({row.operation for row in rows}):
        matches = [row for row in rows if row.operation == operation]
        ok = [row for row in matches if row.status == 200]
        latencies = [row.latency_ms for row in ok]
        result[operation] = {
            "samples": len(matches),
            "errors": len(matches) - len(ok),
            "p50_ms": round(percentile(latencies, 0.50), 2) if latencies else None,
            "p95_ms": round(percentile(latencies, 0.95), 2) if latencies else None,
        }
    return result


def run_level(
    base: str,
    *,
    scenario: str,
    concurrency: int,
    samples: int,
    token: str,
    api_key: str,
    engine_level: float,
    game_difficulty: float,
    timeout: float,
    fen: str,
) -> dict:
    total = max(samples, concurrency)
    started = time.perf_counter()
    rows: list[Sample] = []
    with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="capacity-probe") as pool:
        futures = [
            pool.submit(
                one_scenario_request,
                base,
                scenario=scenario,
                index=index,
                token=token,
                api_key=api_key,
                engine_level=engine_level,
                game_difficulty=game_difficulty,
                timeout=timeout,
                fen=fen,
            )
            for index in range(total)
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
    http_requests = sum(row.http_requests for row in rows)
    return {
        "scenario": scenario,
        "concurrency": concurrency,
        "samples": len(rows),
        "http_requests": http_requests,
        "successes": len(ok),
        "errors": len(rows) - len(ok),
        "error_rate": round((len(rows) - len(ok)) / len(rows), 4),
        "elapsed_ms": round(elapsed * 1000, 2),
        "throughput_ops_rps": round(len(ok) / elapsed, 3),
        "http_request_rate": round(http_requests / elapsed, 3),
        "latency_ms": {
            "p50": round(percentile(latencies, 0.50), 2) if latencies else None,
            "p95": round(percentile(latencies, 0.95), 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
            "mean": round(statistics.fmean(latencies), 2) if latencies else None,
        },
        "status_counts": status_counts,
        "operations": operation_summary(rows),
        "sample_request_ids": [row.request_id for row in rows if row.request_id][:3],
    }


def self_test() -> None:
    assert api_base("https://example.test") == "https://example.test/api"
    assert api_base("https://example.test/api") == "https://example.test/api"
    assert parse_levels("1,2,4,8") == (1, 2, 4, 8)
    assert percentile([10, 20, 30, 40], 0.50) == 25
    assert percentile([10], 0.95) == 10
    assert scenario_requires_jwt("mongo-read")
    assert scenario_requires_jwt("mongo-write")
    assert scenario_requires_jwt("mixed")
    assert scenario_requires_jwt("game-turn")
    assert not scenario_requires_jwt("engine")
    rows = [
        Sample(200, 10, "a", "mongo.profile_read"),
        Sample(200, 20, "b", "mongo.profile_read"),
        Sample(500, 30, "c", "engine.analyze", error="boom"),
    ]
    summary = operation_summary(rows)
    assert summary["mongo.profile_read"]["p50_ms"] == 15
    assert summary["engine.analyze"]["errors"] == 1
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
    parser.add_argument("--invite-code", default=os.getenv("CHESS_CAPACITY_INVITE_CODE", ""))
    parser.add_argument("--ephemeral", action="store_true")
    parser.add_argument("--scenario", choices=SCENARIOS, default=os.getenv("CHESS_CAPACITY_SCENARIO", "engine"))
    parser.add_argument("--concurrency", default=os.getenv("CHESS_CAPACITY_CONCURRENCY", "1,2,4,8"))
    parser.add_argument("--samples-per-level", type=int, default=8)
    parser.add_argument("--engine-level", type=float, default=50)
    parser.add_argument("--game-difficulty", type=float, default=50)
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
    if not 0 <= args.game_difficulty <= 100:
        parser.error("--game-difficulty must be between 0 and 100")

    ephemeral_created = False
    cleanup_password = ""
    token = ""
    api_key = ""
    try:
        base = api_base(args.base_url)
        require_non_production(base, args.allow_production)
        levels = parse_levels(args.concurrency)
        if args.ephemeral:
            if any((args.api_key, args.token, args.username, args.password)):
                raise ValueError("--ephemeral no se combina con API key/token/username/password")
            _, cleanup_password, token = register_ephemeral(base, args.invite_code, args.timeout)
            ephemeral_created = True
        else:
            token, api_key = resolve_auth(base, args)
        if scenario_requires_jwt(args.scenario) and not token:
            raise ValueError(f"el escenario {args.scenario} requiere JWT/usuario; una API key sólo sirve para engine")
    except ValueError as exc:
        print(f"capacity-probe: {exc}", file=sys.stderr)
        return 2

    results = []
    baseline_p95 = None
    failed = False
    cleanup_failed = False
    try:
        for concurrency in levels:
            row = run_level(
                base,
                scenario=args.scenario,
                concurrency=concurrency,
                samples=args.samples_per_level,
                token=token,
                api_key=api_key,
                engine_level=args.engine_level,
                game_difficulty=args.game_difficulty,
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
    finally:
        if ephemeral_created:
            try:
                cleanup_ephemeral(base, token, cleanup_password, args.timeout)
            except (RuntimeError, URLError, TimeoutError, OSError) as exc:
                cleanup_failed = True
                print(f"capacity-probe cleanup: {exc}", file=sys.stderr)

    summary = {
        "base_host": urlsplit(base).hostname,
        "scenario": args.scenario,
        "engine_level": args.engine_level,
        "game_difficulty": args.game_difficulty,
        "levels": results,
        "ephemeral_cleanup_ok": not cleanup_failed if ephemeral_created else None,
        "note": (
            "engine isolates A1/engine pressure; mongo-read/write isolates Atlas/free-tier persistence; "
            "game-turn measures the real human move -> Matthias reply + persistence path; mixed approximates shared "
            "service contention. Fix the operating limit below sustained p95/error degradation."
        ),
    }
    print(json.dumps({"capacity_summary": summary}, sort_keys=True, separators=(",", ":")))
    return 1 if failed or cleanup_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
