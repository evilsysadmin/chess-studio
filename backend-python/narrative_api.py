"""Router factory for the narrative endpoint.

Main.py injects its *existing* authentication dependencies, keeping the route
under the same JWT/admin policy as the rest of Chess Studio.
"""
from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict, deque
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from narrative_cloudflare import RICH_ANALYSIS_EVENT_TYPES, generate_narrative, get_ai_metrics
import matthias_memory_store as matthias_memory_store

narrative_logger = logging.getLogger("uvicorn.error")


class NarrativeRequest(BaseModel):
    eventType: str = Field(default="generic", max_length=48)
    requestKind: str = Field(default="default", max_length=32)
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




class CooldownLimiter:
    def __init__(self, cooldown_seconds: int, max_identities: int = 5000, detail: str = "Manual AI refresh cooldown"):
        self.cooldown_seconds = max(1, int(cooldown_seconds))
        self.max_identities = max(100, int(max_identities))
        self.detail = str(detail or "Manual AI refresh cooldown")[:120]
        self._last: OrderedDict[str, float] = OrderedDict()

    def check(self, key: str) -> None:
        now = time.monotonic()
        previous = self._last.pop(key, None)
        if previous is not None:
            remaining = self.cooldown_seconds - (now - previous)
            if remaining > 0:
                self._last[key] = previous
                raise HTTPException(
                    status_code=429,
                    detail=self.detail,
                    headers={"Retry-After": str(max(1, int(remaining + 0.999)))},
                )
        if previous is not None:
            self._last[key] = previous

    def commit(self, key: str) -> None:
        self._last.pop(key, None)
        self._last[key] = time.monotonic()
        while len(self._last) > self.max_identities:
            self._last.popitem(last=False)


def _identity_name(identity: Any) -> str:
    if isinstance(identity, str):
        return identity.strip()
    if isinstance(identity, dict):
        for key in ("username", "sub", "user"):
            value = identity.get(key)
            if value:
                return str(value).strip()
    value = getattr(identity, "username", None)
    return str(value).strip() if value else ""


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


def _manual_cooldown_seconds(env_name: str) -> int:
    raw = (os.getenv(env_name) or "").strip()
    try:
        return max(60, min(int(raw), 7 * 24 * 60 * 60)) if raw else 6 * 60 * 60
    except ValueError:
        return 6 * 60 * 60


def _portrait_manual_cooldown_seconds() -> int:
    return _manual_cooldown_seconds("AI_PORTRAIT_MANUAL_COOLDOWN_SECONDS")


def _training_plan_manual_cooldown_seconds() -> int:
    return _manual_cooldown_seconds("AI_TRAINING_PLAN_MANUAL_COOLDOWN_SECONDS")


def _personal_puzzle_batch_cooldown_seconds() -> int:
    raw = (os.getenv("AI_PERSONAL_PUZZLE_COOLDOWN_SECONDS") or "").strip()
    try:
        return max(60, min(int(raw), 7 * 24 * 60 * 60)) if raw else 12 * 60 * 60
    except ValueError:
        return 12 * 60 * 60


def build_narrative_router(
    *,
    auth_dependency: Callable[..., Any],
    admin_dependency: Callable[..., Any] | None = None,
    is_admin_check: Callable[[str], bool] | None = None,
    rate_limit_per_minute: int = 30,
) -> APIRouter:
    router = APIRouter()
    # Un retrato fallido no debe bloquear los comentarios de partida ni al
    # revés. Son cargas y ritmos distintos, así que no comparten bucket.
    comment_limiter = SlidingWindowLimiter(rate_limit_per_minute, 60)
    portrait_limiter = SlidingWindowLimiter(max(5, rate_limit_per_minute), 60)
    analysis_limiter = SlidingWindowLimiter(max(10, rate_limit_per_minute), 60)
    portrait_manual_limiter = CooldownLimiter(
        _portrait_manual_cooldown_seconds(), detail="Player portrait manual refresh cooldown"
    )
    training_plan_manual_limiter = CooldownLimiter(
        _training_plan_manual_cooldown_seconds(), detail="Training plan manual refresh cooldown"
    )
    personal_puzzle_batch_limiter = CooldownLimiter(
        _personal_puzzle_batch_cooldown_seconds(), detail="Personal puzzle generation cooldown"
    )

    @router.post("/api/narrative")
    async def narrative(request: Request, body: NarrativeRequest, identity: Any = Depends(auth_dependency)):
        identity_key = _identity_key(identity, request)
        identity_name = _identity_name(identity)
        admin_bypass = bool(is_admin_check and identity_name and is_admin_check(identity_name))
        request_kind = (body.requestKind or "default").strip().lower()
        allowed_request_kinds = {"default", "portrait_auto", "portrait_manual", "post_game", "combat_briefing", "combat_debrief", "unit_bio", "observability_summary", "training_plan", "training_plan_manual", "personal_puzzle_batch", "matthias_position"}
        if request_kind not in allowed_request_kinds:
            request_kind = "default"
        is_portrait = body.eventType == "player_portrait"
        is_analysis = body.eventType in RICH_ANALYSIS_EVENT_TYPES
        bucket = "player_portrait" if is_portrait else "analysis" if is_analysis else "comments"
        request_id = (getattr(request.state, "request_id", None) or request.headers.get("x-request-id") or "").strip()[:80] or None
        try:
            (portrait_limiter if is_portrait else analysis_limiter if is_analysis else comment_limiter).check(identity_key)
            if is_portrait and request_kind == "portrait_manual" and not admin_bypass:
                portrait_manual_limiter.check(identity_key)
            if body.eventType == "training_plan" and request_kind == "training_plan_manual" and not admin_bypass:
                training_plan_manual_limiter.check(identity_key)
            if body.eventType == "personal_puzzle_batch" and request_kind == "personal_puzzle_batch" and not admin_bypass:
                personal_puzzle_batch_limiter.check(identity_key)
        except HTTPException as exc:
            if exc.status_code == 429:
                narrative_logger.warning(
                    "narrative_429 request_id=%s event_type=%s request_kind=%s bucket=%s reason=%s retry_after=%s",
                    request_id or "-",
                    str(body.eventType or "generic")[:48],
                    request_kind,
                    bucket,
                    str(exc.detail or "rate_limited")[:80],
                    (exc.headers or {}).get("Retry-After", "-"),
                )
            raise
        effective_facts = body.facts
        if identity_name and body.eventType in {"player_portrait", "training_plan", "post_game_autopsy", "matthias_position"}:
            try:
                if body.eventType == "player_portrait":
                    await matthias_memory_store.observe_facts(identity_name, body.facts)
                memory_context = await matthias_memory_store.context(identity_name, body.facts)
                effective_facts = {**body.facts, "matthias_memory": memory_context}
            except Exception as exc:
                narrative_logger.warning("matthias_memory_context_failed event_type=%s error=%s", body.eventType, type(exc).__name__)
        result = await generate_narrative(
            body.eventType,
            effective_facts,
            tone=body.tone,
            locale=body.locale,
            request_kind=request_kind,
            request_id=request_id,
        )
        if identity_name and body.eventType == "matthias_position" and str(result.get("text") or "").strip():
            try:
                await matthias_memory_store.record_emblematic_position(identity_name, body.facts)
            except Exception as exc:
                narrative_logger.warning("matthias_position_memory_failed error=%s", type(exc).__name__)
        # Sólo una lectura AI real consume la ventana manual de seis horas. Si
        # Cloudflare falla y usamos fallback, el usuario puede reintentar cuando
        # vuelva el proveedor sin quedar castigado por un fallo ajeno.
        if is_portrait and request_kind == "portrait_manual" and result.get("provider") == "cloudflare" and not admin_bypass:
            portrait_manual_limiter.commit(identity_key)
        if body.eventType == "training_plan" and request_kind == "training_plan_manual" and result.get("provider") == "cloudflare" and not admin_bypass:
            training_plan_manual_limiter.commit(identity_key)
        if body.eventType == "personal_puzzle_batch" and request_kind == "personal_puzzle_batch" and result.get("provider") == "cloudflare" and not admin_bypass:
            personal_puzzle_batch_limiter.commit(identity_key)
        return result

    if admin_dependency is not None:
        @router.get("/api/admin/ai-metrics")
        async def ai_metrics(_: Any = Depends(admin_dependency)):
            return get_ai_metrics()

    return router
