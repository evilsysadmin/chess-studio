"""ASGI middleware pequeño para limitar y sanear cuerpos HTTP.

No confía únicamente en Content-Length: también cuenta los bytes recibidos por
chunks. Rechaza además framing ambiguo (Transfer-Encoding + Content-Length o
Content-Length contradictorios) antes de que distintos proxies puedan
interpretar la misma petición de forma diferente.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from starlette.responses import JSONResponse

ASGIApp = Callable[[dict[str, Any], Callable[[], Awaitable[dict[str, Any]]], Callable[[dict[str, Any]], Awaitable[None]]], Awaitable[None]]


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = 1_048_576, path_limits: dict[str, int] | None = None):
        self.app = app
        self.max_bytes = max(1, int(max_bytes))
        self.path_limits = {str(path): max(1, int(limit)) for path, limit in (path_limits or {}).items()}

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_limit = self.path_limits.get(str(scope.get("path") or ""), self.max_bytes)
        header_pairs = [(bytes(k).lower(), bytes(v)) for k, v in scope.get("headers", [])]
        content_lengths = [value for key, value in header_pairs if key == b"content-length"]
        transfer_encodings = [value for key, value in header_pairs if key == b"transfer-encoding"]

        # Dos mecanismos de framing simultáneos son ambiguos entre proxies y
        # backends. Fallar cerrado evita variantes CL.TE / TE.CL de smuggling.
        if content_lengths and transfer_encodings:
            await self._reject(
                scope,
                receive,
                send,
                400,
                "Transfer-Encoding y Content-Length no pueden combinarse.",
            )
            return

        if content_lengths:
            # Cabeceras Content-Length contradictorias son otro patrón clásico
            # de request smuggling. Duplicados idénticos se toleran; valores
            # distintos fallan cerrado.
            if len(set(content_lengths)) > 1:
                await self._reject(scope, receive, send, 400, "Content-Length contradictorio.")
                return
            raw_content_length = content_lengths[0]
            try:
                declared = int(raw_content_length.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                await self._reject(scope, receive, send, 400, "Content-Length inválido.")
                return
            if declared < 0:
                await self._reject(scope, receive, send, 400, "Content-Length inválido.")
                return
            if declared > request_limit:
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
            if received > request_limit:
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
