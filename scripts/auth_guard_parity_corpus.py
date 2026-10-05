#!/usr/bin/env python3
"""Cross-language parity corpus for the auth brute-force guards.

backend-python/auth_login_guard.py (per login identity: 20 failures in 10
minutes block 5 minutes) and auth_ip_guard.py (per client IP: 10 failures
block 15 minutes) share one state machine and keyed fingerprints. This
records fingerprints for sample identities and IPs, and state transitions
and Retry-After values for sequences of failures over time;
backend-go/internal/authguard must agree.

    python3 scripts/auth_guard_parity_corpus.py           # rewrite the fixture
    python3 scripts/auth_guard_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import auth_ip_guard  # noqa: E402
import auth_login_guard  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "authguard" / "testdata" / "python_guard_corpus.json"
SEED = 20261005
SECRET = "guard-corpus-secret-0123456789abcdef"
START = datetime(2026, 10, 5, 12, 0, 0, 123000, tzinfo=timezone.utc)


def iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def encode_state(state):
    return {k: iso(v) for k, v in state.items()} if state else None


def build() -> dict:
    rng = random.Random(SEED)
    identities = [{"input": name, "key": auth_login_guard.identity_key(name, SECRET)}
                  for name in ["alice", "  Alice ", "ñandú", "bob@example.com", ""]]
    ips = [{"input": ip, "key": auth_ip_guard.ip_key(ip, SECRET)}
           for ip in ["203.0.113.9", "2001:db8::1", "2001:0db8:0000::0001", "::ffff:192.0.2.1"]]
    sequences = []
    for module in (auth_login_guard, auth_ip_guard):
        for sequence in range(12):
            burst = sequence % 2 == 0
            now = START
            state = None
            steps = []
            for _ in range(rng.randint(15, 60)):
                now += timedelta(seconds=rng.choice([0.4, 1, 2, 5, 9.5, 61] if burst else [0.4, 1, 1, 2, 5, 5, 10, 30, 61, 299.9, 300, 600, 900, 3600]))
                if rng.random() < 0.1 and state:
                    # Documents read back from Mongo lose microseconds.
                    state = {k: (v.replace(microsecond=(v.microsecond // 1000) * 1000) if isinstance(v, datetime) else v)
                             for k, v in state.items()}
                retry_before = module.retry_after_seconds(state, now=now)
                state = module.state_after_failure(state, now=now)
                steps.append({
                    "now": now.isoformat(),
                    "retryBefore": retry_before,
                    "state": encode_state(state),
                    "retryAfter": module.retry_after_seconds(state, now=now),
                })
            sequences.append({"guard": module.__name__, "steps": steps})
    odd = []
    for doc in [None, {}, {"failures": "x"}, {"failures": -3, "window_started_at": START.isoformat()},
                {"failures": 5, "window_started_at": "2026-10-05T11:55:00Z"},
                {"failures": 19, "window_started_at": START.isoformat(), "blocked_until": None},
                {"failures": 9, "window_started_at": "not a date"}]:
        odd.append({"doc": doc, "now": START.isoformat(),
                    "login": encode_state(auth_login_guard.state_after_failure(doc, now=START)),
                    "ip": encode_state(auth_ip_guard.state_after_failure(doc, now=START))})
    return {"generator": "scripts/auth_guard_parity_corpus.py", "secret": SECRET, "identities": identities,
            "ips": ips, "sequences": sequences, "odd": odd}


def render(corpus: dict) -> str:
    return json.dumps(corpus, indent=1, ensure_ascii=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/auth_guard_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
