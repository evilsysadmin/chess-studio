import narrative_cloudflare


def test_chronicles_planner_uses_analysis_channel_large_json_budget_and_short_timeout(monkeypatch):
    monkeypatch.delenv("CF_AI_CHRONICLES_PLANNER_TIMEOUT_SECONDS", raising=False)
    assert "chronicles_planner" in narrative_cloudflare.RICH_ANALYSIS_EVENT_TYPES
    assert narrative_cloudflare._circuit_channel("chronicles_planner") == "analysis"
    assert narrative_cloudflare._max_output_chars("chronicles_planner") == 3200
    assert narrative_cloudflare._chronicles_planner_timeout_seconds() == 2.5

    monkeypatch.setenv("CF_AI_CHRONICLES_PLANNER_TIMEOUT_SECONDS", "1.25")
    assert narrative_cloudflare._chronicles_planner_timeout_seconds() == 1.25

    monkeypatch.setenv("CF_AI_CHRONICLES_PLANNER_TIMEOUT_SECONDS", "99")
    assert narrative_cloudflare._chronicles_planner_timeout_seconds() == 5.0
