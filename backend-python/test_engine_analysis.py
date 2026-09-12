import time

import chess
import pytest

import engine_analysis
from engine_analysis import (
    RootCandidateAnalysis,
    RootMoveComparison,
    analyze_root_candidates,
    compare_root_move,
    compare_root_move_iterative,
    score_root_candidates,
)


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


def test_analyze_root_candidates_keeps_immediate_reply_from_same_search(monkeypatch):
    board = chess.Board()
    before = board.fen()

    def fake_minimax(child, *_args, **_kwargs):
        return 0.0, next(iter(child.legal_moves), None)

    monkeypatch.setattr(engine_analysis._engine, "_minimax", fake_minimax)

    analyzed = analyze_root_candidates(board, depth=2, budget_s=1.0)

    assert len(analyzed) == len(list(board.legal_moves))
    for candidate in analyzed:
        child = board.copy(stack=False)
        child.push(candidate.move)
        assert candidate.reply in child.legal_moves
    assert board.fen() == before


def test_compare_root_move_uses_one_white_root_scale_and_preserves_board(monkeypatch):
    board = chess.Board()
    before = board.fen()
    played = chess.Move.from_uci("d2d4")
    best = chess.Move.from_uci("e2e4")
    played_reply = chess.Move.from_uci("d7d5")
    best_reply = chess.Move.from_uci("e7e5")

    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            RootCandidateAnalysis(played, 12.0, played_reply),
            RootCandidateAnalysis(best, 37.0, best_reply),
        ],
    )

    comparison = compare_root_move(board, played, depth=2, budget_s=1.0)

    assert comparison.best_move == best
    assert comparison.played_move == played
    assert comparison.best_score == 37.0
    assert comparison.played_score == 12.0
    assert comparison.best_reply == best_reply
    assert comparison.played_reply == played_reply
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
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            RootCandidateAnalysis(played, 31.0, chess.Move.from_uci("g1f3")),
            RootCandidateAnalysis(best, 9.0, chess.Move.from_uci("g1f3")),
        ],
    )

    comparison = compare_root_move(board, played, depth=2, budget_s=1.0)

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

    monkeypatch.setattr(engine_analysis, "analyze_root_candidates", unexpected_search)

    with pytest.raises(ValueError, match="played_move must be legal"):
        compare_root_move(board, chess.Move.from_uci("e2e5"), depth=2, budget_s=1.0)

    assert searched is False


def test_iterative_comparison_returns_deepest_completed_pass(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    replies = []

    def fake_compare(_board, move, *, depth, deadline=None, **_kwargs):
        replies.append((depth, deadline))
        if depth == 3:
            raise TimeoutError
        return RootMoveComparison(
            best_move=played,
            played_move=move,
            best_score=10.0 * depth,
            played_score=10.0 * depth,
            best_reply=None,
            played_reply=None,
            loss=0.0,
            depth=depth,
            candidate_count=20,
        )

    monkeypatch.setattr(engine_analysis, "compare_root_move", fake_compare)

    result = compare_root_move_iterative(board, played, max_depth=4, budget_s=10.0)

    assert result.depth == 2
    assert [depth for depth, _ in replies] == [1, 2, 3]
    assert len({deadline for _, deadline in replies}) == 1


def test_iterative_comparison_raises_when_no_depth_completes(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    monkeypatch.setattr(
        engine_analysis,
        "compare_root_move",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(TimeoutError()),
    )

    with pytest.raises(TimeoutError):
        compare_root_move_iterative(board, played, max_depth=3, budget_s=1.0)


def test_iterative_comparison_validates_depth_and_played_move_before_search(monkeypatch):
    board = chess.Board()
    searched = False

    def unexpected_search(*_args, **_kwargs):
        nonlocal searched
        searched = True
        raise AssertionError("search should not run")

    monkeypatch.setattr(engine_analysis, "compare_root_move", unexpected_search)

    with pytest.raises(ValueError, match="max_depth"):
        compare_root_move_iterative(board, chess.Move.from_uci("e2e4"), max_depth=0, budget_s=1.0)
    with pytest.raises(ValueError, match="played_move must be legal"):
        compare_root_move_iterative(board, chess.Move.from_uci("e2e5"), max_depth=2, budget_s=1.0)

    assert searched is False
