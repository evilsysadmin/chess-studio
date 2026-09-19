"""Strict optional planner contract for procedural Chronicles topology.

External planners (for example Workers AI) may suggest a *small* topology intent
for a run, but they never own authoritative run identity or semantic content.
The local deterministic generator remains authoritative and every accepted
proposal is normalized through the versioned MapCode validator.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Any

from chronicles_map_code import ChroniclesMapCode, validate_chronicles_map_code


CHRONICLES_PLANNER_CONTRACT_VERSION = 1
CHRONICLES_PLANNER_SOURCE_MAX_LENGTH = 64

_ALLOWED_FIELDS = frozenset({"version", "source", "verbs", "difficulty"})
_SOURCE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


@dataclass(frozen=True, slots=True)
class ChroniclesPlannerDecision:
    recipe: ChroniclesMapCode
    accepted: bool
    source: str | None
    proposal_revision: str | None
    reason: str


class ChroniclesPlannerProposalError(ValueError):
    """Raised when an external planner proposal is outside the safe contract."""


def _proposal_revision(proposal: dict[str, Any]) -> str:
    canonical = json.dumps(
        proposal,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(
        f"chronicles-planner-v{CHRONICLES_PLANNER_CONTRACT_VERSION}\0".encode("utf-8")
        + canonical
    ).hexdigest()


def _normalize_source(raw: Any) -> str:
    if not isinstance(raw, str):
        raise ChroniclesPlannerProposalError("planner source must be a string")
    source = raw.strip().lower()
    if not source or len(source) > CHRONICLES_PLANNER_SOURCE_MAX_LENGTH:
        raise ChroniclesPlannerProposalError("planner source length is invalid")
    if not _SOURCE_RE.fullmatch(source):
        raise ChroniclesPlannerProposalError("planner source contains unsupported characters")
    return source


def _normalize_proposal(proposal: Any) -> dict[str, Any]:
    if not isinstance(proposal, dict):
        raise ChroniclesPlannerProposalError("planner proposal must be an object")

    unknown = sorted(set(proposal) - _ALLOWED_FIELDS)
    if unknown:
        raise ChroniclesPlannerProposalError(f"unsupported planner field: {unknown[0]}")

    version = proposal.get("version")
    if isinstance(version, bool) or not isinstance(version, int):
        raise ChroniclesPlannerProposalError("planner version must be an integer")
    if version != CHRONICLES_PLANNER_CONTRACT_VERSION:
        raise ChroniclesPlannerProposalError(f"unsupported planner version: {version}")

    source = _normalize_source(proposal.get("source"))
    normalized: dict[str, Any] = {
        "version": version,
        "source": source,
    }

    if "verbs" in proposal:
        verbs = proposal["verbs"]
        if not isinstance(verbs, (list, tuple)) or not verbs:
            raise ChroniclesPlannerProposalError("planner verbs must be a non-empty list")
        if len(verbs) > 4 or any(not isinstance(value, str) for value in verbs):
            raise ChroniclesPlannerProposalError("planner verbs must contain 1..4 strings")
        normalized["verbs"] = [value.strip().lower() for value in verbs]

    if "difficulty" in proposal:
        difficulty = proposal["difficulty"]
        if isinstance(difficulty, bool) or not isinstance(difficulty, int):
            raise ChroniclesPlannerProposalError("planner difficulty must be an integer")
        normalized["difficulty"] = difficulty

    if "verbs" not in normalized and "difficulty" not in normalized:
        raise ChroniclesPlannerProposalError("planner proposal must change topology intent")

    return normalized


def normalize_chronicles_planner_proposal(proposal: Any) -> dict[str, Any]:
    """Return the canonical planner proposal or raise on contract violations."""
    return _normalize_proposal(proposal)


def _candidate_recipe(
    base: ChroniclesMapCode,
    normalized: dict[str, Any],
) -> ChroniclesMapCode:
    # seed/size/theme/content counts are deliberately locked. The planner may
    # only influence topology-facing intent consumed by the deterministic
    # generator in contract v1.
    return validate_chronicles_map_code(
        ChroniclesMapCode(
            theme=base.theme,
            width=base.width,
            height=base.height,
            verbs=tuple(normalized.get("verbs", base.verbs)),
            enemies=base.enemies,
            treasures=base.treasures,
            secrets=base.secrets,
            difficulty=normalized.get("difficulty", base.difficulty),
            seed=base.seed,
            version=base.version,
        )
    )


def resolve_chronicles_planner_recipe(
    base_recipe: ChroniclesMapCode,
    proposal: Any = None,
) -> ChroniclesPlannerDecision:
    """Resolve an optional proposal without ever making planner availability fatal.

    Invalid, unsupported or no-op proposals fall back to the locally-derived
    recipe. This is intentional: external planning must not block a run.
    """

    base = validate_chronicles_map_code(base_recipe)
    if proposal is None:
        return ChroniclesPlannerDecision(
            recipe=base,
            accepted=False,
            source=None,
            proposal_revision=None,
            reason="no-proposal",
        )

    try:
        normalized = normalize_chronicles_planner_proposal(proposal)
        candidate = _candidate_recipe(base, normalized)
    except (ChroniclesPlannerProposalError, ValueError, TypeError):
        return ChroniclesPlannerDecision(
            recipe=base,
            accepted=False,
            source=None,
            proposal_revision=None,
            reason="invalid-proposal",
        )

    revision = _proposal_revision(normalized)
    if candidate == base:
        return ChroniclesPlannerDecision(
            recipe=base,
            accepted=False,
            source=normalized["source"],
            proposal_revision=revision,
            reason="no-change",
        )

    return ChroniclesPlannerDecision(
        recipe=candidate,
        accepted=True,
        source=normalized["source"],
        proposal_revision=revision,
        reason="accepted",
    )
