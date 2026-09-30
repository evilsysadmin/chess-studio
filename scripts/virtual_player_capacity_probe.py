#!/usr/bin/env python3
"""Measure realistic concurrent Chess Studio players against staging.

Unlike the pure concurrency hammer, this probe models distinct authenticated
players with human think time. Each virtual player owns its own signed staging
identity and pre-created disposable games, so rate limits remain realistic and
setup/cleanup noise stays outside the measured move latency.

The probe is deliberately capped at 100 players and stops escalation after a
bad level. Production is refused by production_capacity_probe.require_non_production.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from urllib.error import URLError
from urllib.parse import quote, urlsplit

from production_capacity_probe import (
    api_base,
    percentile,
    request_json,
    require_non_production,
)

CI_USER_RE = re.compile(r"^ci_smoke_[0-9a-f]{16}$")
SYNTHETIC_SOURCE = "staging-capacity"
MAX_PLAYERS = 100


@dataclass(frozen=True)
class VirtualPlayer:
    username: str
    password: str
    token: str


@dataclass(frozen=True)
class TurnSample:
    status: int
    latency_ms: float
    request_id: str
    error: str | None = None


def parse_player_levels(raw: str) -> tuple[int, ...]:
    levels: list[int] = []
    for part in str(raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            value = int(part)
        except ValueError as exc:
            raise ValueError(f"jugadores inválidos: {part!r}") from exc
        if value < 1 or value > MAX_PLAYERS:
            raise ValueError(f"cada nivel debe estar entre 1 y {MAX_PLAYERS} jugadores")
        if value not in levels:
            levels.append(value)
    if not levels:
        raise ValueError("falta al menos un nivel de jugadores")
    if levels != sorted(levels):
        raise ValueError("los niveles de jugadores deben estar en orden ascendente")
    return tuple(levels)


def signed_headers(username: str, secret: str) -> dict[str, str]:
    identity = str(username or "").strip().lower()
    if not CI_USER_RE.fullmatch(identity):
        raise ValueError("la identidad sintética no cumple ci_smoke_<16 hex>")
    key = str(secret or "").encode("utf-8")
    if not key:
        raise ValueError("falta secreto sintético de staging")
    message = f"chess-studio:synthetic:{SYNTHETIC_SOURCE}\x00{identity}".encode("utf-8")
    return {
        "X-Chess-Synthetic-Source": SYNTHETIC_SOURCE,
        "X-Chess-Synthetic-Identity": identity,
        "X-Chess-Synthetic-Signature": hmac.new(key, message, hashlib.sha256).hexdigest(),
    }


def detail(payload: dict, fallback: str) -> str:
    return str(payload.get("detail") or payload.get("error") or fallback)[:180]


def register_player(base: str, invite_code: str, synthetic_secret: str, timeout: float) -> VirtualPlayer:
    username = f"ci_smoke_{secrets.token_hex(8)}"
    password = f"CS!{secrets.token_urlsafe(32)}"
    body = {"username": username, "password": password}
    if invite_code:
        body["inviteCode"] = invite_code
    status, payload, _, _ = request_json(
        base,
        "/auth/register",
        method="POST",
        body=body,
        timeout=timeout,
        extra_headers=signed_headers(username, synthetic_secret),
    )
    token = str(payload.get("token") or "") if isinstance(payload, dict) else ""
    if status != 201 or not token:
        raise RuntimeError(f"registro sintético falló HTTP {status}: {detail(payload, 'register failed')}")
    return VirtualPlayer(username=username, password=password, token=token)


def cleanup_player(base: str, player: VirtualPlayer, timeout: float) -> None:
    status, payload, _, _ = request_json(
        base,
        "/auth/delete-account",
        method="POST",
        body={"password": player.password},
        token=player.token,
        timeout=timeout,
    )
    if status != 200 or payload.get("deleted") is not True:
        raise RuntimeError(
            f"cleanup de {player.username} falló HTTP {status}: {detail(payload, 'delete-account failed')}"
        )


def create_game(base: str, player: VirtualPlayer, difficulty: float, timeout: float) -> str:
    status, payload, _, _ = request_json(
        base,
        "/games",
        method="POST",
        body={"difficulty": difficulty, "color": "w"},
        token=player.token,
        timeout=timeout,
    )
    game_id = str(payload.get("id") or "") if isinstance(payload, dict) else ""
    if status != 201 or not game_id:
        raise RuntimeError(
            f"setup de partida para {player.username} falló HTTP {status}: {detail(payload, 'create failed')}"
        )
    return game_id


def think_delay(player_index: int, round_index: int, think_seconds: float, jitter: float) -> float:
    if think_seconds <= 0:
        return 0.0
    # Distribución determinista para que dos runs comparables no dependan del RNG
    # del runner. Con jitter=0.5 produce 10..30 s cuando la media es 20 s.
    phase = ((player_index * 73 + round_index * 197 + 41) % 1000) / 999.0
    multiplier = (1.0 - jitter) + (2.0 * jitter * phase)
    return max(0.0, think_seconds * multiplier)


def run_turn(base: str, player: VirtualPlayer, game_id: str, timeout: float) -> TurnSample:
    path = f"/games/{quote(game_id, safe='')}/move"
    try:
        status, payload, latency, request_id = request_json(
            base,
            path,
            method="POST",
            body={"from": "e2", "to": "e4"},
            token=player.token,
            timeout=timeout,
        )
        return TurnSample(
            status=status,
            latency_ms=latency,
            request_id=request_id,
            error=None if status == 200 else detail(payload, "move failed"),
        )
    except (URLError, TimeoutError, OSError) as exc:
        return TurnSample(
            status=0,
            latency_ms=timeout * 1000,
            request_id="",
            error=type(exc).__name__,
        )


def prepare_games(
    base: str,
    players: list[VirtualPlayer],
    rounds: int,
    difficulty: float,
    timeout: float,
) -> list[list[str]]:
    prepared: list[list[str]] = []
    for index, player in enumerate(players):
        games = [create_game(base, player, difficulty, timeout) for _ in range(rounds)]
        prepared.append(games)
        if (index + 1) % 20 == 0 or index + 1 == len(players):
            print(json.dumps({"virtual_setup": {"players_prepared": index + 1, "total": len(players)}}))
    return prepared


def run_player(
    base: str,
    player: VirtualPlayer,
    game_ids: list[str],
    player_index: int,
    think_seconds: float,
    jitter: float,
    timeout: float,
) -> list[TurnSample]:
    rows: list[TurnSample] = []
    for round_index, game_id in enumerate(game_ids):
        time.sleep(think_delay(player_index, round_index, think_seconds, jitter))
        rows.append(run_turn(base, player, game_id, timeout))
    return rows


def summarize_level(
    *,
    players: int,
    rounds: int,
    elapsed: float,
    rows: list[TurnSample],
    think_seconds: float,
) -> dict:
    ok = [row for row in rows if row.status == 200]
    latencies = [row.latency_ms for row in ok]
    status_counts: dict[str, int] = {}
    for row in rows:
        key = str(row.status)
        status_counts[key] = status_counts.get(key, 0) + 1
    total = max(len(rows), 1)
    errors = len(rows) - len(ok)
    return {
        "virtual_players": players,
        "rounds_per_player": rounds,
        "think_seconds_mean": think_seconds,
        "turns": len(rows),
        "successes": len(ok),
        "errors": errors,
        "error_rate": round(errors / total, 4),
        "elapsed_ms": round(elapsed * 1000, 2),
        "completed_turns_rps": round(len(ok) / max(elapsed, 1e-9), 3),
        "nominal_offered_turns_rps": round(players / max(think_seconds, 1e-9), 3) if think_seconds else None,
        "latency_ms": {
            "p50": round(percentile(latencies, 0.50), 2) if latencies else None,
            "p95": round(percentile(latencies, 0.95), 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
            "mean": round(statistics.fmean(latencies), 2) if latencies else None,
        },
        "status_counts": status_counts,
        "sample_request_ids": [row.request_id for row in rows if row.request_id][:3],
    }


def run_level(
    base: str,
    players: list[VirtualPlayer],
    *,
    rounds: int,
    difficulty: float,
    think_seconds: float,
    jitter: float,
    timeout: float,
    warmup_seconds: float,
) -> dict:
    prepared = prepare_games(base, players, rounds, difficulty, timeout)
    if warmup_seconds:
        time.sleep(warmup_seconds)
    started = time.perf_counter()
    rows: list[TurnSample] = []
    with ThreadPoolExecutor(max_workers=len(players), thread_name_prefix="virtual-player") as pool:
        futures = [
            pool.submit(
                run_player,
                base,
                player,
                prepared[index],
                index,
                think_seconds,
                jitter,
                timeout,
            )
            for index, player in enumerate(players)
        ]
        for future in as_completed(futures):
            rows.extend(future.result())
    elapsed = max(time.perf_counter() - started, 1e-9)
    return summarize_level(
        players=len(players),
        rounds=rounds,
        elapsed=elapsed,
        rows=rows,
        think_seconds=think_seconds,
    )


def self_test() -> None:
    assert parse_player_levels("20,50,100") == (20, 50, 100)
    assert parse_player_levels("20,20,50") == (20, 50)
    signed = signed_headers("ci_smoke_0123456789abcdef", "secret")
    assert signed["X-Chess-Synthetic-Source"] == SYNTHETIC_SOURCE
    assert signed["X-Chess-Synthetic-Identity"] == "ci_smoke_0123456789abcdef"
    assert len(signed["X-Chess-Synthetic-Signature"]) == 64
    assert "secret" not in "".join(signed.values())
    assert math.isclose(think_delay(0, 0, 20, 0.0), 20.0)
    delay = think_delay(7, 1, 20, 0.5)
    assert 10.0 <= delay <= 30.0
    try:
        parse_player_levels("20,101")
    except ValueError:
        pass
    else:
        raise AssertionError("the safety cap must reject >100 virtual players")
    print("Virtual player capacity probe self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("CHESS_CAPACITY_BASE_URL", ""))
    parser.add_argument("--invite-code", default=os.getenv("CHESS_CAPACITY_INVITE_CODE", ""))
    parser.add_argument(
        "--synthetic-secret",
        default=os.getenv("CHESS_CAPACITY_SYNTHETIC_SECRET", ""),
    )
    parser.add_argument("--players", default="20,50,100")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--think-seconds", type=float, default=20.0)
    parser.add_argument("--think-jitter", type=float, default=0.5)
    parser.add_argument("--game-difficulty", type=float, default=50)
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--warmup-seconds", type=float, default=5.0)
    parser.add_argument("--cooldown-seconds", type=float, default=15.0)
    parser.add_argument("--stop-p95-ms", type=float, default=5000.0)
    parser.add_argument("--stop-error-rate", type=float, default=0.02)
    parser.add_argument("--allow-production", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if args.rounds < 1 or args.rounds > 3:
        parser.error("--rounds must be between 1 and 3")
    if args.think_seconds < 0:
        parser.error("--think-seconds must be >= 0")
    if not 0 <= args.think_jitter <= 0.9:
        parser.error("--think-jitter must be between 0 and 0.9")
    if not 0 <= args.game_difficulty <= 100:
        parser.error("--game-difficulty must be between 0 and 100")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    try:
        base = api_base(args.base_url)
        require_non_production(base, args.allow_production)
        levels = parse_player_levels(args.players)
        invite_code = str(args.invite_code or "").strip()
        synthetic_secret = str(args.synthetic_secret or "").strip()
        if not invite_code:
            raise ValueError("falta invite code de staging")
        if not synthetic_secret:
            raise ValueError("falta secreto sintético de staging")
    except ValueError as exc:
        print(f"virtual-capacity: {exc}", file=sys.stderr)
        return 2

    players: list[VirtualPlayer] = []
    cleanup_errors: list[str] = []
    results: list[dict] = []
    degraded = False
    baseline_p95: float | None = None

    try:
        max_players = max(levels)
        for index in range(max_players):
            players.append(register_player(base, invite_code, synthetic_secret, args.timeout))
            if (index + 1) % 20 == 0 or index + 1 == max_players:
                print(json.dumps({"virtual_accounts": {"created": index + 1, "total": max_players}}))

        for level in levels:
            row = run_level(
                base,
                players[:level],
                rounds=args.rounds,
                difficulty=args.game_difficulty,
                think_seconds=args.think_seconds,
                jitter=args.think_jitter,
                timeout=args.timeout,
                warmup_seconds=args.warmup_seconds,
            )
            p95 = row["latency_ms"]["p95"]
            if baseline_p95 is None and p95:
                baseline_p95 = p95
            row["p95_amplification_vs_first_level"] = (
                round(p95 / baseline_p95, 2) if p95 and baseline_p95 else None
            )
            print(json.dumps({"virtual_capacity_level": row}, sort_keys=True, separators=(",", ":")))
            results.append(row)

            level_bad = (
                row["error_rate"] > args.stop_error_rate
                or (p95 is not None and args.stop_p95_ms and p95 > args.stop_p95_ms)
            )
            if level_bad:
                degraded = True
                print(json.dumps({
                    "virtual_capacity_stop": {
                        "after_players": level,
                        "reason": "safety threshold reached",
                        "p95_ms": p95,
                        "error_rate": row["error_rate"],
                    }
                }, sort_keys=True, separators=(",", ":")))
                break
            if args.cooldown_seconds and level != levels[-1]:
                time.sleep(args.cooldown_seconds)
    except (RuntimeError, URLError, TimeoutError, OSError) as exc:
        print(f"virtual-capacity harness: {exc}", file=sys.stderr)
        degraded = True
        results.append({"harness_error": type(exc).__name__, "detail": str(exc)[:200]})
    finally:
        for player in reversed(players):
            try:
                cleanup_player(base, player, args.timeout)
            except (RuntimeError, URLError, TimeoutError, OSError) as exc:
                cleanup_errors.append(f"{player.username}:{type(exc).__name__}")

    summary = {
        "base_host": urlsplit(base).hostname,
        "game_difficulty": args.game_difficulty,
        "requested_player_levels": list(levels),
        "rounds_per_player": args.rounds,
        "think_seconds_mean": args.think_seconds,
        "think_jitter": args.think_jitter,
        "stop_p95_ms": args.stop_p95_ms,
        "stop_error_rate": args.stop_error_rate,
        "levels": results,
        "cleanup_ok": not cleanup_errors,
        "cleanup_errors": cleanup_errors[:5],
        "note": (
            "Each virtual player is a distinct signed staging identity. Games are prepared before timing; "
            "latency measures POST /move (human move -> Matthias -> persistence). Escalation stops after "
            "the first level that exceeds the configured p95/error safety threshold."
        ),
    }
    print(json.dumps({"virtual_capacity_summary": summary}, sort_keys=True, separators=(",", ":")))

    if cleanup_errors:
        return 2
    return 1 if degraded else 0


if __name__ == "__main__":
    raise SystemExit(main())
