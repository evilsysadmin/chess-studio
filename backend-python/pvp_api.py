"""Authoritative human-vs-human War Room matchmaking API."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone

import chess
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

import profile_store as pstore
import pvp_store as store

RATING_KEY = "chess-study-player-rating"
DEFAULT_RATING = 400
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


def _profile_rating(profile: dict | None) -> tuple[int, str]:
    data = (profile or {}).get("data")
    raw = data.get(RATING_KEY) if isinstance(data, dict) else None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = None
    if isinstance(raw, dict):
        raw = raw.get("rating")
    try:
        rating = int(raw)
    except (TypeError, ValueError):
        rating = DEFAULT_RATING
    rating = max(DEFAULT_RATING, min(10_000, rating))
    return rating, _rating_tier(rating)


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


def _public_roster(row: dict, username: str) -> dict:
    return {
        "username": row["username"],
        "rating": int(row.get("rating", DEFAULT_RATING)),
        "tier": row.get("tier") or _rating_tier(int(row.get("rating", DEFAULT_RATING))),
        "joinedAt": _iso(row.get("joined_at")),
        "isSelf": row["username"] == username,
    }


def _public_challenge(row: dict, username: str) -> dict:
    return {
        "id": row["id"],
        "challenger": row["challenger"],
        "opponent": row["opponent"],
        "challengerRating": int(row.get("challenger_rating", DEFAULT_RATING)),
        "opponentRating": int(row.get("opponent_rating", DEFAULT_RATING)),
        "status": row["status"],
        "direction": "incoming" if row["opponent"] == username else "outgoing",
        "createdAt": _iso(row.get("created_at")),
        "matchId": row.get("match_id"),
    }


def _player_color(match: dict, username: str) -> chess.Color | None:
    if match.get("white") == username:
        return chess.WHITE
    if match.get("black") == username:
        return chess.BLACK
    return None


def _public_match(match: dict, username: str) -> dict:
    color = _player_color(match, username)
    turn = match.get("turn", "w")
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
        "termination": match.get("termination"),
        "resignedBy": match.get("resigned_by"),
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
        rating, tier = _profile_rating(await pstore.get_profile(username))
        row = await store.upsert_roster(username, rating=rating, tier=tier)
        return {"member": _public_roster(row, username)}

    @router.delete("/roster", status_code=204)
    async def leave_roster(username: str = Depends(auth_dependency)):
        await store.leave_roster(username)
        return Response(status_code=204)

    @router.get("/lobby")
    @limiter.limit("40/minute")
    async def lobby(request: Request, username: str = Depends(auth_dependency)):
        roster = await store.active_roster()
        challenges = await store.list_challenges(username)
        active_match = await store.active_match_for_user(username)
        return {
            "roster": [_public_roster(row, username) for row in roster],
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

    @router.post("/challenges/{challenge_id}/decline")
    async def decline(challenge_id: str, username: str = Depends(auth_dependency)):
        row = await store.decline_challenge(challenge_id, username)
        if not row:
            raise HTTPException(404, "Reto pendiente no encontrado.")
        return {"challenge": _public_challenge(row, username)}

    @router.post("/challenges/{challenge_id}/accept")
    async def accept(challenge_id: str, username: str = Depends(auth_dependency)):
        challenge_row = await store.get_challenge(challenge_id)
        if not challenge_row or challenge_row.get("status") != "pending" or challenge_row.get("opponent") != username:
            raise HTTPException(404, "Reto pendiente no encontrado.")
        if not await store.roster_member(challenge_row["challenger"]):
            raise HTTPException(409, "El rival ya no está disponible.")
        if not await store.roster_member(username):
            raise HTTPException(409, "Ya no figuras en el roster.")

        challenger = challenge_row["challenger"]
        challenger_white = bool(secrets.randbits(1))
        white = challenger if challenger_white else username
        black = username if challenger_white else challenger
        now = store.utcnow()
        match = {
            "id": uuid.uuid4().hex,
            "white": white,
            "black": black,
            "white_rating": int(challenge_row["challenger_rating"] if white == challenger else challenge_row["opponent_rating"]),
            "black_rating": int(challenge_row["opponent_rating"] if black == username else challenge_row["challenger_rating"]),
            "fen": chess.STARTING_FEN,
            "turn": "w",
            "status": "active",
            "result": None,
            "history": [],
            "revision": 0,
            "created_at": now,
            "updated_at": now,
        }
        accepted = await store.accept_challenge(challenge_id, username, match)
        if not accepted:
            raise HTTPException(409, "El reto ya no está disponible.")
        await store.leave_roster(white)
        await store.leave_roster(black)
        return {"match": _public_match(match, username)}

    @router.get("/matches/{match_id}")
    @limiter.limit("60/minute")
    async def get_match(request: Request, match_id: str, username: str = Depends(auth_dependency)):
        match = await store.get_match(match_id)
        if not match or _player_color(match, username) is None:
            raise HTTPException(404, "Partida 1v1 no encontrada.")
        return {"match": _public_match(match, username), "pollAfterMs": 1250}

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
            now = store.utcnow()
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
                    "history": history,
                    "updated_at": now,
                },
            )
            if updated:
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "La posición cambió mientras enviabas la jugada. Actualiza e inténtalo de nuevo.")

    @router.post("/matches/{match_id}/resign")
    @limiter.limit("10/minute")
    async def resign(request: Request, match_id: str, username: str = Depends(auth_dependency)):
        for _attempt in range(3):
            match = await store.get_match(match_id)
            color = _player_color(match or {}, username)
            if not match or color is None:
                raise HTTPException(404, "Partida 1v1 no encontrada.")
            if match.get("status") != "active":
                if match.get("termination") == "resignation" and match.get("resigned_by") == username:
                    return {"match": _public_match(match, username)}
                raise HTTPException(409, "La partida ya ha terminado.")

            now = store.utcnow()
            result = "0-1" if color == chess.WHITE else "1-0"
            updated = await store.update_match(
                match_id,
                expected_revision=int(match.get("revision", 0)),
                changes={
                    "status": "finished",
                    "result": result,
                    "termination": "resignation",
                    "resigned_by": username,
                    "updated_at": now,
                },
            )
            if updated:
                return {"match": _public_match(updated, username)}
        raise HTTPException(409, "La partida cambió mientras intentabas rendirte. Actualiza e inténtalo de nuevo.")

    return router