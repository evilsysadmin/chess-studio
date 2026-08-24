"""Pydantic request models shared by Chess Studio API routers.

Kept separate from ``main.py`` so the application composition layer does not
accumulate transport schemas alongside middleware and route wiring.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

HINT_STRENGTH = 95

class ActivityHeartbeatRequest(BaseModel):
    activity: Optional[str] = Field(default=None, max_length=40)
    foreground: Optional[bool] = None
    release: Optional[str] = Field(default=None, max_length=32)

class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)
    email: Optional[str] = Field(default=None, max_length=254)
    invite_code: Optional[str] = Field(default=None, alias="inviteCode", max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=254)


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    token: str = Field(max_length=4096)
    new_password: str = Field(alias="newPassword", max_length=128)


class UpdateEmailRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class AdminInsightsRequest(BaseModel):
    username: str = Field(max_length=64)


class FeedbackRequest(BaseModel):
    category: str = Field(default="other", max_length=24)
    message: str = Field(max_length=2000)
    context: Optional[str] = Field(default="Home", max_length=80)


class AdminFeedbackStatusRequest(BaseModel):
    status: str = Field(max_length=16)


class AdminDeleteUserRequest(BaseModel):
    username: str = Field(max_length=64)


class AdminPlayerPortraitRequest(BaseModel):
    username: str = Field(max_length=64)
    facts: dict[str, Any] = Field(default_factory=dict)


class GhostStyle(BaseModel):
    # Sesgos derivados de partidas reales del usuario. El rango estrecho
    # evita que un cliente manipulado convierta el desempate de estilo en una
    # orden arbitraria para el motor.
    capture: float = Field(default=0.0, ge=-1.0, le=1.0)
    pawn: float = Field(default=0.0, ge=-1.0, le=1.0)
    queen: float = Field(default=0.0, ge=-1.0, le=1.0)
    check: float = Field(default=0.0, ge=-1.0, le=1.0)
    castle: float = Field(default=0.0, ge=-1.0, le=1.0)


class NewGameRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    difficulty: float = 50
    color: str = "w"
    handicap: Optional[str] = None  # None | "pawn" | "knight" | "rook" | "queen" — ver HANDICAP_SQUARES
    starting_fen: Optional[str] = Field(default=None, alias="startingFen")
    ghost_style: Optional[GhostStyle] = Field(default=None, alias="ghostStyle")


class MoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_square: str = Field(alias="from")
    to: str
    promotion: Optional[str] = None


class AnalyzeRequest(BaseModel):
    fen: str
    level: float = HINT_STRENGTH


class AnalyzeMoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fen: str
    from_square: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None
    promotion: Optional[str] = None
    level: float = 45

