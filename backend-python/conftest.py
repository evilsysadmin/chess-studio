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
    # Resiliencia/observabilidad son estado global in-memory de proceso. Una
    # prueba que genera 5xx deliberados no puede dejar el siguiente test en
    # presión crítica y provocar 503/adaptive_shed espurios. Cada test empieza
    # con estas señales operativas limpias; los tests que prueban presión las
    # construyen dentro de su propio caso.
    try:
        from resilience import reset_resilience_state
        reset_resilience_state()
    except Exception:
        pass
    try:
        from observability import reset_http_metrics
        reset_http_metrics()
    except Exception:
        pass
    # Motor + reglas puras y el middleware de límites forman gates deliberadamente
    # independientes de FastAPI/Mongo/auth. Así `make gate-core` solo necesita pytest + python-chess.
    if request.path.name in {"test_chess_ai.py", "test_core_game.py", "test_request_limits.py", "test_feedback_attachments.py", "test_narrative_cloudflare.py", "test_narrative_api.py", "test_resilience.py", "test_tracing.py"}:
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

    # Bcrypt de producción usa 12 rounds. En tests mantenemos bcrypt real pero
    # con el mínimo válido (4) para que las numerosas altas/login no dominen
    # el tiempo de la suite.
    import auth as auth_module
    monkeypatch.setattr(auth_module, "BCRYPT_ROUNDS", 4)

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

    monkeypatch.setattr("feedback_store.get_db", fake_get_db)
    monkeypatch.setattr("feedback_store._memory_feedback", {})
