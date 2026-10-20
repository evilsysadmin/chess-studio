"""The standalone Chronicles API must not be remounted in Chess Studio."""
from __future__ import annotations

from fastapi import FastAPI

from system_api import _legacy_chronicles_routes_enabled, build_system_router


class _Limiter:
    @staticmethod
    def exempt(fn):
        return fn

    @staticmethod
    def limit(_rule):
        return lambda fn: fn


def _mounted_paths():
    app = FastAPI()
    app.include_router(build_system_router(
        auth_dependency=lambda: "tester",
        is_admin_check=lambda _username: False,
        limiter=_Limiter(),
    ))
    return {route.path for route in app.routes}


def test_legacy_chronicles_routes_are_unmounted_by_default(monkeypatch):
    monkeypatch.delenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", raising=False)
    assert not _legacy_chronicles_routes_enabled()
    paths = _mounted_paths()
    assert not any(path.startswith("/api/chronicles/") for path in paths)
    assert "/api/health" in paths


def test_legacy_chronicles_router_requires_explicit_opt_in(monkeypatch):
    for raw in ("", "false", "off", "unexpected"):
        monkeypatch.setenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", raw)
        assert not _legacy_chronicles_routes_enabled()
    monkeypatch.setenv("CHESS_STUDIO_LEGACY_CHRONICLES_API_ENABLED", "true")
    assert _legacy_chronicles_routes_enabled()
    paths = _mounted_paths()
    assert any(path.startswith("/api/chronicles/") for path in paths)
    assert "/api/health" in paths
