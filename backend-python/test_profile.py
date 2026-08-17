"""test_profile.py — Tests de los endpoints de perfil (GET/PUT /api/profile).
Ahora requieren autenticación (perfil por usuario, no un documento único
compartido) — cada test se registra un usuario propio y usa su token.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

_counter = 0


def _auth_headers():
    """Registra un usuario nuevo (nombre único por test, para no chocar
    entre tests) y devuelve el header Authorization con su token."""
    global _counter
    _counter += 1
    username = f"perfil_test_{_counter}"
    r = client.post("/api/auth/register", json={"username": username, "password": "clave123456"})
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_profile_requires_auth():
    r = client.get("/api/profile")
    assert r.status_code == 401


def test_profile_starts_empty():
    headers = _auth_headers()
    r = client.get("/api/profile", headers=headers)
    assert r.status_code == 200
    assert r.json() == {}


def test_save_and_retrieve_profile():
    headers = _auth_headers()
    payload = {"data": {"chess-study-tournament": '{"points": 250}'}}
    r = client.put("/api/profile", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json() == payload

    r2 = client.get("/api/profile", headers=headers)
    assert r2.status_code == 200
    assert r2.json() == payload


def test_save_overwrites_previous_profile():
    headers = _auth_headers()
    client.put("/api/profile", json={"data": {"a": "1"}}, headers=headers)
    client.put("/api/profile", json={"data": {"b": "2"}}, headers=headers)
    r = client.get("/api/profile", headers=headers)
    assert r.json() == {"data": {"b": "2"}}


def test_two_users_have_completely_separate_profiles():
    # El punto central de todo este cambio: que Alice y Bob no se pisen el progreso.
    headers_alice = _auth_headers()
    headers_bob = _auth_headers()

    client.put("/api/profile", json={"data": {"nivel": "alice-nivel-50"}}, headers=headers_alice)
    client.put("/api/profile", json={"data": {"nivel": "bob-nivel-3"}}, headers=headers_bob)

    r_alice = client.get("/api/profile", headers=headers_alice)
    r_bob = client.get("/api/profile", headers=headers_bob)

    assert r_alice.json() == {"data": {"nivel": "alice-nivel-50"}}
    assert r_bob.json() == {"data": {"nivel": "bob-nivel-3"}}
