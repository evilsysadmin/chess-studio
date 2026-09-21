from types import SimpleNamespace
import asyncio

from fastapi import Request
from fastapi.responses import JSONResponse
import pytest

import main as main_module


def _simple_request(*, path="/api/auth/login", method="POST", peer="172.17.0.1", cf_ip="203.0.113.9"):
    return SimpleNamespace(
        method=method,
        url=SimpleNamespace(path=path),
        headers={"cf-ray": "test-ray-FRA", "cf-connecting-ip": cf_ip},
        client=SimpleNamespace(host=peer),
        state=SimpleNamespace(),
    )


def _middleware_request(*, path="/api/auth/login", method="POST", peer="203.0.113.8"):
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": method,
            "scheme": "https",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": [],
            "client": (peer, 4242),
            "server": ("testserver", 443),
            "root_path": "",
        }
    )


def _silence_observability(monkeypatch):
    monkeypatch.setattr(main_module, "request_enter", lambda: 1)
    monkeypatch.setattr(main_module, "request_exit", lambda: None)
    monkeypatch.setattr(main_module, "should_shed", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(main_module, "record_http_request", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(main_module, "schedule_history_flush", lambda: None)
    monkeypatch.setattr(main_module, "emit_http_event", lambda *_args, **_kwargs: None)


def test_auth_ip_guard_is_scoped_to_exact_public_auth_posts(monkeypatch):
    monkeypatch.setenv("TRUST_CLOUDFLARE_CLIENT_IP", "false")
    login = main_module._auth_ip_guard_identity(_simple_request(path="/api/auth/login"))
    register = main_module._auth_ip_guard_identity(_simple_request(path="/api/auth/register"))

    assert login == register
    assert login == main_module.auth_ip_guard.ip_key("172.17.0.1", main_module.JWT_SECRET)
    assert main_module._auth_ip_guard_identity(_simple_request(path="/api/auth/email")) is None
    assert main_module._auth_ip_guard_identity(_simple_request(method="GET")) is None


def test_auth_ip_guard_trusts_cf_ip_only_when_edge_boundary_is_enabled(monkeypatch):
    request = _simple_request(peer="172.17.0.1", cf_ip="203.0.113.9")

    monkeypatch.setenv("TRUST_CLOUDFLARE_CLIENT_IP", "false")
    direct = main_module._auth_ip_guard_identity(request)
    monkeypatch.setenv("TRUST_CLOUDFLARE_CLIENT_IP", "true")
    tunneled = main_module._auth_ip_guard_identity(request)

    assert direct == main_module.auth_ip_guard.ip_key("172.17.0.1", main_module.JWT_SECRET)
    assert tunneled == main_module.auth_ip_guard.ip_key("203.0.113.9", main_module.JWT_SECRET)
    assert direct != tunneled


def test_active_ip_ban_short_circuits_before_endpoint(monkeypatch):
    _silence_observability(monkeypatch)
    monkeypatch.setattr(main_module, "_auth_ip_guard_identity", lambda _request: "ip-fingerprint")

    async def blocked(_identity):
        return 73

    async def should_not_run(_request):
        raise AssertionError("blocked auth request reached endpoint")

    monkeypatch.setattr(main_module.auth_ip_guard, "retry_after", blocked)
    response = asyncio.run(
        main_module.log_request_with_user(_middleware_request(), should_not_run)
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "73"
    assert response.body


@pytest.mark.parametrize("status_code", [401, 403])
def test_failed_auth_response_increments_ip_guard(monkeypatch, status_code):
    _silence_observability(monkeypatch)
    monkeypatch.setattr(main_module, "_auth_ip_guard_identity", lambda _request: "ip-fingerprint")
    recorded = []

    async def not_blocked(_identity):
        return 0

    async def record(identity):
        recorded.append(identity)
        return 0

    async def endpoint(_request):
        return JSONResponse({"detail": "denied"}, status_code=status_code)

    monkeypatch.setattr(main_module.auth_ip_guard, "retry_after", not_blocked)
    monkeypatch.setattr(main_module.auth_ip_guard, "record_failure", record)
    response = asyncio.run(
        main_module.log_request_with_user(_middleware_request(), endpoint)
    )

    assert response.status_code == status_code
    assert recorded == ["ip-fingerprint"]


@pytest.mark.parametrize("status_code", [200, 400, 409, 429, 500])
def test_non_auth_failure_status_does_not_increment_ip_guard(monkeypatch, status_code):
    _silence_observability(monkeypatch)
    monkeypatch.setattr(main_module, "_auth_ip_guard_identity", lambda _request: "ip-fingerprint")

    async def not_blocked(_identity):
        return 0

    async def should_not_record(_identity):
        raise AssertionError(f"HTTP {status_code} must not count toward auth IP ban")

    async def endpoint(_request):
        return JSONResponse({"ok": status_code == 200}, status_code=status_code)

    monkeypatch.setattr(main_module.auth_ip_guard, "retry_after", not_blocked)
    monkeypatch.setattr(main_module.auth_ip_guard, "record_failure", should_not_record)
    response = asyncio.run(
        main_module.log_request_with_user(_middleware_request(), endpoint)
    )

    assert response.status_code == status_code


def test_guard_storage_failure_does_not_break_auth_response(monkeypatch):
    _silence_observability(monkeypatch)
    monkeypatch.setattr(main_module, "_auth_ip_guard_identity", lambda _request: "ip-fingerprint")

    async def unavailable(_identity):
        raise main_module.PersistentStorageUnavailable("temporary")

    async def endpoint(_request):
        return JSONResponse({"detail": "denied"}, status_code=401)

    monkeypatch.setattr(main_module.auth_ip_guard, "retry_after", unavailable)
    monkeypatch.setattr(main_module.auth_ip_guard, "record_failure", unavailable)
    response = asyncio.run(
        main_module.log_request_with_user(_middleware_request(), endpoint)
    )

    assert response.status_code == 401
