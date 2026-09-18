"""Central lifecycle for user-owned persistent data.

Account identity is still keyed by username in the current schema, so every
path that creates or destroys that identity must clear all non-account data
owned by that username. Keeping this cascade in one place prevents a reused
username from inheriting state from a previous account.
"""
from __future__ import annotations

import chronicles_run_store
import feedback_store
import game_store
import matthias_daily_store
import matthias_memory_store
import profile_store
import pvp_store


async def purge_user_data(username: str) -> dict[str, int]:
    """Delete all non-account persistent data owned by username.

    The account document itself is deliberately excluded. Callers that delete
    an account can therefore remove it last, preserving the existing fail-safe
    behaviour: a partial storage outage never makes the identity disappear
    while owned data may still remain.
    """
    deleted_games = await game_store.delete_games_by_owner(username)
    await profile_store.delete_profile(username)
    await pvp_store.delete_user_data(username)
    deleted_chronicles_runs = await chronicles_run_store.delete_user_runs(username)
    await matthias_daily_store.delete_user_daily(username)
    await matthias_memory_store.delete_user_memory(username)
    deleted_feedback = await feedback_store.delete_feedback_by_user(username)
    return {
        "games": int(deleted_games),
        "chroniclesRuns": int(deleted_chronicles_runs),
        "feedback": int(deleted_feedback),
    }
