import asyncio
import threading
import time

import pytest

from engine_runtime import (
    EngineBackpressureError,
    configured_engine_workers,
    configured_optional_engine_limit,
    engine_optional_pressure,
    reset_engine_pressure_state,
    run_engine_work,
    run_optional_engine_work,
)


def test_engine_work_runs_outside_the_event_loop_thread():
    event_loop_thread = threading.get_ident()

    async def scenario():
        return await run_engine_work(threading.get_ident)

    engine_thread = asyncio.run(scenario())
    assert engine_thread != event_loop_thread


def test_engine_work_is_bounded_to_one_search_at_a_time():
    active = 0
    maximum_active = 0
    guard = threading.Lock()

    def search():
        nonlocal active, maximum_active
        with guard:
            active += 1
            maximum_active = max(maximum_active, active)
        time.sleep(0.03)
        with guard:
            active -= 1
        return "legal-move"

    async def scenario():
        return await asyncio.gather(run_engine_work(search), run_engine_work(search))

    assert asyncio.run(scenario()) == ["legal-move", "legal-move"]
    assert maximum_active == 1


def test_engine_worker_config_defaults_to_one_and_is_bounded(monkeypatch):
    monkeypatch.delenv("CHESS_ENGINE_WORKERS", raising=False)
    assert configured_engine_workers() == 1

    monkeypatch.setenv("CHESS_ENGINE_WORKERS", "2")
    assert configured_engine_workers() == 2

    monkeypatch.setenv("CHESS_ENGINE_WORKERS", "99")
    assert configured_engine_workers() == 4

    monkeypatch.setenv("CHESS_ENGINE_WORKERS", "nonsense")
    assert configured_engine_workers() == 1


def test_optional_engine_limit_defaults_to_worker_count_and_is_bounded(monkeypatch):
    monkeypatch.delenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT", raising=False)
    monkeypatch.setenv("CHESS_ENGINE_WORKERS", "1")
    assert configured_optional_engine_limit() == 1

    monkeypatch.setenv("CHESS_ENGINE_WORKERS", "2")
    assert configured_optional_engine_limit() == 2

    monkeypatch.setenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT", "99")
    assert configured_optional_engine_limit() == 8

    monkeypatch.setenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT", "nonsense")
    assert configured_optional_engine_limit() == 2


def test_optional_engine_work_sheds_queue_but_critical_work_stays_admissible(monkeypatch):
    monkeypatch.setenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT", "1")
    reset_engine_pressure_state()
    started = threading.Event()
    release = threading.Event()

    def slow_optional():
        started.set()
        release.wait(timeout=1)
        return "optional"

    async def scenario():
        first = asyncio.create_task(run_optional_engine_work(slow_optional))
        while not started.is_set():
            await asyncio.sleep(0.001)

        with pytest.raises(EngineBackpressureError):
            await run_optional_engine_work(lambda: "second optional")

        critical = asyncio.create_task(run_engine_work(lambda: "critical"))
        release.set()
        return await first, await critical

    assert asyncio.run(scenario()) == ("optional", "critical")
    pressure = engine_optional_pressure()
    assert pressure["optional_inflight"] == 0
    assert pressure["optional_limit"] == 1
    assert pressure["optional_rejections"] == 1
    reset_engine_pressure_state()
