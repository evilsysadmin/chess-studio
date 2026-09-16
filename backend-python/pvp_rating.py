"""Server-authoritative Elo state for War Room human-vs-human games.

The browser profile is intentionally not consulted here. PvP identity lives in
the account document and can advance only from a finished backend-authoritative
match. Conditional writes make settlement idempotent and prevent replaying an
old result over a newer rating.
"""
from __future__ import annotations

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable
import users_store as ustore

DEFAULT_RATING = 400
MIN_RATING = 100
MAX_RATING = 10_000
ELO_K = 32
_VALID_RESULTS = {"1-0", "0-1", "1/2-1/2"}


def _rating(value) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = DEFAULT_RATING
    return max(MIN_RATING, min(MAX_RATING, parsed))


def next_ratings(white_rating: int, black_rating: int, result: str) -> tuple[int, int]:
    """Return deterministic Elo ratings for one authoritative result."""
    white = _rating(white_rating)
    black = _rating(black_rating)
    if result not in _VALID_RESULTS:
        raise ValueError("Resultado PvP no válido para rating.")

    white_score = 1.0 if result == "1-0" else 0.0 if result == "0-1" else 0.5
    black_score = 1.0 - white_score
    white_expected = 1.0 / (1.0 + 10.0 ** ((black - white) / 400.0))
    black_expected = 1.0 - white_expected
    next_white = _rating(round(white + ELO_K * (white_score - white_expected)))
    next_black = _rating(round(black + ELO_K * (black_score - black_expected)))
    return next_white, next_black


async def get_rating(username: str) -> int:
    user = await ustore.get_user(username)
    return _rating((user or {}).get("pvp_rating"))


async def _apply_rating(
    username: str,
    *,
    match_id: str,
    expected_rating: int,
    next_rating: int,
) -> bool:
    """Apply one side exactly once and only from the expected prior rating."""
    expected = _rating(expected_rating)
    target = _rating(next_rating)
    col = await ustore._get_collection()
    if col is not None:
        try:
            result = await col.update_one(
                {
                    "_id": username,
                    "pvp_last_settled_match": {"$ne": match_id},
                    "$or": [
                        {"pvp_rating": expected},
                        {"pvp_rating": {"$exists": False}} if expected == DEFAULT_RATING else {"pvp_rating": {"$type": "missing"}},
                    ],
                },
                {
                    "$set": {
                        "pvp_rating": target,
                        "pvp_last_settled_match": match_id,
                    },
                    "$inc": {"pvp_rating_games": 1},
                },
            )
            if result.matched_count:
                return True
            current = await col.find_one(
                {"_id": username},
                {"pvp_rating": 1, "pvp_last_settled_match": 1},
            )
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo actualizar el rating PvP.") from exc
        return bool(current and current.get("pvp_last_settled_match") == match_id)

    user = ustore._memory_users.get(username)
    if user is None:
        return False
    if user.get("pvp_last_settled_match") == match_id:
        return True
    if _rating(user.get("pvp_rating")) != expected:
        return False
    user["pvp_rating"] = target
    user["pvp_last_settled_match"] = match_id
    user["pvp_rating_games"] = int(user.get("pvp_rating_games") or 0) + 1
    return True


async def settle_match(match_id: str, match: dict | None) -> dict | None:
    """Settle a finished match into both account ratings.

    The starting ratings are frozen into the authoritative match at challenge
    acceptance. Repeating settlement for the same match is harmless; replaying
    an older match after a newer one cannot overwrite the newer rating because
    the expected-prior-rating guard will no longer match.
    """
    if not match or match.get("status") != "finished":
        return None
    result = str(match.get("result") or "")
    if result not in _VALID_RESULTS:
        return None

    white = str(match.get("white") or "")
    black = str(match.get("black") or "")
    if not white or not black or white == black:
        return None

    white_before = _rating(match.get("white_rating"))
    black_before = _rating(match.get("black_rating"))
    white_after, black_after = next_ratings(white_before, black_before, result)

    white_ok = await _apply_rating(
        white,
        match_id=match_id,
        expected_rating=white_before,
        next_rating=white_after,
    )
    black_ok = await _apply_rating(
        black,
        match_id=match_id,
        expected_rating=black_before,
        next_rating=black_after,
    )
    if not (white_ok and black_ok):
        return None
    return {
        "white": white_after,
        "black": black_after,
    }
