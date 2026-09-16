"""Early ASGI guard for obviously hostile filesystem/path probes.

This sits outside FastAPI in the production entrypoint so scanner traffic aimed
at repository metadata, dotenv files or path traversal dies before routing,
rate-limit bookkeeping, tracing, database access or application middleware.
Legitimate unknown routes keep flowing to FastAPI and retain the normal 404
observability contract.
"""
from __future__ import annotations

from urllib.parse import unquote

_SENSITIVE_SEGMENTS = frozenset({".git", ".svn", ".hg", ".bzr"})
_NOT_FOUND_BODY = b'{"detail":"Not Found"}'
_NOT_FOUND_HEADERS = (
    (b"content-type", b"application/json"),
    (b"content-length", str(len(_NOT_FOUND_BODY)).encode("ascii")),
    (b"cache-control", b"no-store"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
)


def _decoded_variants(path: str):
    """Yield the path plus a few decode rounds for double-encoded probes."""
    current = path
    for _ in range(3):
        yield current
        decoded = unquote(current, errors="replace")
        if decoded == current:
            break
        current = decoded


def _variant_is_hostile(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if "\x00" in normalized:
        return True
    for raw_segment in normalized.split("/"):
        segment = raw_segment.strip().casefold()
        if not segment:
            continue
        if segment == "..":
            return True
        if segment in _SENSITIVE_SEGMENTS:
            return True
        if segment == ".env" or segment.startswith(".env."):
            return True
    return False


def is_hostile_request_path(path: str, raw_path: bytes | None = None) -> bool:
    """Identify high-confidence secret/repository/traversal probes only.

    The rule is intentionally narrow: normal typos and unknown application
    routes are *not* classified as hostile and continue to FastAPI unchanged.
    """
    candidates = [str(path or "")]
    if raw_path:
        candidates.append(raw_path.decode("latin-1", errors="replace"))
    return any(
        _variant_is_hostile(variant)
        for candidate in candidates
        for variant in _decoded_variants(candidate)
    )


class HostilePathGuard:
    """ASGI middleware that cheaply returns a generic 404 for hostile probes."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http" and is_hostile_request_path(
            scope.get("path", ""), scope.get("raw_path")
        ):
            await send(
                {
                    "type": "http.response.start",
                    "status": 404,
                    "headers": list(_NOT_FOUND_HEADERS),
                }
            )
            await send({"type": "http.response.body", "body": _NOT_FOUND_BODY})
            return
        await self.app(scope, receive, send)
