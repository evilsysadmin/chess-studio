#!/usr/bin/env python3
"""Cross-language parity corpus for the Admin observability history.

Python (backend-python/observability_history.py) and the Go edge
(backend-go/internal/obshistory) add to the same 5-minute buckets in
observability_5min_v2 with $inc/$max. This records, for a deterministic
sequence of HTTP, presence and frontend samples, exactly the $inc and $max
deltas Python would flush per bucket; Go must produce the same field paths
and values so both writers merge into one coherent history.

    python3 scripts/observability_history_parity_corpus.py           # rewrite the fixture
    python3 scripts/observability_history_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import observability_history as history  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "obshistory" / "testdata" / "python_history_corpus.json"
SEED = 20261004
START = 1_790_000_000  # bucket-aligned enough; samples spread over 3 buckets
ROUTES = ["/api/games/{game_id}", "/api/analyze", "/api/pvp/lobby", "/api/status", "/" + "x" * 130, "/api/ñandú"]
METHODS = ["GET", "post", "DELETE", "OPTIONSXYZ", ""]
STATUSES = [200, 201, 204, 301, 400, 401, 404, 429, 500, 503, 0]
RELEASES = ["", "v16.6dm46j", "v17.0abc", "r" * 50]
EVENTS = ["web_vital", "frontend_error", "unhandled_rejection", ""]
METRICS = ["LCP", "cls", "INP", "FCP", "TTFB", ""]


def build() -> dict:
    rng = random.Random(SEED)
    history.reset_history_for_tests()
    samples = []
    for i in range(240):
        at = START + rng.randint(0, 3 * history.BUCKET_SECONDS - 1)
        kind = rng.choice(["http", "http", "http", "presence", "frontend"])
        if kind == "http":
            sample = {
                "kind": "http",
                "at": at,
                "method": rng.choice(METHODS),
                "route": rng.choice(ROUTES),
                "status": rng.choice(STATUSES),
                "latencyMs": rng.choice([0.0, 3.5, 25.0, 25.01, 260.0, 999.9, 4800.0, 25000.0, round(rng.uniform(0, 30000), 3)]),
                "release": rng.choice(RELEASES),
            }
            history.record_http_event(
                sample["method"], sample["route"], sample["status"], sample["latencyMs"],
                client_release=sample["release"] or None, timestamp=at,
            )
        elif kind == "presence":
            sample = {"kind": "presence", "at": at, "online": rng.choice([0, 1, 3, 17, 42])}
            history.record_presence_snapshot(sample["online"], timestamp=at)
        else:
            metric = rng.choice(METRICS)
            value = rng.choice([None, 0.0, 0.08, 0.31, 850.0, 2600.0, 30000.0])
            sample = {
                "kind": "frontend",
                "at": at,
                "eventType": rng.choice(EVENTS),
                "metricName": metric,
                "value": value,
                "errorName": rng.choice(["", "TypeError", "ChunkLoadError"]),
                "context": rng.choice(["", "home", "war-room"]),
                "release": rng.choice(RELEASES),
            }
            history.record_frontend_event(
                sample["eventType"], metric_name=metric or None, value=value,
                error_name=sample["errorName"] or None, context=sample["context"] or None,
                release=sample["release"] or None, timestamp=at,
            )
        samples.append(sample)
    # AI narrative events (narrative_cloudflare._record), seeded apart so the
    # samples above stay as they were.
    ai_rng = random.Random(SEED + 1)
    for i in range(140):
        at = START + ai_rng.randint(0, 3 * history.BUCKET_SECONDS - 1)
        event = {
            "at": at,
            "provider": ai_rng.choice(["cloudflare", "cloudflare", "local", "", "c" * 40]),
            "event_type": ai_rng.choice(["matthias_daily", "player_portrait", "blunder", "", "e" * 60]),
            "request_kind": ai_rng.choice(["default", "portrait_manual", "", "k" * 40]),
            "channel": ai_rng.choice(["comments", "analysis", "player_portrait", "", None]),
            "latency_ms": ai_rng.choice([0.0, 12.5, 25.0, 480.25, 2600.0, 21000.0, round(ai_rng.uniform(0, 9000), 2)]),
            "reason": ai_rng.choice(["ok", "timeout", "http_500", "ungrounded_dama", "", "r" * 70]),
            "input_tokens": ai_rng.choice([0, 120, 845, None]),
            "output_tokens": ai_rng.choice([0, 64, 300, None]),
            "model": ai_rng.choice([None, "", "@cf/qwen/qwen3-30b-a3b-fp8", "m" * 100]),
            "worker_error": ai_rng.choice([None, "", "AiError:InferenceUpstreamError:3040", "w" * 90]),
        }
        history.record_ai_event(event)
        samples.append({"kind": "ai", **event})
    buckets = {}
    for key, bucket in sorted(history._PENDING.items()):
        incs, maxima = history._mongo_update(bucket)
        buckets[str(key)] = {"inc": incs, "max": maxima}
    history.reset_history_for_tests()
    return {
        "generator": "scripts/observability_history_parity_corpus.py",
        "seed": SEED,
        "samples": samples,
        "buckets": buckets,
    }


def render(corpus: dict) -> str:
    return json.dumps(corpus, indent=1, sort_keys=True, ensure_ascii=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/observability_history_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
