"""Authoritative human-vs-human War Room matchmaking API."""

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import chess
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

import pvp_rating as rating_store
import pvp_residents as residents
import pvp_sparring as sparring
import pvp_store as store
from db import PersistentStorageUnavailable
from engine_runtime import run_engine_work

DEFAULT_RATING = rating_store.DEFAULT_RATING
PVP_TIME_CONTROL_ID = "10+0"
PVP_INITIAL_MS = 10 * 60 * 1000
PVP_INCREMENT_MS = 0
PVP_HANDOFF_SECONDS = 5
PVP_READY_TIMEOUT_SECONDS = 30
PVP_PRESENCE_ONLINE_SECONDS = 4
PVP_PRESENCE_RECONNECTING_SECONDS = 12
PVP_DISCONNECT_GRACE_SECONDS = 60

logger = logging.getLogger("uvicorn.error")
RATING_TIERS = (
    (0, 699, "Principiante"),
    (700, 999, "Aficionado"),
    (1000, 1299, "Intermedio"),
    (1300, 1599, "Avanzado"),
    (1600, 1899, "Experto"),
    (1900, 10_000, "Maestro"),
)


class ChallengeRequest(BaseModel):
    opponent: str = Field(min_length=1, max_length=64)


class LobbyChatRequest(BaseModel):
    text: str = Field(min_length=1, max_length=240)


class MoveRequest(BaseModel):
    from_square: str = Field(alias="from", pattern=r"^[a-h][1-8]$")
    to_square: str = Field(alias="to", pattern=r"^[a-h][1-8]$")
    promotion: str | None = Field(default=None, pattern=r"^[qrbnQRBN]$")


def _rating_tier(rating: int) -> str:
    for low, high, label in RATING_TIERS:
        if low <= rating <= high:
            return label
    return "Maestro"


def _as_utc(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value):
    if isinstance(value, datetime):
        return _as_utc(value).isoformat().replace("+00:00", "Z")
    return value


def _serialize(value):
    if isinstance(value, datetime):
        return _iso(value)
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def _public_roster(
    row: dict,
    username: str,
    head_to_head: dict | None = None,
    challenge_cooldown_until: datetime | None = None,
) -> dict:
    payload = {
        "username": row["username"],
        "rating": int(row.get("rating", DEFAULT_RATING)),
        "tier": row.get("tier") or _rating_tier(int(row.get("rating", DEFAULT_RATING))),
        "joinedAt": _iso(row.get("joined_at")),
        "isSelf": row["username"] == username,
    }
    if challenge_cooldown_until and row["username"] != username:
        payload["challengeCooldownUntil"] = _iso(challenge_cooldown_until)
    identity = residents.public_identity(row.get("username"))
    if identity:
        payload.update(identity)
    if head_to_head and row["username"] != username:
        payload["headToHead"] = {
            "games": int(head_to_head.get("games", 0)),
            "wins": int(head_to_head.get("wins", 0)),
            "draws": int(head_to_head.get("draws", 0)),
            "losses": int(head_to_head.get("losses", 0)),
            "lastPlayedAt": _iso(head_to_head.get("last_played_at")),
        }
    return payload


def _public_challenge(row: dict, username: str) -> dict:
    created_at = row.get("created_at")
    expires_at = (
        created_at + timedelta(seconds=store.CHALLENGE_TTL_SECONDS)
        if isinstance(created_at, datetime)
        else None
    )
    return {
        "id": row["id"],
        "challenger": row["challenger"],
        "opponent": row["opponent"],
        "challengerRating": int(row.get("challenger_rating", DEFAULT_RATING)),
        "opponentRating": int(row.get("opponent_rating", DEFAULT_RATING)),
        "status": row["status"],
        "direction": "incoming" if row["opponent"] == username else "outgoing",
        "createdAt": _iso(created_at),
        "expiresAt": _iso(expires_at),
        "resolvedAt": _iso(row.get("resolved_at")),
        "matchId": row.get("match_id"),
    }


def _player_color(match: dict, username: str) -> chess.Color | None:
    if match.get("white") == username:
        return chess.WHITE
    if match.get("black") == username:
        return chess.BLACK
    return None


def _clock_snapshot(match: dict, now: datetime | None = None) -> dict:
    stamp = now or store.utcnow()
    white_ms = max(0, int(match.get("white_clock_ms", PVP_INITIAL_MS)))
    black_ms = max(0, int(match.get("black_clock_ms", PVP_INITIAL_MS)))
    started = match.get("turn_started_at")
    normalized_started = _as_utc(started) if isinstance(started, datetime) else None
    normalized_stamp = _as_utc(stamp)
    running = (
        match.get("turn", "w")
        if match.get("status") == "active"
        and normalized_started is not None
        and normalized_started <= normalized_stamp
        else None
    )
    if running in {"w", "b"} and normalized_started is not None:
        elapsed_ms = max(0, int((normalized_stamp - normalized_started).total_seconds() * 1000))
        if running == "w":
            white_ms = max(0, white_ms - elapsed_ms)
        else:
            black_ms = max(0, black_ms - elapsed_ms)
    return {
        "id": PVP_TIME_CONTROL_ID,
        "whiteMs": white_ms,
        "blackMs": black_ms,
        "incrementMs": PVP_INCREMENT_MS,
        "runningColor": running,
    }


def _timeout_result(flagged_color: str) -> str:
    return "0-1" if flagged_color == "w" else "1-0"


async def _with_handoff_storage_retry(operation, *, attempts: int = 3):
    """Retry brief storage hiccups only inside the bounded 1v1 handoff path."""
    last_error = None
    for attempt in range(max(1, attempts)):
        try:
            return await operation()
        except PersistentStorageUnavailable as exc:
            last_error = exc
            if attempt + 1 >= attempts:
                raise
            await asyncio.sleep(0.12 * (attempt + 1))
    raise last_error


async def _best_effort_leave_roster(*usernames: str) -> None:
    """Detach players from matchmaking after the match is already authoritative.

    Roster cleanup is secondary to the committed match state. A cleanup failure
    must never turn a successfully activated duel into an HTTP 500 that leaves
    both clients stranded in the handoff screen.
    """
    for username in usernames:
        if not username:
            continue
        try:
            await store.leave_roster(username)
        except Exception:
            logger.exception("PvP roster cleanup failed after match activation", extra={"username": username})


async def _finish_timeout(match_id: str, match: dict, now: datetime | None = None) -> dict | None:
    if match.get("status") != "active":
        return match
    stamp = now or store.utcnow()
    clock = _clock_snapshot(match, stamp)
    flagged = "w" if clock["whiteMs"] <= 0 and match.get("turn", "w") == "w" else "b" if clock["blackMs"] <= 0 and match.get("turn") == "b" else None
    if not flagged:
        return match
    return await store.update_match(
        match_id,
        expected_revision=int(match.get("revision", 0)),
        changes={
            "status": "finished",
            "result": _timeout_result(flagged),
            "end_reason": "timeout",
            "white_clock_ms": clock["whiteMs"],
            "black_clock_ms": clock["blackMs"],
            "turn_started_at": None,
            "updated_at": stamp,
        },
    )


async def _finish_handoff_timeout(match_id: str, match: dict, now: datetime | None = None) -> dict | None:
    if match.get("status") != "starting":
        return match
    stamp = now or store.utcnow()
    deadline = match.get("ready_deadline")
    if not isinstance(deadline, datetime) or _as_utc(deadline) > _as_utc(stamp):
        return match
    updated = await store.update_match(
        match_id,
        expected_revision=int(match.get("revision", 0)),
        changes={
            "status": "cancelled",
            "result": None,
            "end_reason": "handoff_timeout",
            "turn_started_at": None,
            "updated_at": stamp,
        },
    )
    return updated or await store.get_match(match_id)


def _disconnect_grace_key(color: chess.Color) -> str:
    return "white_disconnect_grace_started_at" if color == chess.WHITE else "black_disconnect_grace_started_at"


def _player_was_recently_present(match: dict, color: chess.Color, now: datetime) -> bool:
    seen_key = "white_seen_at" if color == chess.WHITE else "black_seen_at"
    seen_at = match.get(seen_key)
    if not isinstance(seen_at, datetime):
        return False
    return max(0.0, (_as_utc(now) - _as_utc(seen_at)).total_seconds()) <= PVP_PRESENCE_RECONNECTING_SECONDS


async def _ensure_disconnect_grace(
    match_id: str,
    match: dict,
    username: str,
    now: datetime | None = None,
    *,
    observer_was_live: bool = True,
) -> dict:
    if match.get("status") != "active":
        return match
    stamp = now or store.utcnow()
    color = _player_color(match, username)
    if color is None:
        return match
    opponent_color = not color
    opponent_presence, _seen_at = _opponent_presence(match, username, stamp)
    grace_key = _disconnect_grace_key(opponent_color)
    if opponent_presence != "disconnected":
        return match
    if observer_was_live and isinstance(match.get(grace_key), datetime):
        return match
    return await store.begin_disconnect_grace(
        match_id,
        "w" if opponent_color == chess.WHITE else "b",
        now=stamp,
        restart=not observer_was_live,
    ) or match


async def _finish_disconnect_forfeit(
    match_id: str,
    match: dict,
    username: str,
    now: datetime | None = None,
) -> dict | None:
    if match.get("status") != "active":
        return match
    stamp = now or store.utcnow()
    color = _player_color(match, username)
    if color is None:
        return match
    opponent_color = not color
    grace_started_at = match.get(_disconnect_grace_key(opponent_color))
    opponent_presence, _seen_at = _opponent_presence(match, username, stamp)
    if (
        opponent_presence != "disconnected"
        or not isinstance(grace_started_at, datetime)
        or _as_utc(grace_started_at) + timedelta(seconds=PVP_DISCONNECT_GRACE_SECONDS) > _as_utc(stamp)
    ):
        return match

    clock = _clock_snapshot(match, stamp)
    result = "0-1" if opponent_color == chess.WHITE else "1-0"
    return await store.update_match(
        match_id,
        expected_revision=int(match.get("revision", 0)),
        changes={
            "status": "finished",
            "result": result,
            "end_reason": "disconnect",
            "white_clock_ms": clock["whiteMs"],
            "black_clock_ms": clock["blackMs"],
            "turn_started_at": None,
            "updated_at": stamp,
        },
    )


async def _apply_active_lifecycle(
    match_id: str,
    match: dict,
    username: str,
    now: datetime | None = None,
    *,
    observer_was_live: bool = True,
) -> dict:
    if match.get("status") != "active":
        return match
    stamp = now or store.utcnow()

    timed = await _finish_timeout(match_id, match, stamp)
    if timed is None:
        match = await store.get_match(match_id) or match
    else:
        match = timed
    if match.get("status") != "active":
        return match

    match = await _ensure_disconnect_grace(
        match_id,
        match,
        username,
        stamp,
        observer_was_live=observer_was_live,
    )
    disconnected = await _finish_disconnect_forfeit(match_id, match, username, stamp)
    if disconnected is None:
        return await store.get_match(match_id) or match
    return disconnected


def _rating_change(match: dict, color: chess.Color | None) -> dict | None:
    if match.get("rated") is False:
        return None
    if color is None or match.get("status") != "finished":
        return None
    result = str(match.get("result") or "")
    if result not in {"1-0", "0-1", "1/2-1/2"}:
        return None
    white_before = int(match.get("white_rating", DEFAULT_RATING))
    black_before = int(match.get("black_rating", DEFAULT_RATING))
    white_after, black_after = rating_store.next_ratings(white_before, black_before, result)
    before = white_before if color == chess.WHITE else black_before
    after = white_after if color == chess.WHITE else black_after
    return {"before": before, "after": after, "delta": after - before}


def _is_virtual_opponent(match: dict, username: str) -> bool:
    return sparring.is_virtual_opponent(match, username) or residents.is_virtual_opponent(match, username)


def _is_synthetic_pair(left: str, right: str) -> bool:
    return sparring.is_sparring_pair(left, right) or residents.is_resident_pair(left, right)


def _virtual_username(match: dict) -> str | None:
    resident = residents.virtual_username(match)
    if resident:
        return resident
    cfg = sparring.settings()
    if cfg.enabled and cfg.username in {match.get("white"), match.get("black")}:
        return cfg.username
    return None


def _opponent_presence(match: dict, username: str, now: datetime | None = None) -> tuple[str, datetime | None]:
    stamp = now or store.utcnow()
    if _is_virtual_opponent(match, username):
        return "online", stamp
    color = _player_color(match, username)
    seen_at = match.get("black_seen_at") if color == chess.WHITE else match.get("white_seen_at") if color == chess.BLACK else None
    if not isinstance(seen_at, datetime):
        return "disconnected", None
    age_seconds = max(0.0, (_as_utc(stamp) - _as_utc(seen_at)).total_seconds())
    if age_seconds <= PVP_PRESENCE_ONLINE_SECONDS:
        return "online", seen_at
    if age_seconds <= PVP_PRESENCE_RECONNECTING_SECONDS:
        return "reconnecting", seen_at
    return "disconnected", seen_at


def _public_match(match: dict, username: str) -> dict:
    color = _player_color(match, username)
    turn = match.get("turn", "w")
    opponent_presence, opponent_seen_at = _opponent_presence(match, username)
    opponent_color = not color if color is not None else None
    opponent_grace_started_at = match.get(_disconnect_grace_key(opponent_color)) if opponent_color is not None else None
    opponent_disconnect_deadline = (
        opponent_grace_started_at + timedelta(seconds=PVP_DISCONNECT_GRACE_SECONDS)
        if match.get("status") == "active"
        and opponent_presence == "disconnected"
        and isinstance(opponent_grace_started_at, datetime)
        else None
    )
    you_ready = bool(match.get("white_ready")) if color == chess.WHITE else bool(match.get("black_ready")) if color == chess.BLACK else False
    opponent_ready = bool(match.get("black_ready")) if color == chess.WHITE else bool(match.get("white_ready")) if color == chess.BLACK else False
    return {
        "id": match["id"],
        "white": match["white"],
        "black": match["black"],
        "whiteDisplayName": residents.public_identity(match.get("white")).get("displayName", match["white"]),
        "blackDisplayName": residents.public_identity(match.get("black")).get("displayName", match["black"]),
        "whiteActorKind": residents.public_identity(match.get("white")).get("actorKind"),
        "blackActorKind": residents.public_identity(match.get("black")).get("actorKind"),
        "whiteActorLabel": residents.public_identity(match.get("white")).get("actorLabel"),
        "blackActorLabel": residents.public_identity(match.get("black")).get("actorLabel"),
        "whiteRating": int(match.get("white_rating", DEFAULT_RATING)),
        "blackRating": int(match.get("black_rating", DEFAULT_RATING)),
        "fen": match["fen"],
        "turn": turn,
        "status": match.get("status", "active"),
        "result": match.get("result"),
        "endReason": match.get("end_reason"),
        "startsAt": _iso(match.get("start_at")),
        "readyDeadline": _iso(match.get("ready_deadline")),
        "youReady": you_ready,
        "opponentReady": opponent_ready,
        "opponentPresence": opponent_presence,
        "opponentSeenAt": _iso(opponent_seen_at),
        "opponentDisconnectDeadline": _iso(opponent_disconnect_deadline),
        "ratingChange": _rating_change(match, color),
        "clock": _clock_snapshot(match),
        "history": _serialize(match.get("history") or []),
        "revision": int(match.get("revision", 0)),
        "youAre": "w" if color == chess.WHITE else "b",
        "yourTurn": (turn == "w") == (color == chess.WHITE) if color is not None and match.get("status") == "active" else False,
        "createdAt": _iso(match.get("created_at")),
        "updatedAt": _iso(match.get("updated_at")),
    }


def _match_result(board: chess.Board) -> tuple[str, str | None]:
    if not board.is_game_over(claim_draw=True):
        return "active", None
    outcome = board.outcome(claim_draw=True)
    return "finished", outcome.result() if outcome else "1/2-1/2"


async def _ensure_synthetic_roster(viewer: str) -> list[dict]:
    rows = []
    if sparring.visible_to(viewer):
        cfg = sparring.settings()
        rows.append(await store.upsert_roster(
            cfg.username,
            rating=DEFAULT_RATING,
            tier=_rating_tier(DEFAULT_RATING),
        ))
    for profile in residents.profiles_for(viewer):
        rows.append(await store.upsert_roster(
            profile.username,
            rating=profile.rating,
            tier=_rating_tier(profile.rating),
        ))
    return rows


async def _mark_virtual_ready(match: dict) -> dict:
    virtual_username = _virtual_username(match)
    if not virtual_username or match.get("status") != "starting":
        return match
    color = _player_color(match, virtual_username)
    if color is None:
        return match

    own_key = "white_ready" if color == chess.WHITE else "black_ready"
    if match.get(own_key):
        return match

    now = store.utcnow()
    match = await store.touch_match_presence(
        match["id"],
        virtual_username,
        "w" if color == chess.WHITE else "b",
        now=now,
    ) or match
    updated = await store.update_match(
        match["id"],
        expected_revision=int(match.get("revision", 0)),
        changes={own_key: True, "updated_at": now},
    )
    return updated or await store.get_match(match["id"]) or match


async def _play_resident_reply(match_id: str, match: dict) -> dict:
    if match.get("status") != "active":
        return match
    bot_username = match.get("white") if match.get("turn") == "w" else match.get("black")
    if residents.active_profile(bot_username) is None:
        return match

    board = chess.Board(match["fen"])
    move = await run_engine_work(residents.choose_move, board.copy(stack=False), bot_username)
    if move is None or move not in board.legal_moves:
        return match

    now = store.utcnow()
    clock = _clock_snapshot(match, now)
    color = _player_color(match, bot_username)
    mover_clock = clock["whiteMs"] if color == chess.WHITE else clock["blackMs"]
    if mover_clock <= 0:
        timed = await _finish_timeout(match_id, match, now)
        return timed or await store.get_match(match_id) or match

    san = board.san(move)
    board.push(move)
    status, result = _match_result(board)
    history = [*(match.get("history") or []), {
        "ply": len(match.get("history") or []) + 1,
        "uci": move.uci(),
        "san": san,
        "by": bot_username,
        "at": now,
    }]
    updated = await store.update_match(
        match_id,
        expected_revision=int(match.get("revision", 0)),
        changes={
            "fen": board.fen(),
            "turn": "w" if board.turn == chess.WHITE else "b",
            "status": status,
            "result": result,
            "end_reason": None if status == "finished" else match.get("end_reason"),
            "history": history,
            "white_clock_ms": clock["whiteMs"],
            "black_clock_ms": clock["blackMs"],
            "turn_started_at": now if status == "active" else None,
            "updated_at": now,
        },
    )
    return updated or await store.get_match(match_id) or match


async def _accept_challenge_for_user(challenge_id: str, username: str) -> tuple[dict, bool, str]:
    challenge_row = await store.get_challenge(challenge_id)
    if not challenge_row or challenge_row.get("opponent") != username:
        raise HTTPException(404, "Reto pendiente no encontrado.")

    challenge_status = challenge_row.get("status")
    if challenge_status == "accepted" and challenge_row.get("match_id"):
        existing = await store.get_match(challenge_row["match_id"])
        if existing:
            return existing, False, challenge_row["challenger"]
    elif challenge_status != "pending":
        raise HTTPException(404, "Reto pendiente no encontrado.")

    if challenge_status == "pending":
        if await store.active_match_for_user(challenge_row["challenger"]):
            raise HTTPException(409, "El rival ya está entrando o jugando otro duelo.")
        if await store.active_match_for_user(username):
            raise HTTPException(409, "Ya tienes un duelo 1v1 en curso.")
        if not await store.roster_member(challenge_row["challenger"]):
            raise HTTPException(409, "El rival ya no está disponible.")
        if not await store.roster_member(username):
            raise HTTPException(409, "Ya no figuras en el roster.")

    challenger = challenge_row["challenger"]
    challenger_white = True if _is_synthetic_pair(challenger, username) else bool(secrets.randbits(1))
    white = challenger if challenger_white else username
    black = username if challenger_white else challenger
    now = store.utcnow()
    match_id = str(challenge_row.get("match_id") or challenge_id)
    match = {
        "id": match_id,
        "white": white,
        "black": black,
        "white_rating": int(challenge_row["challenger_rating"] if white == challenger else challenge_row["opponent_rating"]),
        "black_rating": int(challenge_row["opponent_rating"] if black == username else challenge_row["challenger_rating"]),
        "fen": chess.STARTING_FEN,
        "turn": "w",
        "status": "starting",
        "result": None,
        "history": [],
        "revision": 0,
        "rated": not _is_synthetic_pair(challenger, username),
        "white_clock_ms": PVP_INITIAL_MS,
        "black_clock_ms": PVP_INITIAL_MS,
        "white_ready": False,
        "black_ready": False,
        "start_at": None,
        "ready_deadline": now + timedelta(seconds=PVP_READY_TIMEOUT_SECONDS),
        "turn_started_at": None,
        "end_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    accepted = await store.accept_challenge(challenge_id, username, match)
    if not accepted:
        raise HTTPException(409, "El reto ya no está disponible.")
    _accepted_challenge, accepted_match = accepted
    return accepted_match, True, challenger


def build_pvp_router(*, auth_dependency, limiter) -> APIRouter:
    router = APIRouter(prefix="/api/pvp", tags=["pvp"])

    @router.post("/roster")
    @limiter.limit("30/minute")
    async def join_roster(request: Request, username: str = Depends(auth_dependency)):
        # El perfil sincronizado es client-owned y jamás participa en este
        # cálculo. El rating PvP vive en el documento de cuenta del backend y
        # sólo cambia al liquidar una partida 1v1 autoritativa terminada.
        rating = await rating_store.get_rating(username)
        row = await store.upsert_roster(username, rating=rating, tier=_rating_tier(rating))
        return {"member": _public_roster(row, username)}

    @router.delete("/roster", status_code=204)
    async def leave_roster(username: str = Depends(auth_dependency)):
        await store.leave_roster(username)
        return Response(status_code=204)

    @router.get("/lobby")
    @limiter.limit("40/minute")
    async def lobby(request: Request, username: str = Depends(auth_dependency)):
        await _ensure_synthetic_roster(username)
        roster = [
            row for row in await store.active_roster()
            if not sparring.hidden_from(username, row.get("username", ""))
            and not residents.hidden_from(username, row.get("username", ""))
        ]
        rivals = [row["username"] for row in roster if row.get("username") != username]
        head_to_head = await store.head_to_head_for_user(username, rivals)
        cooldowns = await store.challenge_cooldowns_for_user(username, rivals)
        challenges = await store.list_challenges(username)
        active_match = await store.active_match_for_user(username)
        chat = await store.list_lobby_chat()
        return {
            "roster": [
                _public_roster(
                    row,
                    username,
                    head_to_head.get(row["username"]),
                    cooldowns.get(row["username"]),
                )
                for row in roster
            ],
            "challenges": [_public_challenge(row, username) for row in challenges],
            "activeMatch": _public_match(active_match, username) if active_match else None,
            "messages": [
                {
                    "id": row["id"],
                    "username": row["username"],
                    "text": row["text"],
                    "kind": row.get("kind") or "message",
                    "createdAt": _iso(row.get("created_at")),
                    "isSelf": row["username"] == username,
                }
                for row in chat
            ],
            "pollAfterMs": 3000,
        }

    @router.post("/lobby/chat")
    @limiter.limit("12/minute")
    async def post_lobby_chat(
        payload: LobbyChatRequest,
        request: Request,
        username: str = Depends(auth_dependency),
    ):
        text = " ".join(payload.text.split()).strip()
        if not text:
            raise HTTPException(422, "El mensaje está vacío.")
        row = await store.append_lobby_chat(username, text)
        return {
            "message": {
                "id": row["id"],
                "username": username,
                "text": row["text"],
                "kind": row.get("kind") or "message",
                "createdAt": _iso(row.get("created_at")),
                "isSelf": True,
            }
        }


    @router.post("/challenges", status_code=201)
    async def challenge(body: ChallengeRequest, username: str = Depends(auth_dependency)):
        opponent = body.opponent.strip().lower()
        if opponent == username:
            raise HTTPException(400, "No puedes retarte a ti mismo.")
        cfg = sparring.settings()
        is_sparring_target = sparring.should_auto_accept(username, opponent)
        is_resident_target = residents.should_auto_accept(username, opponent)
        if cfg.enabled and opponent == cfg.username and not is_sparring_target:
            raise HTTPException(409, "Ese rival de staging no está disponible para esta cuenta.")
        if cfg.enabled and residents.is_resident(opponent) and not is_resident_target:
            raise HTTPException(409, "Ese residente no está disponible para esta cuenta.")
        is_virtual_target = is_sparring_target or is_resident_target
        if is_virtual_target:
            await _ensure_synthetic_roster(username)
        challenger_row = await store.roster_member(username)
        if not challenger_row:
            raise HTTPException(409, "Apúntate al roster antes de retar a otro jugador.")
        opponent_row = await store.roster_member(opponent)
        if not opponent_row:
            raise HTTPException(409, "Ese jugador ya no está disponible en el roster.")
        if await store.active_match_for_user(username):
            raise HTTPException(409, "Ya tienes un duelo 1v1 en curso.")
        if await store.active_match_for_user(opponent):
            raise HTTPException(409, "Ese jugador ya está entrando o jugando otro duelo.")
        now = store.utcnow()
        cooldown_until = await store.challenge_cooldown_until(username, opponent, now=now)
        if cooldown_until:
            retry_after = max(1, int((cooldown_until - now).total_seconds()) + 1)
            raise HTTPException(
                429,
                f"Espera {retry_after} s antes de volver a retar a este jugador.",
                headers={"Retry-After": str(retry_after)},
            )
        challenge_id = uuid.uuid4().hex
        row = await store.create_challenge({
            "id": challenge_id,
            "challenger": username,
            "opponent": opponent,
            "challenger_rating": int(challenger_row.get("rating", DEFAULT_RATING)),
            "opponent_rating": int(opponent_row.get("rating", DEFAULT_RATING)),
            "status": "pending",
            "created_at": now,
        })
        if row.get("id") == challenge_id:
            await store.append_lobby_chat(
                "Sistema",
                f"{username} retó a {opponent}.",
                kind="system",
            )
        if is_virtual_target:
            virtual_challenge_id = row["id"]
            accepted_match, accepted_now, _challenger = await _accept_challenge_for_user(virtual_challenge_id, opponent)
            if accepted_now:
                await store.append_lobby_chat(
                    "Sistema",
                    f"{opponent} aceptó el reto de {username}.",
                    kind="system",
                )
            try:
                await _mark_virtual_ready(accepted_match)
            except PersistentStorageUnavailable:
                logger.warning(
                    "PvP synthetic rival ready write deferred to handoff reconciliation",
                    extra={"challenge_id": virtual_challenge_id},
                )
            row = await store.get_challenge(virtual_challenge_id) or row
        return {"challenge": _public_challenge(row, username)}

    @router.post("/challenges/{challenge_id}/cancel")
    async def cancel(challenge_id: str, username: str = Depends(auth_dependency)):
        row = await store.cancel_challenge(challenge_id, username)
        if not row:
            raise HTTPException(404, "Reto saliente pendiente no encontrado.")
        return {"challenge": _public_challenge(row, username)}

    @router.post("/challenges/{challenge_id}/decline")
    async def decline(challenge_id: str, username: str = Depends(auth_dependency)):
        row = await store.decline_challenge(challenge_id, username)
        if not row:
            raise HTTPException(404, "Reto pendiente no encontrado.")
        return {"challenge": _public_challenge(row, username)}

    @router.post("/challenges/{challenge_id}/accept")
    async def accept(challenge_id: str, username: str = Depends(auth_dependency)):
        accepted_match, accepted_now, challenger = await _accept_challenge_for_user(challenge_id, username)
        if accepted_now:
            await store.append_lobby_chat(
                "Sistema",
                f"{username} aceptó el reto de {challenger}.",
                kind="system",
            )
        return {"match": _public_match(accepted_match, username)}

    @router.post("/matches/{match_id}/cancel-starting")
    async def cancel_starting_match(match_id: str, username: str = Depends(auth_dependency)):
        match = await store.get_match(match_id)
        color = _player_color(match or {}, username)
        if not match or color is None:
            raise HTTPException(404, "Partida 1v1 no encontrada.")
        if match.get("status") == "cancelled":
            return {"match": _public_match(match, username)}
        if match.get("status") != "starting":
            raise HTTPException(409, "El duelo ya ha empezado y no puede cancelarse como entrada.")
        now = store.utcnow()
        updated = await store.update_match(
            match_id,
            expected_revision=int(match.get("revision", 0)),
            changes={
                "status": "cancelled",
                "result": None,
                "end_reason": "handoff_cancelled",
                "turn_started_at": None,
                "updated_at": now,
            },
        )
        if not updated:
            current = await store.get_match(match_id)
            if current and current.get("status") == "cancelled":
                return {"match": _public_match(current, username)}
            raise HTTPException(409, "El duelo cambió mientras cancelábamos la entrada.")
        return {"match": _public_match(updated, username)}

    @router.post("/matches/{match_id}/ready")
    async def ready_match(match_id: str, username: str = Depends(auth_dependency)):
        for _attempt in range(4):
            match = await _with_handoff_storage_retry(lambda: store.get_match(match_id))
            color = _player_color(match or {}, username)
            if not match or color is None:
                raise HTTPException(404, "Partida 1v1 no encontrada.")
            match = await _with_handoff_storage_retry(
                lambda: store.touch_match_presence(match_id, username, "w" if color == chess.WHITE else "b")
            ) or match
            if _is_virtual_opponent(match, username):
                match = await _with_handoff_storage_retry(lambda: _mark_virtual_ready(match))
            match = await _with_handoff_storage_retry(
                lambda: _finish_handoff_timeout(match_id, match)
            ) or await _with_handoff_storage_retry(lambda: store.get_match(match_id)) or match
            if match.get("status") == "cancelled":
                return {"match": _public_match(match, username)}
            if match.get("status") == "active":
                await _best_effort_leave_roster(match.get("white"), match.get("black"))
                return {"match": _public_match(match, username)}
            if match.get("status") != "starting":
                raise HTTPException(409, "La partida ya no está preparando el arranque.")

            own_key = "white_ready" if color == chess.WHITE else "black_ready"
            other_key = "black_ready" if color == chess.WHITE else "white_ready"
            if match.get(own_key) and not match.get(other_key):
                return {"match": _public_match(match, username)}

            now = store.utcnow()
            changes = {own_key: True, "updated_at": now}
            if match.get(other_key):
                start_at = now + timedelta(seconds=PVP_HANDOFF_SECONDS)
                changes.update(status="active", start_at=start_at, turn_started_at=start_at)
            updated = await _with_handoff_storage_retry(lambda: store.update_match(
                match_id,
                expected_revision=int(match.get("revision", 0)),
                changes=changes,
            ))
            if updated:
                if updated.get("status") == "active":
                    await _best_effort_leave_roster(updated.get("white"), updated.get("black"))
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "El duelo cambió mientras sincronizábamos a los jugadores.")

    @router.get("/matches/{match_id}")
    @limiter.limit("60/minute")
    async def get_match(request: Request, match_id: str, username: str = Depends(auth_dependency)):
        match = await _with_handoff_storage_retry(lambda: store.get_match(match_id))
        color = _player_color(match or {}, username)
        if not match or color is None:
            raise HTTPException(404, "Partida 1v1 no encontrada.")
        now = store.utcnow()
        observer_was_live = _player_was_recently_present(match, color, now)
        match = await _with_handoff_storage_retry(lambda: store.touch_match_presence(
            match_id,
            username,
            "w" if color == chess.WHITE else "b",
            now=now,
        )) or match
        if match.get("status") == "starting":
            if _is_virtual_opponent(match, username):
                match = await _with_handoff_storage_retry(lambda: _mark_virtual_ready(match))
            match = await _finish_handoff_timeout(match_id, match) or await store.get_match(match_id) or match
        if match.get("status") == "active":
            match = await _apply_active_lifecycle(
                match_id,
                match,
                username,
                now,
                observer_was_live=observer_was_live,
            )
        if match.get("status") == "finished":
            # Reintento idempotente: si el request que dio mate, la bandera o
            # la rendición se cortó tras guardar la partida pero antes de
            # liquidar Elo, una lectura sana termina la operación sin duplicar.
            await rating_store.settle_match(match_id, match)
        return {"match": _public_match(match, username), "pollAfterMs": 1250}

    @router.post("/matches/{match_id}/resign")
    async def resign(match_id: str, username: str = Depends(auth_dependency)):
        for _attempt in range(3):
            match = await store.get_match(match_id)
            color = _player_color(match or {}, username)
            if not match or color is None:
                raise HTTPException(404, "Partida 1v1 no encontrada.")
            if match.get("status") != "active":
                raise HTTPException(409, "La partida ya ha terminado.")

            now = store.utcnow()
            clock = _clock_snapshot(match, now)
            result = "0-1" if color == chess.WHITE else "1-0"
            updated = await store.update_match(
                match_id,
                expected_revision=int(match.get("revision", 0)),
                changes={
                    "status": "finished",
                    "result": result,
                    "end_reason": "resignation",
                    "white_clock_ms": clock["whiteMs"],
                    "black_clock_ms": clock["blackMs"],
                    "turn_started_at": None,
                    "updated_at": now,
                },
            )
            if updated:
                await rating_store.settle_match(match_id, updated)
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "La partida cambió mientras registrábamos la rendición.")

    @router.post("/matches/{match_id}/move")
    @limiter.limit("45/minute")
    async def play_move(request: Request, match_id: str, body: MoveRequest, username: str = Depends(auth_dependency)):
        for _attempt in range(3):
            match = await store.get_match(match_id)
            color = _player_color(match or {}, username)
            if not match or color is None:
                raise HTTPException(404, "Partida 1v1 no encontrada.")
            if match.get("status") != "active":
                raise HTTPException(409, "La partida ya ha terminado.")
            lifecycle_now = store.utcnow()
            observer_was_live = _player_was_recently_present(match, color, lifecycle_now)
            match = await store.touch_match_presence(
                match_id,
                username,
                "w" if color == chess.WHITE else "b",
                now=lifecycle_now,
            ) or match
            match = await _apply_active_lifecycle(
                match_id,
                match,
                username,
                lifecycle_now,
                observer_was_live=observer_was_live,
            )
            if match.get("status") == "finished":
                await rating_store.settle_match(match_id, match)
                return {"match": _public_match(match, username)}

            board = chess.Board(match["fen"])
            if board.turn != color:
                raise HTTPException(409, "No es tu turno.")
            now = store.utcnow()
            start_at = match.get("start_at")
            if isinstance(start_at, datetime) and _as_utc(now) < _as_utc(start_at):
                raise HTTPException(409, "El duelo todavía está en la cuenta atrás.")
            clock = _clock_snapshot(match, now)
            mover_clock = clock["whiteMs"] if color == chess.WHITE else clock["blackMs"]
            if mover_clock <= 0:
                timed = await _finish_timeout(match_id, match, now)
                if timed:
                    await rating_store.settle_match(match_id, timed)
                    return {"match": _public_match(timed, username)}
                continue
            uci = f"{body.from_square}{body.to_square}{(body.promotion or '').lower()}"
            try:
                move = chess.Move.from_uci(uci)
            except ValueError as exc:
                raise HTTPException(400, "Jugada inválida.") from exc
            if move not in board.legal_moves:
                raise HTTPException(400, "Jugada ilegal.")

            san = board.san(move)
            board.push(move)
            status, result = _match_result(board)
            history = [*(match.get("history") or []), {
                "ply": len(match.get("history") or []) + 1,
                "uci": uci,
                "san": san,
                "by": username,
                "at": now,
            }]
            updated = await store.update_match(
                match_id,
                expected_revision=int(match.get("revision", 0)),
                changes={
                    "fen": board.fen(),
                    "turn": "w" if board.turn == chess.WHITE else "b",
                    "status": status,
                    "result": result,
                    "end_reason": None if status == "finished" else match.get("end_reason"),
                    "history": history,
                    "white_clock_ms": clock["whiteMs"] + (PVP_INCREMENT_MS if color == chess.WHITE and status == "active" else 0),
                    "black_clock_ms": clock["blackMs"] + (PVP_INCREMENT_MS if color == chess.BLACK and status == "active" else 0),
                    "turn_started_at": now if status == "active" else None,
                    "updated_at": now,
                },
            )
            if updated:
                if updated.get("status") == "finished":
                    await rating_store.settle_match(match_id, updated)
                else:
                    updated = await _play_resident_reply(match_id, updated)
                    if updated.get("status") == "finished":
                        await rating_store.settle_match(match_id, updated)
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "La posición cambió mientras enviabas la jugada. Actualiza e inténtalo de nuevo.")

    return router
