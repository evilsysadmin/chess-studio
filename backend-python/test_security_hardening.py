import asyncio
import json

import bcrypt

from auth import hash_password, is_legacy_bcrypt_hash, verify_password
from request_limits import RequestBodyLimitMiddleware


def _run_asgi(middleware, *, headers=None):
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/test",
        "headers": headers or [],
    }
    incoming = [{"type": "http.request", "body": b"1234", "more_body": False}]
    sent = []

    async def receive():
        if incoming:
            return incoming.pop(0)
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(middleware(scope, receive, send))
    return sent


def _status(sent):
    return next(message["status"] for message in sent if message["type"] == "http.response.start")


def _payload(sent):
    raw = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return json.loads(raw)


def test_new_password_hashes_use_argon2id_and_do_not_truncate_after_72_bytes():
    prefix = "A" * 72
    password = prefix + "-real-tail"
    collision_candidate = prefix + "-different-tail"

    password_hash = hash_password(password)

    assert password_hash.startswith("$argon2id$")
    assert verify_password(password, password_hash) is True
    assert verify_password(collision_candidate, password_hash) is False


def test_legacy_bcrypt_hashes_remain_read_compatible():
    password = "legacy-password-123"
    password_hash = bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=4),
    ).decode("utf-8")

    assert is_legacy_bcrypt_hash(password_hash) is True
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong-password", password_hash) is False


def test_rejects_transfer_encoding_plus_content_length_before_downstream_app():
    called = False

    async def app(scope, receive, send):
        nonlocal called
        called = True

    middleware = RequestBodyLimitMiddleware(app, max_bytes=1024)
    sent = _run_asgi(
        middleware,
        headers=[
            (b"transfer-encoding", b"chunked"),
            (b"content-length", b"4"),
        ],
    )

    assert called is False
    assert _status(sent) == 400
    assert _payload(sent)["detail"] == "Transfer-Encoding y Content-Length no pueden combinarse."
