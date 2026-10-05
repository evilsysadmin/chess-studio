#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's feedback routes.

Seeds feedback rows into backend-python/feedback_store.py's in-memory store
(which answers like the Mongo path) and replays a flow through
admin_api.py's router: the list, the summary, attachments, status changes,
replies and deletion, with the admin gate and pydantic's body and path
errors. Every answer is recorded byte for byte; backend-go/internal/gamesapi
replays the same seeds and steps.

    python3 scripts/admin_feedback_parity_corpus.py           # rewrite the fixture
    python3 scripts/admin_feedback_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import admin_api  # noqa: E402
import feedback_store  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "gamesapi" / "testdata" / "python_admin_feedback_corpus.json"
START = datetime(2026, 10, 5, 9, 30, 0, 250000, tzinfo=timezone.utc)
ADMIN = "root"
PNG = b"\x89PNG\r\n\x1a\n" + bytes(range(40))


class Clock:
    now = START


class _FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return Clock.now


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


class _NoLimiter:
    # The admin routes only use the default limit; submit_feedback is not replayed.
    def limit(self, _value):
        return lambda endpoint: endpoint


async def _no_collection():
    return None


def _seeds() -> list[dict]:
    def row(n, username, status, *, attachments=(), reply=None, context="Home"):
        created = (START - timedelta(hours=10 - n)).isoformat()
        return {
            "id": f"{n:032x}", "username": username, "category": ["bug", "idea", "ux", "general"][n % 4],
            "message": f"Mensaje {n} con acentos: canción", "context": context, "attachments": list(attachments),
            "status": status, "admin_reply": reply, "replied_at": created if reply else None,
            "created_at": created, "updated_at": created,
        }
    shot = {"name": "captura.png", "mime_type": "image/png", "size": len(PNG), "data": PNG}
    odd = {"name": 'a"b\r\nc.png', "mime_type": "image/png", "size": 12, "data": PNG[:12]}
    bare = {"size": 11, "data": b"GIF89a....."}  # API rows always carry their size
    return [
        row(1, "alice", "new", attachments=[shot, odd]),
        row(2, "bob", "read"),
        row(3, "alice", "resolved", reply="Gracias", context="Partida"),
        row(4, "carol", "new", attachments=[bare]),
        row(5, "bob", "new"),
    ]


def _render_seed(row: dict) -> dict:
    out = dict(row)
    out["attachments"] = [
        {**{k: v for k, v in item.items() if k != "data"}, "data": base64.b64encode(item["data"]).decode("ascii")}
        for item in row["attachments"]
    ]
    return out


def build() -> dict:
    feedback_store._memory_feedback.clear()
    feedback_store._get_collection = _no_collection
    feedback_store.datetime = _FixedDatetime
    seeds = _seeds()
    for row in seeds:
        feedback_store._memory_feedback[row["id"]] = dict(row)
    app = FastAPI()
    app.include_router(admin_api.build_admin_router(auth_dependency=_auth, admin_dependency=_admin, limiter=_NoLimiter()))
    client = TestClient(app)
    steps: list[dict] = []

    def step(method, path, *, user=ADMIN, body=None, label=""):
        Clock.now = START + timedelta(minutes=len(steps), microseconds=len(steps) * 1001)
        headers = {"Authorization": f"Bearer {user}"}
        content = None
        if body is not None:
            content = (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)).encode("utf-8")
            headers["Content-Type"] = "application/json"
        response = client.request(method, path, content=content, headers=headers)
        raw = response.content
        entry = {
            "label": label, "method": method, "path": path, "user": user,
            "body": None if body is None else (body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)),
            "now": Clock.now.isoformat(), "status": response.status_code,
            "headers": {k: v for k, v in response.headers.items() if k.lower() in {"content-type", "content-disposition", "cache-control", "content-length"}},
        }
        if len(raw) <= 2500:
            entry["response"] = base64.b64encode(raw).decode("ascii") if response.headers.get("content-type", "").startswith("image/") else raw.decode("utf-8")
            entry["binary"] = response.headers.get("content-type", "").startswith("image/")
        else:
            entry["sha256"] = hashlib.sha256(raw).hexdigest()
            entry["length"] = len(raw)
        steps.append(entry)

    first, second, third, fourth, fifth = (row["id"] for row in seeds)
    step("GET", "/api/admin/feedback", label="list")
    step("GET", "/api/admin/feedback", user="alice", label="list not admin")
    step("GET", "/api/admin/feedback/summary", label="summary")
    step("GET", f"/api/admin/feedback/{first}/attachments/0", label="attachment")
    step("GET", f"/api/admin/feedback/{first}/attachments/1", label="attachment odd name")
    step("GET", f"/api/admin/feedback/{fourth}/attachments/0", label="attachment defaults")
    for index in ["2", "-1", "abc", "1.0", " 0", "00"]:
        step("GET", f"/api/admin/feedback/{first}/attachments/{index}", label=f"attachment index {index!r}")
    step("GET", f"/api/admin/feedback/{second}/attachments/0", label="no attachments")
    step("GET", "/api/admin/feedback/missing/attachments/0", label="attachment missing")
    step("GET", f"/api/admin/feedback/{first}/attachments/0", user="alice", label="attachment not admin")
    for body in [{"status": "read"}, {"status": " RESOLVED "}, {"status": "closed"}, {"status": "x" * 17}, {"status": 5},
                 {}, [], "", "{", {"status": "new", "extra": 1}]:
        step("POST", f"/api/admin/feedback/{fifth}/status", body=body, label=f"status {body!r}")
    step("POST", "/api/admin/feedback/missing/status", body={"status": "read"}, label="status missing")
    step("POST", f"/api/admin/feedback/{fifth}/status", user="alice", body={"status": "read"}, label="status not admin")
    for body in [{"message": "  Arreglado  "}, {"message": "Visto", "resolve": False}, {"message": "   "}, {"message": ""},
                 {"message": "m" * 1001}, {"message": 3}, {"message": "ok", "resolve": "yes"}, {"message": "ok", "resolve": "maybe"},
                 {"message": "ok", "resolve": None}, {"message": "ok", "resolve": 1}, {"message": "ok", "resolve": 2}, {"message": "ok", "resolve": 0.0},
                 {"message": "ok", "resolve": 2.0}, {"message": "ok", "resolve": 0.5}, {"message": "ok", "resolve": "OFF"}, {"resolve": True}, {}]:
        step("POST", f"/api/admin/feedback/{third}/reply", body=body, label=f"reply {json.dumps(body)[:40]}")
    step("POST", "/api/admin/feedback/missing/reply", body={"message": "hola"}, label="reply missing")
    step("GET", "/api/admin/feedback", label="list after updates")
    step("GET", "/api/admin/feedback/summary", label="summary after updates")
    step("DELETE", f"/api/admin/feedback/{second}", label="delete")
    step("DELETE", f"/api/admin/feedback/{second}", label="delete again")
    step("DELETE", f"/api/admin/feedback/{fourth}", user="alice", label="delete not admin")
    step("GET", "/api/admin/feedback", label="list after delete")
    step("GET", "/api/admin/feedback/summary", label="summary after delete")
    return {"seeds": [_render_seed(row) for row in seeds], "steps": steps}


def render(corpus: dict) -> str:
    sections = []
    for key in ("seeds", "steps"):
        rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus[key])
        sections.append(f'"{key}":[\n{rows}\n]')
    return "{" + ",\n".join(sections) + "}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/admin_feedback_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
