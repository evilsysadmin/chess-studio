import pytest

import observability_history as history


def setup_function():
    history.reset_history_for_tests()


def _pending_bucket():
    with history._PENDING_LOCK:
        assert len(history._PENDING) == 1
        return next(iter(history._PENDING.values()))


def test_history_aggregates_http_without_identity_or_payload():
    at = 1_800_000_000.0
    history.record_http_event("GET", "/api/games/{game_id}", 200, 12.0, client_release="v16.6dm46j", timestamp=at)
    history.record_http_event("GET", "/api/games/{game_id}", 500, 700.0, client_release="v16.6dm46j", timestamp=at + 2)
    history.record_http_event("POST", "/api/narrative", 429, 40.0, timestamp=at + 4)

    payload = _pending_bucket()["http"]
    summary = history._summarize_http(payload, 3600)
    assert summary["samples"] == 3
    assert summary["status_4xx"] == 1
    assert summary["status_5xx"] == 1
    assert summary["p95_ms"] == 1000.0
    assert summary["top_routes"][0]["route"] == "GET /api/games/{game_id}"
    assert summary["releases"][0]["release"] == "v16.6dm46j"
    assert summary["releases"][0]["requests"] == 2
    assert summary["releases"][0]["errors_5xx"] == 1
    serialized = str(payload).lower()
    assert "username" not in serialized
    assert "fen" not in serialized


def test_history_aggregates_ai_model_reason_and_usage():
    at = 1_800_000_000
    history.record_ai_event({
        "at": at,
        "provider": "cloudflare",
        "event_type": "player_portrait",
        "request_kind": "portrait_manual",
        "latency_ms": 380,
        "reason": "ok",
        "input_tokens": 120,
        "output_tokens": 40,
        "model": "@cf/qwen/qwen3-30b-a3b-fp8",
    })
    history.record_ai_event({
        "at": at + 2,
        "provider": "local",
        "event_type": "player_portrait",
        "request_kind": "portrait_manual",
        "latency_ms": 90,
        "reason": "http_502",
        "model": None,
        "worker_error": "empty_provider_response",
    })

    summary = history._summarize_ai(_pending_bucket()["ai"])
    assert summary["samples"] == 2
    assert summary["cloudflare_percent"] == 50.0
    assert summary["reasons"]["http_502"] == 1
    assert summary["event_types"]["player_portrait"] == 2
    assert summary["worker_errors"]["empty_provider_response"] == 1
    assert summary["models"]["@cf/qwen/qwen3-30b-a3b-fp8"] == 1
    assert summary["usage"]["input_tokens"] == 120
    assert summary["usage"]["estimated_neurons"] > 0


def test_history_range_is_bounded_and_defaults_to_24h():
    now = 1_800_000_000
    start, end = history.normalize_range(None, None, now=now)
    assert end - start == 24 * 60 * 60

    with pytest.raises(ValueError, match="90 días"):
        history.normalize_range("2026-01-01T00:00:00Z", "2026-08-01T00:00:00Z", now=1_800_000_000)


def test_dynamic_mongo_keys_survive_dots_and_slashes():
    original = "@cf/meta/llama-3.2-3b-instruct"
    assert history._unsafe_key(history._safe_key(original)) == original
    assert "." not in history._safe_key(original)


def test_history_retention_exceeds_query_window_but_is_bounded():
    assert history.RETENTION_SECONDS > history.MAX_RANGE_SECONDS
    assert history.RETENTION_SECONDS <= 120 * 24 * 60 * 60


def test_history_series_exposes_dashboard_metrics():
    at = 1_800_000_000.0
    history.record_http_event("GET", "/api/test", 200, 80.0, timestamp=at)
    history.record_http_event("GET", "/api/test", 500, 900.0, timestamp=at + 2)
    history.record_ai_event({
        "at": at + 3,
        "provider": "cloudflare",
        "event_type": "player_portrait",
        "request_kind": "portrait_auto",
        "latency_ms": 420,
        "reason": "ok",
    })
    with history._PENDING_LOCK:
        rows = sorted(history._PENDING.items())
    series = history._group_series(rows, int(at - 10), int(at + 3600))
    assert len(series) == 1
    point = series[0]
    assert point["http_requests"] == 2
    assert point["http_5xx"] == 1
    assert point["http_p95_ms"] >= point["http_p50_ms"]
    assert point["http_p99_ms"] >= point["http_p95_ms"]
    assert "ai_p50_ms" in point
    assert "ai_p95_ms" in point
    assert "ai_p99_ms" in point
    assert point["ai_samples"] == 1
    assert point["ai_cloudflare_percent"] == 100.0
    assert point["ai_fallback_percent"] == 0.0
    assert point["ai_p95_ms"] > 0

def test_short_ranges_use_fine_grained_series_resolution():
    at = 1_800_000_000.0
    history.record_http_event("GET", "/api/a", 200, 20.0, timestamp=at)
    history.record_http_event("GET", "/api/a", 200, 30.0, timestamp=at + 6 * 60)
    with history._PENDING_LOCK:
        rows = sorted(history._PENDING.items())
    series = history._group_series(rows, int(at), int(at + 15 * 60))
    assert history.BUCKET_SECONDS == 5 * 60
    assert len(series) == 2


def test_presence_history_is_aggregate_and_exposes_average_and_peak():
    history.reset_history_for_tests()
    history.record_presence_snapshot(2, timestamp=1_800_000_000)
    history.record_presence_snapshot(6, timestamp=1_800_000_010)
    bucket = history._PENDING[history._bucket_start(1_800_000_000)]
    summary = history._summarize_presence(bucket["presence"])
    assert summary == {"samples": 2, "average_online": 4.0, "peak_online": 6}


def test_sparse_pending_bucket_is_rehydrated_after_flush_delta():
    at = 1_750_000_000.0
    bucket_key = history._bucket_start(at)
    history._PENDING.clear()
    # Simulate the sparse shape left after a successful delta subtraction.
    route_key = history._safe_key("GET /api/status")
    channel_key = history._safe_key("comments")
    history._PENDING[bucket_key] = {
        "http": {"samples": 2, "routes": {route_key: {"requests": 2}}},
        "ai": {"channels": {channel_key: {"samples": 1}}},
    }

    history.record_presence_snapshot(3, timestamp=at)
    history.record_http_event("GET", "/api/status", 200, 12.0, timestamp=at)
    history.record_ai_event({"at": at, "provider": "local", "event_type": "generic", "channel": "comments"})

    bucket = history._PENDING[bucket_key]
    assert bucket["presence"] == {"samples": 1, "online_sum": 3, "online_max": 3}
    assert bucket["http"]["samples"] == 3
    assert bucket["http"]["routes"][route_key]["requests"] == 3
    assert bucket["http"]["routes"][route_key]["latency_hist"]
    assert bucket["ai"]["samples"] == 1
    assert bucket["ai"]["channels"][channel_key]["samples"] == 2
