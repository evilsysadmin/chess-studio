#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's observability panel route.

admin_api.py's GET /api/admin/observability assembles the history, the
process' HTTP window, the MongoDB probe, the Workers AI dependency, the
resilience pressure, the deployment annotations, shadow evaluation, the
OTLP diagnostics and the backend release. Each source has its own parity
corpus; this one stubs them with fixed documents and pins the assembly: the
admin gate, the query parameters handed to the history (last value of a
repeated one, empty values), a range ValueError as a 400 and anything else
as a 500, the dependency rows, the frontend fallback and get_shadow_metrics
for a process that never samples. backend-go/internal/gamesapi replays it.

    python3 scripts/admin_observability_parity_corpus.py           # rewrite the fixture
    python3 scripts/admin_observability_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import admin_api  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "gamesapi" / "testdata" / "python_admin_observability_corpus.json"
ADMIN = "root"

HISTORY = {"range": {"from": "2026-10-04T12:00:00+00:00", "to": "2026-10-05T12:00:00+00:00", "seconds": 86400, "persistent": True, "resolution": "hour"},
           "http": {"samples": 3}, "ai": {"samples": 0}, "presence": {"samples": 1},
           "frontend": {"samples": 2, "errors": 0, "vitals_p75": {"LCP": 1500.0}, "scope": "persistent_identity_free"}, "series": []}
HTTP = {"uptime_seconds": 42, "startup": {"first_ready_observed": True, "first_ready_observed_ms": 12.5, "scope": "current_process"},
        "last_15m": {"samples": 1}, "last_1h": {"samples": 2}, "capacity": 5000, "scope": "in_memory_since_process_start"}
AI_OK = {"status": "ok", "enabled": True, "configured": True, "circuitOpen": False, "channels": {"comments": {"open": False, "secondsRemaining": 0.0, "failures": 0}}}
AI_OPEN = {"status": "degraded", "enabled": True, "configured": True, "circuitOpen": True, "channels": {"analysis": {"open": True, "secondsRemaining": 41.5, "failures": 5}}}
PRESSURE = {"level": "normal", "reasons": [], "inflight": 1, "optional_inflight_limit": 16, "degraded_inflight_threshold": 12,
            "critical_inflight_threshold": 32, "shed_last_5m": 0, "bulkhead_rejections_last_5m": 2}
DEPLOYMENTS = [{"release": "v16.6dm46zfrv", "provider": "unknown", "deploymentId": "git:abc", "at": "2026-10-05T11:00:00.123000"}]
TRACING = {"configured": False, "enabled": False, "signals": {"traces": {"configured": False}}}
TRACE_PROBE = {"ok": True, "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "sampled": True, "flushed": True, "exported": True,
               "exportResult": "SUCCESS", "exportError": None, "httpStatus": 200, "serviceName": "chess-studio-backend"}
SIGNAL_PROBE = {"ok": False, "traceId": None, "signals": {"metrics": {"configured": True, "flushed": True}}, "diagnostics": TRACING}


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


def build() -> dict:
    state: dict = {}

    async def history(from_value, to_value):
        state["calls"].append([from_value, to_value])
        mode = state["case"]["history"]
        if mode == "value_error":
            raise ValueError("El rango máximo de observabilidad es de 90 días.")
        if mode == "type_error":
            raise TypeError("unsupported operand")
        return state["case"].get("historyDoc", HISTORY)

    async def database():
        return state["case"]["database"]

    async def ensure():
        state["ensured"] += 1

    async def deployments():
        return state["case"].get("deployments", DEPLOYMENTS)

    admin_api.get_observability_history = history
    admin_api.get_database_metrics = database
    admin_api.get_ai_dependency_health = lambda: state["case"]["ai"]
    admin_api.pressure_state = lambda: PRESSURE
    admin_api.ensure_current_deployment_annotation = ensure
    admin_api.list_deployment_annotations = deployments
    admin_api.tracing_diagnostics = lambda: TRACING
    admin_api.get_http_metrics = lambda: HTTP
    admin_api.emit_trace_probe = lambda: TRACE_PROBE
    admin_api.emit_observability_probe = lambda: SIGNAL_PROBE

    app = FastAPI()
    app.include_router(admin_api.build_admin_router(auth_dependency=_auth, admin_dependency=_admin, limiter=_NoLimiter()))
    client = TestClient(app, raise_server_exceptions=False)
    ok_db = {"status": "ok", "mode": "mongo", "latency_ms": 1.25}
    cases = [
        {"label": "panel", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "range", "query": "?from_time=2026-10-01T00:00:00Z&to_time=2026-10-02", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "repeated", "query": "?from_time=a&from_time=b&to_time=", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "encoded", "query": "?from_time=2026-10-01T00%3A00%3A00%2B02%3A00&other=1", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "range error", "query": "?from_time=2020-01-01", "database": ok_db, "ai": AI_OK, "history": "value_error"},
        {"label": "raises", "query": "", "database": ok_db, "ai": AI_OK, "history": "type_error"},
        {"label": "memory db", "query": "", "database": {"status": "memory", "mode": "memory", "latency_ms": 0.01}, "ai": AI_OPEN, "history": "ok"},
        {"label": "down db", "query": "", "database": {"status": "down", "mode": "mongo", "latency_ms": 1500.4, "error": "TimeoutError"}, "ai": AI_OPEN, "history": "ok"},
        {"label": "empty frontend", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "historyDoc": {**HISTORY, "frontend": {}}, "deployments": []},
        {"label": "shadow delta", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "env": {"SHADOW_EVAL_LEVEL_DELTA": "5"}},
        {"label": "shadow delta high", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "env": {"SHADOW_EVAL_LEVEL_DELTA": " 100 "}},
        {"label": "shadow delta bad", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "env": {"SHADOW_EVAL_LEVEL_DELTA": "abc"}},
        {"label": "shadow delta nan", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "env": {"SHADOW_EVAL_LEVEL_DELTA": "nan"}},
        {"label": "shadow delta exp", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "env": {"SHADOW_EVAL_LEVEL_DELTA": "2e1"}},
        {"label": "not admin", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "user": "alice"},
        {"label": "anonymous", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "user": None},
        {"label": "trace probe", "method": "POST", "path": "/api/admin/observability/trace-probe", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "signal probe", "method": "POST", "path": "/api/admin/observability/probe", "query": "?x=1", "database": ok_db, "ai": AI_OK, "history": "ok"},
        {"label": "probe not admin", "method": "POST", "path": "/api/admin/observability/probe", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "user": "bob"},
        {"label": "probe anonymous", "method": "POST", "path": "/api/admin/observability/trace-probe", "query": "", "database": ok_db, "ai": AI_OK, "history": "ok", "user": None},
    ]
    steps = []
    for case in cases:
        state.update(case=case, calls=[], ensured=0)
        saved = {k: os.environ.get(k) for k in ("SHADOW_EVAL_LEVEL_DELTA", "SHADOW_EVAL_PERCENT")}
        os.environ.pop("SHADOW_EVAL_PERCENT", None)
        os.environ.pop("SHADOW_EVAL_LEVEL_DELTA", None)
        os.environ.update(case.get("env", {}))
        user = case.get("user", ADMIN)
        headers = {"Authorization": f"Bearer {user}"} if user else {}
        response = client.request(case.get("method", "GET"), case.get("path", "/api/admin/observability") + case["query"], headers=headers)
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        steps.append({**case, "user": user, "status": response.status_code,
                      "response": None if response.status_code == 500 else response.content.decode("utf-8"),
                      "historyCalls": state["calls"], "ensured": state["ensured"]})
    return {"fixtures": {"history": HISTORY, "http": HTTP, "pressure": PRESSURE, "deployments": DEPLOYMENTS, "tracing": TRACING,
                         "traceProbe": TRACE_PROBE, "signalProbe": SIGNAL_PROBE},
            "steps": steps}


def render(corpus: dict) -> str:
    rows = ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in corpus["steps"])
    head = json.dumps({"fixtures": corpus["fixtures"]}, ensure_ascii=False, separators=(",", ":"))
    return head[:-1] + ',"steps":[\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/admin_observability_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
