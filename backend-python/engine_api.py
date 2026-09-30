"""HTTP adapter for optional chess-engine admission control."""
from __future__ import annotations

from fastapi import HTTPException

from engine_runtime import EngineBackpressureError, run_engine_work, run_optional_engine_work


async def run_optional_analysis(function, *args, **kwargs):
    try:
        return await run_optional_engine_work(function, *args, **kwargs)
    except EngineBackpressureError as exc:
        raise HTTPException(
            status_code=503,
            detail="Análisis temporalmente ocupado. Reintenta en un instante.",
            headers={"Retry-After": "1"},
        ) from exc
