from fastapi.testclient import TestClient

import main as main_module


client = TestClient(main_module.app)


def test_registration_requires_twelve_character_new_password(monkeypatch):
    monkeypatch.setattr(main_module, "ALLOW_REGISTRATION", True)
    monkeypatch.setattr(main_module, "ENABLE_EMAIL_RECOVERY", False)
    monkeypatch.setattr(main_module, "INVITE_CODE", "")

    response = client.post(
        "/api/auth/register",
        json={"username": "weak_new_user", "password": "12345678901"},
    )

    assert response.status_code == 400
    assert "12 caracteres" in response.json()["detail"]


def test_reset_requires_twelve_character_new_password(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_EMAIL_RECOVERY", True)

    response = client.post(
        "/api/auth/reset-password",
        json={"token": "irrelevant", "newPassword": "12345678901"},
    )

    assert response.status_code == 400
    assert "12 caracteres" in response.json()["detail"]


def test_legacy_six_character_password_can_still_login(monkeypatch):
    async def not_blocked(_identity):
        return 0

    async def existing_user(_username):
        return {"password_hash": "legacy-hash"}

    async def clear(_identity):
        return None

    async def no_touch(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main_module.auth_login_guard, "retry_after", not_blocked)
    monkeypatch.setattr(main_module.auth_login_guard, "clear", clear)
    monkeypatch.setattr(main_module.ustore, "get_user", existing_user)
    monkeypatch.setattr(main_module, "verify_password", lambda password, _hash: password == "abc123")
    monkeypatch.setattr(main_module, "_touch_activity_best_effort", no_touch)

    response = client.post(
        "/api/auth/login",
        json={"username": "legacy_user", "password": "abc123"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "legacy_user"
