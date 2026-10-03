"""pvp_hop: how a PvP request reached Python (evidence for the fallback sunset)."""
import json
import logging

from fastapi import Request

import main as main_module
from structured_logging import emit_http_event


def _request(path: str, headers: dict[str, str] | None = None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "method": "GET", "path": path, "headers": raw, "query_string": b""})


def test_pvp_hop_classifies_go_fallback_and_direct_traffic():
    hop = main_module._pvp_hop
    assert hop(_request("/api/games/1")) is None
    assert hop(_request("/api/pvpx")) is None
    assert hop(_request("/api/pvp/lobby")) == "direct"
    assert hop(_request("/api/pvp")) == "direct"
    assert hop(_request("/api/pvp/lobby", {"X-Chess-Pvp-Edge": "go"})) == "go:unspecified"
    assert hop(_request("/api/pvp/roster", {
        "X-Chess-Pvp-Edge": "go", "X-Chess-Pvp-Fallback": "disabled:roster",
    })) == "go:disabled:roster"


def test_http_log_carries_pvp_hop_only_when_given(caplog):
    logger = logging.getLogger("test.chess.pvp_hop")
    caplog.set_level(logging.INFO, logger=logger.name)
    emit_http_event(logger, request_id="r1", method="GET", route="/api/pvp/lobby",
                    status_code=200, duration_ms=1.0, pvp_hop="go:unknown\nforged")
    payload = json.loads(caplog.records[-1].getMessage())
    assert payload["pvp_hop"] == "go:unknown forged"
    emit_http_event(logger, request_id="r2", method="GET", route="/api/health",
                    status_code=200, duration_ms=1.0)
    assert "pvp_hop" not in json.loads(caplog.records[-1].getMessage())
