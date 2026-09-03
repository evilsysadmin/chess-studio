import narrative_cloudflare as provider


def test_opening_banter_uses_background_ai_budget_without_slowing_move_comments(monkeypatch):
    monkeypatch.delenv("CF_AI_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("CF_AI_COMMENT_TIMEOUT_SECONDS", raising=False)

    assert "game_opening_banter" in provider.RICH_ANALYSIS_EVENT_TYPES
    assert provider._circuit_channel("game_opening_banter") == "analysis"
    assert provider._timeout_seconds(provider._circuit_channel("game_opening_banter")) == 5.0

    assert provider._circuit_channel("blunder") == "comments"
    assert provider._timeout_seconds("comments") == 2.0
