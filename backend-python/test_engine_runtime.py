import asyncio
import threading
import time

from engine_runtime import configured_engine_workers, run_engine_work


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
