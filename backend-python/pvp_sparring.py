"""Environment-gated synthetic PvP rival for staging visual QA."""

from __future__ import annotations

import os
from dataclasses import dataclass

_TRUE_VALUES = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SparringSettings:
    enabled: bool
    owner: str
    username: str


def _clean_username(value: str | None, default: str) -> str:
    return (value or default).strip().lower()


def settings() -> SparringSettings:
    owner = _clean_username(os.getenv("CHESS_PVP_SPARRING_OWNER"), "evilsysadmin")
    username = _clean_username(os.getenv("CHESS_PVP_SPARRING_USERNAME"), "sparringmeister")
    enabled = (os.getenv("CHESS_PVP_SPARRING_ENABLED") or "").strip().lower() in _TRUE_VALUES
    if not owner or not username or owner == username:
        enabled = False
    return SparringSettings(enabled=enabled, owner=owner, username=username)


def visible_to(viewer: str) -> bool:
    cfg = settings()
    return cfg.enabled and viewer == cfg.owner


def should_auto_accept(challenger: str, opponent: str) -> bool:
    cfg = settings()
    return cfg.enabled and challenger == cfg.owner and opponent == cfg.username


def hidden_from(viewer: str, roster_username: str) -> bool:
    cfg = settings()
    return cfg.enabled and roster_username == cfg.username and viewer != cfg.owner


def is_sparring_pair(left: str, right: str) -> bool:
    cfg = settings()
    return cfg.enabled and {left, right} == {cfg.owner, cfg.username}


def is_virtual_opponent(match: dict, viewer: str) -> bool:
    cfg = settings()
    if not cfg.enabled or viewer != cfg.owner:
        return False
    if match.get("white") == viewer:
        return match.get("black") == cfg.username
    if match.get("black") == viewer:
        return match.get("white") == cfg.username
    return False
