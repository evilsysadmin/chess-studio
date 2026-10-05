#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's in-memory HTTP window.

backend-python/observability.py keeps the last 5000 requests (method, route
pattern, status, latency, sanitized client release) and summarizes the last
15 minutes and the last hour for Admin's observability panel, with the
process' first observed readiness. This replays fuzzed request streams at a
fixed clock (old events falling out of each window, the ring overflowing,
releases that fail sanitizing, odd methods and routes, readiness probes) and
records get_http_metrics(); backend-go/internal/httpwindow must agree.

    python3 scripts/http_window_parity_corpus.py           # rewrite the fixture
    python3 scripts/http_window_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import observability  # noqa: E402
import observability_history  # noqa: E402
import tracing  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "httpwindow" / "testdata" / "python_http_window_corpus.json"
SEED = 20261005
START = 1_791_200_000.125


class _Clock:
    wall = START
    mono = 50.0

    @classmethod
    def time(cls):
        return cls.wall

    @classmethod
    def perf_counter(cls):
        return cls.mono


METHODS = ["GET", "POST", "put", "DELETE", "", "options", "PATCHPATCHX", "ñ"]
ROUTES = ["/api/games", "/api/games/{game_id}", "/api/narrative", "/api/pvp/match/{match_id}/move", "proxy:python",
          "", "unmatched", "/api/" + "x" * 130, "/api/ñandú"]
RELEASES = ["v42", "v16.6dm46zfrv", "", "  v43  ", "bad release", "-v1", "v" + "1" * 45, "release_2026-10-05.a", None, "ü1"]
STATUSES = [200, 200, 200, 201, 204, 304, 400, 401, 404, 409, 422, 429, 500, 502, 503, 0, 99]


def scenario(rng, index):
    events = []
    count = rng.choice([0, 1, 3, 12, 40, 150, 400]) if index != 3 else 5100
    t = START + rng.uniform(0, 20)
    for _ in range(count):
        t += rng.choice([0.0, 0.001, 0.5, 2.0, 11.0, 61.0, 333.3]) if count < 1000 else 0.2
        latency = rng.choice([0.0, 1.234, 12.345, 99.995, 250.0, 1500.005, 3200.7, -4.0, 18000.0, rng.uniform(0, 4000)])
        # [at, method index, route index, status, latency, release index]
        events.append([t, rng.randrange(len(METHODS)), rng.randrange(len(ROUTES)), rng.choice(STATUSES), latency,
                       rng.randrange(len(RELEASES))])
    ready = []
    for _ in range(rng.choice([0, 0, 1, 2])):
        ready.append(rng.uniform(0.0, 9.0))
    now = (events[-1][0] if events else START) + rng.choice([0.0, 1.0, 600.0, 900.0, 901.0, 3599.0, 3600.0, 3601.0, 7200.0])
    if index == 1:
        now = START + 0.25
    return {"events": events, "ready": sorted(ready), "now": now}


def run(case):
    observability.reset_http_metrics()
    observability._FIRST_READY_OBSERVED_MS = None
    _Clock.wall, _Clock.mono = START, 50.0
    observability.PROCESS_STARTED_AT = START
    observability.PROCESS_STARTED_MONOTONIC = 50.0
    ready_results = []
    events = list(case["events"])
    for delay in case["ready"]:
        _Clock.mono = 50.0 + delay
        ready_results.append(list(observability.record_process_ready()))
    for at, method, route, status, latency, release in events:
        _Clock.wall = at
        observability.record_http_request(METHODS[method], ROUTES[route], status, latency, client_release=RELEASES[release])
    _Clock.wall = case["now"]
    raw = json.dumps(observability.get_http_metrics(), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    out = {"readyResults": ready_results}
    if len(raw) <= 6000:
        out["response"] = raw
    else:
        out["sha256"], out["length"] = hashlib.sha256(raw.encode()).hexdigest(), len(raw.encode())
    return out


def build():
    observability.time = _Clock
    # Only the window is under test: the history and OTLP hooks stay out.
    observability_history.record_http_event = lambda *a, **k: None
    tracing.record_http_otel = lambda *a, **k: None
    rng = random.Random(SEED)
    cases = []
    for i in range(60):
        case = scenario(rng, i)
        cases.append({**case, **run(case)})
    return {"start": START, "methods": METHODS, "routes": ROUTES, "releases": RELEASES, "cases": cases}


def render(corpus):
    rows = ",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in corpus["cases"])
    head = {k: corpus[k] for k in ("start", "methods", "routes", "releases")}
    return json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"cases":[\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/http_window_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
