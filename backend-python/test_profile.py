"""test_profile.py — Tests de los endpoints de perfil (GET/PUT/PATCH /api/profile).
Ahora requieren autenticación (perfil por usuario, no un documento único
compartido) — cada test se registra un usuario propio y usa su token.
"""

from fastapi.testclient import TestClient

from main import app
import profile_store
import matthias_daily_store
import matthias_memory_store

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
    assert client.patch("/api/profile", json={"data": {}, "revisions": {}}).status_code == 401


def test_profile_patch_rejects_oversized_key_sets():
    headers = _auth_headers()
    changes = {f"k{i}": str(i) for i in range(129)}
    revisions = {key: 0 for key in changes}
    response = client.patch("/api/profile", json={"data": changes, "revisions": revisions}, headers=headers)
    assert response.status_code == 413
    assert response.json()["detail"] == "PATCH de perfil demasiado grande."


def test_profile_starts_empty():
    headers = _auth_headers()
    r = client.get("/api/profile", headers=headers)
    assert r.status_code == 200
    assert r.json() == {}


def test_new_registration_removes_orphan_profile_for_reused_username():
    username = "perfil_huerfano"
    orphan = {
        "data": {
            "chess-study-game-history": '[{"id":"otra-identidad"}]',
            "chess-study-worst-move-cache": '{"leak":true}',
        }
    }
    profile_store._memory_profiles[username] = profile_store._build_internal(
        username,
        orphan,
        {key: 1 for key in orphan["data"]},
        1,
    )
    matthias_memory_store._memory[username] = {
        "_id": username,
        "consultation_count": 9,
        "question_counts": {"improve": 9},
        "recent_advice": [{"text": "memoria huérfana", "question_kind": "improve"}],
    }
    matthias_daily_store._memory[username] = {"date": "2026-08-28", "state": "used"}

    registered = client.post(
        "/api/auth/register",
        json={"username": username, "password": "clave123456"},
    )

    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['token']}"}
    assert client.get("/api/profile", headers=headers).json() == {}
    assert username not in matthias_memory_store._memory
    assert username not in matthias_daily_store._memory


def test_save_and_retrieve_profile():
    headers = _auth_headers()
    payload = {"data": {"chess-study-tournament": '{"points": 250}'}}
    r = client.put("/api/profile", json=payload, headers=headers)
    assert r.status_code == 200
    assert r.json()["data"] == payload["data"]
    assert r.json()["revisions"]["chess-study-tournament"] >= 1

    r2 = client.get("/api/profile", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["data"] == payload["data"]


def test_save_overwrites_previous_profile():
    headers = _auth_headers()
    client.put("/api/profile", json={"data": {"a": "1"}}, headers=headers)
    client.put("/api/profile", json={"data": {"b": "2"}}, headers=headers)
    r = client.get("/api/profile", headers=headers)
    assert r.json()["data"] == {"b": "2"}


def test_two_users_have_completely_separate_profiles():
    # El punto central de todo este cambio: que Alice y Bob no se pisen el progreso.
    headers_alice = _auth_headers()
    headers_bob = _auth_headers()

    client.put("/api/profile", json={"data": {"nivel": "alice-nivel-50"}}, headers=headers_alice)
    client.put("/api/profile", json={"data": {"nivel": "bob-nivel-3"}}, headers=headers_bob)

    r_alice = client.get("/api/profile", headers=headers_alice)
    r_bob = client.get("/api/profile", headers=headers_bob)

    assert r_alice.json()["data"] == {"nivel": "alice-nivel-50"}
    assert r_bob.json()["data"] == {"nivel": "bob-nivel-3"}


def test_profile_returns_503_instead_of_empty_when_configured_mongo_is_down(monkeypatch):
    """Una caída de Mongo no puede parecer una cuenta nueva/perfil vacío."""
    headers = _auth_headers()
    monkeypatch.setattr("profile_store.persistent_storage_required", lambda: True)

    r = client.get("/api/profile", headers=headers)

    assert r.status_code == 503
    assert "base de datos" in r.json()["detail"].lower()


def test_register_returns_503_when_configured_mongo_is_down(monkeypatch):
    monkeypatch.setattr("users_store.persistent_storage_required", lambda: True)

    r = client.post(
        "/api/auth/register",
        json={"username": "mongo_caido", "password": "clave123456"},
    )

    assert r.status_code == 503


def test_profile_store_forces_authenticated_username_as_mongo_id(monkeypatch):
    """El body nunca puede sobreescribir el _id/propietario autenticado."""
    import asyncio
    import profile_store

    captured = {}

    class FakeResult:
        matched_count = 1
        upserted_id = None

    class FakeCollection:
        async def find_one(self, query):
            return None

        async def replace_one(self, query, doc, upsert=False):
            captured["query"] = query
            captured["doc"] = doc
            captured["upsert"] = upsert
            return FakeResult()

    async def fake_collection():
        return FakeCollection()

    monkeypatch.setattr(profile_store, "_get_collection", fake_collection)
    asyncio.run(profile_store.save_profile("alice", {"_id": "bob", "data": {"x": "1"}}))

    assert captured["query"] == {"_id": "alice"}
    assert captured["doc"]["_id"] == "alice"
    assert captured["doc"]["data"] == {"x": "1"}
    assert "__profile_meta__" in captured["doc"]


def test_register_duplicate_race_stays_409(monkeypatch):
    """Un DuplicateKey concurrente es 'ya existe', no 'Mongo caído'."""
    async def fake_get_user(username):
        return None

    async def fake_create_user(username, password_hash, email=None):
        raise __import__('users_store').UserAlreadyExists(username)

    monkeypatch.setattr('users_store.get_user', fake_get_user)
    monkeypatch.setattr('users_store.create_user', fake_create_user)

    r = client.post(
        '/api/auth/register',
        json={'username': 'carrera', 'password': 'clave123456'},
    )

    assert r.status_code == 409
    assert 'ya existe' in r.json()['detail'].lower()



def test_profile_patch_merges_independent_keys():
    headers = _auth_headers()
    first = client.put("/api/profile", json={"data": {"rating": "1200", "theme": "dark"}}, headers=headers).json()
    revisions = first["revisions"]

    r = client.patch(
        "/api/profile",
        json={"data": {"rating": "1210"}, "revisions": {"rating": revisions["rating"]}},
        headers=headers,
    )

    assert r.status_code == 200
    assert r.json()["data"] == {"rating": "1210", "theme": "dark"}
    assert r.json()["revisions"]["rating"] == revisions["rating"] + 1
    assert r.json()["revisions"]["theme"] == revisions["theme"]


def test_profile_patch_stale_same_key_returns_409_with_remote_snapshot():
    headers = _auth_headers()
    first = client.put("/api/profile", json={"data": {"rating": "1200"}}, headers=headers).json()
    rev = first["revisions"]["rating"]
    client.patch("/api/profile", json={"data": {"rating": "1210"}, "revisions": {"rating": rev}}, headers=headers)

    stale = client.patch("/api/profile", json={"data": {"rating": "999"}, "revisions": {"rating": rev}}, headers=headers)

    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["conflicts"]["rating"]["actual"] == rev + 1
    assert detail["profile"]["data"]["rating"] == "1210"


def test_profile_patch_retry_with_fresh_revision_succeeds():
    headers = _auth_headers()
    first = client.put("/api/profile", json={"data": {"rating": "1200"}}, headers=headers).json()
    rev = first["revisions"]["rating"]
    current = client.patch("/api/profile", json={"data": {"rating": "1210"}, "revisions": {"rating": rev}}, headers=headers).json()

    retry = client.patch(
        "/api/profile",
        json={"data": {"rating": "1220"}, "revisions": {"rating": current["revisions"]["rating"]}},
        headers=headers,
    )

    assert retry.status_code == 200
    assert retry.json()["data"]["rating"] == "1220"


def test_profile_patch_none_deletes_only_target_key():
    headers = _auth_headers()
    first = client.put("/api/profile", json={"data": {"a": "1", "b": "2"}}, headers=headers).json()

    deleted = client.patch(
        "/api/profile",
        json={"data": {"a": None}, "revisions": {"a": first["revisions"]["a"]}},
        headers=headers,
    )

    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"b": "2"}


def test_profile_put_remains_supported_and_advances_changed_key_revision():
    headers = _auth_headers()
    first = client.put("/api/profile", json={"data": {"a": "1"}}, headers=headers).json()
    second = client.put("/api/profile", json={"data": {"a": "2"}}, headers=headers).json()

    assert second["data"] == {"a": "2"}
    assert second["revisions"]["a"] == first["revisions"]["a"] + 1


def test_profile_patch_initial_insert_race_rereads_instead_of_overwriting_winner(monkeypatch):
    """Dos primeros PATCH concurrentes no pueden perder la escritura ganadora.

    El caso peligroso es: ambos leen ausencia; A inserta; B llega después. B
    debe recibir DuplicateKey, releer y detectar el conflicto de la misma
    clave, nunca convertir su upsert tardío en un replace ciego.
    """
    import asyncio
    import profile_store
    from pymongo.errors import DuplicateKeyError

    winner = profile_store._build_internal(
        "alice",
        {"data": {"rating": "1210"}},
        {"rating": 1},
        1,
    )

    class FakeCollection:
        def __init__(self):
            self.finds = 0

        async def find_one(self, query):
            self.finds += 1
            return None if self.finds == 1 else winner

        async def insert_one(self, doc):
            raise DuplicateKeyError("otro PATCH creó el perfil primero")

        async def replace_one(self, *args, **kwargs):
            raise AssertionError("la misma clave debe entrar en conflicto antes de reemplazar")

    fake = FakeCollection()

    async def fake_collection():
        return fake

    monkeypatch.setattr(profile_store, "_get_collection", fake_collection)
    result = asyncio.run(profile_store.patch_profile("alice", {"rating": "999"}, {"rating": 0}))

    assert isinstance(result, profile_store.ProfilePatchConflict)
    assert result.conflicts == {"rating": {"expected": 0, "actual": 1}}
    assert result.profile["data"]["rating"] == "1210"
    assert fake.finds == 2


def test_health_is_liveness_and_does_not_touch_mongo(monkeypatch):
    async def exploding_get_db():
        raise AssertionError("/health no debe tocar Mongo")

    monkeypatch.setattr("db.get_db", exploding_get_db)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_ready_memory_mode_does_not_touch_mongo(monkeypatch):
    async def exploding_get_db():
        raise AssertionError("/ready no debe tocar Mongo si la persistencia no está configurada")

    monkeypatch.setattr("db.persistent_storage_required", lambda: False)
    monkeypatch.setattr("db.get_db", exploding_get_db)
    r = client.get("/api/ready")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "storage": "memory"}


def test_ready_returns_200_when_configured_mongo_is_available(monkeypatch):
    async def available_db():
        return object()

    monkeypatch.setattr("db.persistent_storage_required", lambda: True)
    monkeypatch.setattr("db.get_db", available_db)
    r = client.get("/api/ready")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "storage": "mongo"}



def test_ready_returns_503_when_configured_mongo_is_down(monkeypatch):
    async def unavailable_db():
        return None

    monkeypatch.setattr("db.persistent_storage_required", lambda: True)
    monkeypatch.setattr("db.get_db", unavailable_db)
    r = client.get("/api/ready")
    assert r.status_code == 503
