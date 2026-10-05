#!/usr/bin/env python3
"""Cross-language parity corpus for Admin's profile aggregation.

backend-python/admin_insights.py turns synced profile snapshots (JSON strings
per key, written by browsers and therefore of any shape) into the Admin user
summary, the per-user ``Así juegas`` payload and the anonymous matchmaking
aggregate. This fuzzes realistic and malformed snapshots and records
Python's answers (or the fact that it raised, which the routes turn into a
500); backend-go/internal/admininsights must agree.

    python3 scripts/admin_insights_parity_corpus.py           # rewrite the fixture
    python3 scripts/admin_insights_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import admin_insights as ai  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "admininsights" / "testdata" / "python_admin_insights_corpus.json"
SEED = 20261005

JUNK = [None, True, False, 0, 1, -3, 7, 2.5, 0.5, -0.0, 1e6, 3.0, "", "x", "3", " 4.5 ", "1_0", "inf", "nan", "-Infinity",
        "abc", [], [1, 2], {}, {"a": 1}, "win", "draw", "loss", "q", "w", "b"]
DATES = ["2026-01-02T10:00:00Z", "2026-03-04T08:30:00Z", "2026-03-04T08:30:00Z", "2025-12-31", "", None, 20260101, "2026-05-01T00:00:00+02:00"]


def pick(rng, options):
    return options[rng.randrange(len(options))]


def junk(rng):
    return pick(rng, JUNK)


def maybe(rng, value, p=0.85):
    return value if rng.random() < p else junk(rng)


def move(rng):
    m = {"san": pick(rng, ["e4", "Nxf3", "Qxd8", "exd5"])}
    r = rng.random()
    if r < 0.5:
        m["captured"] = maybe(rng, pick(rng, ["p", "n", "b", "r", "q", "k"]), 0.9)
        if rng.random() < 0.4:
            m["capturedPiece"] = maybe(rng, pick(rng, ["p", "q", "r", None]), 0.9)
    elif r < 0.6:
        m["captured"] = pick(rng, ["", None, 0, False])
    return m if rng.random() < 0.95 else junk(rng)


def game(rng, index, combat=False):
    record = {
        "date": pick(rng, DATES),
        "outcome": maybe(rng, pick(rng, ["win", "draw", "loss"]), 0.9),
        "difficulty": maybe(rng, pick(rng, [3, 5.5, 7.49, "8", 12, 2.5, 4.5, None]), 0.85),
    }
    if rng.random() < 0.8:
        record["gameId"] = pick(rng, [f"g{index}", f"g{index % 3}", index, None, ""])
    if rng.random() < 0.3:
        record["sourceGameId"] = pick(rng, [f"s{index}", f"g{index}", 0])
    if not combat:
        record["humanColor"] = maybe(rng, pick(rng, ["w", "b"]), 0.9)
        if rng.random() < 0.4:
            record["initialFen"] = pick(rng, ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                                              "8/8/8/8/8/8/8/k6K b - - 0 1", "garbage", 5, " x b "])
        moves = [move(rng) for _ in range(rng.randrange(0, 7))]
        record["moves"] = moves if rng.random() < 0.9 else pick(rng, ["e4", {"a": 1}, None, []])
        if rng.random() < 0.5:
            record["timeControl"] = maybe(rng, {"id": pick(rng, ["blitz", "none", "", None]), **({"label": pick(rng, ["5+0", "", 3])} if rng.random() < 0.6 else {})}, 0.85)
        record["mode"] = maybe(rng, pick(rng, ["tournament", "practice", "ghost", "nemesis-training", "sudden", "casual", "weird", None]), 0.9)
    else:
        record["variant"] = maybe(rng, pick(rng, ["combat", "roguelike", "classic"]), 0.9)
        if rng.random() < 0.6:
            record["roguelikeMode"] = maybe(rng, pick(rng, ["campaign", "tower", "endless", "duel"]), 0.9)
    return record if rng.random() < 0.97 else junk(rng)


def activity(rng, index):
    row = {
        "gameId": pick(rng, [f"g{index}", f"g{index % 4}", index, None]),
        "state": maybe(rng, pick(rng, ["started", "finished", "cancelled", "Started", "paused"]), 0.9),
        "date": pick(rng, DATES),
    }
    for key, values in [("detail", ["adaptive-difficulty", " nota ", "", 3]), ("outcome", ["win", "loss", "draw", "meh"]),
                        ("difficulty", [4, 6.5, None, "x"]), ("modeLabel", ["Combat Chess · Torre", "  ", "Torneo", 4]),
                        ("mode", ["casual", "tournament", None, "ghost"])]:
        if rng.random() < 0.5:
            row[key] = pick(rng, values)
    return row if rng.random() < 0.95 else junk(rng)


def profile(rng, index) -> dict:
    data: dict = {}

    def put(key, value, p=0.85):
        if rng.random() >= p:
            return
        r = rng.random()
        if r < 0.9:
            data[key] = json.dumps(value)
        elif r < 0.95:
            data[key] = "{not json"
        else:
            data[key] = junk(rng) if not isinstance(junk(rng), str) else 5

    games = [game(rng, i) for i in range(rng.randrange(0, 9))]
    put("chess-study-game-history", games if rng.random() < 0.95 else junk(rng))
    put("chess-study-combat-history", [game(rng, i + 50, combat=True) for i in range(rng.randrange(0, 4))])
    put("chess-study-game-activity", [activity(rng, i) for i in range(rng.randrange(0, 15))])
    put("chess-study-tournament", maybe(rng, {"points": maybe(rng, 12), "wins": maybe(rng, 3)}))
    put("chess-study-player-rating", maybe(rng, {"rating": maybe(rng, pick(rng, [1200, 1350.5, 1349.5, "1400", None])), "games": maybe(rng, 7)}))
    put("chess-study-rating-history", [maybe(rng, {"rating": maybe(rng, pick(rng, [1100, 1500.5, "1450", 999.5]))}) for _ in range(rng.randrange(0, 5))])
    put("chess-study-worst-move-cache", {
        f"g{i}": maybe(rng, {"worst": maybe(rng, {"loss": maybe(rng, pick(rng, [150, 300, 299.9, "250", 150])), "index": i,
                                                  "played": "Qh5", "suggested": maybe(rng, "Nf3"), "severity": "blunder",
                                                  "moveNumber": i + 3}), "analyzedAt": pick(rng, DATES)})
        for i in range(rng.randrange(0, 4))
    })
    put("chess-study-achievements", [junk(rng) for _ in range(rng.randrange(0, 4))])
    put("chess-study-puzzles-solved", maybe(rng, pick(rng, [12, 3.5, True])))
    put("chess-study-puzzle-best-streak", maybe(rng, 4))
    put("chess-study-personal-puzzles", [junk(rng) for _ in range(rng.randrange(0, 3))])
    rivalry = {}
    if rng.random() < 0.6:
        rivalry["record"] = maybe(rng, {"games": maybe(rng, pick(rng, [9, "4", 0, None, 2.7]))})
    if rng.random() < 0.4:
        rivalry["totalGames"] = maybe(rng, 5)
    if rng.random() < 0.4:
        rivalry["byPersona"] = maybe(rng, {"aria": {"games": maybe(rng, 3)}, "boris": maybe(rng, {"games": "2"})}, 0.9)
    if rng.random() < 0.6:
        rivalry["incidents"] = maybe(rng, {
            "human:MISSED_MATE": maybe(rng, pick(rng, [3, "4", 1.9])), "cpu:KNIGHT_FORK": maybe(rng, pick(rng, [3, 5])),
            "cpu:PAWN_FORK": maybe(rng, 5), "other": 99,
        })
    put("chess-study-cpu-rivalry", maybe(rng, rivalry))
    put("chess-study-daily-challenge", maybe(rng, {"bestStreak": maybe(rng, 6)} if rng.random() < 0.7 else {}))
    put("chess-study-series-history", [maybe(rng, {"winner": pick(rng, ["human", "cpu", "draw"])}) for _ in range(rng.randrange(0, 4))])
    career = {}
    if rng.random() < 0.5:
        career["milestones" if rng.random() < 0.7 else "activity"] = maybe(rng, [
            maybe(rng, {"date": pick(rng, DATES), "text": maybe(rng, pick(rng, ["Contrato cumplido: Torre", "reto fallido:  Peón", "Algo", " Reto cumplido · X "])),
                        "detail": maybe(rng, "d"), "type": "contract"})
            for _ in range(rng.randrange(0, 11))
        ])
    if rng.random() < 0.4:
        career["season"] = {} if rng.random() < 0.15 else maybe(rng, {"id": maybe(rng, pick(rng, [3, 0, ""])), "number": maybe(rng, 4),
                                       "games": maybe(rng, pick(rng, [5, 2.5, ["a", "b"], "xyz", None])), "targetGames": maybe(rng, 25)})
    for key, value in [("puzzleRush", {"bestScore": 17}), ("runRecords", {"streakBest": 4, "bossBestStage": 2}),
                       ("records", {"puzzleRushBest": 21, "bestCupScore": 8, "suddenDeathWins": 1}),
                       ("contracts" if rng.random() < 0.5 else "contractStats", {"completed": 3, "offered": 5})]:
        if rng.random() < 0.4:
            career[key] = maybe(rng, value)
    put("chess-study-career" if rng.random() < 0.7 else "chess-study-career-meta", maybe(rng, career))
    put("chess-study-analysis-archive", {
        f"a{i}": maybe(rng, {"accuracy": maybe(rng, pick(rng, [81.5, 90, "77", "nan", "-NaN", "+inf"])), "pressureMoves": maybe(rng, pick(rng, [10, "4", 3.9])),
                             "pressureIncidents": maybe(rng, pick(rng, [2, 0, "1"])), "peakPerspectiveEval": maybe(rng, pick(rng, [350, 299, "400", 300, 300.0])),
                             "troughPerspectiveEval": maybe(rng, pick(rng, [-350, -299, -300])), "outcome": maybe(rng, pick(rng, ["win", "loss", "draw", None]))})
        for i in range(rng.randrange(0, 5))
    })
    samples = [maybe(rng, {"outcome": maybe(rng, pick(rng, ["win", "draw", "loss"])), "closeGame": maybe(rng, pick(rng, [True, False])),
                           "decisiveAdvantageEscaped": pick(rng, [True, False, 1]), "stalemateFromWinning": pick(rng, [True, False]),
                           "rematch": pick(rng, [True, "true"])}) for _ in range(rng.randrange(0, 6))]
    put("chess-study-matchmaking-telemetry-v1", maybe(rng, {"samples": samples if rng.random() < 0.9 else junk(rng)}))
    if rng.random() < 0.05:
        return {"data": {}} if rng.random() < 0.5 else None
    return {"data": data}


def outcome(fn, full=False):
    try:
        value = fn()
    except Exception as exc:  # the admin routes answer an unhandled 500
        return {"error": type(exc).__name__}
    try:
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    except ValueError:  # NaN/Infinity echoed from a snapshot: the JSON response fails
        return {"error": "ValueError"}
    if full or len(raw) <= 1200:
        return {"value": value}
    return {"sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(), "length": len(raw.encode("utf-8"))}


def build() -> dict:
    rng = random.Random(SEED)
    profiles = [profile(rng, i) for i in range(400)]
    cases = []
    for index, item in enumerate(profiles):
        cases.append({
            "profile": item,
            "summary": outcome(lambda: ai._extract_summary_stats(item), full=index < 60),
            "insights": outcome(lambda: ai._extract_admin_insights_payload(item)),
        })
    groups = []
    for start in range(0, len(profiles), 25):
        chunk = {f"u{start + i}": item for i, item in enumerate(profiles[start:start + 25])}
        groups.append({"profiles": list(chunk), "result": outcome(lambda: ai.aggregate_matchmaking_telemetry(chunk))})
    return {"cases": cases, "matchmaking": groups}


def render(corpus: dict) -> str:
    sections = []
    for key in ("cases", "matchmaking"):
        rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus[key])
        sections.append(f'"{key}":[\n{rows}\n]')
    return "{" + ",\n".join(sections) + "}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/admin_insights_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
