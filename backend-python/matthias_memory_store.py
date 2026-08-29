"""Persistent, bounded and grounded memory for Matthias.

One document per user. Memory is deliberately split into two kinds of data:

* authoritative structured facts/progress computed by Chess Studio; and
* a short history of advice Matthias actually gave, stored as *advice*, never
  promoted to factual player history.

Raw prompts, auth material and arbitrary chat transcripts are never stored.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "matthias_memory"
MEMORY_SCHEMA_VERSION = 5
MAX_RECENT_ADVICE = 12
MAX_RECENT_CONSULTATION_IDS = MAX_RECENT_ADVICE
MAX_ACTIVE_GOALS = 3
MAX_MILESTONES = 10
MAX_OPENING_MEMORY = 6
MAX_EMBLEMATIC_POSITIONS = 8
MAX_RESPONSE_SIGNATURES = 12
ACTIVE_CHALLENGE_GAMES = 3
RETURN_AFTER_DAYS = 14
RETURN_CONTEXT_TTL_DAYS = 3
_memory: dict[str, dict[str, Any]] = {}
_memory_lock = asyncio.Lock()

_NUMERIC_SNAPSHOT_KEYS = (
    "total_games",
    "puzzles_solved",
    "personal_training_positions",
    "achievements_unlocked",
)
_RECORD_KEYS = ("wins", "losses", "draws")

_TOPIC_LABELS = {
    "mate_awareness": "Ver mates antes de que sea demasiado tarde",
    "queen_safety": "Seguridad de la dama",
    "forks": "Horquillas y dobles ataques",
    "conversion": "Convertir ventajas sin regalar el final",
    "openings": "Aperturas recurrentes",
    "tactics": "Táctica y cálculo",
    "strengths": "Consolidar fortalezas reales",
    "decision_process": "Proceso de decisión antes de mover",
    "general_improvement": "Reducir el error recurrente principal",
}

_INCIDENT_TOPICS = {
    "human:MISSED_MATE": "mate_awareness",
    "human:ALLOWED_MATE": "mate_awareness",
    "human:QUEEN_EN_PRISE_TO_PAWN": "queen_safety",
    "cpu:PAWN_TAKES_QUEEN": "queen_safety",
    "cpu:KNIGHT_FORK": "forks",
    "cpu:PAWN_FORK": "forks",
    "human:STALEMATE_BLUNDER": "conversion",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para la memoria de Matthias.")
    return None


def _bounded_text(value: Any, limit: int = 900) -> str:
    return " ".join(str(value or "").split())[:limit]


def _clean_consultation_id(value: Any) -> str | None:
    clean = re.sub(r"[^A-Za-z0-9._:-]", "", str(value or ""))[:80]
    return clean or None


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _parse_iso(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _response_signature(text: Any) -> str | None:
    normalized = re.sub(r"[^a-z0-9áéíóúüñ ]+", " ", _bounded_text(text, 900).lower())
    normalized = " ".join(normalized.split())
    if not normalized:
        return None
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]


def _clean_respect(value: Any) -> dict[str, Any]:
    row = value if isinstance(value, dict) else {}
    score = max(0, min(100, int(_number(row.get("score")) or 0)))
    return {
        "tier": _bounded_text(row.get("tier"), 24) or "recruit",
        "label": _bounded_text(row.get("label"), 48) or "Recluta",
        "score": score,
    }


def _clean_rivalry(value: Any) -> dict[str, int]:
    row = value if isinstance(value, dict) else {}
    return {
        "games": max(0, int(_number(row.get("games")) or 0)),
        "wins": max(0, int(_number(row.get("wins")) or 0)),
        "draws": max(0, int(_number(row.get("draws")) or 0)),
        "losses": max(0, int(_number(row.get("losses")) or 0)),
        "best_human_streak": max(0, int(_number(row.get("best_human_streak")) or 0)),
        "best_cpu_streak": max(0, int(_number(row.get("best_cpu_streak")) or 0)),
    }


def _clean_challenge(value: Any) -> dict[str, Any] | None:
    row = value if isinstance(value, dict) else None
    if not row:
        return None
    challenge_id = _bounded_text(row.get("id"), 96)
    label = _bounded_text(row.get("label"), 160)
    if not challenge_id or not label:
        return None
    return {
        "id": challenge_id,
        "topic": _bounded_text(row.get("topic"), 48),
        "incident_key": _bounded_text(row.get("incident_key"), 80),
        "label": label,
        "baseline_games": max(0, int(_number(row.get("baseline_games")) or 0)),
        "current_games": max(0, int(_number(row.get("current_games")) or 0)),
        "baseline_count": max(0, int(_number(row.get("baseline_count")) or 0)),
        "current_count": max(0, int(_number(row.get("current_count")) or 0)),
        "target_games": max(1, int(_number(row.get("target_games")) or ACTIVE_CHALLENGE_GAMES)),
        "setbacks": max(0, int(_number(row.get("setbacks")) or 0)),
        "created_at": row.get("created_at"),
    }


def _clean_emblematic_positions(value: Any) -> list[dict[str, Any]]:
    rows = value if isinstance(value, list) else []
    clean = []
    for item in rows[-MAX_EMBLEMATIC_POSITIONS:]:
        if not isinstance(item, dict):
            continue
        fingerprint = _bounded_text(item.get("fingerprint"), 48)
        fen = _bounded_text(item.get("fen"), 128)
        if not fingerprint or not fen:
            continue
        clean.append({
            "fingerprint": fingerprint,
            "label": _bounded_text(item.get("label"), 180),
            "fen": fen,
            "opening": _bounded_text(item.get("opening"), 100),
            "move_number": _number(item.get("move_number")),
            "played": _bounded_text(item.get("played"), 24),
            "suggested": _bounded_text(item.get("suggested"), 24),
            "loss_cp": max(0, int(_number(item.get("loss_cp")) or 0)),
            "severity": _bounded_text(item.get("severity"), 24),
            "at": item.get("at"),
        })
    return clean


def _clean_return_context(value: Any, *, now: datetime | None = None) -> dict[str, Any] | None:
    row = value if isinstance(value, dict) else None
    if not row:
        return None
    returned_at = _parse_iso(row.get("returned_at"))
    current = now or datetime.now(timezone.utc)
    if not returned_at or (current - returned_at).total_seconds() > RETURN_CONTEXT_TTL_DAYS * 86400:
        return None
    days = max(0, int(_number(row.get("days")) or 0))
    return {"days": days, "returned_at": row.get("returned_at")} if days >= RETURN_AFTER_DAYS else None


def _snapshot(facts: dict[str, Any] | None) -> dict[str, Any]:
    facts = facts if isinstance(facts, dict) else {}
    snap: dict[str, Any] = {}
    for key in _NUMERIC_SNAPSHOT_KEYS:
        value = _number(facts.get(key))
        if value is not None:
            snap[key] = value
    record = facts.get("record") if isinstance(facts.get("record"), dict) else {}
    clean_record = {}
    for key in _RECORD_KEYS:
        value = _number(record.get(key))
        if value is not None:
            clean_record[key] = value
    if clean_record:
        snap["record"] = clean_record
    return snap


def _progress(previous: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, Any]:
    previous = previous if isinstance(previous, dict) else {}
    delta: dict[str, Any] = {}
    for key in _NUMERIC_SNAPSHOT_KEYS:
        before = _number(previous.get(key))
        after = _number(current.get(key))
        if before is not None and after is not None and after != before:
            delta[key] = after - before
    before_record = previous.get("record") if isinstance(previous.get("record"), dict) else {}
    after_record = current.get("record") if isinstance(current.get("record"), dict) else {}
    record_delta = {}
    for key in _RECORD_KEYS:
        before = _number(before_record.get(key))
        after = _number(after_record.get(key))
        if before is not None and after is not None and after != before:
            record_delta[key] = after - before
    if record_delta:
        delta["record"] = record_delta
    return delta


def _dominant_incident_topic(facts: dict[str, Any]) -> str | None:
    rows = facts.get("noteworthy_incidents") if isinstance(facts.get("noteworthy_incidents"), list) else []
    candidates: list[tuple[int, str]] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "")[:80]
        topic = _INCIDENT_TOPICS.get(key)
        count = _number(item.get("count"))
        if topic and count is not None and count > 0:
            candidates.append((int(count), topic))
    return max(candidates, default=(0, None), key=lambda row: (row[0], row[1] or ""))[1]


def _grounded_topic(question_kind: str, facts: dict[str, Any] | None) -> str:
    facts = facts if isinstance(facts, dict) else {}
    incident_topic = _dominant_incident_topic(facts)
    if question_kind in {"improve", "tactics", "action"} and incident_topic:
        return incident_topic
    return {
        "openings": "openings",
        "tactics": "tactics",
        "strengths": "strengths",
        "action": "decision_process",
        "improve": "general_improvement",
    }.get(question_kind, "general_improvement")


def _topic_label(topic: str | None) -> str | None:
    return _TOPIC_LABELS.get(str(topic or ""))


def _clean_counts(value: Any, *, max_keys: int = 32) -> dict[str, int]:
    source = value if isinstance(value, dict) else {}
    clean: dict[str, int] = {}
    for key, count in list(source.items())[:max_keys]:
        if isinstance(count, (int, float)) and not isinstance(count, bool):
            clean[str(key)[:48]] = max(0, int(count))
    return clean



def _clean_relationship(value: Any) -> dict[str, Any]:
    row = value if isinstance(value, dict) else {}
    return {
        "tier": _bounded_text(row.get("tier"), 20) or "newcomer",
        "label": _bounded_text(row.get("label"), 48) or "Recién llegado",
        "games_seen": max(0, int(_number(row.get("games_seen")) or 0)),
    }


def _clean_opening_rows(value: Any) -> list[dict[str, Any]]:
    rows = value if isinstance(value, list) else []
    clean = []
    for item in rows[:MAX_OPENING_MEMORY]:
        if not isinstance(item, dict):
            continue
        name = _bounded_text(item.get("name"), 100)
        if not name:
            continue
        clean.append({
            "name": name,
            "games": max(0, int(_number(item.get("games")) or 0)),
            "wins": max(0, int(_number(item.get("wins")) or 0)),
            "draws": max(0, int(_number(item.get("draws")) or 0)),
            "losses": max(0, int(_number(item.get("losses")) or 0)),
            "win_pct": max(0.0, min(100.0, float(_number(item.get("win_pct")) or 0))),
        })
    return clean


def _clean_goal_rows(value: Any) -> list[dict[str, Any]]:
    rows = value if isinstance(value, list) else []
    clean = []
    for item in rows[:MAX_ACTIVE_GOALS]:
        if not isinstance(item, dict):
            continue
        goal_id = _bounded_text(item.get("id"), 96)
        label = _bounded_text(item.get("label"), 120)
        if not goal_id or not label:
            continue
        clean.append({
            "id": goal_id,
            "topic": _bounded_text(item.get("topic"), 48),
            "label": label,
            "metric": _bounded_text(item.get("metric"), 48),
            "baseline": _number(item.get("baseline")),
            "current": _number(item.get("current")),
            "baseline_games": max(0, int(_number(item.get("baseline_games")) or 0)),
            "current_games": max(0, int(_number(item.get("current_games")) or 0)),
            "created_at": item.get("created_at"),
        })
    return clean


def _clean_milestones(value: Any, polarity: str | None = None) -> list[dict[str, Any]]:
    rows = value if isinstance(value, list) else []
    clean = []
    for item in rows[-MAX_MILESTONES:]:
        if not isinstance(item, dict):
            continue
        if polarity and item.get("polarity") != polarity:
            continue
        fingerprint = _bounded_text(item.get("fingerprint"), 96)
        label = _bounded_text(item.get("label"), 160)
        if not fingerprint or not label:
            continue
        clean.append({
            "fingerprint": fingerprint,
            "kind": _bounded_text(item.get("kind"), 48),
            "polarity": "shame" if item.get("polarity") == "shame" else "fame",
            "label": label,
            "at": item.get("at"),
        })
    return clean


def _opening_memory_from_facts(facts: dict[str, Any]) -> list[dict[str, Any]]:
    rows = facts.get("openings") if isinstance(facts.get("openings"), list) else []
    clean = _clean_opening_rows(rows)
    return sorted(clean, key=lambda item: (-item["games"], item["name"]))[:MAX_OPENING_MEMORY]


def _incident_counts_from_facts(facts: dict[str, Any]) -> dict[str, int]:
    rows = facts.get("noteworthy_incidents") if isinstance(facts.get("noteworthy_incidents"), list) else []
    out: dict[str, int] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        key = _bounded_text(item.get("key"), 80)
        count = _number(item.get("count"))
        if key and count is not None and count > 0:
            out[key] = max(0, int(count))
    return out


def _relationship_for(row: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    games = max(0, int(_number(facts.get("total_games")) or 0))
    consultations = max(0, int(row.get("consultation_count") or 0))
    if games >= 50 or consultations >= 12:
        tier, label = "veteran", "Viejo conocido"
    elif games >= 15 or consultations >= 5:
        tier, label = "regular", "Habitual del despacho"
    elif games >= 3 or consultations >= 1:
        tier, label = "acquainted", "Ya nos conocemos"
    else:
        tier, label = "newcomer", "Recién llegado"
    return {"tier": tier, "label": label, "games_seen": games}


def _rivalry_from_facts(facts: dict[str, Any]) -> dict[str, int]:
    return _clean_rivalry(facts.get("cpu_rivalry"))


def _respect_for(row: dict[str, Any], facts: dict[str, Any], milestones: list[dict[str, Any]]) -> dict[str, Any]:
    games = max(0, int(_number(facts.get("total_games")) or 0))
    puzzles = max(0, int(_number(facts.get("puzzles_solved")) or 0))
    streak = max(0, int(_number(facts.get("longest_win_streak")) or 0))
    rivalry = _rivalry_from_facts(facts)
    completed_goals = sum(1 for item in milestones if item.get("kind") in {"goal_completed", "challenge_completed"})
    rating = facts.get("rating_trend") if isinstance(facts.get("rating_trend"), dict) else {}
    rating_gain = max(0, int(_number(rating.get("delta")) or 0))
    score = min(100,
        min(40, games)
        + min(18, rivalry["wins"] * 3)
        + min(12, puzzles // 3)
        + min(18, completed_goals * 6)
        + min(6, streak)
        + min(12, rating_gain // 25)
    )
    if score >= 65:
        tier, label = "formidable", "Rival respetado"
    elif score >= 40:
        tier, label = "respected", "Respeto ganado"
    elif score >= 18:
        tier, label = "proven", "Ya no eres recluta"
    else:
        tier, label = "recruit", "Recluta bajo observación"
    return {"tier": tier, "label": label, "score": score}


def _return_context_for(row: dict[str, Any], now: str) -> dict[str, Any] | None:
    previous = _parse_iso(row.get("last_observed_at"))
    current = _parse_iso(now)
    if not previous or not current:
        return _clean_return_context(row.get("return_context"), now=current)
    gap_days = int((current - previous).total_seconds() // 86400)
    if gap_days >= RETURN_AFTER_DAYS and _clean_relationship(row.get("relationship"))["tier"] != "newcomer":
        return {"days": gap_days, "returned_at": now}
    return _clean_return_context(row.get("return_context"), now=current)


def _challenge_from_facts(existing: Any, facts: dict[str, Any], now: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    incidents = _incident_counts_from_facts(facts)
    games = max(0, int(_number(facts.get("total_games")) or 0))
    challenge = _clean_challenge(existing)
    if challenge:
        key = challenge.get("incident_key")
        count = incidents.get(key, 0)
        challenge["current_games"] = games
        challenge["current_count"] = count
        if count > challenge["baseline_count"]:
            # Reincidencia real: la deuda sigue abierta y el contador vuelve a
            # empezar desde el último incidente, sin fingir progreso.
            challenge["baseline_count"] = count
            challenge["baseline_games"] = games
            challenge["setbacks"] = int(challenge.get("setbacks") or 0) + 1
            return challenge, None
        if games >= challenge["baseline_games"] + challenge["target_games"]:
            return None, challenge
        return challenge, None

    ranked = sorted(
        ((count, key, _INCIDENT_TOPICS.get(key)) for key, count in incidents.items() if _INCIDENT_TOPICS.get(key) and count > 0),
        reverse=True,
    )
    if not ranked:
        return None, None
    count, key, topic = ranked[0]
    label = _topic_label(topic) or topic
    return {
        "id": f"clean-run:{key}",
        "topic": topic,
        "incident_key": key,
        "label": f"{ACTIVE_CHALLENGE_GAMES} partidas sin repetir: {label}",
        "baseline_games": games,
        "current_games": games,
        "baseline_count": int(count),
        "current_count": int(count),
        "target_games": ACTIVE_CHALLENGE_GAMES,
        "setbacks": 0,
        "created_at": now,
    }, None


def _challenge_completion_milestone(challenge: dict[str, Any] | None, now: str) -> dict[str, Any] | None:
    if not challenge:
        return None
    return {
        "fingerprint": f"challenge-complete:{challenge.get('id')}:{challenge.get('baseline_games', 0)}",
        "kind": "challenge_completed",
        "polarity": "fame",
        "label": f"Expediente cerrado: {challenge.get('label')}",
        "at": now,
    }


def _mood_for(previous: dict[str, Any] | None, facts: dict[str, Any], previous_mood: Any = None) -> str:
    """Derive Matthias' narrative mood only from measured player performance.

    One noisy game must not make the character manic. Strong signals may move
    immediately; weaker signals preserve the previous mood for one observation.
    The LLM receives this state but never gets to choose or justify it itself.
    """
    current = _snapshot(facts)
    delta = _progress(previous, current)
    record = delta.get("record") if isinstance(delta.get("record"), dict) else {}
    wins = int(record.get("wins") or 0)
    losses = int(record.get("losses") or 0)
    puzzles = int(delta.get("puzzles_solved") or 0)
    prior = _bounded_text(previous_mood, 24) or "observant"

    # Strong, repeatable performance signals.
    if wins >= 3 and wins >= losses + 2:
        return "impressed"
    if losses >= 3 and losses >= wins + 2:
        return "annoyed"
    if puzzles >= 5 or (wins >= 2 and losses == 0):
        return "pleased"
    if losses >= 2 and losses > wins:
        return "skeptical"
    if puzzles >= 3:
        return "satisfied"

    if wins > losses and wins > 0 and prior in {"annoyed", "skeptical"}:
        return "observant"
    if losses > wins and losses > 0 and prior in {"pleased", "impressed", "satisfied"}:
        return "observant"
    return prior if prior in {"observant", "impressed", "skeptical", "satisfied", "pleased", "annoyed"} else "observant"


def _candidate_milestones(facts: dict[str, Any], now: str) -> list[dict[str, Any]]:
    record = facts.get("record") if isinstance(facts.get("record"), dict) else {}
    rivalry = facts.get("cpu_rivalry") if isinstance(facts.get("cpu_rivalry"), dict) else {}
    incidents = _incident_counts_from_facts(facts)
    candidates = []
    def add(fingerprint: str, kind: str, polarity: str, label: str):
        candidates.append({"fingerprint": fingerprint, "kind": kind, "polarity": polarity, "label": label, "at": now})
    if int(_number(record.get("wins")) or 0) >= 1:
        add("first-win", "first_win", "fame", "Primera victoria registrada")
    if int(_number(rivalry.get("wins")) or 0) >= 1:
        add("first-win-vs-matthias", "rivalry", "fame", "Primera victoria contra Matthias")
    streak = int(_number(facts.get("longest_win_streak")) or 0)
    if streak >= 3:
        add("win-streak-3", "streak", "fame", "Primera racha de 3 victorias")
    if streak >= 5:
        add("win-streak-5", "streak", "fame", "Racha de 5 victorias")
    puzzles = int(_number(facts.get("puzzles_solved")) or 0)
    if puzzles >= 10:
        add("puzzles-10", "training", "fame", "10 puzzles resueltos")
    rating = facts.get("rating_trend") if isinstance(facts.get("rating_trend"), dict) else {}
    rating_delta = _number(rating.get("delta"))
    if rating_delta is not None and rating_delta >= 100:
        add("rating-plus-100", "rating", "fame", "+100 de rating respecto al inicio registrado")
    if incidents.get("human:QUEEN_EN_PRISE_TO_PAWN", 0) > 0 or incidents.get("cpu:PAWN_TAKES_QUEEN", 0) > 0:
        add("queen-lost-to-pawn", "queen_safety", "shame", "Una dama acabó en manos de un peón")
    if incidents.get("human:MISSED_MATE", 0) > 0:
        add("missed-mate", "mate_awareness", "shame", "Hubo un mate disponible que pasó de largo")
    if incidents.get("human:STALEMATE_BLUNDER", 0) > 0:
        add("stalemate-blunder", "conversion", "shame", "Una ventaja terminó en ahogado")
    return candidates


def _merge_milestones(existing: Any, facts: dict[str, Any], now: str) -> list[dict[str, Any]]:
    rows = _clean_milestones(existing)
    seen = {item["fingerprint"] for item in rows}
    for item in _candidate_milestones(facts, now):
        if item["fingerprint"] not in seen:
            rows.append(item)
            seen.add(item["fingerprint"])
    return rows[-MAX_MILESTONES:]


def _goal_candidates(facts: dict[str, Any], now: str) -> list[dict[str, Any]]:
    games = max(1, int(_number(facts.get("total_games")) or 1))
    incidents = _incident_counts_from_facts(facts)
    out = []
    ranked = sorted(
        ((count, key, _INCIDENT_TOPICS.get(key)) for key, count in incidents.items() if _INCIDENT_TOPICS.get(key)),
        reverse=True,
    )
    for count, key, topic in ranked[:2]:
        rate = round(float(count) / games, 4)
        out.append({
            "id": f"incident:{key}", "topic": topic, "label": _topic_label(topic) or topic,
            "metric": "incidents_per_game", "baseline": rate, "current": rate,
            "baseline_games": games, "current_games": games, "created_at": now,
        })
    openings = [row for row in _opening_memory_from_facts(facts) if row["games"] >= 3]
    if openings:
        weak = min(openings, key=lambda row: (row["win_pct"], -row["games"], row["name"]))
        if weak["win_pct"] < 50:
            out.append({
                "id": f"opening:{weak['name']}", "topic": "openings",
                "label": f"Levantar {weak['name']}", "metric": "opening_win_pct",
                "baseline": weak["win_pct"], "current": weak["win_pct"],
                "baseline_games": weak["games"], "current_games": weak["games"], "created_at": now,
            })
    return out[:MAX_ACTIVE_GOALS]


def _refresh_goals(existing: Any, facts: dict[str, Any], now: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    current_games = max(0, int(_number(facts.get("total_games")) or 0))
    incidents = _incident_counts_from_facts(facts)
    openings = {row["name"]: row for row in _opening_memory_from_facts(facts)}
    active = []
    completed = []
    existing_rows = _clean_goal_rows(existing)
    candidate_map = {row["id"]: row for row in _goal_candidates(facts, now)}
    for goal in existing_rows:
        updated = dict(goal)
        if goal["metric"] == "incidents_per_game":
            incident_key = goal["id"].split(":", 1)[1] if ":" in goal["id"] else ""
            count = incidents.get(incident_key, 0)
            updated["current"] = round(float(count) / max(1, current_games), 4)
            updated["current_games"] = current_games
            enough = current_games >= goal["baseline_games"] + 3
            if enough and goal["baseline"] is not None and updated["current"] <= float(goal["baseline"]) * 0.70:
                completed.append(updated)
                continue
        elif goal["metric"] == "opening_win_pct":
            opening_name = goal["id"].split(":", 1)[1] if ":" in goal["id"] else ""
            opening = openings.get(opening_name)
            if opening:
                updated["current"] = opening["win_pct"]
                updated["current_games"] = opening["games"]
                enough = opening["games"] >= goal["baseline_games"] + 3
                if enough and goal["baseline"] is not None and updated["current"] >= float(goal["baseline"]) + 15:
                    completed.append(updated)
                    continue
        active.append(updated)
        candidate_map.pop(goal["id"], None)
    for candidate in candidate_map.values():
        if len(active) >= MAX_ACTIVE_GOALS:
            break
        active.append(candidate)
    return active[:MAX_ACTIVE_GOALS], completed


def _goal_completion_milestones(completed: list[dict[str, Any]], now: str) -> list[dict[str, Any]]:
    out = []
    for goal in completed:
        out.append({
            "fingerprint": f"goal-complete:{goal['id']}:{goal.get('baseline_games', 0)}",
            "kind": "goal_completed", "polarity": "fame",
            "label": f"Objetivo superado: {goal['label']}", "at": now,
        })
    return out


async def observe_facts(username: str, facts: dict[str, Any]) -> dict[str, Any]:
    """Persist deterministic coaching state from current Chess Studio facts.

    This function never stores LLM claims as facts. It only derives goals,
    milestones, relationship tier and opening memory from structured metrics.
    """
    if not username or not isinstance(facts, dict):
        return {}
    now = _now_iso()
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}) or {"_id": username}
            active_goals, completed = _refresh_goals(row.get("active_goals"), facts, now)
            milestones = _merge_milestones(row.get("milestones"), facts, now)
            for item in _goal_completion_milestones(completed, now):
                if item["fingerprint"] not in {m["fingerprint"] for m in milestones}:
                    milestones.append(item)
            active_challenge, completed_challenge = _challenge_from_facts(row.get("active_challenge"), facts, now)
            challenge_milestone = _challenge_completion_milestone(completed_challenge, now)
            if challenge_milestone and challenge_milestone["fingerprint"] not in {m["fingerprint"] for m in milestones}:
                milestones.append(challenge_milestone)
            milestones = milestones[-MAX_MILESTONES:]
            update = {
                "schema_version": MEMORY_SCHEMA_VERSION,
                "relationship": _relationship_for(row, facts),
                "respect": _respect_for(row, facts, milestones),
                "mood": _mood_for(row.get("latest_observed_snapshot"), facts, row.get("mood")),
                "active_goals": active_goals,
                "active_challenge": active_challenge,
                "opening_memory": _opening_memory_from_facts(facts),
                "rivalry": _rivalry_from_facts(facts),
                "return_context": _return_context_for(row, now),
                "milestones": milestones,
                "latest_observed_snapshot": _snapshot(facts),
                "last_observed_at": now,
                "updated_at": now,
            }
            await col.update_one({"_id": username}, {"$set": update, "$setOnInsert": {"created_at": now, "consultation_count": 0}}, upsert=True)
            return update
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo actualizar el expediente determinista de Matthias.") from exc

    async with _memory_lock:
        row = _memory.setdefault(username, {"_id": username, "consultation_count": 0, "created_at": now})
        active_goals, completed = _refresh_goals(row.get("active_goals"), facts, now)
        milestones = _merge_milestones(row.get("milestones"), facts, now)
        fingerprints = {m["fingerprint"] for m in milestones}
        for item in _goal_completion_milestones(completed, now):
            if item["fingerprint"] not in fingerprints:
                milestones.append(item)
                fingerprints.add(item["fingerprint"])
        active_challenge, completed_challenge = _challenge_from_facts(row.get("active_challenge"), facts, now)
        challenge_milestone = _challenge_completion_milestone(completed_challenge, now)
        if challenge_milestone and challenge_milestone["fingerprint"] not in fingerprints:
            milestones.append(challenge_milestone)
            fingerprints.add(challenge_milestone["fingerprint"])
        milestones = milestones[-MAX_MILESTONES:]
        row.update({
            "schema_version": MEMORY_SCHEMA_VERSION,
            "relationship": _relationship_for(row, facts),
            "respect": _respect_for(row, facts, milestones),
            "mood": _mood_for(row.get("latest_observed_snapshot"), facts, row.get("mood")),
            "active_goals": active_goals,
            "active_challenge": active_challenge,
            "opening_memory": _opening_memory_from_facts(facts),
            "rivalry": _rivalry_from_facts(facts),
            "return_context": _return_context_for(row, now),
            "milestones": milestones,
            "latest_observed_snapshot": _snapshot(facts),
            "last_observed_at": now,
            "updated_at": now,
        })
        return dict(row)

def _advice_followup(row: dict[str, Any], current_snapshot: dict[str, Any]) -> dict[str, Any] | None:
    advice = row.get("main_advice") if isinstance(row.get("main_advice"), dict) else None
    if not advice:
        return None
    delta = _progress(row.get("facts_snapshot"), current_snapshot)
    games_since = int(delta.get("total_games") or 0)
    if games_since < 3:
        return {
            "status": "waiting",
            "games_since": max(0, games_since),
            "games_needed": max(0, 3 - games_since),
            "topic": _bounded_text(advice.get("topic"), 48),
        }
    record = delta.get("record") if isinstance(delta.get("record"), dict) else {}
    wins = int(record.get("wins") or 0)
    losses = int(record.get("losses") or 0)
    puzzle_gain = int(delta.get("puzzles_solved") or 0)
    if wins > losses or puzzle_gain >= 3:
        status = "improving"
    elif losses >= wins + 2:
        status = "struggling"
    else:
        status = "mixed"
    return {
        "status": status,
        "games_since": games_since,
        "games_needed": 0,
        "topic": _bounded_text(advice.get("topic"), 48),
        "progress": delta,
    }


def _current_obsession(row: dict[str, Any]) -> dict[str, Any] | None:
    goals = _clean_goal_rows(row.get("active_goals"))
    if not goals:
        return None
    goal = goals[0]
    return {"id": goal.get("id"), "topic": goal.get("topic"), "label": goal.get("label")}


def _open_debt(row: dict[str, Any], current_snapshot: dict[str, Any]) -> dict[str, Any] | None:
    followup = _advice_followup(row, current_snapshot)
    advice = row.get("main_advice") if isinstance(row.get("main_advice"), dict) else None
    if not followup or not advice or followup.get("status") == "improving":
        return None
    return {
        "topic": _bounded_text(advice.get("topic"), 48),
        "advice": _bounded_text(advice.get("text"), 240),
        "status": followup.get("status"),
        "games_since": followup.get("games_since", 0),
    }


def _context_from_row(row: dict[str, Any] | None, current_facts: dict[str, Any]) -> dict[str, Any]:
    row = row or {}
    current_snapshot = _snapshot(current_facts)
    recent = row.get("recent_advice") if isinstance(row.get("recent_advice"), list) else []
    prior_advice = []
    for item in recent[-3:]:
        if not isinstance(item, dict):
            continue
        text = _bounded_text(item.get("text"))
        if not text:
            continue
        prior_advice.append({
            "question_kind": _bounded_text(item.get("question_kind"), 32),
            "text": text,
            "at": _bounded_text(item.get("at"), 48),
        })
    remembered_position = None
    current_fen = _bounded_text(current_facts.get("fen"), 128)
    if current_fen:
        for position in reversed(_clean_emblematic_positions(row.get("emblematic_positions"))):
            if position.get("fen") == current_fen:
                remembered_position = position
                break
    return {
        "schema_version": int(row.get("schema_version") or 1),
        "consultation_count": max(0, int(row.get("consultation_count") or 0)),
        "question_counts": _clean_counts(row.get("question_counts")),
        "prior_advice": prior_advice,
        # This is the only place where improvement/regression is inferred. Both
        # sides are structured snapshots produced by Chess Studio, never prose.
        "progress_since_last": _progress(row.get("facts_snapshot"), current_snapshot),
        "grounded_topic": _grounded_topic(str(current_facts.get("question_kind") or ""), current_facts),
        "relationship": _clean_relationship(row.get("relationship")),
        "respect": _clean_respect(row.get("respect")),
        "mood": _bounded_text(row.get("mood"), 24) or "observant",
        "active_goals": _clean_goal_rows(row.get("active_goals")),
        "current_obsession": _current_obsession(row),
        "active_challenge": _clean_challenge(row.get("active_challenge")),
        "opening_memory": _clean_opening_rows(row.get("opening_memory")),
        "rivalry": _clean_rivalry(row.get("rivalry")),
        "return_context": _clean_return_context(row.get("return_context")),
        "hall_of_fame": _clean_milestones(row.get("milestones"), polarity="fame")[-3:],
        "hall_of_shame": _clean_milestones(row.get("milestones"), polarity="shame")[-3:],
        "recent_milestones": _clean_milestones(row.get("milestones"))[-5:],
        "emblematic_positions": _clean_emblematic_positions(row.get("emblematic_positions"))[-3:],
        # Exact-FEN recognition only. Matthias may remember the same position,
        # but must never claim that a merely similar position is an old memory.
        "remembered_position": remembered_position,
        "advice_followup": _advice_followup(row, current_snapshot),
        "open_debt": _open_debt(row, current_snapshot),
        "avoid_phrases": [_bounded_text(item.get("text"), 90) for item in recent[-5:] if isinstance(item, dict) and _bounded_text(item.get("text"), 90)],
    }


async def context(username: str, current_facts: dict[str, Any]) -> dict[str, Any]:
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer la memoria de Matthias.") from exc
    else:
        row = _memory.get(username)
    return _context_from_row(row, current_facts)


async def replay_consultation(username: str, consultation_id: str | None) -> dict[str, Any] | None:
    """Return a recently persisted successful consultation for safe retry replay.

    The replay window is intentionally the same bounded window as recent advice,
    so an idempotency key is never remembered after its response text was compacted.
    """
    clean_id = _clean_consultation_id(consultation_id)
    if not clean_id:
        return None
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}, {"recent_advice": 1})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer la memoria de Matthias.") from exc
    else:
        row = _memory.get(username)
    recent = row.get("recent_advice") if isinstance(row, dict) and isinstance(row.get("recent_advice"), list) else []
    for item in reversed(recent):
        if not isinstance(item, dict) or item.get("consultation_id") != clean_id:
            continue
        text = _bounded_text(item.get("text"))
        if not text:
            return None
        return {
            "consultationId": clean_id,
            "questionKind": _bounded_text(item.get("question_kind"), 32),
            "text": text,
            "at": item.get("at"),
        }
    return None


async def user_summary(username: str) -> dict[str, Any]:
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer la memoria de Matthias.") from exc
    else:
        row = _memory.get(username)
    row = row or {}
    advice = row.get("main_advice") if isinstance(row.get("main_advice"), dict) else None
    milestones = _clean_milestones(row.get("milestones"))
    openings = _clean_opening_rows(row.get("opening_memory"))
    nemesis = min((item for item in openings if item["games"] >= 3), key=lambda item: (item["win_pct"], -item["games"], item["name"]), default=None)
    return {
        "schemaVersion": int(row.get("schema_version") or MEMORY_SCHEMA_VERSION),
        "consultations": max(0, int(row.get("consultation_count") or 0)),
        "lastConsultedAt": row.get("last_consulted_at"),
        "lastObservedAt": row.get("last_observed_at"),
        "relationship": _clean_relationship(row.get("relationship")),
        "respect": _clean_respect(row.get("respect")),
        "mood": _bounded_text(row.get("mood"), 24) or "observant",
        "activeGoals": _clean_goal_rows(row.get("active_goals")),
        "currentObsession": _current_obsession(row),
        "activeChallenge": _clean_challenge(row.get("active_challenge")),
        "openingMemory": openings,
        "nemesisOpening": nemesis,
        "rivalry": _clean_rivalry(row.get("rivalry")),
        "returnContext": _clean_return_context(row.get("return_context")),
        "hallOfFame": [item for item in milestones if item["polarity"] == "fame"][-5:],
        "hallOfShame": [item for item in milestones if item["polarity"] == "shame"][-5:],
        "recentMilestones": milestones[-5:],
        "emblematicPositions": _clean_emblematic_positions(row.get("emblematic_positions")),
        "adviceFollowup": _advice_followup(row, row.get("latest_observed_snapshot") if isinstance(row.get("latest_observed_snapshot"), dict) else _snapshot({})),
        "openDebt": _open_debt(row, row.get("latest_observed_snapshot") if isinstance(row.get("latest_observed_snapshot"), dict) else _snapshot({})),
        "mainAdvice": {
            "text": _bounded_text(advice.get("text")),
            "questionKind": _bounded_text(advice.get("question_kind"), 32),
            "topic": _bounded_text(advice.get("topic"), 48),
            "at": advice.get("at"),
        } if advice and _bounded_text(advice.get("text")) else None,
    }


def _mongo_update(entry: dict[str, Any], snapshot: dict[str, Any], kind: str, topic: str, now: str, consultation_id: str | None, response_signature: str | None) -> dict[str, Any]:
    update: dict[str, Any] = {
        "$inc": {
            "consultation_count": 1,
            f"question_counts.{kind}": 1,
            f"topic_counts.{topic}": 1,
        },
        "$set": {
            "schema_version": MEMORY_SCHEMA_VERSION,
            "last_consulted_at": now,
            "main_advice": entry,
            "facts_snapshot": snapshot,
            "updated_at": now,
        },
        "$setOnInsert": {"created_at": now},
        "$push": {"recent_advice": {"$each": [entry], "$slice": -MAX_RECENT_ADVICE}},
    }
    if consultation_id:
        update["$push"]["recent_consultation_ids"] = {
            "$each": [consultation_id],
            "$slice": -MAX_RECENT_CONSULTATION_IDS,
        }
    if response_signature:
        update["$push"]["recent_response_signatures"] = {
            "$each": [response_signature],
            "$slice": -MAX_RESPONSE_SIGNATURES,
        }
    return update


def _new_row(username: str, entry: dict[str, Any], snapshot: dict[str, Any], kind: str, topic: str, now: str, consultation_id: str | None, response_signature: str | None) -> dict[str, Any]:
    return {
        "_id": username,
        "schema_version": MEMORY_SCHEMA_VERSION,
        "consultation_count": 1,
        "question_counts": {kind: 1},
        "topic_counts": {topic: 1},
        "recent_advice": [entry],
        "recent_consultation_ids": [consultation_id] if consultation_id else [],
        "recent_response_signatures": [response_signature] if response_signature else [],
        "created_at": now,
        "last_consulted_at": now,
        "main_advice": entry,
        "facts_snapshot": snapshot,
        "updated_at": now,
    }


async def record_consultation(
    username: str,
    question_kind: str,
    text: str,
    facts: dict[str, Any],
    *,
    consultation_id: str | None = None,
) -> bool:
    """Persist one successful consultation.

    Returns ``True`` only when a new consultation was recorded. Replaying the
    same consultation_id is idempotent and returns ``False``.
    """
    advice_text = _bounded_text(text)
    if not advice_text:
        return False
    kind = re.sub(r"[^A-Za-z0-9_-]", "_", _bounded_text(question_kind, 32))[:32] or "unknown"
    topic = _grounded_topic(kind, facts)
    now = _now_iso()
    clean_id = _clean_consultation_id(consultation_id)
    entry = {"question_kind": kind, "topic": topic, "text": advice_text, "at": now}
    if clean_id:
        entry["consultation_id"] = clean_id
    snapshot = _snapshot(facts)
    response_signature = _response_signature(advice_text)
    col = await _collection()
    if col is not None:
        try:
            existing = await col.find_one({"_id": username}, {"recent_consultation_ids": 1})
            if existing is not None:
                ids = existing.get("recent_consultation_ids") if isinstance(existing.get("recent_consultation_ids"), list) else []
                if clean_id and clean_id in ids:
                    return False
                result = await col.update_one(
                    {"_id": username, **({"recent_consultation_ids": {"$ne": clean_id}} if clean_id else {})},
                    _mongo_update(entry, snapshot, kind, topic, now, clean_id, response_signature),
                    upsert=False,
                )
                return bool(result.modified_count)

            try:
                await col.insert_one(_new_row(username, entry, snapshot, kind, topic, now, clean_id, response_signature))
                return True
            except DuplicateKeyError:
                # Another request created the user row between find and insert.
                # Re-run the idempotent update rather than double counting.
                result = await col.update_one(
                    {"_id": username, **({"recent_consultation_ids": {"$ne": clean_id}} if clean_id else {})},
                    _mongo_update(entry, snapshot, kind, topic, now, clean_id, response_signature),
                    upsert=False,
                )
                return bool(result.modified_count)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo guardar la memoria de Matthias.") from exc

    async with _memory_lock:
        row = _memory.get(username)
        if row is None:
            _memory[username] = _new_row(username, entry, snapshot, kind, topic, now, clean_id, response_signature)
            return True
        ids = row.get("recent_consultation_ids") if isinstance(row.get("recent_consultation_ids"), list) else []
        if clean_id and clean_id in ids:
            return False
        row["schema_version"] = MEMORY_SCHEMA_VERSION
        row["consultation_count"] = int(row.get("consultation_count") or 0) + 1
        counts = row.setdefault("question_counts", {})
        counts[kind] = int(counts.get(kind) or 0) + 1
        topics = row.setdefault("topic_counts", {})
        topics[topic] = int(topics.get(topic) or 0) + 1
        recent = row.setdefault("recent_advice", [])
        recent.append(entry)
        del recent[:-MAX_RECENT_ADVICE]
        if clean_id:
            ids = row.setdefault("recent_consultation_ids", [])
            ids.append(clean_id)
            del ids[:-MAX_RECENT_CONSULTATION_IDS]
        if response_signature:
            signatures = row.setdefault("recent_response_signatures", [])
            signatures.append(response_signature)
            del signatures[:-MAX_RESPONSE_SIGNATURES]
        row.update({
            "last_consulted_at": now,
            "main_advice": entry,
            "facts_snapshot": snapshot,
            "updated_at": now,
        })
        return True


def briefing_text_from_summary(summary: dict[str, Any]) -> str:
    relationship = _clean_relationship(summary.get("relationship"))
    respect = _clean_respect(summary.get("respect"))
    goals = summary.get("activeGoals") if isinstance(summary.get("activeGoals"), list) else []
    challenge = _clean_challenge(summary.get("activeChallenge"))
    debt = summary.get("openDebt") if isinstance(summary.get("openDebt"), dict) else None
    nemesis = summary.get("nemesisOpening") if isinstance(summary.get("nemesisOpening"), dict) else None
    reunion = summary.get("returnContext") if isinstance(summary.get("returnContext"), dict) else None
    mood = _bounded_text(summary.get("mood"), 24) or "observant"
    if reunion and int(reunion.get("days") or 0) >= RETURN_AFTER_DAYS:
        if nemesis and int(nemesis.get("games") or 0) >= 3:
            return f"Has vuelto después de {int(reunion.get('days') or 0)} días. {nemesis.get('name')} seguía en el expediente; comprueba si también sigue cobrando peaje, bitte."[:420]
        return f"Has vuelto después de {int(reunion.get('days') or 0)} días. El expediente no se ha borrado por aburrimiento: calcula dos candidatas antes de cada decisión crítica."[:420]
    if challenge:
        remaining = max(0, challenge["baseline_games"] + challenge["target_games"] - challenge["current_games"])
        if remaining > 0:
            return f"Reto pendiente: {challenge.get('label')}. Te quedan {remaining} partida{'s' if remaining != 1 else ''} limpias para que retire oficialmente la acusación."[:420]
    if debt and debt.get("status") in {"struggling", "mixed"}:
        return "Mi consejo anterior sigue abierto. Los datos nuevos todavía no me permiten archivarlo, así que hoy no vamos a fingir que el problema se evaporó."
    if goals:
        goal = goals[0]
        return f"Achtung. Mi obsesión actual sigue siendo: {goal.get('label')}. Hoy no hace falta inventar otro problema; con ése ya tienes trabajo."[:420]
    if nemesis and int(nemesis.get("games") or 0) >= 3 and float(nemesis.get("win_pct") or 0) < 50:
        return f"Tu expediente señala {nemesis.get('name')}: {int(round(float(nemesis.get('win_pct') or 0)))}% de victorias en {int(nemesis.get('games') or 0)} partidas. Si aparece, juega despierto, bitte."[:420]
    if mood == "annoyed":
        return "Ach. El expediente reciente es bastante feo y mi paciencia estadística también tiene límites. Hoy calcula dos candidatas antes de mover y no me obligues a archivar otra autopsia."
    if mood == "pleased":
        return "Sehr gut. Los datos recientes por fin apuntan en la dirección correcta. Disfrútalo cinco segundos y vuelve al trabajo: dos candidatas antes de cada jugada crítica."
    if mood == "skeptical":
        return "Te estoy mirando con bastante poca fe estadística. Demuéstrame lo contrario: revisa jaques, capturas y amenazas antes de cada decisión crítica."
    if mood == "impressed":
        return "Vienes mejorando desde la última vez que miré el expediente. Eso ha sido bueno. Muy bueno. No te acostumbres a oírlo: dos candidatas antes de cada jugada crítica."
    if respect.get("tier") in {"respected", "formidable"}:
        return "Ya no necesitas ceremonia de recluta. Juega, calcula y dame una partida digna de un rival al que ya tengo que tomar en serio."
    if relationship.get("tier") == "veteran":
        return "Ya nos conocemos demasiado bien. Nada de calentamiento ceremonial: juega, calcula y dame menos material para el Hall of Shame."
    return "Briefing corto: antes de mover, revisa jaques, capturas y amenazas. Si hoy no me das una tragedia nueva que archivar, lo consideraré progreso."


def _position_label(facts: dict[str, Any]) -> str:
    loss = max(0, int(_number(facts.get("loss_cp")) or 0))
    played = _bounded_text(facts.get("played"), 24) or "la jugada"
    if loss >= 500:
        return f"Posición emblemática: {played}, catástrofe de {loss} cp"
    if loss >= 250:
        return f"Posición emblemática: {played}, error grave de {loss} cp"
    return f"Posición crítica recordada: {played}, {loss} cp"


async def record_emblematic_position(username: str, facts: dict[str, Any]) -> bool:
    """Remember a genuinely important queried position, bounded and idempotent.

    Only engine-grounded position facts are stored. Merely asking Matthias about
    an ordinary move does not turn it into biography.
    """
    if not username or not isinstance(facts, dict):
        return False
    fen = _bounded_text(facts.get("fen"), 128)
    loss = max(0, int(_number(facts.get("loss_cp")) or 0))
    severity = _bounded_text(facts.get("severity"), 24).lower()
    if not fen or (loss < 180 and severity not in {"mistake", "blunder", "grave", "critical"}):
        return False
    played = _bounded_text(facts.get("played"), 24)
    suggested = _bounded_text(facts.get("suggested"), 24)
    fingerprint = hashlib.sha1(f"{fen}|{played}|{suggested}".encode("utf-8")).hexdigest()[:20]
    now = _now_iso()
    entry = {
        "fingerprint": fingerprint,
        "label": _position_label(facts),
        "fen": fen,
        "opening": _bounded_text(facts.get("opening"), 100),
        "move_number": _number(facts.get("move_number")),
        "played": played,
        "suggested": suggested,
        "loss_cp": loss,
        "severity": severity,
        "at": now,
    }
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}, {"emblematic_positions": 1}) or {}
            positions = _clean_emblematic_positions(row.get("emblematic_positions"))
            positions = [item for item in positions if item.get("fingerprint") != fingerprint]
            positions.append(entry)
            await col.update_one(
                {"_id": username},
                {"$set": {"schema_version": MEMORY_SCHEMA_VERSION, "emblematic_positions": positions[-MAX_EMBLEMATIC_POSITIONS:], "updated_at": now}, "$setOnInsert": {"created_at": now, "consultation_count": 0}},
                upsert=True,
            )
            return True
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo guardar la posición emblemática de Matthias.") from exc
    async with _memory_lock:
        row = _memory.setdefault(username, {"_id": username, "consultation_count": 0, "created_at": now})
        positions = _clean_emblematic_positions(row.get("emblematic_positions"))
        positions = [item for item in positions if item.get("fingerprint") != fingerprint]
        positions.append(entry)
        row.update({"schema_version": MEMORY_SCHEMA_VERSION, "emblematic_positions": positions[-MAX_EMBLEMATIC_POSITIONS:], "updated_at": now})
        return True


async def briefing_for_user(username: str) -> dict[str, Any]:
    summary = await user_summary(username)
    return {"text": briefing_text_from_summary(summary), "memory": summary}


async def admin_status() -> dict[str, Any]:
    col = await _collection()
    storage = "mongo" if col is not None else "memory"
    if col is not None:
        try:
            rows = await col.find({}, {
                "consultation_count": 1,
                "question_counts": 1,
                "topic_counts": 1,
                "schema_version": 1,
                "active_goals": 1,
                "relationship": 1,
                "milestones": 1,
                "respect": 1,
                "mood": 1,
                "active_challenge": 1,
                "emblematic_positions": 1,
            }).to_list(length=5000)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer el estado de Matthias.") from exc
    else:
        rows = list(_memory.values())

    total = 0
    topic_counts: dict[str, int] = {}
    topic_users: dict[str, int] = {}
    question_counts: dict[str, int] = {}
    schema_versions: dict[int, int] = {}
    for row in rows:
        total += max(0, int(row.get("consultation_count") or 0))
        version = int(row.get("schema_version") or 1)
        schema_versions[version] = schema_versions.get(version, 0) + 1
        for key, value in _clean_counts(row.get("question_counts")).items():
            question_counts[key] = question_counts.get(key, 0) + value
        user_topics = _clean_counts(row.get("topic_counts"))
        for key, value in user_topics.items():
            topic_counts[key] = topic_counts.get(key, 0) + value
            if value > 0:
                topic_users[key] = topic_users.get(key, 0) + 1

    top_kind = max(question_counts.items(), key=lambda item: (item[1], item[0]))[0] if question_counts else None
    top_topic = max(topic_counts.items(), key=lambda item: (item[1], item[0]))[0] if topic_counts else None
    dominant = None
    if top_topic:
        dominant = {
            "topic": top_topic,
            "label": _topic_label(top_topic) or top_topic,
            "consultations": topic_counts[top_topic],
            "usersAffected": topic_users.get(top_topic, 0),
        }
    goal_counts: dict[str, int] = {}
    relationship_counts: dict[str, int] = {}
    respect_counts: dict[str, int] = {}
    mood_counts: dict[str, int] = {}
    milestone_count = 0
    active_challenges = 0
    emblematic_positions = 0
    for row in rows:
        for goal in _clean_goal_rows(row.get("active_goals")):
            topic = goal.get("topic") or "other"
            goal_counts[topic] = goal_counts.get(topic, 0) + 1
        tier = _clean_relationship(row.get("relationship"))["tier"]
        relationship_counts[tier] = relationship_counts.get(tier, 0) + 1
        respect_tier = _clean_respect(row.get("respect"))["tier"]
        respect_counts[respect_tier] = respect_counts.get(respect_tier, 0) + 1
        mood = _bounded_text(row.get("mood"), 24) or "observant"
        mood_counts[mood] = mood_counts.get(mood, 0) + 1
        milestone_count += len(_clean_milestones(row.get("milestones")))
        if _clean_challenge(row.get("active_challenge")):
            active_challenges += 1
        emblematic_positions += len(_clean_emblematic_positions(row.get("emblematic_positions")))
    top_goal = max(goal_counts.items(), key=lambda item: (item[1], item[0]))[0] if goal_counts else None
    return {
        "ok": True,
        "storage": storage,
        "memorySchemaVersion": MEMORY_SCHEMA_VERSION,
        "schemaVersions": {str(key): value for key, value in sorted(schema_versions.items())},
        "recentAdviceCap": MAX_RECENT_ADVICE,
        "activeGoalCap": MAX_ACTIVE_GOALS,
        "milestoneCap": MAX_MILESTONES,
        "openingMemoryCap": MAX_OPENING_MEMORY,
        "emblematicPositionCap": MAX_EMBLEMATIC_POSITIONS,
        "responseSignatureCap": MAX_RESPONSE_SIGNATURES,
        "consultations": total,
        "usersWithMemory": sum(1 for row in rows if int(row.get("consultation_count") or 0) > 0),
        "topQuestionKind": top_kind,
        "questionCounts": question_counts,
        "dominantAdvice": dominant,
        "activeGoalCounts": goal_counts,
        "topActiveGoal": {"topic": top_goal, "label": _topic_label(top_goal) or top_goal, "users": goal_counts.get(top_goal, 0)} if top_goal else None,
        "relationshipCounts": relationship_counts,
        "respectCounts": respect_counts,
        "moodCounts": mood_counts,
        "milestonesRemembered": milestone_count,
        "activeChallenges": active_challenges,
        "emblematicPositions": emblematic_positions,
    }


async def delete_user_memory(username: str) -> None:
    col = await _collection()
    if col is not None:
        try:
            await col.delete_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo borrar la memoria de Matthias.") from exc
    else:
        async with _memory_lock:
            _memory.pop(username, None)
