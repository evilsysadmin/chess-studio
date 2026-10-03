#!/usr/bin/env python3
"""Cross-language parity corpus for the games-vs-CPU core (Python -> Go).

backend-go/internal/gamecore ports backend-python/chess_core.py: rebuilding a
stored game (initial FEN or handicap + SAN history), its canonical JSON
snapshot (serialize_game: status, draw claims, insufficient material per
side, history), resolving a from/to/promotion request, and FEN validity.
This script records what Python returns for a deterministic set of cases;
the Go tests require the same answers.

    python3 scripts/games_parity_corpus.py           # rewrite the fixture
    python3 scripts/games_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import chess  # noqa: E402

from chess_core import (  # noqa: E402
    HANDICAP_SQUARES,
    apply_handicap,
    board_from_valid_fen,
    load_board,
    resolve_move,
    serialize_game,
)

FIXTURE = ROOT / "backend-go" / "internal" / "gamecore" / "testdata" / "python_games_corpus.json"
SEED = 20261005
HANDICAPS = [None, *sorted(HANDICAP_SQUARES)]

LAB_FENS = [
    "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
    "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    "8/P6k/8/8/8/8/6Kp/8 w - - 0 1",
    "4k3/8/8/8/8/8/8/4K2R w K - 95 80",
    "8/8/8/3k4/8/8/3K4/3N4 w - - 0 1",
    "8/8/8/3k4/2b5/8/3K4/3B4 w - - 0 1",
    "7k/5Q2/8/8/8/8/8/K7 w - - 0 1",
    "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
]

# One position per branch of python-chess has_insufficient_material, plus
# terminal positions: random play does not reach them reliably.
ENDGAME_FENS = [
    "8/8/8/4k3/8/8/8/3NK3 w - - 0 1",        # K+N v K
    "8/8/8/4k3/8/8/2q5/3NK3 w - - 0 1",      # K+N v K+Q: knight side insufficient
    "8/8/8/4k3/8/8/2r5/3NK3 w - - 0 1",      # K+N v K+R: selfmate possible
    "8/8/8/4k3/8/8/8/2NNK3 w - - 0 1",       # K+N+N v K
    "8/8/8/4k3/8/8/8/2B1K2b w - - 0 1",      # bishops on the same colour
    "8/8/8/4k3/8/8/8/2B1Kb2 w - - 0 1",      # bishops on opposite colours
    "8/8/8/4k3/8/8/6n1/2B1K3 w - - 0 1",     # K+B v K+N
    "8/8/8/4k3/8/6p1/8/2B1K3 w - - 0 1",     # K+B v K+P
    "8/8/8/4k3/8/8/8/2BBK3 w - - 0 1",       # two same-side bishops, opposite colours
    "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",        # stalemate
    "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",     # checkmate
    "8/8/8/4k3/8/8/8/4K3 w - - 0 1",         # bare kings
]

# Knight shuffles return to the same position: threefold and fivefold.
SHUFFLE = ["Nf3", "Nf6", "Ng1", "Ng8"]


def entry_for(board: chess.Board, human: str, handicap, initial_fen, rng: random.Random) -> dict:
    sans = []
    replay = chess.Board(initial_fen) if initial_fen else chess.Board()
    if not initial_fen:
        apply_handicap(replay, handicap, "b" if human == "w" else "w")
    for move in board.move_stack:
        sans.append(replay.san(move))
        replay.push(move)
    last = None
    if board.move_stack:
        move = board.move_stack[-1]
        before = board.copy()
        before.pop()
        piece = before.piece_at(move.from_square)
        last = {
            "from": chess.square_name(move.from_square),
            "to": chess.square_name(move.to_square),
            "by": rng.choice(["human", "cpu"]),
            "captured": before.is_capture(move),
            "piece": chess.piece_symbol(piece.piece_type) if piece else None,
            "promotion": chess.piece_symbol(move.promotion) if move.promotion else None,
        }
    return {
        "owner": "alice",
        "moves": sans,
        "difficulty": rng.choice([0, 13, 50, 87, 100]),
        "humanColor": human,
        "handicap": None if initial_fen else handicap,
        "initialFen": initial_fen,
        "lastMove": last,
    }


def start_board(handicap, human, initial_fen) -> chess.Board:
    if initial_fen:
        return chess.Board(initial_fen)
    board = chess.Board()
    apply_handicap(board, handicap, "b" if human == "w" else "w")
    return board


def random_games(rng: random.Random) -> list[dict]:
    games = []
    for index in range(110):
        human = rng.choice(["w", "b"])
        if index % 5 == 4:
            initial_fen, handicap = rng.choice(LAB_FENS), None
        else:
            initial_fen, handicap = None, rng.choice(HANDICAPS)
        board = start_board(handicap, human, initial_fen)
        capture_bias = (index % 3) / 3
        for _ in range(rng.randint(0, 100)):
            if board.is_game_over(claim_draw=True):
                break
            moves = list(board.legal_moves)
            captures = [m for m in moves if board.is_capture(m) or m.promotion]
            pool = captures if captures and rng.random() < capture_bias else moves
            board.push(rng.choice(pool))
        games.append(entry_for(board, human, handicap, initial_fen, rng))
    # Repetitions: shuffle knights from the start and from a lab position.
    for reps in range(1, 6):
        for initial_fen in (None, LAB_FENS[9]):
            board = chess.Board(initial_fen) if initial_fen else chess.Board()
            if initial_fen:
                board.push_san("Bc4")
            shuffle = ["Nf6", "Ng1", "Ng8", "Nf3"] if initial_fen else SHUFFLE
            for _ in range(reps):
                for san in shuffle:
                    board.push_san(san)
            # Stop one move short too: the "claim before moving" rule.
            games.append(entry_for(board, "w", None, initial_fen, rng))
            short = board.copy()
            short.pop()
            games.append(entry_for(short, "w", None, initial_fen, rng))
    for fen in ENDGAME_FENS:
        games.append(entry_for(chess.Board(fen), "w", None, fen, rng))
    # Fifty-move rule: rook shuffles from a high halfmove clock.
    for extra in range(0, 8):
        board = chess.Board(LAB_FENS[4])
        rook = ["Rh2", "Kd7", "Rh1", "Ke8"] * 2
        for san in rook[:extra]:
            board.push_san(san)
        games.append(entry_for(board, "w", None, LAB_FENS[4], rng))
    return games


def resolve_cases(games: list[dict], rng: random.Random) -> list[dict]:
    cases = []
    promotions = [None, "q", "r", "b", "n", "Q", "x", ""]
    for entry in games[:120]:
        board = load_board(entry)
        if board.is_game_over(claim_draw=True):
            continue
        legal = list(board.legal_moves)
        picks = rng.sample(legal, min(3, len(legal)))
        squares = [chess.square_name(sq) for sq in chess.SQUARES]
        for move in picks:
            for promotion in ([None, "q", "n", "x"] if move.promotion else [None, "q"]):
                cases.append(case(board, chess.square_name(move.from_square), chess.square_name(move.to_square), promotion))
        cases.append(case(board, rng.choice(squares), rng.choice(squares), rng.choice(promotions)))
        cases.append(case(board, "z9", "e4", None))
    # Promotions on purpose: no code (queen by default), each piece, bad codes,
    # a capture-promotion and a promotion code on a non-promotion move.
    for fen in ("8/P6k/8/8/8/8/6Kp/8 w - - 0 1", "8/P6k/8/8/8/8/6Kp/8 b - - 0 1", "1r5k/P7/8/8/8/8/8/6K1 w - - 0 1"):
        board = chess.Board(fen)
        for move in board.legal_moves:
            if move.promotion is None and board.piece_type_at(move.from_square) != chess.PAWN:
                continue
            for promotion in (None, "q", "r", "b", "n", "Q", "k", "x", ""):
                cases.append(case(board, chess.square_name(move.from_square), chess.square_name(move.to_square), promotion))
    return cases


def case(board: chess.Board, from_sq, to_sq, promotion) -> dict:
    move = resolve_move(board, from_sq, to_sq, promotion)
    return {"fen": board.fen(), "from": from_sq, "to": to_sq, "promotion": promotion, "uci": move.uci() if move else None}


def validity_cases(rng: random.Random) -> list[dict]:
    seeds = LAB_FENS + [chess.STARTING_FEN]
    mutations = [
        lambda f: f.replace("K", "", 1),
        lambda f: f.replace("k", "kk", 1),
        lambda f: f.replace(" w ", " b ", 1),
        lambda f: "P" + f[1:] if f[0] in "rnbqk" else f,
        lambda f: f.replace("KQkq", "KQkq").replace(" - ", " KQkq ", 1),
        lambda f: f.replace(" - 0", " e3 0", 1),
        lambda f: f,
    ]
    cases = []
    for fen in seeds:
        for mutate in mutations:
            candidate = mutate(fen)
            try:
                board_from_valid_fen(candidate)
                valid = True
            except ValueError:
                valid = False
            cases.append({"fen": candidate, "valid": valid})
    for fen in ENDGAME_FENS + ["", "garbage", "8/8/8/8/8/8/8/8 w - - 0 1", "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
                "4k3/8/8/8/8/8/4q3/4K3 b - - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]:
        try:
            board_from_valid_fen(fen)
            valid = True
        except ValueError:
            valid = False
        cases.append({"fen": fen, "valid": valid})
    return cases


def build() -> dict:
    rng = random.Random(SEED)
    games = random_games(rng)
    snapshots = []
    for index, entry in enumerate(games):
        game_id = f"g-{index}"
        snapshots.append({"entry": entry, "snapshot": serialize_game(game_id, entry, load_board(entry)), "id": game_id})
    return {
        "generator": "scripts/games_parity_corpus.py",
        "python_chess": chess.__version__,
        "seed": SEED,
        "games": snapshots,
        "resolve": resolve_cases(games, rng),
        "validity": validity_cases(rng),
    }


def render(corpus: dict) -> str:
    head = {k: v for k, v in corpus.items() if k not in {"games", "resolve", "validity"}}
    parts = [json.dumps(head, sort_keys=True)[:-1]]
    for key in ("games", "resolve", "validity"):
        rows = ",\n".join(json.dumps(row, sort_keys=True, separators=(",", ":")) for row in corpus[key])
        parts.append(f', "{key}": [\n{rows}\n]')
    return "".join(parts) + "}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/games_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    corpus = json.loads(text)
    print(f"wrote {FIXTURE.relative_to(ROOT)}: {len(corpus['games'])} games, "
          f"{len(corpus['resolve'])} resolve cases, {len(corpus['validity'])} validity cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
