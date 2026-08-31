import asyncio

import pytest

import db


def test_deployed_environments_require_explicit_database_selection():
    assert db.validate_mongo_environment({}) == "chess_study"
    assert db.validate_mongo_environment({
        "ENVIRONMENT": "production",
        "MONGO_URL": "mongodb://cluster",
        "MONGO_DB_NAME": "chess_study",
    }) == "chess_study"
    assert db.validate_mongo_environment({
        "ENVIRONMENT": "staging",
        "MONGO_URL": "mongodb://cluster",
        "MONGO_DB_NAME": "chess_study_staging",
    }) == "chess_study_staging"


def test_staging_and_production_cannot_cross_databases():
    with pytest.raises(RuntimeError, match="MONGO_URL"):
        db.validate_mongo_environment({
            "ENVIRONMENT": "staging",
            "MONGO_DB_NAME": "chess_study_staging",
        })
    with pytest.raises(RuntimeError, match="MONGO_DB_NAME"):
        db.validate_mongo_environment({
            "ENVIRONMENT": "staging",
            "MONGO_URL": "mongodb://cluster",
        })
    with pytest.raises(RuntimeError, match="no puede usar"):
        db.validate_mongo_environment({
            "ENVIRONMENT": "staging",
            "MONGO_URL": "mongodb://cluster",
            "MONGO_DB_NAME": "chess_study",
        })
    with pytest.raises(RuntimeError, match="debe usar"):
        db.validate_mongo_environment({
            "ENVIRONMENT": "production",
            "MONGO_URL": "mongodb://cluster",
            "MONGO_DB_NAME": "chess_study_staging",
        })


def _reset_db_state(monkeypatch, *, clock=100.0):
    if db._client is not None:
        try:
            db._client.close()
        except Exception:
            pass
    monkeypatch.setattr(db, "_db", None)
    monkeypatch.setattr(db, "_client", None)
    monkeypatch.setattr(db, "_warned", False)
    monkeypatch.setattr(db, "_connect_lock", None)
    monkeypatch.setattr(db, "_connect_lock_loop", None)
    monkeypatch.setattr(db, "_retry_after_monotonic", 0.0)
    now = [float(clock)]
    monkeypatch.setattr(db, "_monotonic", lambda: now[0])
    return now


def test_concurrent_callers_share_one_mongo_connect_attempt(monkeypatch):
    _reset_db_state(monkeypatch)
    calls = {"clients": 0, "pings": 0}
    fake_database = object()

    class FakeAdmin:
        async def command(self, name):
            assert name == "ping"
            calls["pings"] += 1
            await asyncio.sleep(0.01)
            return {"ok": 1}

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            calls["clients"] += 1
            self.admin = FakeAdmin()

        def __getitem__(self, _name):
            return fake_database

        def close(self):
            pass

    monkeypatch.setattr(db, "AsyncIOMotorClient", FakeClient)

    async def scenario():
        return await asyncio.gather(*(db.get_db() for _ in range(20)))

    results = asyncio.run(scenario())
    assert results == [fake_database] * 20
    assert calls == {"clients": 1, "pings": 1}


def test_failed_connect_enters_fast_retry_cooldown_then_recovers(monkeypatch):
    now = _reset_db_state(monkeypatch)
    calls = {"clients": 0, "pings": 0, "closed": 0}
    should_fail = [True]
    fake_database = object()

    class FakeAdmin:
        async def command(self, name):
            assert name == "ping"
            calls["pings"] += 1
            await asyncio.sleep(0.01)
            if should_fail[0]:
                raise RuntimeError("mongo down")
            return {"ok": 1}

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            calls["clients"] += 1
            self.admin = FakeAdmin()

        def __getitem__(self, _name):
            return fake_database

        def close(self):
            calls["closed"] += 1

    monkeypatch.setattr(db, "AsyncIOMotorClient", FakeClient)

    async def failed_wave():
        return await asyncio.gather(*(db.get_db() for _ in range(16)))

    assert asyncio.run(failed_wave()) == [None] * 16
    assert calls["clients"] == 1
    assert calls["pings"] == 1
    assert calls["closed"] == 1

    # Dentro del cooldown no se crea ni se hace ping a ningún cliente nuevo.
    assert asyncio.run(db.get_db()) is None
    assert calls["clients"] == 1
    assert calls["pings"] == 1

    now[0] += db.MONGO_RETRY_COOLDOWN_S + 0.01
    should_fail[0] = False
    assert asyncio.run(db.get_db()) is fake_database
    assert calls["clients"] == 2
    assert calls["pings"] == 2
