import asyncio

import resilience


def setup_function():
    resilience.reset_resilience_state()


def test_optional_routes_shed_before_critical_game_paths(monkeypatch):
    monkeypatch.setenv("CHESS_OPTIONAL_INFLIGHT_LIMIT", "2")
    monkeypatch.setenv("CHESS_DEGRADED_INFLIGHT", "10")
    monkeypatch.setenv("CHESS_CRITICAL_INFLIGHT", "20")
    assert resilience.request_enter() == 1
    assert resilience.request_enter() == 2
    assert resilience.request_enter() == 3
    assert resilience.should_shed("/api/narrative", 3) is True
    assert resilience.should_shed("/api/analyze-move", 3) is True
    assert resilience.should_shed("/api/games/abc/move", 3) is False
    resilience.request_exit(); resilience.request_exit(); resilience.request_exit()


def test_adaptive_ai_degrades_rich_channels_first(monkeypatch):
    monkeypatch.setenv("CHESS_DEGRADED_INFLIGHT", "1")
    monkeypatch.setenv("CHESS_CRITICAL_INFLIGHT", "9")
    resilience.request_enter()
    assert resilience.adaptive_ai_mode("analysis") == "local_only"
    assert resilience.adaptive_ai_mode("player_portrait") == "local_only"
    assert resilience.adaptive_ai_mode("comments") == "normal"
    resilience.request_exit()


def test_ai_bulkhead_rejects_excess_without_waiting(monkeypatch):
    monkeypatch.setenv("CHESS_AI_BULKHEAD_COMMENTS", "1")

    async def run():
        async with resilience.ai_bulkhead("comments") as first:
            assert first is True
            async with resilience.ai_bulkhead("comments", wait_seconds=0.001) as second:
                assert second is False
    asyncio.run(run())
    assert resilience.pressure_state()["bulkhead_rejections_last_5m"] == 1
