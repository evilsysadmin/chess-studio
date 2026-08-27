import observability


def setup_function():
    observability.reset_http_metrics()


def test_http_observability_is_aggregate_and_low_cardinality(monkeypatch):
    clock = [1_000_000.0]
    monkeypatch.setattr(observability.time, "time", lambda: clock[0])
    observability.record_http_request("GET", "/api/games/{game_id}", 200, 12.0)
    observability.record_http_request("GET", "/api/games/{game_id}", 500, 120.0)
    observability.record_http_request("POST", "/api/narrative", 200, 40.0)

    metrics = observability.get_http_metrics()["last_1h"]
    assert metrics["samples"] == 3
    assert metrics["status_5xx"] == 1
    assert metrics["error_5xx_percent"] == 33.33
    assert metrics["p95_ms"] == 120.0
    assert metrics["top_routes"][0]["route"] == "GET /api/games/{game_id}"
    assert "username" not in str(metrics).lower()
    assert "fen" not in str(metrics).lower()
