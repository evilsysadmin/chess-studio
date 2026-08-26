import json
import logging

from structured_logging import emit_http_event


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
