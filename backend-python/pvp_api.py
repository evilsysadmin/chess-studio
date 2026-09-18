"""Authoritative human-vs-human War Room matchmaking API."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import chess
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

import pvp_rating as rating_store
import pvp_store as store

DEFAULT_RATING = rating_store.DEFAULT_RATING
PVP_TIME_CONTROL_ID = "10+0"
PVP_INITIAL_MS = 10 * 60 * 1000
PVP_INCREMENT_MS = 0
PVP_HANDOFF_SECONDS = 5
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


class MoveRequest(BaseModel):
    from_square: str = Field(alias="from", pattern=r"^[a-h][1-8]$")
    to_square: str = Field(alias="to", pattern=r"^[a-h][1-8]$")
    promotion: str | None = Field(default=None, pattern=r"^[qrbnQRBN]$")


def _rating_tier(rating: int) -> str:
    for low, high, label in RATING_TIERS:
        if low <= rating <= high:
            return label
    return "Maestro"


def _iso(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return value


def _serialize(value):
    if isinstance(value, datetime):
        return _iso(value)
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def _public_roster(row: dict, username: str, head_to_head: dict | None = None) -> dict:
    payload = {
        "username": row["username"],
        "rating": int(row.get("rating", DEFAULT_RATING)),
        "tier": row.get("tier") or _rating_tier(int(row.get("rating", DEFAULT_RATING))),
        "joinedAt": _iso(row.get("joined_at")),
        "isSelf": row["username"] == username,
    }
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
    running = (
        match.get("turn", "w")
        if match.get("status") == "active" and isinstance(started, datetime) and started <= stamp
        else None
    )
    if running in {"w", "b"} and isinstance(started, datetime):
        elapsed_ms = max(0, int((stamp - started).total_seconds() * 1000))
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


def _rating_change(match: dict, color: chess.Color | None) -> dict | None:
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


def _public_match(match: dict, username: str) -> dict:
    color = _player_color(match, username)
    turn = match.get("turn", "w")
    you_ready = bool(match.get("white_ready")) if color == chess.WHITE else bool(match.get("black_ready")) if color == chess.BLACK else False
    opponent_ready = bool(match.get("black_ready")) if color == chess.WHITE else bool(match.get("white_ready")) if color == chess.BLACK else False
    return {
        "id": match["id"],
        "white": match["white"],
        "black": match["black"],
        "whiteRating": int(match.get("white_rating", DEFAULT_RATING)),
        "blackRating": int(match.get("black_rating", DEFAULT_RATING)),
        "fen": match["fen"],
        "turn": turn,
        "status": match.get("status", "active"),
        "result": match.get("result"),
        "endReason": match.get("end_reason"),
        "startsAt": _iso(match.get("start_at")),
        "youReady": you_ready,
        "opponentReady": opponent_ready,
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
        roster = await store.active_roster()
        rivals = [row["username"] for row in roster if row.get("username") != username]
        head_to_head = await store.head_to_head_for_user(username, rivals)
        challenges = await store.list_challenges(username)
        active_match = await store.active_match_for_user(username)
        return {
            "roster": [_public_roster(row, username, head_to_head.get(row["username"])) for row in roster],
            "challenges": [_public_challenge(row, username) for row in challenges],
            "activeMatch": _public_match(active_match, username) if active_match else None,
            "pollAfterMs": 3000,
        }

    @router.post("/challenges", status_code=201)
    async def challenge(body: ChallengeRequest, username: str = Depends(auth_dependency)):
        opponent = body.opponent.strip().lower()
        if opponent == username:
            raise HTTPException(400, "No puedes retarte a ti mismo.")
        challenger_row = await store.roster_member(username)
        if not challenger_row:
            raise HTTPException(409, "Apúntate al roster antes de retar a otro jugador.")
        opponent_row = await store.roster_member(opponent)
        if not opponent_row:
            raise HTTPException(409, "Ese jugador ya no está disponible en el roster.")
        now = store.utcnow()
        row = await store.create_challenge({
            "id": uuid.uuid4().hex,
            "challenger": username,
            "opponent": opponent,
            "challenger_rating": int(challenger_row.get("rating", DEFAULT_RATING)),
            "opponent_rating": int(opponent_row.get("rating", DEFAULT_RATING)),
            "status": "pending",
            "created_at": now,
        })
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
        challenge_row = await store.get_challenge(challenge_id)
        if not challenge_row or challenge_row.get("opponent") != username:
            raise HTTPException(404, "Reto pendiente no encontrado.")

        challenge_status = challenge_row.get("status")
        if challenge_status == "accepted" and challenge_row.get("match_id"):
            existing = await store.get_match(challenge_row["match_id"])
            if existing:
                # Idempotent response after a lost HTTP response/retry.
                return {"match": _public_match(existing, username)}
        elif challenge_status != "pending":
            raise HTTPException(404, "Reto pendiente no encontrado.")

        # Once the challenge is already accepted we are repairing/resuming the
        # storage saga and must not require players to still be in the ephemeral
        # roster. Fresh acceptance still requires both live roster entries.
        if challenge_status == "pending":
            if not await store.roster_member(challenge_row["challenger"]):
                raise HTTPException(409, "El rival ya no está disponible.")
            if not await store.roster_member(username):
                raise HTTPException(409, "Ya no figuras en el roster.")

        challenger = challenge_row["challenger"]
        challenger_white = bool(secrets.randbits(1))
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
            "white_clock_ms": PVP_INITIAL_MS,
            "black_clock_ms": PVP_INITIAL_MS,
            "white_ready": False,
            "black_ready": False,
            "start_at": None,
            "turn_started_at": None,
            "end_reason": None,
            "created_at": now,
            "updated_at": now,
        }
        accepted = await store.accept_challenge(challenge_id, username, match)
        if not accepted:
            raise HTTPException(409, "El reto ya no está disponible.")
        _accepted_challenge, accepted_match = accepted
        await store.leave_roster(accepted_match["white"])
        await store.leave_roster(accepted_match["black"])
        return {"match": _public_match(accepted_match, username)}

    @router.post("/matches/{match_id}/ready")
    async def ready_match(match_id: str, username: str = Depends(auth_dependency)):
        for _attempt in range(4):
            match = await store.get_match(match_id)
            color = _player_color(match or {}, username)
            if not match or color is None:
                raise HTTPException(404, "Partida 1v1 no encontrada.")
            if match.get("status") == "active":
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
            updated = await store.update_match(
                match_id,
                expected_revision=int(match.get("revision", 0)),
                changes=changes,
            )
            if updated:
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "El duelo cambió mientras sincronizábamos a los jugadores.")

    @router.get("/matches/{match_id}")
    @limiter.limit("60/minute")
    async def get_match(request: Request, match_id: str, username: str = Depends(auth_dependency)):
        match = await store.get_match(match_id)
        if not match or _player_color(match, username) is None:
            raise HTTPException(404, "Partida 1v1 no encontrada.")
        if match.get("status") == "active":
            timed = await _finish_timeout(match_id, match)
            if timed is None:
                match = await store.get_match(match_id) or match
            else:
                match = timed
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

            board = chess.Board(match["fen"])
            if board.turn != color:
                raise HTTPException(409, "No es tu turno.")
            now = store.utcnow()
            start_at = match.get("start_at")
            if isinstance(start_at, datetime) and now < start_at:
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
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "La posición cambió mientras enviabas la jugada. Actualiza e inténtalo de nuevo.")

    return router
