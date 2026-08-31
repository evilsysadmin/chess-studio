"""Contrato del borrado propio de cuenta usado también por el smoke de staging."""

import asyncio

from fastapi.testclient import TestClient

import game_store as gstore
import matthias_daily_store as mdstore
import matthias_memory_store as mmstore
import profile_store as pstore
import users_store as ustore
from main import app

client = TestClient(app)


def _register(username: str, password: str = "clave123456") -> str:
    response = client.post("/api/auth/register", json={"username": username, "password": password})
    assert response.status_code == 201
    return response.json()["token"]


def test_delete_own_account_requires_authentication():
    response = client.post("/api/auth/delete-account", json={"password": "clave123456"})
    assert response.status_code == 401


def test_delete_own_account_revalidates_password_and_preserves_account_on_error():
    username = "delete_self_wrong_password"
    token = _register(username)
    response = client.post(
        "/api/auth/delete-account",
        json={"password": "no-es-la-clave"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert asyncio.run(ustore.user_exists(username, force=True)) is True


def test_delete_own_account_cascades_and_revokes_existing_token():
    username = "delete_self_cascade"
    token = _register(username)
    auth = {"Authorization": f"Bearer {token}"}

    profile = client.put("/api/profile", json={"data": {"fixture": "present"}}, headers=auth)
    assert profile.status_code == 200
    game = client.post("/api/games", json={"difficulty": 10, "color": "w"}, headers=auth)
    assert game.status_code == 201
    game_id = game.json()["id"]

    # Los almacenes de Matthias forman parte de la misma cascada que Admin.
    mdstore._memory[username] = {"day": "2026-08-31", "state": "used"}
    mmstore._memory[username] = {"schema_version": 5, "relationship": {"games_seen": 1}}

    deleted = client.post(
        "/api/auth/delete-account",
        json={"password": "clave123456"},
        headers=auth,
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert deleted.json()["username"] == username
    assert deleted.json()["deletedGames"] >= 1

    assert asyncio.run(ustore.user_exists(username, force=True)) is False
    assert asyncio.run(pstore.get_profile(username)) == {}
    assert asyncio.run(gstore.get_game(game_id)) is None
    assert username not in mdstore._memory
    assert username not in mmstore._memory

    # Un JWT emitido antes del borrado ya no autentica porque la existencia de
    # la cuenta se revalida en cada acceso protegido.
    assert client.get("/api/profile", headers=auth).status_code == 401
