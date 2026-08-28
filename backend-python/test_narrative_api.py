import logging
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import narrative_api


import pytest


@pytest.fixture(autouse=True)
def isolate_matthias_memory(monkeypatch):
    async def empty_context(_username, _facts):
        return {
            "consultation_count": 0,
            "question_counts": {},
            "prior_advice": [],
            "progress_since_last": {},
        }

    monkeypatch.setattr(narrative_api.matthias_memory_store, "context", empty_context)


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



def test_portrait_receives_server_side_matthias_memory(monkeypatch):
    captured = {}

    async def remembered_context(username, facts):
        assert username == "test-user"
        assert facts["total_games"] == 8
        return {
            "consultation_count": 3,
            "question_counts": {"priority": 2},
            "prior_advice": [{"question_kind": "priority", "text": "No regales la dama.", "at": "2026-08-28T12:00:00+00:00"}],
            "progress_since_last": {"total_games": 2},
        }

    async def capture_narrative(event_type, facts, **kwargs):
        captured["event_type"] = event_type
        captured["facts"] = facts
        return {"text": "Te sigo teniendo calado.", "provider": "cloudflare", "latencyMs": 5.0}

    monkeypatch.setattr(narrative_api.matthias_memory_store, "context", remembered_context)
    monkeypatch.setattr(narrative_api, "generate_narrative", capture_narrative)

    response = build_client().post(
        "/api/narrative",
        headers={"Authorization": "Bearer ok"},
        json={"eventType": "player_portrait", "requestKind": "portrait_auto", "facts": {"total_games": 8}},
    )

    assert response.status_code == 200
    assert captured["event_type"] == "player_portrait"
    memory = captured["facts"]["matthias_memory"]
    assert memory["consultation_count"] == 3
    assert memory["progress_since_last"] == {"total_games": 2}
    assert "username" not in memory
    assert captured["facts"]["total_games"] == 8

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



def test_training_plan_uses_analysis_bucket_and_request_kind(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {
        "eventType": "training_plan",
        "requestKind": "training_plan",
        "facts": {"sample_band": "10-19", "priorities": [{"title": "Táctica", "action": "Repite posiciones"}]},
    }
    for _ in range(3):
        assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200

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


def test_training_plan_manual_refresh_only_consumes_cooldown_after_cloud_success(monkeypatch):
    monkeypatch.setenv("AI_TRAINING_PLAN_MANUAL_COOLDOWN_SECONDS", "21600")

    async def cloud_success(*args, **kwargs):
        return {"text": "Plan remoto", "provider": "cloudflare", "latencyMs": 12.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", cloud_success)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "training_plan", "requestKind": "training_plan_manual", "facts": {"priorities": [{"title": "Táctica"}]}}
    first = client.post("/api/narrative", headers=headers, json=payload)
    second = client.post("/api/narrative", headers=headers, json=payload)
    assert first.status_code == 200
    assert second.status_code == 429
    assert "Training plan manual refresh cooldown" in second.json()["detail"]
    assert int(second.headers["retry-after"]) > 0


def test_training_plan_manual_fallback_does_not_burn_cooldown(monkeypatch):
    monkeypatch.setenv("AI_TRAINING_PLAN_MANUAL_COOLDOWN_SECONDS", "21600")

    async def local_fallback(*args, **kwargs):
        return {"text": "Fallback", "provider": "local", "latencyMs": 0.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", local_fallback)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "training_plan", "requestKind": "training_plan_manual", "facts": {"priorities": [{"title": "Táctica"}]}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200


def test_admin_training_plan_manual_refresh_has_no_cooldown(monkeypatch):
    monkeypatch.setenv("AI_TRAINING_PLAN_MANUAL_COOLDOWN_SECONDS", "21600")

    async def cloud_success(*args, **kwargs):
        return {"text": "Plan remoto", "provider": "cloudflare", "latencyMs": 12.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", cloud_success)
    client = build_client()
    headers = {"Authorization": "Bearer admin"}
    payload = {"eventType": "training_plan", "requestKind": "training_plan_manual", "facts": {"priorities": [{"title": "Táctica"}]}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200



def test_personal_puzzle_batch_has_its_own_expensive_generation_cooldown(monkeypatch):
    monkeypatch.setenv("AI_PERSONAL_PUZZLE_COOLDOWN_SECONDS", "43200")

    async def cloud_success(*args, **kwargs):
        return {"text": '{"candidates":[]}', "provider": "cloudflare", "latencyMs": 10.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", cloud_success)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {
        "eventType": "personal_puzzle_batch",
        "requestKind": "personal_puzzle_batch",
        "facts": {"requested_candidates": 4, "seeds": [{"fen": "8/8/8/8/8/8/4K3/7k w - - 0 1", "better_move": "Ke3"}]},
    }
    first = client.post("/api/narrative", headers=headers, json=payload)
    second = client.post("/api/narrative", headers=headers, json=payload)
    assert first.status_code == 200
    assert second.status_code == 429
    assert "Personal puzzle generation cooldown" in second.json()["detail"]
    assert int(second.headers["retry-after"]) > 0


def test_personal_puzzle_batch_fallback_does_not_burn_cooldown(monkeypatch):
    monkeypatch.setenv("AI_PERSONAL_PUZZLE_COOLDOWN_SECONDS", "43200")

    async def local_fallback(*args, **kwargs):
        return {"text": "fallback", "provider": "local", "latencyMs": 0.0}

    monkeypatch.setattr(narrative_api, "generate_narrative", local_fallback)
    client = build_client()
    headers = {"Authorization": "Bearer ok"}
    payload = {"eventType": "personal_puzzle_batch", "requestKind": "personal_puzzle_batch", "facts": {"seeds": [{"fen": "x"}]}}
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
    assert client.post("/api/narrative", headers=headers, json=payload).status_code == 200
