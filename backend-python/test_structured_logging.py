import json
import logging

from structured_logging import emit_http_event, normalize_unmatched_path


def test_structured_http_log_is_json_and_keeps_sensitive_payloads_out(caplog):
    logger = logging.getLogger("test.chess.structured")
    caplog.set_level(logging.INFO, logger=logger.name)
    emit_http_event(
        logger,
        request_id="req-abc123",
        method="GET",
        route="/api/games/{game_id}",
        status_code=200,
        duration_ms=12.345,
        client_release="v16.6dm46j",
        username="stan",
    )
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload == {
        "client_release": "v16.6dm46j",
        "duration_ms": 12.35,
        "event": "http_request",
        "method": "GET",
        "request_id": "req-abc123",
        "route": "/api/games/{game_id}",
        "status": 200,
        "username": "stan",
    }
    assert payload["username"] == "stan"
    assert "fen" not in payload


def test_unmatched_path_is_actionable_but_identifiers_are_normalized(caplog):
    logger = logging.getLogger("test.chess.structured.404")
    caplog.set_level(logging.INFO, logger=logger.name)
    emit_http_event(
        logger, request_id="req-404", method="GET", route="unmatched",
        status_code=404, duration_ms=4.2,
        request_path="/api/games/1234567890/deadbeef-dead-beef-dead-beefdeadbeef/missing?token=nope",
    )
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["request_path"] == "/api/games/{n}/{id}/missing"
    assert "token" not in payload["request_path"]
    assert normalize_unmatched_path("not-a-path") is None


def test_exception_http_log_is_explicitly_filterable(caplog):
    logger = logging.getLogger("test.chess.structured.exception")
    caplog.set_level(logging.INFO, logger=logger.name)
    try:
        raise RuntimeError("internal detail")
    except RuntimeError:
        emit_http_event(
            logger, request_id="req-500", method="GET", route="/api/status",
            status_code=500, duration_ms=11.0, exception=True,
        )
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["exception"] is True
    assert "internal detail" not in payload


def test_structured_http_log_sanitizes_network_origin_fields(caplog):
    logger = logging.getLogger("test.chess.structured.network")
    caplog.set_level(logging.INFO, logger=logger.name)
    emit_http_event(
        logger,
        request_id="req-net",
        method="GET",
        route="/api/health",
        status_code=200,
        duration_ms=1.2,
        client_ip="203.0.113.42",
        peer_ip="10.0.0.7",
        x_forwarded_for=["203.0.113.42", "198.51.100.3", "basura"],
    )
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["client_ip"] == "203.0.113.42"
    assert payload["peer_ip"] == "10.0.0.7"
    assert payload["x_forwarded_for"] == ["203.0.113.42", "198.51.100.3"]


def test_structured_http_log_reports_whether_trace_was_sampled(monkeypatch, caplog):
    import tracing
    monkeypatch.setattr(tracing, "current_trace_id", lambda: "a" * 32)
    monkeypatch.setattr(tracing, "current_trace_sampled", lambda: True)
    logger = logging.getLogger("test.chess.structured.trace")
    caplog.set_level(logging.INFO, logger=logger.name)
    emit_http_event(logger, request_id="req-trace", method="GET", route="/api/health", status_code=200, duration_ms=1.0)
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["trace_id"] == "a" * 32
    assert payload["trace_sampled"] is True
