"""Owner-scoped synthetic PvP residents for staging product experiments."""

from __future__ import annotations

from dataclasses import dataclass

import chess

from cpu_difficulty import elo_for_level, get_factual_difficulty_cpu_move
import pvp_sparring as sparring


@dataclass(frozen=True)
class ResidentProfile:
    username: str
    display_name: str
    engine_level: int

    @property
    def rating(self) -> int:
        return elo_for_level(self.engine_level)


RESIDENTS = (
    ResidentProfile("otto_falk", "Otto Falk", 20),
    ResidentProfile("marta_stein", "Marta Stein", 45),
    ResidentProfile("viktor_kraus", "Viktor Kraus", 70),
)


def profiles_for(viewer: str) -> tuple[ResidentProfile, ...]:
    cfg = sparring.settings()
    return RESIDENTS if cfg.enabled and viewer == cfg.owner else ()


def profile(username: str | None) -> ResidentProfile | None:
    normalized = (username or "").strip().lower()
    return next((row for row in RESIDENTS if row.username == normalized), None)


def is_resident(username: str | None) -> bool:
    return profile(username) is not None


def active_profile(username: str | None) -> ResidentProfile | None:
    return profile(username) if sparring.settings().enabled else None


def should_auto_accept(challenger: str, opponent: str) -> bool:
    cfg = sparring.settings()
    return bool(cfg.enabled and challenger == cfg.owner and is_resident(opponent))


def hidden_from(viewer: str, roster_username: str) -> bool:
    cfg = sparring.settings()
    return bool(cfg.enabled and is_resident(roster_username) and viewer != cfg.owner)


def is_resident_pair(left: str, right: str) -> bool:
    cfg = sparring.settings()
    pair = {left, right}
    return bool(cfg.enabled and cfg.owner in pair and any(row.username in pair for row in RESIDENTS))


def virtual_username(match: dict) -> str | None:
    for candidate in (match.get("white"), match.get("black")):
        if is_resident(candidate):
            return candidate
    return None


def is_virtual_opponent(match: dict, viewer: str) -> bool:
    cfg = sparring.settings()
    if not cfg.enabled or viewer != cfg.owner:
        return False
    resident = virtual_username(match)
    return bool(resident and resident != viewer and viewer in {match.get("white"), match.get("black")})


def public_identity(username: str | None) -> dict:
    row = active_profile(username)
    if not row:
        return {}
    return {
        "displayName": row.display_name,
        "actorKind": "resident",
        "actorLabel": "RESIDENTE · IA",
    }


def choose_move(board: chess.Board, username: str) -> chess.Move | None:
    row = active_profile(username)
    if not row:
        return None
    suggestion = get_factual_difficulty_cpu_move(board, row.engine_level)
    move = None
    if isinstance(suggestion, dict):
        from_square = suggestion.get("from")
        to_square = suggestion.get("to")
        promotion = (suggestion.get("promotion") or "").lower()
        if from_square and to_square:
            try:
                move = chess.Move.from_uci(f"{from_square}{to_square}{promotion}")
            except ValueError:
                move = None
    if move in board.legal_moves:
        return move
    legal = sorted(board.legal_moves, key=lambda candidate: candidate.uci())
    return legal[0] if legal else None
