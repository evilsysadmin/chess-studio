#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's observability history read.

backend-python/observability_history.py's get_history merges the legacy
hourly buckets and the 5-minute ones that both runtimes $inc/$max into
MongoDB, then summarizes them for Admin's panel. The documents are shared and
loosely typed, so this fuzzes realistic and malformed buckets (counters that
became floats, bools, strings, numbers where dicts were, undecodable keys,
unaligned and float ids, a cursor that fails half way) and ranges (ISO
strings in every shape fromisoformat accepts or rejects, open ends, limits),
and records Python's answer, or the exception it raised (a ValueError is the
route's 400 with its message; anything else is the generic 500).
backend-go/internal/obshistory must agree.

    python3 scripts/observability_history_read_parity_corpus.py           # rewrite the fixture
    python3 scripts/observability_history_read_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import db  # noqa: E402
import observability_history as oh  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "obshistory" / "testdata" / "python_history_read_corpus.json"
SEED = 20261005
NOW = datetime(2026, 10, 5, 12, 7, 31, 250000, tzinfo=timezone.utc)
NOW_TS = NOW.timestamp()
RAISE = "__cursor_raises__"


class _Clock:
    @staticmethod
    def time() -> float:
        return NOW_TS


class _CursorError(Exception):
    pass


class _Collection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):
        lower, upper = query["_id"]["$gte"], query["_id"]["$lte"]
        docs = self.docs

        async def gen():
            for doc in docs:
                if doc.get(RAISE):
                    raise _CursorError("cursor")
                if lower <= doc["_id"] <= upper:
                    yield doc
        return gen()


class _Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return _Collection(self.collections.get(name, []))


def key(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


ODD_KEYS = ["%%", "é", "YQ", "YQ=", "Y", "_-_", "YWJj!ZA", "w6k", "7Q", "=", "YW=Jj", "+/8", "____", "Y=Q", "gA"]
HIST_HTTP = ["le_25", "le_50", "le_100", "le_250", "le_500", "le_1000", "le_2500", "le_5000", "le_10000", "le_20000", "inf"]
HIST_FRONT = ["le_10", "le_50", "le_100", "le_150", "le_250", "le_500", "le_800", "le_1000", "le_1500", "le_2000", "le_2500", "le_4000", "le_6000", "le_10000", "le_20000", "inf"]


def number(rng, high=50):
    roll = rng.random()
    if roll < 0.75:
        return rng.randint(0, high)
    if roll < 0.85:
        return float(rng.randint(0, high))
    if roll < 0.93:
        return round(rng.uniform(0, high), rng.choice([1, 2, 3]))
    return -rng.randint(1, 5)


def corrupt(rng, value, depth=0):
    roll = rng.random()
    if roll > 0.025:
        return value
    return rng.choice([True, False, "7", "x", None, [], [1], {}, 0, 0.0, 3, 2.5,
                       {"a": 1} if depth < 2 else 1])


def hist(rng, keys):
    out = {}
    for k in rng.sample(keys, rng.randint(0, min(5, len(keys)))):
        out[k] = corrupt(rng, number(rng, 30))
    if rng.random() < 0.05:
        out["le_99"] = 4
    return out


def label(rng, choices):
    if rng.random() < 0.12:
        return rng.choice(ODD_KEYS)
    return key(rng.choice(choices))


def row(rng, max_key="latency_max_ms"):
    doc = {"requests": number(rng), "errors_5xx": number(rng, 5), "latency_hist": hist(rng, HIST_HTTP),
           max_key: round(rng.uniform(0, 40000), 2)}
    for k in list(doc):
        if rng.random() < 0.15:
            del doc[k]
        else:
            doc[k] = corrupt(rng, doc[k], 1)
    return doc


ROUTES = ["GET /api/games", "POST /api/narrative", "GET /api/pulse", "GET /api/admin/users", "PUT /api/profile",
          "GET /api/chronicles/maps/{id}", "GET /api/ready", "POST /api/pvp/match/{id}/move"]
RELEASES = ["v42", "v43", "2026.10.05-a", "v1"]
REASONS = ["timeout", "circuit_open", "invalid_output", "worker_error", "shed", "ok"]
EVENTS = ["player_portrait", "matthias_daily", "comment", "analysis"]
METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB", "cls", "ß", "lcp"]


def section_http(rng):
    doc = {"samples": number(rng, 400), "status_2xx": number(rng, 300), "status_4xx": number(rng, 30),
           "status_5xx": number(rng, 10), "latency_hist": hist(rng, HIST_HTTP),
           "latency_max_ms": round(rng.uniform(0, 30000), 2),
           "routes": {label(rng, ROUTES): row(rng) for _ in range(rng.randint(0, 6))},
           "releases": {label(rng, RELEASES): row(rng) for _ in range(rng.randint(0, 3))}}
    return doc


def counters(rng, names, n):
    return {label(rng, names): corrupt(rng, number(rng, 9)) for _ in range(rng.randint(0, n))}


def section_ai(rng):
    channels = {}
    for _ in range(rng.randint(0, 3)):
        channels[label(rng, ["portrait", "daily", "comment"])] = corrupt(rng, {
            "samples": number(rng), "cloudflare": number(rng), "local": number(rng),
            "latency_hist": hist(rng, HIST_HTTP), "latency_max_ms": round(rng.uniform(0, 30000), 1),
            "reasons": counters(rng, REASONS, 4)}, 1)
    return {"samples": number(rng, 60), "cloudflare": number(rng, 50), "local": number(rng, 10),
            "latency_hist": hist(rng, HIST_HTTP), "latency_max_ms": round(rng.uniform(0, 30000), 2),
            "input_tokens": number(rng, 90000), "output_tokens": number(rng, 20000),
            "reasons": counters(rng, REASONS, 7), "event_types": counters(rng, EVENTS, 5),
            "request_kinds": counters(rng, ["portrait_admin", "matthias_preview_veteran", "comment"], 4),
            "models": counters(rng, ["@cf/meta/llama", "@cf/qwen"], 2),
            "worker_errors": counters(rng, ["5xx", "parse"], 2), "channels": channels}


def section_frontend(rng):
    metrics = {}
    for _ in range(rng.randint(0, 4)):
        metrics[label(rng, METRICS)] = corrupt(rng, {"samples": number(rng), "hist": hist(rng, HIST_FRONT),
                                                     "value_max": round(rng.uniform(0, 30000), 3)}, 1)
    return {"samples": number(rng, 90), "errors": number(rng, 9), "event_types": counters(rng, ["vital", "error"], 3),
            "error_names": counters(rng, ["TypeError", "ChunkLoadError"], 2),
            "contexts": counters(rng, ["home", "war-room"], 3), "releases": counters(rng, RELEASES, 2),
            "metrics": metrics}


def strip_some(rng, doc):
    for k in list(doc):
        if rng.random() < 0.1:
            del doc[k]
        else:
            doc[k] = corrupt(rng, doc[k])
    return doc


def bucket(rng, ident):
    doc = {"_id": ident, "bucket_start": "ignored", "schema": 1}
    for name, make in (("http", section_http), ("ai", section_ai),
                       ("presence", lambda r: {"samples": number(r), "online_sum": number(r, 900), "online_max": number(r, 40)}),
                       ("frontend", section_frontend)):
        if rng.random() < 0.85:
            doc[name] = strip_some(rng, make(rng))
        elif rng.random() < 0.5:
            doc[name] = rng.choice([None, 0, "", [], 5, True, "x", [1], 2.5])
    return doc


def collection(rng, size, count, spread):
    used, docs = set(), []
    base = int(NOW_TS) - int(NOW_TS) % size
    for _ in range(count):
        roll = rng.random()
        if roll < 0.8:
            ident = base - size * rng.randint(-2, spread)
        elif roll < 0.9:
            ident = base - rng.randint(-600, spread * size)
        else:
            ident = base - size * rng.randint(0, spread) + 0.5
        if ident in used:
            continue
        used.add(ident)
        docs.append(bucket(rng, ident))
    return docs


def iso(ts, fmt="z", offset_minutes=0):
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    if fmt == "z":
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    if fmt == "naive":
        return dt.replace(tzinfo=None).isoformat()
    return dt.astimezone(timezone(timedelta(minutes=offset_minutes))).isoformat()


def ranges(rng, first):
    out = []
    if first:
        out += [(None, None), (iso(NOW_TS - 3600), None), (None, iso(NOW_TS - 3600)), ("", ""), ("  ", None), (None, "  "),
                ("abc", None), (None, "2026-02-30"), (iso(NOW_TS), iso(NOW_TS - 1)), (iso(NOW_TS - 91 * 86400), None),
                (iso(NOW_TS + 400), iso(NOW_TS + 900)), ("0001-01-01T00:00+05:00", None), (None, "9999-12-31T23:00-05:00"),
                ("1960-01-01", "1960-01-02T00:00:00"), (iso(NOW_TS - 7200, "off", 120), iso(NOW_TS, "off", -330)),
                (iso(NOW_TS - 7201, "naive"), iso(NOW_TS, "naive")), ("2026-10-05T10:00:00.999999Z", "2026-10-05T12:00:00.5+00:00:00.25"),
                ("2026-W40-1", "2026-W41"), ("2026-10-05T12:00+25:00", None), (None, "2026-10-05T24:00"),
                (iso(NOW_TS - 12 * 3600), None), (iso(NOW_TS - 12 * 3600 - 1), None), (iso(NOW_TS - 48 * 3600), None),
                (iso(NOW_TS - 48 * 3600 - 1), None), (iso(NOW_TS - 90 * 86400), iso(NOW_TS)), ("20261005T0000", "20261005T1200Z"),
                (" 2026-10-05T00:00Z ", None), ("2026-10-05T00:00ZZ", None), ("1969-12-31T23:00Z", "1970-01-01T00:30Z"),
                ("1969-12-31T23:59:58.5Z", "1970-01-01T00:10Z"), ("1969-12-31T23:00Z", "1969-12-31T23:59:59.5Z")]
    for _ in range(4):
        span = rng.choice([600, 3600, 7200, 7201, 6 * 3600, 43200, 86400, 2 * 86400, 3 * 86400, 10 * 86400])
        end = NOW_TS - rng.randint(-200, 3 * 86400)
        fmt = rng.choice(["z", "naive", "off"])
        out.append((iso(end - span, fmt, rng.choice([0, 60, -90, 330])), iso(end, fmt, rng.choice([0, 120, -300]))))
    return out


def run(collections, from_value, to_value, database=True):
    async def fake_get_db():
        return _Database(collections) if database else None

    db.get_db = fake_get_db
    try:
        result = asyncio.run(oh.get_history(from_value, to_value))
    except ValueError as exc:
        return {"error": "ValueError", "message": str(exc)}
    except Exception as exc:  # noqa: BLE001 - the route's generic 500
        return {"error": type(exc).__name__}
    raw = json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return {"response": raw} if len(raw) <= 1500 else {"sha256": hashlib.sha256(raw.encode()).hexdigest(), "length": len(raw.encode())}


def build() -> dict:
    oh.time = _Clock
    oh.reset_history_for_tests()
    rng = random.Random(SEED)
    scenarios = []
    base = int(NOW_TS) - int(NOW_TS) % 300
    channel = {"samples": 4, "cloudflare": 3, "local": 1, "latency_hist": {"le_250": 3, "inf": 1}, "latency_max_ms": 30500.5,
               "reasons": {"YQ": 2, "YQ=": 3, "%%": 1}}
    handmade = [{"_id": base - 600, "ai": {"samples": 4, "channels": {"YQ": channel, "YQ=": {**channel, "samples": 9}, "x": 5}},
                 "frontend": {"metrics": {key("lcp"): {"samples": 2, "hist": {"le_800": 2}}, key("LCP"): {"samples": 1, "hist": {"inf": 1}, "value_max": 31000}},
                              "contexts": {"YQ": 1, "YQ=": 1, "Yg": 2}}},
                {"_id": base - 300, "http": {"routes": {"YQ": {"requests": 2}, "YQ=": {"requests": 2}}}}]
    scenarios.append({"database": True, "legacy": [], "current": handmade, "cases": [
        {"from": None, "to": None, **run({oh.COLLECTION_NAME: handmade}, None, None)}]})
    for i in range(80):
        legacy = collection(rng, 3600, rng.randint(0, 4), 80)
        current = collection(rng, 300, rng.randint(0, 14), 900)
        if i % 17 == 5 and current:
            current.insert(rng.randrange(len(current) + 1), {"_id": -1, RAISE: True})
        database = i % 23 != 7
        cases = []
        for from_value, to_value in ranges(rng, i == 0):
            cases.append({"from": from_value, "to": to_value, **run({oh.LEGACY_COLLECTION_NAME: legacy, oh.COLLECTION_NAME: current}, from_value, to_value, database)})
        scenarios.append({"database": database, "legacy": legacy, "current": current, "cases": cases})
    return {"now": NOW.isoformat(), "scenarios": scenarios}


def render(corpus: dict) -> str:
    rows = ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in corpus["scenarios"])
    return '{"now":' + json.dumps(corpus["now"]) + ',"scenarios":[\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/observability_history_read_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
