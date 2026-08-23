"""Router factory for the narrative endpoint.

Main.py injects its *existing* authentication dependencies, keeping the route
under the same JWT/admin policy as the rest of Chess Studio.
"""
from __future__ import annotations

import time
from collections import OrderedDict, deque
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from narrative_cloudflare import generate_narrative, get_ai_metrics


class NarrativeRequest(BaseModel):
    eventType: str = Field(default="generic", max_length=48)
    facts: dict[str, Any] = Field(default_factory=dict)
    tone: str = Field(default="friendly_sarcastic", max_length=32)
    locale: str = Field(default="es-ES", max_length=16)


class SlidingWindowLimiter:
    def __init__(self, limit: int = 30, window_seconds: int = 60, max_identities: int = 5000):
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_identities = max(100, max_identities)
        self._events: OrderedDict[str, deque[float]] = OrderedDict()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds

        q = self._events.pop(key, deque())
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= self.limit:
            self._events[key] = q
            raise HTTPException(status_code=429, detail="Narrative rate limit exceeded")

        q.append(now)
        self._events[key] = q

        # A botnet / rotating-IP attack must not grow this in-process map forever.
        while len(self._events) > self.max_identities:
            self._events.popitem(last=False)


def _identity_key(identity: Any, request: Request) -> str:
    if isinstance(identity, str) and identity:
        return f"user:{identity.lower()}"
    if isinstance(identity, dict):
        for key in ("username", "sub", "user"):
            value = identity.get(key)
            if value:
                return f"user:{str(value).lower()}"
    value = getattr(identity, "username", None)
    if value:
        return f"user:{str(value).lower()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


def build_narrative_router(
    *,
    auth_dependency: Callable[..., Any],
    admin_dependency: Callable[..., Any] | None = None,
    rate_limit_per_minute: int = 30,
) -> APIRouter:
    router = APIRouter()
    limiter = SlidingWindowLimiter(rate_limit_per_minute, 60)

    @router.post("/api/narrative")
    async def narrative(request: Request, body: NarrativeRequest, identity: Any = Depends(auth_dependency)):
        limiter.check(_identity_key(identity, request))
        return await generate_narrative(body.eventType, body.facts, tone=body.tone, locale=body.locale)

    if admin_dependency is not None:
        @router.get("/api/admin/ai-metrics")
        async def ai_metrics(_: Any = Depends(admin_dependency)):
            return get_ai_metrics()

    return router
