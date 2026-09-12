import chess
import pytest

import factual_move_analysis
from engine_analysis import RootMoveComparison
from factual_move_analysis import build_factual_move_analysis


def test_factual_move_analysis_serializes_both_legal_lines_and_provenance(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("d2d4")
    best = chess.Move.from_uci("e2e4")
    seen = {}

    def fake_compare(_board, move, *, max_depth, budget_s):
        seen.update(max_depth=max_depth, budget_s=budget_s)
        return RootMoveComparison(
            best_move=best,
            played_move=move,
            best_score=42.0,
            played_score=17.0,
            best_reply=chess.Move.from_uci("e7e5"),
            played_reply=chess.Move.from_uci("d7d5"),
            loss=25.0,
            depth=2,
            candidate_count=20,
        )

    monkeypatch.setattr(factual_move_analysis, "compare_root_move_iterative", fake_compare)

    analysis = build_factual_move_analysis(board, played, level=45, budget_s=0.4)
    payload = analysis.to_api_payload()

    assert seen == {"max_depth": 3, "budget_s": 0.4}
    assert analysis.suggested["san"] == "e4"
    assert analysis.played["san"] == "d4"
    assert analysis.suggested_reply["san"] == "e5"
    assert analysis.played_reply["san"] == "d5"
    assert payload["evalAfterSuggested"] == 42.0
    assert payload["evalAfterPlayed"] == 17.0
    assert payload["loss"] == 25.0
    assert payload["analysisDepth"] == 2
    assert payload["candidateCount"] == 20


def test_factual_move_analysis_caps_depth_to_engine_level(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    seen = {}

    def fake_compare(_board, move, *, max_depth, budget_s):
        seen.update(max_depth=max_depth, budget_s=budget_s)
        return RootMoveComparison(
            best_move=move,
            played_move=move,
            best_score=0.0,
            played_score=0.0,
            best_reply=None,
            played_reply=None,
            loss=0.0,
            depth=max_depth,
            candidate_count=20,
        )

    monkeypatch.setattr(factual_move_analysis, "compare_root_move_iterative", fake_compare)

    analysis = build_factual_move_analysis(board, played, level=10, max_depth=5, budget_s=0.2)

    assert seen["max_depth"] == 2
    assert analysis.depth == 2


def test_factual_move_analysis_rejects_corrupt_reply_evidence(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")

    monkeypatch.setattr(
        factual_move_analysis,
        "compare_root_move_iterative",
        lambda *_args, **_kwargs: RootMoveComparison(
            best_move=played,
            played_move=played,
            best_score=0.0,
            played_score=0.0,
            best_reply=chess.Move.from_uci("a2a3"),
            played_reply=None,
            loss=0.0,
            depth=2,
            candidate_count=20,
        ),
    )

    with pytest.raises(ValueError, match="reply must be legal"):
        build_factual_move_analysis(board, played, level=45, budget_s=0.2)


def test_factual_move_analysis_propagates_timeout_without_partial_payload(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    monkeypatch.setattr(
        factual_move_analysis,
        "compare_root_move_iterative",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(TimeoutError()),
    )

    with pytest.raises(TimeoutError):
        build_factual_move_analysis(board, played, level=45, budget_s=0.01)


def test_factual_move_analysis_validates_requested_depth_before_search(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    searched = False

    def unexpected_search(*_args, **_kwargs):
        nonlocal searched
        searched = True
        raise AssertionError("search should not run")

    monkeypatch.setattr(factual_move_analysis, "compare_root_move_iterative", unexpected_search)

    with pytest.raises(ValueError, match="max_depth"):
        build_factual_move_analysis(board, played, max_depth=0, budget_s=0.2)

    assert searched is False
