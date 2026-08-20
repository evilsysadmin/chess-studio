"""conftest.py — Fixtures compartidas. La más importante: evita que cada
test dispare un intento real de conexión a MongoDB (que tarda ~3s en
fallar si no hay Mongo corriendo) — se fuerza directo el respaldo en
memoria, que es exactamente lo que se quiere probar igual. También reinicia
ese respaldo en memoria antes de cada test, para que uno no arrastre datos
del anterior.
"""

import pytest


@pytest.fixture(autouse=True)
def no_real_mongo(monkeypatch):
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
    monkeypatch.setattr("users_store._memory_users", {})
