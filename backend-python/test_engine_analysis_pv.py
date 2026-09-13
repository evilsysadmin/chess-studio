import chess

import engine_analysis
from engine_analysis import (
    PrincipalVariationAnalysis,
    RootAnalysisSnapshot,
    RootCandidateAnalysis,
    only_legal_move,
    principal_variation,
)


def _tt_key_for(board, ply):
    return (*engine_analysis._engine._tt_key(board), ply)


def test_principal_variation_helper_recovers_only_exact_legal_tt_prefix():
    board = chess.Board()
    before = board.fen()
    root = chess.Move.from_uci("e2e4")
    reply = chess.Move.from_uci("e7e5")
    third = chess.Move.from_uci("g1f3")

    probe = board.copy(stack=True)
    probe.push(root)
    probe.push(reply)
    tt = {
        _tt_key_for(probe, 2): engine_analysis._engine.TTEntry(
            depth=1,
            score=15.0,
            flag="EXACT",
            move=third,
        ),
    }

    line = engine_analysis._principal_variation_from_tt(
        board,
        root,
        reply,
        depth=3,
        tt=tt,
    )

    assert [move.uci() for move in line] == ["e2e4", "e7e5", "g1f3"]
    assert board.fen() == before


def test_principal_variation_helper_truncates_on_bound_or_illegal_tt_move():
    board = chess.Board()
    root = chess.Move.from_uci("e2e4")
    reply = chess.Move.from_uci("e7e5")
    probe = board.copy(stack=True)
    probe.push(root)
    probe.push(reply)
    key = _tt_key_for(probe, 2)

    bound = {
        key: engine_analysis._engine.TTEntry(
            depth=2,
            score=12.0,
            flag="LOWER",
            move=chess.Move.from_uci("g1f3"),
        ),
    }
    illegal = {
        key: engine_analysis._engine.TTEntry(
            depth=2,
            score=12.0,
            flag="EXACT",
            move=chess.Move.from_uci("e2e4"),
        ),
    }

    assert [move.uci() for move in engine_analysis._principal_variation_from_tt(
        board, root, reply, depth=4, tt=bound,
    )] == ["e2e4", "e7e5"]
    assert [move.uci() for move in engine_analysis._principal_variation_from_tt(
        board, root, reply, depth=4, tt=illegal,
    )] == ["e2e4", "e7e5"]


def test_principal_variation_returns_best_proven_line_and_terminal_none(monkeypatch):
    board = chess.Board()
    candidate = RootCandidateAnalysis(
        move=chess.Move.from_uci("e2e4"),
        score=32.0,
        reply=chess.Move.from_uci("e7e5"),
        principal_variation=(
            chess.Move.from_uci("e2e4"),
            chess.Move.from_uci("e7e5"),
            chess.Move.from_uci("g1f3"),
        ),
    )

    monkeypatch.setattr(
        engine_analysis,
        "top_root_candidates_iterative",
        lambda *_args, **_kwargs: RootAnalysisSnapshot(
            candidates=(candidate,),
            depth=3,
            candidate_count=20,
        ),
    )

    result = principal_variation(board, max_depth=4, budget_s=0.4)

    assert result == PrincipalVariationAnalysis(
        moves=candidate.principal_variation,
        score=32.0,
        depth=3,
        candidate_count=20,
    )

    monkeypatch.setattr(
        engine_analysis,
        "top_root_candidates_iterative",
        lambda *_args, **_kwargs: RootAnalysisSnapshot(
            candidates=(),
            depth=1,
            candidate_count=0,
        ),
    )
    assert principal_variation(board, max_depth=2, budget_s=0.1) is None


def test_only_legal_move_reports_exactly_one_candidate():
    only = chess.Move.from_uci("a2a3")

    class DummyBoard:
        def __init__(self, moves):
            self.legal_moves = moves

    assert only_legal_move(DummyBoard([only])) == only
    assert only_legal_move(DummyBoard([])) is None
    assert only_legal_move(DummyBoard([only, chess.Move.from_uci("b2b3")])) is None
