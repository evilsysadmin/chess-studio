import time

import chess
import pytest

import engine_analysis
from engine_analysis import compare_root_move, score_root_candidates


def test_score_root_candidates_covers_every_legal_move_and_preserves_board():
    board = chess.Board()
    before = board.fen()
    legal_moves = set(board.legal_moves)

    scored = score_root_candidates(board, depth=1, budget_s=1.0)

    assert {move for move, _ in scored} == legal_moves
    assert len(scored) == len(legal_moves)
    assert board.fen() == before


def test_score_root_candidates_timeout_is_atomic_and_preserves_board():
    board = chess.Board()
    before = board.fen()

    with pytest.raises(TimeoutError):
        score_root_candidates(board, depth=1, deadline=time.monotonic() - 1.0)

    assert board.fen() == before


def test_score_root_candidates_requires_one_time_contract():
    board = chess.Board()

    with pytest.raises(ValueError):
        score_root_candidates(board, depth=1)
    with pytest.raises(ValueError):
        score_root_candidates(board, depth=1, deadline=time.monotonic() + 1.0, budget_s=1.0)
    with pytest.raises(ValueError):
        score_root_candidates(board, depth=0, budget_s=1.0)


def test_compare_root_move_uses_one_white_root_scale_and_preserves_board(monkeypatch):
    board = chess.Board()
    before = board.fen()
    played = chess.Move.from_uci("d2d4")
    best = chess.Move.from_uci("e2e4")

    monkeypatch.setattr(
        engine_analysis,
        "score_root_candidates",
        lambda *_args, **_kwargs: [(played, 12.0), (best, 37.0)],
    )

    comparison = compare_root_move(board, played, depth=2, budget_s=1.0)

    assert comparison.best_move == best
    assert comparison.played_move == played
    assert comparison.best_score == 37.0
    assert comparison.played_score == 12.0
    assert comparison.loss == 25.0
    assert comparison.depth == 2
    assert comparison.candidate_count == 2
    assert board.fen() == before


def test_compare_root_move_minimizes_for_black(monkeypatch):
    board = chess.Board()
    board.push_uci("e2e4")
    played = chess.Move.from_uci("e7e5")
    best = chess.Move.from_uci("c7c5")

    monkeypatch.setattr(
        engine_analysis,
        "score_root_candidates",
        lambda *_args, **_kwargs: [(played, 31.0), (best, 9.0)],
    )

    comparison = compare_root_move(board, played, depth=1, budget_s=1.0)

    assert comparison.best_move == best
    assert comparison.best_score == 9.0
    assert comparison.played_score == 31.0
    assert comparison.loss == 22.0


def test_compare_root_move_rejects_illegal_played_move_before_search(monkeypatch):
    board = chess.Board()
    searched = False

    def unexpected_search(*_args, **_kwargs):
        nonlocal searched
        searched = True
        return []

    monkeypatch.setattr(engine_analysis, "score_root_candidates", unexpected_search)

    with pytest.raises(ValueError, match="played_move must be legal"):
        compare_root_move(board, chess.Move.from_uci("e2e5"), depth=1, budget_s=1.0)

    assert searched is False
