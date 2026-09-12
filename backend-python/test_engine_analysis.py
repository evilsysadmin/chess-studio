import time

import chess
import pytest

from engine_analysis import score_root_candidates


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
