"""Guided, grounded, one-per-day audience with Matthias."""
from __future__ import annotations
from typing import Any, Callable
from datetime import datetime, timezone
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from narrative_cloudflare import generate_narrative, get_ai_event_metrics
import matthias_daily_store as store
import matthias_episode_store as episode_store
import matthias_memory_store as memory_store

logger = logging.getLogger("uvicorn.error")

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
    consultationId: str | None = Field(default=None, max_length=80)


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


async def _memory_summary(username: str) -> dict[str, Any]:
    summary = await memory_store.user_summary(username)
    try:
        episodic = await episode_store.summary(username)
    except Exception as exc:
        logger.warning("matthias_episode_summary_failed error=%s", type(exc).__name__)
        episodic = {"episodeCount": 0, "recentEpisodes": [], "callbackCandidates": []}
    return {**summary, "episodicMemory": episodic}


def build_matthias_daily_router(*, auth_dependency: Callable[..., Any], admin_dependency: Callable[..., Any] | None = None, is_admin_check: Callable[[str], bool] | None = None) -> APIRouter:
    router = APIRouter()

    def _is_admin(username: str) -> bool:
        return bool(is_admin_check and is_admin_check(username))

    @router.get("/api/matthias/daily")
    async def daily_status(username: str = Depends(auth_dependency)):
        if _is_admin(username):
            base = {"used": False, "pending": False, "unlimited": True}
        else:
            base = {**await store.status(username), "unlimited": False}
        try:
            summary = await _memory_summary(username)
        except Exception:
            summary = {"consultations": 0, "lastConsultedAt": None, "mainAdvice": None, "episodicMemory": {"episodeCount": 0, "recentEpisodes": [], "callbackCandidates": []}}
        return {**base, "memory": summary}

    @router.post("/api/matthias/daily")
    async def daily_ask(request: Request, body: MatthiasDailyRequest, username: str = Depends(auth_dependency)):
        facts = _safe_facts(body.questionKind, body.facts)
        admin_unlimited = _is_admin(username)
        try:
            replay = await memory_store.replay_consultation(username, body.consultationId)
        except Exception as exc:
            logger.warning("matthias_memory_replay_failed error=%s", type(exc).__name__)
            replay = None
        if replay:
            if replay.get("questionKind") != body.questionKind:
                raise HTTPException(409, "Ese identificador de consulta ya pertenece a otra pregunta de Matthias.")
            return {
                "used": not admin_unlimited,
                "pending": False,
                "unlimited": admin_unlimited,
                "questionKind": body.questionKind,
                "text": replay.get("text"),
                "provider": "cloudflare",
                "retryable": False,
                "replayed": True,
                "memory": await _memory_summary(username),
            }
        try:
            await memory_store.observe_facts(username, facts)
            await episode_store.observe(username, facts)
            memory_context = await memory_store.context(username, facts)
            episodic_context = await episode_store.context(username)
            memory_context = {**memory_context, "episodic": episodic_context}
        except Exception as exc:
            logger.warning("matthias_memory_read_failed error=%s", type(exc).__name__)
            memory_context = {"consultation_count": 0, "question_counts": {}, "prior_advice": [], "progress_since_last": {}, "episodic": {"episode_count": 0, "callback_candidates": []}}
        worker_facts = {**facts, "matthias_memory": memory_context}
        claim = {"claimed": True, "reservation": "admin-unlimited"} if admin_unlimited else await store.reserve(username)
        if not claim.get("claimed"):
            if claim.get("used"):
                raise HTTPException(429, "Matthias ya ha concedido su audiencia de hoy.")
            raise HTTPException(409, "Matthias ya está atendiendo otra consulta tuya. Bitte, una audiencia a la vez.")
        reservation = str(claim.get("reservation") or "")
        try:
            request_id = (getattr(request.state, "request_id", None) or "")[:80] or None
            result = await generate_narrative(
                "matthias_daily", worker_facts, tone="friendly_sarcastic", locale="es-ES",
                request_kind=f"matthias_{body.questionKind}", request_id=request_id,
            )
            text = str(result.get("text") or "").strip()
            # Sólo una respuesta real de Workers AI consume la audiencia. Un fallback
            # por caída del proveedor libera la reserva y permite reintentar hoy.
            if result.get("provider") != "cloudflare" or not text:
                if not admin_unlimited:
                    await store.release(username, reservation)
                return {"used": False, "pending": False, "unlimited": admin_unlimited, "provider": result.get("provider") or "local", "text": text or None, "retryable": True}
            if admin_unlimited:
                try:
                    await memory_store.record_consultation(
                        username, body.questionKind, text, facts, consultation_id=body.consultationId
                    )
                except Exception as exc:
                    logger.warning("matthias_memory_write_failed error=%s", type(exc).__name__)
                memory = await _memory_summary(username)
                return {"used": False, "pending": False, "unlimited": True, "questionKind": body.questionKind, "text": text, "provider": "cloudflare", "retryable": False, "memory": memory}
            committed = await store.commit(username, reservation, body.questionKind, text)
            try:
                await memory_store.record_consultation(
                    username, body.questionKind, text, facts, consultation_id=body.consultationId
                )
            except Exception as exc:
                logger.warning("matthias_memory_write_failed error=%s", type(exc).__name__)
            memory = await _memory_summary(username)
            return {**committed, "unlimited": False, "provider": "cloudflare", "retryable": False, "memory": memory}
        except Exception:
            if not admin_unlimited:
                await store.release(username, reservation)
            raise

    @router.get("/api/matthias/briefing")
    async def game_briefing(username: str = Depends(auth_dependency)):
        try:
            result = await memory_store.briefing_for_user(username)
            return {**result, "memory": await _memory_summary(username)}
        except Exception as exc:
            logger.warning("matthias_briefing_failed error=%s", type(exc).__name__)
            return {"text": "Briefing corto: revisa jaques, capturas y amenazas antes de mover. El archivo está momentáneamente cerrado, pero tus piezas siguen teniendo obligaciones.", "memory": None}

    @router.post("/api/matthias/reset-memory")
    async def reset_own_memory(username: str = Depends(auth_dependency)):
        # Deliberately does not reset the daily quota: this endpoint exists for
        # "Empezar de cero", not as a back door to buy more audiences today.
        # Episodes live in the same Matthias document, so this one deletion also
        # clears the episodic biography and its observation baseline.
        await memory_store.delete_user_memory(username)
        return {"reset": True}

    if admin_dependency is not None:
        @router.get("/api/admin/matthias-status")
        async def admin_matthias_status(_: Any = Depends(admin_dependency)):
            status = await memory_store.admin_status()
            today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            return {
                **status,
                "aiToday": get_ai_event_metrics("matthias_daily", since_epoch=int(today.timestamp())),
            }

    return router