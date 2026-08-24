import logging
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import narrative_api


def auth(authorization: str | None = Header(default=None)):
    if authorization == "Bearer ok":
        return "test-user"
    if authorization == "Bearer admin":
        return "admin"
    raise HTTPException(status_code=401, detail="Unauthorized")


def admin(authorization: str | None = Header(default=None)):
    if authorization != "Bearer admin":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "admin"


def build_client():
    app = FastAPI()
    app.include_router(narrative_api.build_narrative_router(auth_dependency=auth, admin_dependency=admin, is_admin_check=lambda username: username == "admin", rate_limit_per_minute=2))
    return TestClient(app)




def test_identity_name_normalizes_supported_auth_shapes():
    assert narrative_api._identity_name("Admin") == "Admin"
    assert narrative_api._identity_name({"username": "admin"}) == "admin"
    assert narrative_api._identity_name({"sub": "admin-sub"}) == "admin-sub"

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


def test_player_portrait_manual_refresh_only_consumes_cooldown_after_cloud_success(monkeypatch):
    monkeypatch.setenv("AI_PORTRAIT_MANUAL_COOLDOWN_SECONDS", "21600")

    async def cloud_success(*args, **kwargs):
        return {"text": "Lectura remota", "provider": "cloudflare", "latencyMs": 12.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", cloud_success)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "player_portrait", "requestKind": "portrait_manual", "facts": {"total_games": 8}}
    first = client.post("/api/narrative", headers=headers, json=payload)
    second = client.post("/api/narrative", headers=headers, json=payload)
    assert first.status_code == 200
    assert second.status_code == 429
    assert int(second.headers["retry-after"]) > 0




def test_admin_player_portrait_manual_refresh_has_no_cooldown(monkeypatch):
    monkeypatch.setenv("AI_PORTRAIT_MANUAL_COOLDOWN_SECONDS", "21600")

    async def cloud_success(*args, **kwargs):
        return {"text": "Lectura remota", "provider": "cloudflare", "latencyMs": 12.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", cloud_success)
    client = build_client()
    headers = {"Authorization": "Bearer admin"}
    payload = {"eventType": "player_portrait", "requestKind": "portrait_manual", "facts": {"total_games": 8}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200

def test_player_portrait_fallback_does_not_burn_six_hour_manual_cooldown(monkeypatch):
    monkeypatch.setenv("AI_PORTRAIT_MANUAL_COOLDOWN_SECONDS", "21600")

    async def local_fallback(*args, **kwargs):
        return {"text": "Fallback", "provider": "local", "latencyMs": 0.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", local_fallback)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "player_portrait", "requestKind": "portrait_manual", "facts": {"total_games": 8}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200


def test_portrait_and_move_comments_do_not_share_rate_limit_bucket(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    portrait = {"eventType": "player_portrait", "requestKind": "portrait_auto", "facts": {"total_games": 8}}
    comment = {"eventType": "generic", "facts": {}}

    for _ in range(3):
        assert client.post("/api/narrative", headers=headers, json=portrait).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 429

def test_rate_limiter_bounds_identity_memory():
    limiter = narrative_api.SlidingWindowLimiter(limit=10, window_seconds=60, max_identities=100)
    for i in range(250):
        limiter.check(f"user:{i}")
    assert len(limiter._events) == 100



def test_narrative_429_is_operationally_logged_without_identity(monkeypatch, caplog):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    caplog.set_level(logging.WARNING, logger="uvicorn.error")
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "generic", "facts": {"private_marker": "DO_NOT_LOG"}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 429
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "narrative_429 request_id=- event_type=generic request_kind=default bucket=comments" in text
    assert "DO_NOT_LOG" not in text
    assert "test-user" not in text


def test_rich_analysis_has_its_own_rate_limit_bucket(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    analysis = {"eventType": "post_game_autopsy", "requestKind": "post_game", "facts": {"average_loss_cp": 80}}
    comment = {"eventType": "generic", "facts": {}}

    for _ in range(3):
        assert client.post("/api/narrative", headers=headers, json=analysis).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=comment).status_code == 429
