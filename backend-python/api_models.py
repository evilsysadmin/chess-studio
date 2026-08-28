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


class FeedbackAttachmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(max_length=120)
    mime_type: str = Field(alias="mimeType", max_length=32)
    data: str = Field(max_length=4_300_000)


class FeedbackRequest(BaseModel):
    category: str = Field(default="general", max_length=24)
    message: str = Field(max_length=2000)
    context: Optional[str] = Field(default="Home", max_length=80)
    attachments: list[FeedbackAttachmentRequest] = Field(default_factory=list, max_length=3)


class ClientTelemetryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    event_type: str = Field(alias="eventType", max_length=32)
    metric_name: Optional[str] = Field(default=None, alias="metricName", max_length=16)
    value: Optional[float] = None
    error_name: Optional[str] = Field(default=None, alias="errorName", max_length=80)
    context: Optional[str] = Field(default=None, max_length=48)
    release: Optional[str] = Field(default=None, max_length=40)


class AdminFeedbackStatusRequest(BaseModel):
    status: str = Field(max_length=16)


class AdminFeedbackReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    resolve: bool = True


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
    starting_fen: Optional[str] = Field(default=None, alias="startingFen", max_length=128)
    ghost_style: Optional[GhostStyle] = Field(default=None, alias="ghostStyle")


class MoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_square: str = Field(alias="from", min_length=2, max_length=2)
    to: str = Field(min_length=2, max_length=2)
    promotion: Optional[str] = Field(default=None, max_length=1)


class AnalyzeRequest(BaseModel):
    fen: str = Field(max_length=128)
    level: float = HINT_STRENGTH


class AnalyzeMoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fen: str = Field(max_length=128)
    from_square: Optional[str] = Field(default=None, alias="from", min_length=2, max_length=2)
    to: Optional[str] = Field(default=None, min_length=2, max_length=2)
    promotion: Optional[str] = Field(default=None, max_length=1)
    level: float = 45

