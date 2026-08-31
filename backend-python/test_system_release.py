from fastapi.testclient import TestClient

import release_info
from main import app


client = TestClient(app)


def _clear_identity_env(monkeypatch):
    for key in release_info._COMMIT_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_ready_exposes_release_without_fake_build_locally(monkeypatch):
    _clear_identity_env(monkeypatch)
    response = client.get("/api/ready")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["release"] == release_info.APP_RELEASE
    assert "build" not in payload


def test_ready_exposes_exact_provider_build_commit(monkeypatch):
    _clear_identity_env(monkeypatch)
    expected = "0123456789abcdef0123456789abcdef01234567"
    monkeypatch.setenv("RENDER_GIT_COMMIT", expected)
    response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json()["build"] == expected
