"""The standalone Chronicles API must not be remounted in Chess Studio."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from system_api import _legacy_chronicles_routes_enabled, build_system_router


class _Limiter:
    @staticmethod
    def exempt(fn):
        return fn

    @staticmethod
    def limit(_rule):
        return lambda fn: fn


def _isolated_app():
    app = FastAPI()
    app.include_router(build_system_router(
        auth_dependency=lambda: "tester",
        is_admin_check=lambda _username: False,
        limiter=_Limiter(),
    ))
    return app


def test_legacy_chronicles_routes_are_unmounted_by_default(monkeypatch):
    monkeypatch.delenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", raising=False)
    assert not _legacy_chronicles_routes_enabled()
    client = TestClient(_isolated_app())
    assert client.get("/api/chronicles/maps/crypt-eight-squares").status_code == 404
    assert client.get("/api/health").status_code == 200


def test_legacy_chronicles_router_requires_explicit_opt_in(monkeypatch):
    for raw in ("", "false", "off", "unexpected"):
        monkeypatch.setenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", raw)
        assert not _legacy_chronicles_routes_enabled()
    monkeypatch.setenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", "true")
    assert _legacy_chronicles_routes_enabled()
    client = TestClient(_isolated_app())
    assert client.get("/api/chronicles/maps/crypt-eight-squares").status_code == 200
    assert client.get("/api/health").status_code == 200


def test_design_only_chronicles_campaign_is_not_maintained_here():
    """Only legacy *runtime* recovery and account-data deletion may remain."""
    root = Path(__file__).resolve().parents[1]
    assert not (root / "backend-python" / "chronicles_campaign").exists()
    assert not (root / "scripts" / "validate_chronicles_campaign.py").exists()
