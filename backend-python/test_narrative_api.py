from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import narrative_api


def auth(authorization: str | None = Header(default=None)):
    if authorization != "Bearer ok":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "test-user"


def admin(authorization: str | None = Header(default=None)):
    if authorization != "Bearer admin":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "admin"


def build_client():
    app = FastAPI()
    app.include_router(narrative_api.build_narrative_router(auth_dependency=auth, admin_dependency=admin, rate_limit_per_minute=2))
    return TestClient(app)


def test_narrative_is_not_public():
    r = build_client().post("/api/narrative", json={"eventType":"blunder","facts":{"san":"Qd4"}})
    assert r.status_code == 401


def test_authenticated_narrative_has_nonfatal_local_fallback(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    r = build_client().post("/api/narrative", headers={"Authorization":"Bearer ok"}, json={"eventType":"blunder","facts":{"san":"Qd4"}})
    assert r.status_code == 200
    assert r.json()["provider"] == "local"


def test_metrics_are_admin_only():
    client = build_client()
    assert client.get("/api/admin/ai-metrics").status_code == 401
    assert client.get("/api/admin/ai-metrics", headers={"Authorization":"Bearer admin"}).status_code == 200


def test_rate_limit_is_real(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    client = build_client(); headers={"Authorization":"Bearer ok"}; payload={"eventType":"generic","facts":{}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 429

def test_rate_limiter_bounds_identity_memory():
    limiter = narrative_api.SlidingWindowLimiter(limit=10, window_seconds=60, max_identities=100)
    for i in range(250):
        limiter.check(f"user:{i}")
    assert len(limiter._events) == 100

