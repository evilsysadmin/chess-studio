"""Grounded episodic-memory primitives for Matthias.

Episodes are deliberately small evidence records, not prose memories. They are
built only from facts Chess Studio already measures and are safe to persist in
the existing Matthias memory document. Raw game transcripts, prompts, auth data
and arbitrary user text never belong here.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

EPISODE_SCHEMA_VERSION = 1
MAX_EPISODES = 24
MAX_CALLBACK_CANDIDATES = 3
MAX_OPENING_SNAPSHOT = 12

_INCIDENTS: dict[str, dict[str, Any]] = {
    "human:MISSED_MATE": {"label": "Mate disponible ignorado", "polarity": "shame", "severity": 92},
    "human:ALLOWED_MATE": {"label": "Mate permitido", "polarity": "shame", "severity": 94},
    "human:QUEEN_EN_PRISE_TO_PAWN": {"label": "Dama expuesta a un peón", "polarity": "shame", "severity": 90},
    "human:STALEMATE_BLUNDER": {"label": "Ventaja convertida en ahogado", "polarity": "shame", "severity": 88},
    "cpu:PAWN_TAKES_QUEEN": {"label": "Un peón de Matthias capturó la dama", "polarity": "shame", "severity": 91},
    "cpu:KNIGHT_FORK": {"label": "Horquilla de caballo sufrida", "polarity": "shame", "severity": 72},
    "cpu:PAWN_FORK": {"label": "Horquilla de peón sufrida", "polarity": "shame", "severity": 74},
    "human:MATE_FOUND": {"label": "Mate encontrado", "polarity": "fame", "severity": 86},
    "human:PAWN_TAKES_QUEEN": {"label": "Un peón humano capturó la dama", "polarity": "fame", "severity": 82},
    "human:QUEEN_CAPTURE": {"label": "Captura decisiva de dama", "polarity": "fame", "severity": 76},
}


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _bounded_text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _iso(value: Any = None) -> str:
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _incident_counts(facts: dict[str, Any] | None) -> dict[str, int]:
    facts = facts if isinstance(facts, dict) else {}
    rows = facts.get("noteworthy_incidents") if isinstance(facts.get("noteworthy_incidents"), list) else []
    out: dict[str, int] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = _bounded_text(row.get("key"), 80)
        count = _number(row.get("count"))
        if key and count is not None and count >= 0:
            out[key] = max(out.get(key, 0), int(count))
    return out


def _clean_rivalry(value: Any) -> dict[str, int]:
    row = value if isinstance(value, dict) else {}
    return {
        key: max(0, int(_number(row.get(key)) or 0))
        for key in ("games", "wins", "draws", "losses")
    }


def _opening_rows(facts: dict[str, Any] | None) -> dict[str, dict[str, int | str]]:
    facts = facts if isinstance(facts, dict) else {}
    rows = facts.get("openings") if isinstance(facts.get("openings"), list) else []
    clean: dict[str, dict[str, int | str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = _bounded_text(row.get("name"), 100)
        if not name:
            continue
        clean[name] = {
            "name": name,
            "games": max(0, int(_number(row.get("games")) or 0)),
            "wins": max(0, int(_number(row.get("wins")) or 0)),
            "draws": max(0, int(_number(row.get("draws")) or 0)),
            "losses": max(0, int(_number(row.get("losses")) or 0)),
        }
    return clean


def episodic_observation_snapshot(facts: dict[str, Any] | None) -> dict[str, Any]:
    """Keep only the measured fields needed to prove a future episode delta."""
    facts = facts if isinstance(facts, dict) else {}
    openings = sorted(
        _opening_rows(facts).values(),
        key=lambda row: (-int(row["games"]), str(row["name"])),
    )[:MAX_OPENING_SNAPSHOT]
    return {
        "noteworthy_incidents": _incident_counts(facts),
        "cpu_rivalry": _clean_rivalry(facts.get("cpu_rivalry")),
        "openings": openings,
    }


def _episode(
    *, fingerprint: str, kind: str, label: str, polarity: str, severity: int,
    evidence: dict[str, Any], at: str,
) -> dict[str, Any]:
    return {
        "schema_version": EPISODE_SCHEMA_VERSION,
        "fingerprint": _bounded_text(fingerprint, 160),
        "kind": _bounded_text(kind, 40),
        "label": _bounded_text(label, 180),
        "polarity": polarity if polarity in {"fame", "shame", "neutral"} else "neutral",
        "severity": max(0, min(100, int(severity))),
        "evidence": evidence,
        "at": at,
    }


def _incident_episodes(previous: dict[str, Any], current: dict[str, Any], at: str) -> list[dict[str, Any]]:
    before = previous.get("noteworthy_incidents") if isinstance(previous.get("noteworthy_incidents"), dict) else {}
    after = current.get("noteworthy_incidents") if isinstance(current.get("noteworthy_incidents"), dict) else {}
    episodes = []
    for key, count in sorted(after.items()):
        previous_count = max(0, int(_number(before.get(key)) or 0))
        current_count = max(0, int(_number(count) or 0))
        if current_count <= previous_count:
            continue
        meta = _INCIDENTS.get(key)
        if not meta:
            # Unknown event types remain measured facts but do not become
            # callbacks until Chess Studio defines their semantic contract.
            continue
        delta = current_count - previous_count
        episodes.append(_episode(
            fingerprint=f"incident:{key}:{current_count}",
            kind="incident",
            label=meta["label"],
            polarity=meta["polarity"],
            severity=meta["severity"],
            evidence={
                "source": "noteworthy_incidents",
                "key": key,
                "previous_count": previous_count,
                "count": current_count,
                "delta": delta,
            },
            at=at,
        ))
    return episodes


def _rivalry_episode(previous: dict[str, Any], current: dict[str, Any], at: str) -> dict[str, Any] | None:
    before = _clean_rivalry(previous.get("cpu_rivalry"))
    after = _clean_rivalry(current.get("cpu_rivalry"))
    if after["games"] - before["games"] != 1:
        return None
    deltas = {key: after[key] - before[key] for key in ("wins", "draws", "losses")}
    outcomes = [key for key, delta in deltas.items() if delta == 1]
    if len(outcomes) != 1 or any(delta not in {0, 1} for delta in deltas.values()):
        return None
    result_key = outcomes[0]
    outcome = {"wins": "win", "draws": "draw", "losses": "loss"}[result_key]
    label = {
        "win": "Victoria contra Matthias",
        "draw": "Tablas contra Matthias",
        "loss": "Derrota contra Matthias",
    }[outcome]
    return _episode(
        fingerprint=f"rivalry:{after['games']}:{outcome}",
        kind="rivalry_result",
        label=label,
        polarity="fame" if outcome == "win" else "shame" if outcome == "loss" else "neutral",
        severity=70 if outcome == "win" else 62 if outcome == "loss" else 45,
        evidence={
            "source": "cpu_rivalry",
            "outcome": outcome,
            "game_number": after["games"],
            "record": after,
        },
        at=at,
    )


def _opening_setbacks(previous: dict[str, Any], current: dict[str, Any], at: str) -> list[dict[str, Any]]:
    before_rows = {
        str(row.get("name")): row
        for row in previous.get("openings", [])
        if isinstance(row, dict) and row.get("name")
    }
    episodes = []
    for after in current.get("openings", []):
        if not isinstance(after, dict) or not after.get("name"):
            continue
        name = str(after["name"])
        before = before_rows.get(name, {"games": 0, "wins": 0, "draws": 0, "losses": 0})
        game_delta = int(after.get("games") or 0) - int(before.get("games") or 0)
        loss_delta = int(after.get("losses") or 0) - int(before.get("losses") or 0)
        win_delta = int(after.get("wins") or 0) - int(before.get("wins") or 0)
        draw_delta = int(after.get("draws") or 0) - int(before.get("draws") or 0)
        # One exact additional loss is reconstructible. Larger aggregate jumps
        # are intentionally skipped because we cannot claim which game mattered.
        if game_delta != 1 or loss_delta != 1 or win_delta != 0 or draw_delta != 0:
            continue
        games = int(after.get("games") or 0)
        losses = int(after.get("losses") or 0)
        wins = int(after.get("wins") or 0)
        if games < 3 or losses < 2 or losses <= wins:
            continue
        episodes.append(_episode(
            fingerprint=f"opening-setback:{name}:{games}:{losses}",
            kind="opening_setback",
            label=f"Nueva derrota con {name}",
            polarity="shame",
            severity=min(78, 48 + losses * 6),
            evidence={
                "source": "openings",
                "opening": name,
                "outcome": "loss",
                "games": games,
                "wins": wins,
                "draws": int(after.get("draws") or 0),
                "losses": losses,
            },
            at=at,
        ))
    return episodes


def derive_episodes(
    previous_snapshot: dict[str, Any] | None,
    current_facts: dict[str, Any] | None,
    *,
    at: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return newly proven episodes plus the minimal next observation snapshot."""
    previous = previous_snapshot if isinstance(previous_snapshot, dict) else {}
    current = episodic_observation_snapshot(current_facts)
    moment = _iso(at)
    episodes = _incident_episodes(previous, current, moment)
    rivalry = _rivalry_episode(previous, current, moment)
    if rivalry:
        episodes.append(rivalry)
    episodes.extend(_opening_setbacks(previous, current, moment))
    return episodes, current


def _clean_evidence(value: Any) -> dict[str, Any]:
    row = value if isinstance(value, dict) else {}
    source = _bounded_text(row.get("source"), 40)
    if source == "noteworthy_incidents":
        return {
            "source": source,
            "key": _bounded_text(row.get("key"), 80),
            "previous_count": max(0, int(_number(row.get("previous_count")) or 0)),
            "count": max(0, int(_number(row.get("count")) or 0)),
            "delta": max(0, int(_number(row.get("delta")) or 0)),
        }
    if source == "cpu_rivalry":
        return {
            "source": source,
            "outcome": _bounded_text(row.get("outcome"), 8),
            "game_number": max(0, int(_number(row.get("game_number")) or 0)),
            "record": _clean_rivalry(row.get("record")),
        }
    if source == "openings":
        return {
            "source": source,
            "opening": _bounded_text(row.get("opening"), 100),
            "outcome": _bounded_text(row.get("outcome"), 8),
            "games": max(0, int(_number(row.get("games")) or 0)),
            "wins": max(0, int(_number(row.get("wins")) or 0)),
            "draws": max(0, int(_number(row.get("draws")) or 0)),
            "losses": max(0, int(_number(row.get("losses")) or 0)),
        }
    return {}


def clean_episode(value: Any) -> dict[str, Any] | None:
    row = value if isinstance(value, dict) else None
    if not row:
        return None
    fingerprint = _bounded_text(row.get("fingerprint"), 160)
    kind = _bounded_text(row.get("kind"), 40)
    label = _bounded_text(row.get("label"), 180)
    evidence = _clean_evidence(row.get("evidence"))
    if not fingerprint or not kind or not label or not evidence:
        return None
    return {
        "schema_version": EPISODE_SCHEMA_VERSION,
        "fingerprint": fingerprint,
        "kind": kind,
        "label": label,
        "polarity": row.get("polarity") if row.get("polarity") in {"fame", "shame", "neutral"} else "neutral",
        "severity": max(0, min(100, int(_number(row.get("severity")) or 0))),
        "evidence": evidence,
        "at": _iso(row.get("at")),
    }


def merge_episodes(existing: Any, new_episodes: Any, *, cap: int = MAX_EPISODES) -> list[dict[str, Any]]:
    """Deduplicate by evidence fingerprint and keep a bounded chronological tail."""
    merged: list[dict[str, Any]] = []
    index: dict[str, int] = {}
    for raw in [*(existing if isinstance(existing, list) else []), *(new_episodes if isinstance(new_episodes, list) else [])]:
        episode = clean_episode(raw)
        if not episode:
            continue
        fingerprint = episode["fingerprint"]
        if fingerprint in index:
            merged[index[fingerprint]] = episode
        else:
            index[fingerprint] = len(merged)
            merged.append(episode)
    merged.sort(key=lambda row: (_parse_iso(row.get("at")) or datetime.min.replace(tzinfo=timezone.utc), row["fingerprint"]))
    return merged[-max(1, int(cap or MAX_EPISODES)):]


def _callback_score(episode: dict[str, Any], now: datetime) -> tuple[int, str]:
    severity = int(episode.get("severity") or 0)
    at = _parse_iso(episode.get("at"))
    age_days = 9999 if not at else max(0, int((now - at).total_seconds() // 86400))
    recency = 24 if age_days <= 3 else 12 if age_days <= 14 else 0
    evidence = episode.get("evidence") if isinstance(episode.get("evidence"), dict) else {}
    recurring = 0
    if evidence.get("source") == "noteworthy_incidents":
        count = int(evidence.get("count") or 0)
        recurring = 18 if count >= 5 else 10 if count >= 3 else 0
    if episode.get("kind") == "opening_setback" and int(evidence.get("losses") or 0) >= 3:
        recurring = max(recurring, 12)
    return severity + recency + recurring, episode["fingerprint"]


def eligible_callbacks(episodes: Any, *, now: str | None = None, limit: int = MAX_CALLBACK_CANDIDATES) -> list[dict[str, Any]]:
    """Pick sparse callback candidates; silence remains valid below threshold."""
    current = _parse_iso(now) or datetime.now(timezone.utc)
    clean = [episode for episode in (clean_episode(raw) for raw in (episodes if isinstance(episodes, list) else [])) if episode]
    ranked = []
    for episode in clean:
        score, fingerprint = _callback_score(episode, current)
        if score < 78:
            continue
        evidence = episode["evidence"]
        reasons = []
        at = _parse_iso(episode.get("at"))
        age_days = 9999 if not at else max(0, int((current - at).total_seconds() // 86400))
        if age_days <= 14:
            reasons.append("recent")
        if int(episode.get("severity") or 0) >= 85:
            reasons.append("severe")
        if evidence.get("source") == "noteworthy_incidents" and int(evidence.get("count") or 0) >= 3:
            reasons.append("recurring")
        if episode.get("kind") == "opening_setback" and int(evidence.get("losses") or 0) >= 3:
            reasons.append("recurring")
        ranked.append((score, fingerprint, {"episode": episode, "reasons": reasons or ["notable"]}))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [row[2] for row in ranked[:max(0, min(MAX_CALLBACK_CANDIDATES, int(limit or 0)))]]
