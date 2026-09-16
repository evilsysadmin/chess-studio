"""Regresiones de revocación de JWT al cambiar credenciales."""

import asyncio

from fastapi.testclient import TestClient

import main as main_module
import users_store as ustore
from auth import create_password_reset_token, verify_session_token


client = TestClient(main_module.app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_password_reset_revokes_old_session_and_returns_current_version(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_EMAIL_RECOVERY", True)

    registered = client.post(
        "/api/auth/register",
        json={
            "username": "session_revoke",
            "password": "clave-vieja-123",
            "email": "session-revoke@example.com",
        },
    )
    assert registered.status_code == 201
    old_token = registered.json()["token"]
    assert verify_session_token(old_token) == ("session_revoke", 0)
    assert client.get("/api/auth/me", headers=_auth(old_token)).status_code == 200

    user_before = asyncio.run(ustore.get_user("session_revoke"))
    reset_token = create_password_reset_token("session_revoke", user_before["password_hash"])
    reset = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "newPassword": "clave-nueva-456"},
    )
    assert reset.status_code == 200

    new_token = reset.json()["token"]
    assert verify_session_token(new_token) == ("session_revoke", 1)
    assert ustore._memory_users["session_revoke"]["session_version"] == 1

    # El JWT robado/antiguo conserva firma y no ha expirado, pero ya no posee
    # la versión vigente de la cuenta: debe quedar revocado inmediatamente.
    assert client.get("/api/auth/me", headers=_auth(old_token)).status_code == 401
    assert client.get("/api/auth/me", headers=_auth(new_token)).status_code == 200


def test_login_after_reset_issues_the_persisted_session_version(monkeypatch):
    monkeypatch.setattr(main_module, "ENABLE_EMAIL_RECOVERY", True)

    registered = client.post(
        "/api/auth/register",
        json={
            "username": "session_relogin",
            "password": "clave-vieja-123",
            "email": "session-relogin@example.com",
        },
    )
    assert registered.status_code == 201

    user_before = asyncio.run(ustore.get_user("session_relogin"))
    reset_token = create_password_reset_token("session_relogin", user_before["password_hash"])
    reset = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "newPassword": "clave-nueva-456"},
    )
    assert reset.status_code == 200

    login = client.post(
        "/api/auth/login",
        json={"username": "session_relogin", "password": "clave-nueva-456"},
    )
    assert login.status_code == 200
    login_token = login.json()["token"]
    assert verify_session_token(login_token) == ("session_relogin", 1)
    assert client.get("/api/auth/me", headers=_auth(login_token)).status_code == 200
