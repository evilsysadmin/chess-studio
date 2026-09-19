import chronicles_planner_cloudflare
import narrative_cloudflare


def test_chronicles_planner_uses_analysis_channel_and_local_short_timeout():
    assert "chronicles_planner" in narrative_cloudflare.RICH_ANALYSIS_EVENT_TYPES
    assert narrative_cloudflare._circuit_channel("chronicles_planner") == "analysis"
    assert narrative_cloudflare._max_output_chars("chronicles_planner") == 900
    assert chronicles_planner_cloudflare.CHRONICLES_PLANNER_TIMEOUT_SECONDS == 2.5
