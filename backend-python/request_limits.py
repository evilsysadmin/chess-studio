"""ASGI middleware pequeño para limitar el cuerpo real de cada petición.

No confía únicamente en Content-Length: también cuenta los bytes recibidos por
chunks, de modo que Transfer-Encoding: chunked o un Content-Length ausente no
puedan saltarse el límite y provocar consumo de memoria arbitrario.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from starlette.responses import JSONResponse

ASGIApp = Callable[[dict[str, Any], Callable[[], Awaitable[dict[str, Any]]], Callable[[dict[str, Any]], Awaitable[None]]], Awaitable[None]]


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = 1_048_576):
        self.app = app
        self.max_bytes = max(1, int(max_bytes))

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {bytes(k).lower(): bytes(v) for k, v in scope.get("headers", [])}
        raw_content_length = headers.get(b"content-length")
        if raw_content_length is not None:
            try:
                declared = int(raw_content_length.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                await self._reject(scope, receive, send, 400, "Content-Length inválido.")
                return
            if declared < 0:
                await self._reject(scope, receive, send, 400, "Content-Length inválido.")
                return
            if declared > self.max_bytes:
                await self._reject(scope, receive, send, 413, "Petición demasiado grande.")
                return

        buffered: list[dict[str, Any]] = []
        received = 0
        more_body = True
        while more_body:
            message = await receive()
            message_type = message.get("type")
            if message_type == "http.disconnect":
                return
            if message_type != "http.request":
                buffered.append(message)
                continue

            chunk = message.get("body", b"") or b""
            received += len(chunk)
            if received > self.max_bytes:
                await self._reject(scope, receive, send, 413, "Petición demasiado grande.")
                return
            buffered.append(message)
            more_body = bool(message.get("more_body", False))

        index = 0

        async def replay_receive():
            nonlocal index
            if index < len(buffered):
                message = buffered[index]
                index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay_receive, send)

    @staticmethod
    async def _reject(scope, receive, send, status_code: int, detail: str):
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        await response(scope, receive, send)
