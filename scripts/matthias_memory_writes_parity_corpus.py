#!/usr/bin/env python3
"""Cross-language parity corpus for Matthias' memory write side.

The audience (POST /api/matthias/daily) and POST /api/narrative turn measured
player facts into Matthias' deterministic coaching state before they ask the
model anything: matthias_memory_store.observe_facts (goals, milestones,
challenge, mood, respect, return context), matthias_episode_store.observe
(episodes proven by fact deltas), the prompt context, the consultation log
with its idempotent replay and the emblematic positions. This replays
deterministic operation sequences per player against Python's own store
(in-memory mode, the same transforms as the Mongo path) on a moving fixed
clock, and records every result and the stored document after it;
backend-go/internal/matthiasmem must agree.

    python3 scripts/matthias_memory_writes_parity_corpus.py           # rewrite the fixture
    python3 scripts/matthias_memory_writes_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import asyncio
import copy
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

FIXTURE = ROOT / "backend-go" / "internal" / "matthiasmem" / "testdata" / "python_matthias_writes_corpus.json"
SEED = 20261007
START = _datetime(2026, 9, 1, 9, 0, 0, 125000, tzinfo=timezone.utc)


class FixedDatetime(_datetime):
    current = START

    @classmethod
    def now(cls, tz=None):
        value = cls.current
        if tz is not None:
            return value.astimezone(tz)
        return value.replace(tzinfo=None)


memory_store.datetime = FixedDatetime
episodes.datetime = FixedDatetime

INCIDENT_KEYS = [
    "human:MISSED_MATE", "human:ALLOWED_MATE", "human:QUEEN_EN_PRISE_TO_PAWN", "cpu:PAWN_TAKES_QUEEN",
    "cpu:KNIGHT_FORK", "cpu:PAWN_FORK", "human:STALEMATE_BLUNDER", "human:MATE_FOUND", "human:QUEEN_CAPTURE",
    "human:UNKNOWN_THING",
]
OPENINGS = ["Siciliana", "Italiana", "Gambito de dama", "Caro-Kann", "Francesa", "Escocesa", "Inglesa", "Española"]
KINDS = ["improve", "tactics", "strengths", "action", "openings"]
TEXTS = [
    "Calcule dos candidatas antes de mover, bitte.",
    "Su dama no es un peón: protéjala antes de atacar.",
    "  Revise   jaques,\tcapturas y amenazas.  ",
    "¡Achtung! La Siciliana le cuesta 3 derrotas seguidas.",
    "",
    "x" * 905,
]


class Player:
    def __init__(self, rng: random.Random):
        self.rng = rng
        self.wins = rng.randint(0, 5)
        self.losses = rng.randint(0, 5)
        self.draws = rng.randint(0, 2)
        self.puzzles = rng.randint(0, 12)
        self.training = rng.randint(0, 4)
        self.achievements = rng.randint(0, 6)
        self.streak = rng.randint(0, 4)
        self.rivalry = {"games": 0, "wins": 0, "draws": 0, "losses": 0}
        self.incidents = {key: 0 for key in rng.sample(INCIDENT_KEYS, rng.randint(1, 5))}
        self.openings = {name: [0, 0, 0, 0] for name in rng.sample(OPENINGS, rng.randint(1, 5))}
        self.rating_delta = rng.randint(-50, 40)

    def play(self) -> None:
        rng = self.rng
        for _ in range(rng.choice([1, 1, 1, 2, 3])):
            outcome = rng.choices(["wins", "losses", "draws"], weights=[4, 5, 1])[0]
            setattr(self, outcome, getattr(self, outcome) + 1)
            self.streak = self.streak + 1 if outcome == "wins" else 0
            if rng.random() < 0.6:
                self.rivalry["games"] += 1
                self.rivalry[outcome] += 1
            name = rng.choice(list(self.openings))
            row = self.openings[name]
            row[0] += 1
            row[{"wins": 1, "draws": 2, "losses": 3}[outcome]] += 1
            if rng.random() < 0.35:
                key = rng.choice(list(self.incidents))
                self.incidents[key] += rng.choice([1, 1, 2])
            self.rating_delta += {"wins": 18, "losses": -14, "draws": 2}[outcome]
        if rng.random() < 0.5:
            self.puzzles += rng.randint(0, 6)

    def facts(self, kind: str | None = None) -> dict:
        rng = self.rng
        total = self.wins + self.losses + self.draws
        facts = {
            "total_games": total if rng.random() < 0.93 else rng.choice([float(total), None, "x", True]),
            "record": {"wins": self.wins, "losses": self.losses, "draws": self.draws},
            "puzzles_solved": self.puzzles,
            "personal_training_positions": self.training,
            "achievements_unlocked": self.achievements,
            "longest_win_streak": max(self.streak, rng.choice([0, 3, 5])) if rng.random() < 0.5 else self.streak,
            "cpu_rivalry": dict(self.rivalry, best_human_streak=rng.randint(0, 3)),
            "rating_trend": {"delta": self.rating_delta if rng.random() < 0.85 else rng.choice([150, 2.5, None])},
            "noteworthy_incidents": [{"key": key, "count": count} for key, count in self.incidents.items()],
            "openings": [
                {"name": name, "games": g, "wins": w, "draws": d, "losses": l, "win_pct": round(w * 100 / g, 1) if g else 0}
                for name, (g, w, d, l) in self.openings.items()
            ],
        }
        if facts["openings"]:
            facts["favorite_opening"] = max(facts["openings"], key=lambda row: row["games"])
        if rng.random() < 0.1:
            facts["record"] = rng.choice(["broken", {"wins": 2.0, "losses": None}])
        if rng.random() < 0.08:
            facts["noteworthy_incidents"].append(rng.choice([{"key": "", "count": 2}, {"key": "human:MISSED_MATE", "count": -1}, "x", {"key": 7, "count": 1.5}]))
        if rng.random() < 0.08:
            facts["openings"].append(rng.choice([{"name": "", "games": 4}, {"name": "Ruy", "games": 4.0, "wins": 1, "losses": 3, "draws": 0, "win_pct": "25"}]))
        if rng.random() < 0.05:
            facts["cpu_rivalry"] = rng.choice([None, "x", {"games": 3.5}])
        if kind:
            facts["question_kind"] = kind
        return facts

    def position(self) -> dict:
        rng = self.rng
        return {
            "fen": rng.choice(["8/8/8/8/8/8/8/K6k w - - 0 1", "8/8/8/8/8/8/8/k6K b - - 0 1", "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", ""]),
            "played": rng.choice(["Qxd5", "e4", "Nf3", ""]),
            "suggested": rng.choice(["Nf3", "d4", ""]),
            "loss_cp": rng.choice([40, 180, 250, 520, 90.5, None, "300"]),
            "severity": rng.choice(["blunder", "Mistake", "inaccuracy", "", "critical"]),
            "opening": rng.choice(OPENINGS + [""]),
            "move_number": rng.choice([12, 30, 7.5, None]),
        }


def seed_document(rng: random.Random) -> dict | None:
    """A previous state as other releases may have left it."""
    choice = rng.random()
    if choice < 0.55:
        return None
    if choice < 0.8:
        return {"_id": "p", "consultation_count": rng.choice([0, 3, 13]), "created_at": "2026-01-01T00:00:00+00:00",
                "mood": rng.choice(["pleased", "annoyed", "bored"]), "relationship": {"tier": rng.choice(["newcomer", "regular"])},
                "last_observed_at": rng.choice(["2026-08-01T10:00:00+00:00", "2026-08-30T10:00:00Z", None]),
                "latest_observed_snapshot": {"total_games": 2, "record": {"wins": 1, "losses": 1}},
                "active_goals": [{"id": "incident:human:MISSED_MATE", "topic": "mate_awareness", "label": "Ver mates", "metric": "incidents_per_game", "baseline": 0.5, "current": 0.5, "baseline_games": 2, "current_games": 2}],
                "milestones": [{"fingerprint": "first-win", "kind": "first_win", "polarity": "fame", "label": "Primera victoria registrada", "at": "2026-02-01T00:00:00+00:00"}],
                "recent_advice": [{"question_kind": "improve", "topic": "general_improvement", "text": "Antiguo consejo.", "at": "2026-02-01T00:00:00+00:00", "consultation_id": "old-1"}],
                "recent_consultation_ids": ["old-1"],
                "main_advice": {"question_kind": "improve", "topic": "general_improvement", "text": "Antiguo consejo.", "at": "2026-02-01T00:00:00+00:00"},
                "facts_snapshot": {"total_games": 1, "puzzles_solved": 0, "record": {"wins": 1}},
                "question_counts": {"improve": 3}, "topic_counts": {"general_improvement": 3},
                "episodic_snapshot": {"noteworthy_incidents": {"human:MISSED_MATE": 0}, "cpu_rivalry": {"games": 0, "wins": 0, "draws": 0, "losses": 0}, "openings": []},
                "active_challenge": {"id": "clean-run:cpu:KNIGHT_FORK", "topic": "forks", "incident_key": "cpu:KNIGHT_FORK", "label": "3 partidas sin repetir: Horquillas", "baseline_games": 1, "current_games": 1, "baseline_count": 0, "current_count": 0, "target_games": 3, "setbacks": 0}}
    return {"_id": "p", "consultation_count": 7.0, "active_goals": "x", "milestones": {"a": 1}, "relationship": [],
            "recent_advice": [None, {"text": "", "consultation_id": "dead"}, {"text": "Vivo.", "consultation_id": "alive", "question_kind": "tactics"}],
            "episodes": [{"fingerprint": "x", "kind": "incident", "label": "Viejo", "evidence": {"source": "noteworthy_incidents", "count": 4}, "at": "2026-08-31T00:00:00Z", "severity": 92}],
            "emblematic_positions": [{"fingerprint": "f1", "fen": "8/8/8/8/8/8/8/K6k w - - 0 1", "label": "Vieja"}] * 3,
            "return_context": {"days": 20, "returned_at": "2026-08-31T12:00:00+00:00"}}


def snapshot_row() -> dict | None:
    row = memory_store._memory.get("p")
    return json.loads(json.dumps(row)) if row is not None else None


def guarded(fn):
    try:
        return {"result": fn()}
    except Exception as exc:  # Go must fail where Python raises
        return {"error": type(exc).__name__}


def run_player(rng: random.Random, steps: int) -> dict:
    memory_store._memory.clear()
    FixedDatetime.current = START + timedelta(days=rng.randint(0, 20), seconds=rng.randint(0, 86400), microseconds=rng.randint(0, 999999))
    seed = seed_document(rng)
    if seed is not None:
        memory_store._memory["p"] = copy.deepcopy(seed)
    player = Player(rng)
    ops = []
    used_ids: list[str] = []
    for step in range(steps):
        FixedDatetime.current += rng.choice([
            timedelta(minutes=rng.randint(1, 90)), timedelta(hours=rng.randint(1, 30)),
            timedelta(days=rng.randint(2, 6)), timedelta(days=rng.randint(13, 20), microseconds=rng.randint(0, 999999)),
        ])
        if rng.random() < 0.8:
            player.play()
        op = rng.choices(["audience", "record", "replay", "position", "narrative_context", "portrait"], weights=[6, 3, 2, 2, 2, 2])[0]
        kind = rng.choice(KINDS)
        facts = player.facts(kind if op in {"audience", "record", "narrative_context"} else None)
        entry: dict = {"op": op, "now": FixedDatetime.current.isoformat()}
        if op in {"audience", "portrait"}:
            entry["facts"] = facts
            entry["observe"] = guarded(lambda: asyncio.run(memory_store.observe_facts("p", facts)) and None)
            entry["episodes"] = guarded(lambda: asyncio.run(episode_store.observe("p", facts)))
            entry["context"] = guarded(lambda: asyncio.run(memory_store.context("p", facts)))
            entry["episodic_context"] = guarded(lambda: asyncio.run(episode_store.context("p")))
        elif op == "narrative_context":
            entry["facts"] = facts
            entry["context"] = guarded(lambda: asyncio.run(memory_store.context("p", facts)))
            entry["episodic_context"] = guarded(lambda: asyncio.run(episode_store.context("p")))
        elif op == "record":
            cid = rng.choice([None, f"c-{step}", f"c-{step}", "bad id!?/" + str(step)] + used_ids[-2:])
            if cid:
                used_ids.append(cid)
            text = rng.choice(TEXTS)
            entry.update({"facts": facts, "kind": rng.choice(KINDS + ["weird kind!", ""]), "text": text, "consultation_id": cid})
            entry["recorded"] = guarded(lambda: asyncio.run(memory_store.record_consultation("p", entry["kind"], text, facts, consultation_id=cid)))
        elif op == "replay":
            cid = rng.choice([None, "", "missing"] + used_ids[-3:] + ["old-1", "alive", "dead"])
            entry["consultation_id"] = cid
            entry["replay"] = guarded(lambda: asyncio.run(memory_store.replay_consultation("p", cid)))
        else:
            facts = player.position()
            entry["facts"] = facts
            entry["recorded"] = guarded(lambda: asyncio.run(memory_store.record_emblematic_position("p", facts)))
        # Go carries its own document across every op; checkpoints keep the
        # fixture small while any divergence still surfaces in a later result.
        if step % 3 == 2 or step == steps - 1:
            entry["doc"] = snapshot_row()
        ops.append(entry)
    return {"seed": seed, "ops": ops}


def scripted_boundaries() -> dict:
    """Goals completed exactly on their thresholds (<= 70 %, >= +15 points)."""
    memory_store._memory.clear()
    FixedDatetime.current = START
    seed = {
        "_id": "p", "consultation_count": 1,
        "active_goals": [
            {"id": "incident:human:MISSED_MATE", "topic": "mate_awareness", "label": "Ver mates", "metric": "incidents_per_game",
             "baseline": 0.5, "current": 0.5, "baseline_games": 2, "current_games": 2},
            {"id": "opening:Siciliana", "topic": "openings", "label": "Levantar Siciliana", "metric": "opening_win_pct",
             "baseline": 25.0, "current": 25.0, "baseline_games": 4, "current_games": 4},
        ],
    }
    memory_store._memory["p"] = copy.deepcopy(seed)
    facts = {
        "total_games": 20, "record": {"wins": 10, "losses": 8, "draws": 2},
        "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 7}],
        "openings": [{"name": "Siciliana", "games": 7, "wins": 3, "draws": 0, "losses": 4, "win_pct": 40.0}],
        "question_kind": "improve",
    }
    FixedDatetime.current += timedelta(days=1)
    entry = {"op": "audience", "now": FixedDatetime.current.isoformat(), "facts": facts}
    entry["observe"] = guarded(lambda: asyncio.run(memory_store.observe_facts("p", facts)) and None)
    entry["episodes"] = guarded(lambda: asyncio.run(episode_store.observe("p", facts)))
    entry["context"] = guarded(lambda: asyncio.run(memory_store.context("p", facts)))
    entry["episodic_context"] = guarded(lambda: asyncio.run(episode_store.context("p")))
    entry["doc"] = snapshot_row()
    assert len(entry["doc"]["milestones"]) >= 2, entry["doc"]["milestones"]
    return {"seed": seed, "ops": [entry]}


def build() -> dict:
    rng = random.Random(SEED)
    players = [scripted_boundaries()] + [run_player(rng, rng.choice([8, 12, 20])) for _ in range(36)]
    return {"players": players}


def render(corpus: dict) -> str:
    lines = [json.dumps(player, ensure_ascii=False, separators=(",", ":")) for player in corpus["players"]]
    return '{"players":[\n' + ",\n".join(lines) + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text_out = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text_out:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/matthias_memory_writes_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text_out, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
