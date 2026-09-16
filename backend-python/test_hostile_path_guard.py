import asyncio

import pytest

from hostile_path_guard import HostilePathGuard, is_hostile_request_path


@pytest.mark.parametrize(
    ("path", "raw_path"),
    [
        ("/.git/config", b"/.git/config"),
        ("/media../.git/config", b"/media../.git/config"),
        ("/images../.git/config", b"/images../.git/config"),
        ("/lib../.git/config", b"/lib../.git/config"),
        ("/%2egit/config", b"/%2egit/config"),
        ("/%252egit/config", b"/%252egit/config"),
        ("/.env", b"/.env"),
        ("/.env.production", b"/.env.production"),
        ("/.svn/entries", b"/.svn/entries"),
        ("/.hg/store", b"/.hg/store"),
        ("/static/../../etc/passwd", b"/static/../../etc/passwd"),
        ("/static/%2e%2e/%2e%2e/etc/passwd", b"/static/%2e%2e/%2e%2e/etc/passwd"),
        ("/static/..\\..\\etc\\passwd", b"/static/..\\..\\etc\\passwd"),
        ("/static/\x00secret", b"/static/%00secret"),
    ],
)
def test_hostile_paths_are_detected(path, raw_path):
    assert is_hostile_request_path(path, raw_path)


@pytest.mark.parametrize(
    "path",
    [
        "/api/ready",
        "/api/profile",
        "/assets/app.js",
        "/media../preview",
        "/images/v2/board.png",
        "/api/foo.bar/baz",
        "/.well-known/security.txt",
    ],
)
def test_legitimate_paths_are_not_overblocked(path):
    assert not is_hostile_request_path(path, path.encode("ascii"))


def test_guard_short_circuits_before_inner_app():
    called = []
    messages = []

    async def inner(scope, receive, send):
        called.append(scope["path"])
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "path": "/media../.git/config",
        "raw_path": b"/media../.git/config",
    }
    asyncio.run(HostilePathGuard(inner)(scope, receive, send))

    assert called == []
    assert messages[0]["status"] == 404
    assert messages[1]["body"] == b'{"detail":"Not Found"}'


def test_guard_forwards_normal_requests_unchanged():
    called = []
    messages = []

    async def inner(scope, receive, send):
        called.append(scope["path"])
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {"type": "http", "path": "/api/ready", "raw_path": b"/api/ready"}
    asyncio.run(HostilePathGuard(inner)(scope, receive, send))

    assert called == ["/api/ready"]
    assert messages[0]["status"] == 204
