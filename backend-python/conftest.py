"""conftest.py — Fixtures compartidas. La más importante: evita que cada
test dispare un intento real de conexión a MongoDB (que tarda ~3s en
fallar si no hay Mongo corriendo) — se fuerza directo el respaldo en
memoria, que es exactamente lo que se quiere probar igual. También reinicia
ese respaldo en memoria antes de cada test, para que uno no arrastre datos
del anterior.
"""

import pytest


@pytest.fixture(autouse=True)
def no_real_mongo(monkeypatch, request):
    # Motor + reglas puras forman un gate deliberadamente independiente de
    # FastAPI/Mongo. Así `make gate-core` solo necesita pytest + python-chess.
    if request.path.name in {"test_chess_ai.py", "test_core_game.py"}:
        return

    # Los límites reales se prueban de forma dirigida; no queremos que una
    # suite completa se auto-bloquee por compartir la IP de TestClient.
    try:
        from main import app
        app.state.limiter.enabled = False
    except Exception:
        pass

    # La suite debe ser determinista incluso si el runner/CI define MONGO_URL.
    # Los tests que quieren simular almacenamiento persistente lo activan
    # explícitamente mediante monkeypatch en el store correspondiente.
    monkeypatch.delenv("MONGO_URL", raising=False)

    async def fake_get_db():
        return None

    monkeypatch.setattr("game_store.get_db", fake_get_db)
    monkeypatch.setattr("game_store._memory_store", {})

    monkeypatch.setattr("profile_store.get_db", fake_get_db)
    monkeypatch.setattr("profile_store._memory_profiles", {})

    monkeypatch.setattr("users_store.get_db", fake_get_db)
    monkeypatch.setattr("users_store._memory_users", {
        "testuser": {
            "username": "testuser",
            "password_hash": "fixture-only",
            "created_at": "2026-01-01T00:00:00+00:00",
            "last_activity": "2026-01-01T00:00:00+00:00",
        },
    })
    monkeypatch.setattr("users_store._last_activity_write_monotonic", {})
    monkeypatch.setattr("users_store._user_existence_cache", {})
