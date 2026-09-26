import asyncio

import runtime_settings_store as settings


def test_matchmaking_setting_defaults_and_persists_in_memory(monkeypatch):
    async def no_db():
        return None

    monkeypatch.setattr(settings, "get_db", no_db)
    monkeypatch.setattr(settings, "persistent_storage_required", lambda: False)
    monkeypatch.setitem(
        settings._memory_settings,
        settings.MATCHMAKING_ID,
        {"targetLeadElo": settings.DEFAULT_TARGET_LEAD_ELO},
    )

    assert asyncio.run(settings.get_matchmaking_settings()) == {"targetLeadElo": 50}
    assert asyncio.run(settings.set_matchmaking_target_lead_elo(75)) == {"targetLeadElo": 75}
    assert asyncio.run(settings.get_matchmaking_settings()) == {"targetLeadElo": 75}


def test_matchmaking_setting_is_bounded():
    assert settings.normalize_target_lead_elo(-10) == 0
    assert settings.normalize_target_lead_elo(50) == 50
    assert settings.normalize_target_lead_elo(999) == 150
