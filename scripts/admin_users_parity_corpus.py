#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's user tools.

Seeds accounts, profile snapshots and Matthias memories into the Python
stores' in-memory mode (which answers like the Mongo path), fixes the clock
and the IP→country cache, and replays admin_api.py's user routes: the user
list (presence, foreground, network status, profile summary), matchmaking
telemetry, ELO correction with its audit, insights, Matthias memory tools
and account deletion, with the admin gate, target resolution (exact,
lowercase, casefold) and pydantic errors. backend-go/internal/gamesapi
replays the same seeds and steps and must answer the same bytes.

    python3 scripts/admin_users_parity_corpus.py           # rewrite the fixture
    python3 scripts/admin_users_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import admin_api  # noqa: E402
import admin_insights  # noqa: E402
import matthias_memory_store  # noqa: E402
import profile_store  # noqa: E402
import users_store  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "gamesapi" / "testdata" / "python_admin_users_corpus.json"
NOW = datetime(2026, 10, 5, 12, 0, 0, 500000, tzinfo=timezone.utc)
ADMIN = "root"
CACHED_COUNTRIES = {"8.8.8.8": "US", "2001:4860:4860::8888": "US"}

_spec = importlib.util.spec_from_file_location("insights_corpus", ROOT / "scripts" / "admin_insights_parity_corpus.py")
_insights = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_insights)


class _FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz is not None else NOW.replace(tzinfo=None)


class _NoLimiter:
    def limit(self, _value):
        return lambda endpoint: endpoint


async def _auth(request: Request):
    raw = request.headers.get("Authorization") or ""
    if not raw.startswith("Bearer "):
        raise HTTPException(401, "auth")
    return raw.removeprefix("Bearer ")


async def _admin(request: Request):
    username = await _auth(request)
    if username != ADMIN:
        raise HTTPException(403, "No tienes permisos de administrador.")
    return username


def _ago(**delta) -> str:
    return (NOW - timedelta(**delta)).isoformat()


def _users() -> dict[str, dict]:
    return {
        ADMIN: {"created_at": _ago(days=90), "last_activity": _ago(seconds=10), "last_client_ip": "10.0.0.1"},
        "alice": {"created_at": _ago(days=30), "last_activity": _ago(seconds=200), "current_activity": "Partida vs CPU",
                  "client_release": "v42", "last_client_ip": "8.8.8.8", "presence_online": True,
                  "is_foreground": True, "foreground_updated_at": _ago(seconds=20)},
        "bob": {"created_at": _ago(days=3), "last_login": _ago(seconds=400), "last_client_ip": "1.1.1.1",
                "is_foreground": False, "foreground_updated_at": _ago(seconds=400)},
        "carol": {"created_at": _ago(days=1), "last_activity": (NOW - timedelta(seconds=800)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "last_client_ip": "2001:4860:4860::8888", "presence_online": False, "is_foreground": "yes"},
        "MixedCase": {"created_at": _ago(days=7), "last_activity": "not-a-date", "last_client_ip": "garbage",
                      "last_client_country": "es", "foreground_updated_at": "bad", "is_foreground": True},
        "Straße": {"created_at": _ago(days=400), "last_activity": _ago(days=2), "last_client_ip": "",
                   "last_client_country": None},
        "dave": {"created_at": (NOW - timedelta(seconds=30)).replace(tzinfo=None).isoformat(), "last_client_ip": "100.64.0.9"},
        "erin": {"last_activity": (NOW + timedelta(minutes=5)).isoformat(), "last_client_ip": "192.0.0.9",
                 "foreground_updated_at": (NOW + timedelta(seconds=30)).isoformat(), "is_foreground": True},
        "frank": {},
        "Eve": {"created_at": _ago(seconds=300), "last_activity": _ago(seconds=300), "is_foreground": True,
                "foreground_updated_at": _ago(seconds=150)},
        "eve": {"created_at": _ago(seconds=301), "last_activity": _ago(seconds=301), "is_foreground": True,
                "foreground_updated_at": _ago(seconds=151), "last_client_ip": "9.9.9.9", "last_client_country": "DE"},
        "gina": {"last_activity": _ago(seconds=900), "last_login": _ago(seconds=10)},
        "ivan": {"last_activity": _ago(seconds=150)},
        "hank": {"last_activity": _ago(seconds=901), "last_client_ip": "8.8.4.4", "last_client_country": ""},
    }


def _profiles() -> dict[str, dict]:
    rng = random.Random(4242)
    fuzz = [_insights.profile(rng, i) for i in range(40)]
    readable = [p for p in fuzz if p and p.get("data")]

    def safe(profile):
        try:
            admin_insights._extract_summary_stats(profile)
            json.dumps(admin_insights._extract_summary_stats(profile), allow_nan=False)
            return True
        except Exception:
            return False

    good = [p for p in readable if safe(p)]
    profiles = {
        "alice": {"data": {**good[0]["data"], "chess-study-player-rating": json.dumps({"rating": 1432.5, "games": 12}),
                           "chess-study-admin-rating-audit": json.dumps([{"date": "x", "source": "admin", "note": "café"}] * 50)},
                  "revisions": {"chess-study-player-rating": 3}},
        "bob": {"data": {**good[1]["data"], "chess-study-player-rating": "{broken", "chess-study-admin-rating-audit": "{}"}},
        "carol": {"data": good[2]["data"]},
        "MixedCase": {"data": {**good[3]["data"], "chess-study-player-rating": json.dumps({"rating": "1600", "games": "x"})}},
        ADMIN: {"data": {"chess-study-player-rating": json.dumps({"rating": None, "games": -3})}},
        "erin": {"data": {"chess-study-player-rating": json.dumps([1, 2])}},
    }
    internal = {}
    for name, item in profiles.items():
        internal[name] = {"_id": name, "data": item["data"], "__profile_meta__": {
            "key_revisions": item.get("revisions", {}), "write_revision": 4}}
    return internal


MEMORIES = {
    "alice": {"_id": "alice", "schema_version": 4, "consultation_count": 3, "mood": "impressed",
              "last_consulted_at": "2026-10-01T10:00:00+00:00"},
    "MixedCase": {"_id": "MixedCase", "consultation_count": "x"},
}


def build() -> dict:
    users_store._memory_users.clear()
    for name, doc in _users().items():
        users_store._memory_users[name] = {"username": name, **doc}
    profile_store._memory_profiles.clear()
    profiles = _profiles()
    profile_store._memory_profiles.update(json.loads(json.dumps(profiles)))
    matthias_memory_store._memory.clear()
    matthias_memory_store._memory.update(json.loads(json.dumps(MEMORIES)))
    for module in (admin_insights, admin_api, matthias_memory_store, profile_store, users_store):
        module.datetime = _FixedDatetime
    scheduled: list[str] = []
    admin_api.cached_country_code = lambda ip: CACHED_COUNTRIES.get(ip)
    admin_api.schedule_country_resolution = lambda ip: scheduled.append(ip) or True

    app = FastAPI()
    app.include_router(admin_api.build_admin_router(auth_dependency=_auth, admin_dependency=_admin, limiter=_NoLimiter()))
    # Unhandled exceptions are main.py's generic 500 in production; only the status is pinned.
    client = TestClient(app, raise_server_exceptions=False)
    steps: list[dict] = []

    def step(method, path, body=None, user=ADMIN, label=""):
        headers = {"Authorization": f"Bearer {user}"}
        content = None
        if body is not None:
            content = (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)).encode("utf-8")
            headers["Content-Type"] = "application/json"
        before = len(scheduled)
        response = client.request(method, path, content=content, headers=headers)
        raw = response.content
        entry = {"label": label, "method": method, "path": path, "user": user,
                 "body": None if body is None else (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)),
                 "status": response.status_code, "scheduled": scheduled[before:]}
        if len(raw) <= 20000:
            entry["response"] = raw.decode("utf-8")
        else:
            entry["sha256"] = hashlib.sha256(raw).hexdigest()
            entry["length"] = len(raw)
        steps.append(entry)

    step("GET", "/api/admin/users", label="users")
    step("GET", "/api/admin/users", user="alice", label="users not admin")
    step("GET", "/api/admin/matchmaking-telemetry", label="matchmaking")
    for body in [{"username": "alice"}, {"username": " ALICE "}, {"username": "mixedcase"}, {"username": "STRASSE"}, {"username": "STRAßE"}, {"username": "EVE"}, {"username": "Eve"},
                 {"username": "nobody"}, {"username": "  "}, {"username": ""}, {"username": "x" * 65}, {"username": 5},
                 {}, [], {"username": "bob", "extra": 1}]:
        step("POST", "/api/admin/user-insights", body, label=f"insights {json.dumps(body)[:40]}")
    step("GET", "/api/admin/users/carol/insights", label="insights path")
    step("GET", "/api/admin/users/Frank/insights", label="insights path no profile")
    step("GET", "/api/admin/users/carol/insights", user="bob", label="insights path not admin")
    for body in [{"username": "alice", "rating": 1500}, {"username": "bob", "rating": "1600"}, {"username": "MixedCase", "rating": 1700.0},
                 {"username": "frank", "rating": 400}, {"username": ADMIN, "rating": 3000}, {"username": "erin", "rating": 1234},
                 {"username": "alice", "rating": 399}, {"username": "alice", "rating": 3001}, {"username": "alice", "rating": 1500.5},
                 {"username": "alice"}, {"rating": 1500}, {"username": "nobody", "rating": 1500}, {"username": "alice", "rating": None}]:
        step("POST", "/api/admin/user-rating", body, label=f"rating {json.dumps(body)[:50]}")
    step("POST", "/api/admin/user-insights", {"username": "alice"}, label="insights after rating")
    for body in [{"username": "alice"}, {"username": "mixedcase"}, {"username": "frank"}]:
        step("POST", "/api/admin/matthias/memory", body, label=f"memory {body['username']}")
    step("POST", "/api/admin/matthias/reset-memory", {"username": "ALICE"}, label="reset memory")
    step("POST", "/api/admin/matthias/memory", {"username": "alice"}, label="memory after reset")
    step("POST", "/api/admin/delete-user", {"username": ADMIN}, label="delete self")
    step("POST", "/api/admin/delete-user", {"username": "Dave"}, label="delete")
    step("POST", "/api/admin/delete-user", {"username": "dave"}, label="delete again")
    step("POST", "/api/admin/delete-user", {"username": "dave"}, user="alice", label="delete not admin")
    step("GET", "/api/admin/users", label="users after")
    rated = ["alice", "bob", "MixedCase", "frank", ADMIN, "erin"]
    stored = {name: {key: profile_store._memory_profiles[name]["data"].get(key)
                     for key in ("chess-study-player-rating", "chess-study-admin-rating-audit")} for name in rated}
    return {
        "now": NOW.isoformat(),
        "stored": stored,
        "users": [{"_id": name, **doc} for name, doc in _users().items()],
        "profiles": list(profiles.values()),
        "memories": list(MEMORIES.values()),
        "countries": CACHED_COUNTRIES,
        "steps": steps,
    }


def render(corpus: dict) -> str:
    head = {k: corpus[k] for k in ("now", "users", "profiles", "memories", "countries", "stored")}
    rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus["steps"])
    return json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',\n"steps":[\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/admin_users_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
