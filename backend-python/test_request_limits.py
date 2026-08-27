import asyncio
import json

from request_limits import RequestBodyLimitMiddleware


def run_asgi(middleware, *, headers=None, messages=None, path="/api/test"):
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": headers or [],
    }
    incoming = list(messages or [{"type": "http.request", "body": b"", "more_body": False}])
    sent = []

    async def receive():
        if incoming:
            return incoming.pop(0)
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(middleware(scope, receive, send))
    return sent


def response_status(sent):
    return next(message["status"] for message in sent if message["type"] == "http.response.start")


def response_json(sent):
    raw = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return json.loads(raw)


def test_rejects_declared_body_over_limit_without_calling_app():
    called = False

    async def app(scope, receive, send):
        nonlocal called
        called = True

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    sent = run_asgi(middleware, headers=[(b"content-length", b"9")])
    assert called is False
    assert response_status(sent) == 413
    assert response_json(sent)["detail"] == "Petición demasiado grande."


def test_rejects_chunked_body_when_real_bytes_cross_limit():
    called = False

    async def app(scope, receive, send):
        nonlocal called
        called = True

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    sent = run_asgi(
        middleware,
        messages=[
            {"type": "http.request", "body": b"12345", "more_body": True},
            {"type": "http.request", "body": b"6789", "more_body": False},
        ],
    )
    assert called is False
    assert response_status(sent) == 413


def test_replays_valid_chunked_body_unchanged_to_downstream_app():
    observed = bytearray()

    async def app(scope, receive, send):
        more = True
        while more:
            message = await receive()
            observed.extend(message.get("body", b""))
            more = bool(message.get("more_body", False))
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    sent = run_asgi(
        middleware,
        messages=[
            {"type": "http.request", "body": b"1234", "more_body": True},
            {"type": "http.request", "body": b"5678", "more_body": False},
        ],
    )
    assert response_status(sent) == 204
    assert bytes(observed) == b"12345678"


def test_rejects_malformed_or_negative_content_length():
    async def app(scope, receive, send):
        raise AssertionError("downstream no debe ejecutarse")

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    for value in (b"nope", b"-1"):
        sent = run_asgi(middleware, headers=[(b"content-length", value)])
        assert response_status(sent) == 400
        assert response_json(sent)["detail"] == "Content-Length inválido."


def test_rejects_conflicting_duplicate_content_length_headers():
    async def app(scope, receive, send):
        raise AssertionError("downstream no debe ejecutarse con longitudes contradictorias")

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    sent = run_asgi(
        middleware,
        headers=[(b"content-length", b"4"), (b"content-length", b"9")],
        messages=[{"type": "http.request", "body": b"1234", "more_body": False}],
    )
    assert response_status(sent) == 400
    assert response_json(sent)["detail"] == "Content-Length contradictorio."


def test_accepts_identical_duplicate_content_length_headers():
    observed = bytearray()

    async def app(scope, receive, send):
        message = await receive()
        observed.extend(message.get("body", b""))
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = RequestBodyLimitMiddleware(app, max_bytes=8)
    sent = run_asgi(
        middleware,
        headers=[(b"content-length", b"4"), (b"content-length", b"4")],
        messages=[{"type": "http.request", "body": b"1234", "more_body": False}],
    )
    assert response_status(sent) == 204
    assert bytes(observed) == b"1234"


def test_path_specific_limit_only_relaxes_the_named_endpoint():
    observed = bytearray()

    async def app(scope, receive, send):
        message = await receive()
        observed.extend(message.get("body", b""))
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = RequestBodyLimitMiddleware(app, max_bytes=4, path_limits={"/api/feedback": 8})
    accepted = run_asgi(
        middleware, path="/api/feedback", headers=[(b"content-length", b"8")],
        messages=[{"type": "http.request", "body": b"12345678", "more_body": False}],
    )
    assert response_status(accepted) == 204
    rejected = run_asgi(
        middleware, path="/api/login", headers=[(b"content-length", b"8")],
        messages=[{"type": "http.request", "body": b"12345678", "more_body": False}],
    )
    assert response_status(rejected) == 413
