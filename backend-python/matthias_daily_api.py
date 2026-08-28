"""Guided, grounded, one-per-day audience with Matthias."""
from __future__ import annotations
from typing import Any, Callable
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from narrative_cloudflare import generate_narrative
import matthias_daily_store as store

QUESTION_KINDS = frozenset({"improve", "tactics", "strengths", "action", "openings"})
ALLOWED_FACT_KEYS = frozenset({
    "total_games", "record", "color_usage", "longest_win_streak", "human_captures", "by_mode",
    "favorite_opening", "openings", "rating_trend", "cpu_rivalry", "noteworthy_incidents",
    "puzzles_solved", "personal_training_positions", "achievements_unlocked", "achievements_total",
    "worst_recorded_move",
})

class MatthiasDailyRequest(BaseModel):
    questionKind: str = Field(max_length=32)
    facts: dict[str, Any] = Field(default_factory=dict)


def _safe_facts(kind: str, facts: dict[str, Any]) -> dict[str, Any]:
    if kind not in QUESTION_KINDS:
        raise HTTPException(400, "Consulta de Matthias no válida.")
    if not isinstance(facts, dict):
        raise HTTPException(400, "Datos de consulta no válidos.")
    clean = {key: value for key, value in facts.items() if key in ALLOWED_FACT_KEYS}
    clean["question_kind"] = kind
    if int(clean.get("total_games") or 0) < 1:
        raise HTTPException(409, "Juega al menos una partida antes de pedir audiencia a Matthias.")
    return clean


def build_matthias_daily_router(*, auth_dependency: Callable[..., Any]) -> APIRouter:
    router = APIRouter()

    @router.get("/api/matthias/daily")
    async def daily_status(username: str = Depends(auth_dependency)):
        return await store.status(username)

    @router.post("/api/matthias/daily")
    async def daily_ask(request: Request, body: MatthiasDailyRequest, username: str = Depends(auth_dependency)):
        facts = _safe_facts(body.questionKind, body.facts)
        claim = await store.reserve(username)
        if not claim.get("claimed"):
            if claim.get("used"):
                raise HTTPException(429, "Matthias ya ha concedido su audiencia de hoy.")
            raise HTTPException(409, "Matthias ya está atendiendo otra consulta tuya. Bitte, una audiencia a la vez.")
        reservation = str(claim.get("reservation") or "")
        try:
            request_id = (getattr(request.state, "request_id", None) or "")[:80] or None
            result = await generate_narrative(
                "matthias_daily", facts, tone="friendly_sarcastic", locale="es-ES",
                request_kind=f"matthias_{body.questionKind}", request_id=request_id,
            )
            text = str(result.get("text") or "").strip()
            # Sólo una respuesta real de Workers AI consume la audiencia. Un fallback
            # por caída del proveedor libera la reserva y permite reintentar hoy.
            if result.get("provider") != "cloudflare" or not text:
                await store.release(username, reservation)
                return {"used": False, "pending": False, "provider": result.get("provider") or "local", "text": text or None, "retryable": True}
            committed = await store.commit(username, reservation, body.questionKind, text)
            return {**committed, "provider": "cloudflare", "retryable": False}
        except Exception:
            await store.release(username, reservation)
            raise

    return router
