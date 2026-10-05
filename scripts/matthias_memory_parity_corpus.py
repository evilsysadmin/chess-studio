#!/usr/bin/env python3
"""Cross-language parity corpus for Matthias' memory read side.

GET /api/matthias/daily, GET /api/matthias/briefing and the memory summary
they carry are pure functions of one ``matthias_memory`` document (and the
clock): backend-python/matthias_memory_store.py cleans every field with
Python's dynamic rules (str(), int(), " ".join(split()), fromisoformat) and
matthias_episodes.py ranks the episodic biography. This feeds Python's own
functions a deterministic set of documents, realistic and corrupted, at a
fixed clock, and records the summary, the episodic summary and the briefing
text (or the fact that Python raises); backend-go/internal/matthiasmem must
agree byte for byte.

    python3 scripts/matthias_memory_parity_corpus.py           # rewrite the fixture
    python3 scripts/matthias_memory_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime as _datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))
os.environ.pop("MONGO_URL", None)

import matthias_episode_store as episode_store  # noqa: E402
import matthias_episodes as episodes  # noqa: E402
import matthias_memory_store as memory_store  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "matthiasmem" / "testdata" / "python_matthias_memory_corpus.json"
SEED = 20261006
NOW = _datetime(2026, 10, 5, 12, 30, 15, 250000, tzinfo=timezone.utc)


class FixedDatetime(_datetime):
    current = NOW

    @classmethod
    def now(cls, tz=None):  # noqa: D401 - mirrors datetime.now
        value = cls.current
        if tz is not None:
            return value.astimezone(tz)
        return value.replace(tzinfo=None)


memory_store.datetime = FixedDatetime
episodes.datetime = FixedDatetime


def iso(delta_days: float, rng: random.Random) -> str:
    at = NOW - timedelta(days=delta_days)
    style = rng.choice(["py", "py", "z", "naive", "space", "ms", "offset", "date", "basic"])
    if style == "py":
        return at.isoformat()
    if style == "z":
        return at.replace(tzinfo=None).isoformat() + "Z"
    if style == "naive":
        return at.replace(tzinfo=None, microsecond=0).isoformat()
    if style == "space":
        return at.replace(microsecond=0).isoformat(sep=" ")
    if style == "ms":
        return at.replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z"
    if style == "offset":
        return at.astimezone(timezone(timedelta(hours=2))).isoformat()
    if style == "date":
        return at.date().isoformat()
    return at.strftime("%Y%m%dT%H%M%S")


ODD_DATES = [
    "", "nope", "2026-13-01", "2026-10-05T24:00:00", " 2026-10-01", "2026-W39-3", "2026W393",
    "2026-10-01T10", "2026-10-01T10:00:00,5", "2026-10-01T10:00:00.1234567+00:00", "2026-10-01x08:00",
    "2026-10-01T10:00:00+0200", "2026-10-01T10:00:00-02:30:15", "2026-10-01T10:00:00+00:00Z", "2026-02-30",
    "2024-02-29T00:00:00", 20261001, 1.5, True, None,
]

TEXTS = [
    "", "   ", "Seguridad  de\tla dama", "  espacios raros　aquí  ", "sep\x1cunit", "ñandú ♞",
    "x" * 130, "é" * 200, 0, 7, -3, 2.5, 1e16, 1.0, True, False, None, {"a": 1}, ["q", 2], [], {},
    'comillas "dobles"', "it's", "line\nbreak",
]

INTS = [None, 0, 3, -4, 7, 2.9, -0.5, True, False, "7", " 8 ", "+9", "1_000", "abc", "3.5", "", [], {"a": 1}, [1], 2**33]
NUMBERS = [None, 0, 1, 3, 5, 12, 40, 2.5, 50.0, 49.9, 100, 120.5, -3, True, "4", [], 2**33]


def pick(rng: random.Random, values):
    return rng.choice(values)


def maybe(rng: random.Random, value, odds: float = 0.85):
    return value if rng.random() < odds else pick(rng, [None, "x", 3, [], {}, True])


def text(rng: random.Random, good: list[str]):
    return rng.choice(good) if rng.random() < 0.88 else pick(rng, TEXTS)


def snapshot(rng: random.Random) -> dict:
    snap = {}
    for key in ("total_games", "puzzles_solved", "personal_training_positions", "achievements_unlocked"):
        if rng.random() < 0.8:
            snap[key] = rng.choice([rng.randint(0, 60), rng.randint(0, 60), float(rng.randint(0, 9)) + 0.5, True, "3", None])
    if rng.random() < 0.8:
        snap["record"] = {k: rng.choice([rng.randint(0, 30), 2.0, None, "x"]) for k in rng.sample(["wins", "losses", "draws"], rng.randint(0, 3))}
    elif rng.random() < 0.3:
        snap["record"] = "broken"
    return snap


def goal(rng: random.Random):
    return {
        "id": text(rng, ["goal:queen_safety", "goal:mate", "goal:forks"]),
        "topic": text(rng, ["queen_safety", "mate_awareness", "forks"]),
        "label": text(rng, ["Proteger la dama", "Ver mates", "Evitar horquillas"]),
        "metric": text(rng, ["human:QUEEN_EN_PRISE_TO_PAWN", "count"]),
        "baseline": pick(rng, NUMBERS),
        "current": pick(rng, NUMBERS),
        "baseline_games": pick(rng, NUMBERS),
        "current_games": pick(rng, NUMBERS),
        "created_at": iso(rng.uniform(0, 30), rng) if rng.random() < 0.8 else pick(rng, ODD_DATES),
    }


def opening(rng: random.Random):
    return {
        "name": text(rng, ["Siciliana", "Italiana", "Gambito de dama", "Caro-Kann", "Francesa"]),
        "games": rng.choice([rng.randint(0, 12), rng.randint(0, 12), 3.0, None, "5"]),
        "wins": rng.choice([rng.randint(0, 6), None]),
        "draws": rng.choice([rng.randint(0, 3), 1.5]),
        "losses": rng.choice([rng.randint(0, 6), True]),
        "win_pct": rng.choice([rng.randint(0, 100), round(rng.uniform(0, 100), 2), 150, -5, None, "40", 33.333333333333336]),
    }


def milestone(rng: random.Random, i: int):
    return {
        "fingerprint": text(rng, [f"ms:{i}", f"fame:{i}", f"shame:{i}"]),
        "kind": text(rng, ["incident", "goal_completed", "challenge_completed", "rivalry"]),
        "polarity": rng.choice(["fame", "shame", "shame", "neutral", None, 1]),
        "label": text(rng, ["Mate encontrado", "Dama regalada", "Racha de 5"]),
        "at": iso(rng.uniform(0, 40), rng) if rng.random() < 0.8 else pick(rng, ODD_DATES),
    }


def position(rng: random.Random, i: int):
    return {
        "fingerprint": text(rng, [f"pos{i:04d}abcd"]),
        "label": text(rng, ["Posición emblemática: Qxd5, catástrofe de 640 cp"]),
        "fen": text(rng, ["8/8/8/8/8/8/8/K6k w - - 0 1", "8/8/8/8/8/8/8/k6K b - - 0 1"]),
        "opening": text(rng, ["Siciliana", ""]),
        "move_number": rng.choice([12, 7.5, None, "9", True, 0]),
        "played": text(rng, ["Qxd5", "e4"]),
        "suggested": text(rng, ["Nf3", ""]),
        "loss_cp": pick(rng, NUMBERS),
        "severity": text(rng, ["blunder", "mistake"]),
        "at": iso(rng.uniform(0, 40), rng),
    }


def challenge(rng: random.Random):
    return {
        "id": text(rng, ["challenge:queen", "challenge:mate"]),
        "topic": text(rng, ["queen_safety"]),
        "incident_key": text(rng, ["human:QUEEN_EN_PRISE_TO_PAWN"]),
        "label": text(rng, ["Tres partidas sin regalar la dama", "Ver el mate"]),
        "baseline_games": rng.choice([rng.randint(0, 20), 4.5, None]),
        "current_games": rng.choice([rng.randint(0, 25), None, "x"]),
        "baseline_count": pick(rng, NUMBERS),
        "current_count": pick(rng, NUMBERS),
        "target_games": rng.choice([3, 3, 0, None, 2.5, 5, -1]),
        "setbacks": pick(rng, NUMBERS),
        "created_at": iso(rng.uniform(0, 10), rng),
    }


EPISODE_KINDS = ["incident", "rivalry_result", "opening_setback", "", None]


def evidence(rng: random.Random):
    source = rng.choice(["noteworthy_incidents", "cpu_rivalry", "openings", "other", None])
    if source == "noteworthy_incidents":
        return {"source": source, "key": text(rng, ["human:MISSED_MATE", "cpu:KNIGHT_FORK"]), "previous_count": pick(rng, NUMBERS), "count": rng.choice([1, 3, 5, 8, None, 4.5]), "delta": pick(rng, NUMBERS)}
    if source == "cpu_rivalry":
        return {"source": source, "outcome": text(rng, ["win", "loss", "draw"]), "game_number": pick(rng, NUMBERS), "record": rng.choice([{"games": 4, "wins": 2, "losses": 1.5}, None, "x"])}
    if source == "openings":
        return {"source": source, "opening": text(rng, ["Siciliana"]), "outcome": text(rng, ["loss"]), "games": pick(rng, NUMBERS), "wins": pick(rng, NUMBERS), "draws": pick(rng, NUMBERS), "losses": rng.choice([1, 3, 4, None, 3.5])}
    return rng.choice([{"source": source}, None, [], "x"])


def episode(rng: random.Random, i: int):
    return {
        "schema_version": 1,
        "fingerprint": text(rng, [f"ep:{i % 9}", f"incident:human:MISSED_MATE:{i}"]),
        "kind": rng.choice(EPISODE_KINDS) if rng.random() < 0.3 else rng.choice(["incident", "rivalry_result", "opening_setback"]),
        "label": text(rng, ["Mate disponible ignorado", "Horquilla de caballo sufrida", "Derrota con la Siciliana"]),
        "polarity": rng.choice(["fame", "shame", "neutral", "other", None]),
        "severity": rng.choice([72, 86, 92, 94, 60, 150, -5, None, "90", 88.8]),
        "evidence": evidence(rng),
        "at": iso(rng.choice([0.2, 1, 2.5, 3.5, 10, 13.9, 14.5, 30, -1]), rng) if rng.random() < 0.85 else pick(rng, ODD_DATES),
    }


def document(rng: random.Random) -> dict:
    doc: dict = {}
    fields = {
        "schema_version": lambda: rng.choice([5, 5, 5, 4, 1, 0, None, "5", 2.7]) if rng.random() < 0.97 else "x",
        "consultation_count": lambda: rng.choice([0, 1, 4, 12]) if rng.random() < 0.8 else pick(rng, INTS),
        "last_consulted_at": lambda: iso(rng.uniform(0, 20), rng),
        "last_observed_at": lambda: rng.choice([iso(1, rng), None, 7]),
        "relationship": lambda: maybe(rng, {"tier": text(rng, ["newcomer", "regular", "veteran"]), "label": text(rng, ["Recién llegado", "Habitual", "Veterano"]), "games_seen": pick(rng, NUMBERS)}),
        "respect": lambda: maybe(rng, {"tier": text(rng, ["recruit", "respected", "formidable", "rival"]), "label": text(rng, ["Recluta", "Respetado"]), "score": rng.choice([0, 45, 80, 120, -10, 66.6, None, "50"])}),
        "mood": lambda: text(rng, ["observant", "annoyed", "pleased", "skeptical", "impressed", "bored"]),
        "active_goals": lambda: maybe(rng, [goal(rng) for _ in range(rng.randint(0, 5))] + rng.sample([None, "x", 3], rng.randint(0, 1))),
        "active_challenge": lambda: maybe(rng, challenge(rng)),
        "opening_memory": lambda: maybe(rng, [opening(rng) for _ in range(rng.randint(0, 8))]),
        "rivalry": lambda: maybe(rng, {k: pick(rng, NUMBERS) for k in rng.sample(["games", "wins", "draws", "losses", "best_human_streak", "best_cpu_streak"], rng.randint(0, 6))}),
        "return_context": lambda: maybe(rng, {"days": rng.choice([3, 14, 15, 40, 14.9, None, "20"]), "returned_at": iso(rng.choice([0.1, 1, 2.9, 3.1, 5]), rng) if rng.random() < 0.85 else pick(rng, ODD_DATES)}),
        "milestones": lambda: maybe(rng, [milestone(rng, i) for i in range(rng.choice([0, 2, 4, 12]))] + rng.sample(["x", None], rng.randint(0, 1))),
        "emblematic_positions": lambda: maybe(rng, [position(rng, i) for i in range(rng.choice([0, 1, 3, 9]))]),
        "main_advice": lambda: maybe(rng, {"text": text(rng, ["Calcule dos candidatas antes de mover.", "Proteja la dama, bitte."]), "question_kind": text(rng, ["improve", "tactics"]), "topic": text(rng, ["queen_safety", "general_improvement"]), "at": iso(rng.uniform(0, 9), rng)}),
        "facts_snapshot": lambda: maybe(rng, snapshot(rng)),
        "latest_observed_snapshot": lambda: maybe(rng, snapshot(rng)),
        "question_counts": lambda: maybe(rng, {k: rng.choice([0, 1, 3, 2.5, -1, True, "4"]) for k in rng.sample(["improve", "tactics", "strengths", "action", "openings", "x" * 60], rng.randint(0, 4))}),
        "topic_counts": lambda: maybe(rng, {k: rng.choice([0, 1, 2, 5, 1.5]) for k in rng.sample(["queen_safety", "forks", "mate_awareness", "general_improvement", "openings"], rng.randint(0, 3))}),
        "episodes": lambda: maybe(rng, [episode(rng, i) for i in range(rng.choice([0, 1, 3, 5, 9, 26]) if rng.random() < 0.9 else 3)] + rng.sample([None, "x"], rng.randint(0, 1))),
    }
    for key, make in fields.items():
        if rng.random() < 0.82:
            doc[key] = make()
    return doc


def scenarios() -> list[tuple[str, dict]]:
    """Hand-made documents that reach every briefing branch on purpose."""
    base_snapshot = {"total_games": 20, "puzzles_solved": 4, "record": {"wins": 8, "losses": 10, "draws": 2}}
    advice = {"text": "Calcule dos candidatas.", "question_kind": "improve", "topic": "queen_safety", "at": "2026-10-01T10:00:00+00:00"}
    return [
        ("empty", {}),
        ("reunion_nemesis", {"return_context": {"days": 20, "returned_at": "2026-10-04T12:00:00+00:00"}, "opening_memory": [{"name": "Siciliana", "games": 6, "wins": 1, "draws": 0, "losses": 5, "win_pct": 16.67}]}),
        ("reunion_plain", {"return_context": {"days": 30, "returned_at": "2026-10-05T08:00:00Z"}}),
        ("reunion_expired", {"return_context": {"days": 30, "returned_at": "2026-10-01T08:00:00Z"}, "mood": "pleased"}),
        ("challenge_one_left", {"active_challenge": {"id": "c1", "label": "Sin regalar la dama", "baseline_games": 10, "current_games": 12, "target_games": 3}}),
        ("challenge_many_left", {"active_challenge": {"id": "c1", "label": "Sin regalar la dama", "baseline_games": 10, "current_games": 10, "target_games": 3}}),
        ("challenge_done", {"active_challenge": {"id": "c1", "label": "Sin regalar la dama", "baseline_games": 10, "current_games": 14, "target_games": 3}, "mood": "annoyed"}),
        ("debt_struggling", {"main_advice": advice, "facts_snapshot": base_snapshot, "latest_observed_snapshot": {"total_games": 25, "puzzles_solved": 4, "record": {"wins": 8, "losses": 13, "draws": 4}}}),
        ("debt_mixed", {"main_advice": advice, "facts_snapshot": base_snapshot, "latest_observed_snapshot": {"total_games": 24, "puzzles_solved": 5, "record": {"wins": 9, "losses": 10, "draws": 5}}}),
        ("debt_improving", {"main_advice": advice, "facts_snapshot": base_snapshot, "latest_observed_snapshot": {"total_games": 24.0, "puzzles_solved": 7, "record": {"wins": 11, "losses": 11, "draws": 2}}, "mood": "impressed"}),
        ("debt_waiting", {"main_advice": advice, "facts_snapshot": base_snapshot, "latest_observed_snapshot": {"total_games": 21}}),
        ("goal", {"active_goals": [{"id": "g1", "label": "Proteger la dama", "topic": "queen_safety"}]}),
        ("nemesis_only", {"opening_memory": [{"name": "Italiana", "games": 4, "win_pct": 25}, {"name": "Siciliana", "games": 4, "win_pct": 25}, {"name": "Francesa", "games": 9, "win_pct": 25.0}, {"name": "Caro", "games": 2, "win_pct": 0}]}),
        ("nemesis_round_half", {"opening_memory": [{"name": "Italiana", "games": 3, "win_pct": 12.5}]}),
        ("nemesis_winning", {"opening_memory": [{"name": "Italiana", "games": 3, "win_pct": 66.7}], "mood": "skeptical"}),
        ("respected", {"respect": {"tier": "formidable", "score": 90}}),
        ("veteran", {"relationship": {"tier": "veteran", "games_seen": 300}}),
        ("bad_count", {"consultation_count": "abc", "episodes": [{"fingerprint": "f", "kind": "incident", "label": "L", "evidence": {"source": "cpu_rivalry"}, "at": "2026-10-05T00:00:00Z", "severity": 95}]}),
    ]


def run(doc: dict) -> dict:
    memory_store._memory.clear()
    memory_store._memory["alice"] = {"_id": "alice", **json.loads(json.dumps(doc))}
    case: dict = {}
    try:
        summary = asyncio.run(memory_store.user_summary("alice"))
        case["summary"] = summary
        case["briefing"] = memory_store.briefing_text_from_summary(summary)
    except Exception as exc:  # Python raises: Go must fail the same call
        case["summary_error"] = type(exc).__name__
    try:
        case["episodic"] = asyncio.run(episode_store.summary("alice"))
    except Exception as exc:
        case["episodic_error"] = type(exc).__name__
    return case


def build() -> dict:
    rng = random.Random(SEED)
    cases = []
    for name, doc in scenarios():
        cases.append({"name": name, "doc": doc, **run(doc)})
    for i in range(220):
        doc = document(rng)
        cases.append({"name": f"random_{i:03d}", "doc": doc, **run(doc)})
    # Admin's aggregate (admin_status) over groups of the same documents.
    admin = []
    readable = [c["doc"] for c in cases if "summary" in c]
    groups = [readable[i:i + 8] for i in range(0, len(readable), 8)] + [[c["doc"] for c in cases[i:i + 12]] for i in (0, 120, 228)]
    for start, group in enumerate(groups):
        memory_store._memory.clear()
        for i, doc in enumerate(group):
            memory_store._memory[f"u{i}"] = {"_id": f"u{i}", **json.loads(json.dumps(doc))}
        try:
            admin.append({"start": start, "status": asyncio.run(memory_store.admin_status())})
        except Exception as exc:
            admin.append({"start": start, "error": type(exc).__name__})
    return {"now": NOW.isoformat(), "cases": cases, "admin": admin}


def render(corpus: dict) -> str:
    lines = [json.dumps(case, ensure_ascii=False, separators=(",", ":")) for case in corpus["cases"]]
    admin = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus["admin"])
    return '{"now":' + json.dumps(corpus["now"]) + ',"cases":[\n' + ",\n".join(lines) + '\n],"admin":[\n' + admin + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text_out = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text_out:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/matthias_memory_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text_out, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
