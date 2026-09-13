import chess
import pytest

import engine_analysis


def test_compare_root_move_carries_best_and_played_principal_variations(monkeypatch):
    board = chess.Board()
    best = chess.Move.from_uci("e2e4")
    played = chess.Move.from_uci("d2d4")
    best_line = (best, chess.Move.from_uci("e7e5"), chess.Move.from_uci("g1f3"))
    played_line = (played, chess.Move.from_uci("d7d5"), chess.Move.from_uci("c2c4"))

    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            engine_analysis.RootCandidateAnalysis(
                move=played,
                score=10.0,
                reply=played_line[1],
                principal_variation=played_line,
            ),
            engine_analysis.RootCandidateAnalysis(
                move=best,
                score=35.0,
                reply=best_line[1],
                principal_variation=best_line,
            ),
        ],
    )

    comparison = engine_analysis.compare_root_move(board, played, depth=3, budget_s=0.2)

    assert comparison.best_principal_variation == best_line
    assert comparison.played_principal_variation == played_line
    assert comparison.best_reply == best_line[1]
    assert comparison.played_reply == played_line[1]


def test_factual_analysis_serializes_each_pv_in_its_real_board_context(monkeypatch):
    board = chess.Board()
    best = chess.Move.from_uci("e2e4")
    played = chess.Move.from_uci("d2d4")
    best_line = (best, chess.Move.from_uci("e7e5"), chess.Move.from_uci("g1f3"))
    played_line = (played, chess.Move.from_uci("d7d5"), chess.Move.from_uci("c2c4"))

    monkeypatch.setattr(
        engine_analysis,
        "compare_root_move_iterative",
        lambda *_args, **_kwargs: engine_analysis.RootMoveComparison(
            best_move=best,
            played_move=played,
            best_score=35.0,
            played_score=10.0,
            best_reply=best_line[1],
            played_reply=played_line[1],
            loss=25.0,
            depth=3,
            candidate_count=20,
            best_principal_variation=best_line,
            played_principal_variation=played_line,
        ),
    )

    factual = engine_analysis.build_factual_move_analysis(board, played, level=45, budget_s=0.2)
    payload = factual.to_api_payload()

    assert [move["san"] for move in factual.suggested_line] == ["e4", "e5", "Nf3"]
    assert [move["san"] for move in factual.played_line] == ["d4", "d5", "c4"]
    assert [move["san"] for move in payload["suggestedLine"]] == ["e4", "e5", "Nf3"]
    assert [move["san"] for move in payload["playedLine"]] == ["d4", "d5", "c4"]


def test_factual_analysis_rejects_corrupt_deep_principal_variation(monkeypatch):
    board = chess.Board()
    root = chess.Move.from_uci("e2e4")
    reply = chess.Move.from_uci("e7e5")
    corrupt = (root, reply, chess.Move.from_uci("e2e4"))

    monkeypatch.setattr(
        engine_analysis,
        "compare_root_move_iterative",
        lambda *_args, **_kwargs: engine_analysis.RootMoveComparison(
            best_move=root,
            played_move=root,
            best_score=0.0,
            played_score=0.0,
            best_reply=reply,
            played_reply=reply,
            loss=0.0,
            depth=3,
            candidate_count=20,
            best_principal_variation=corrupt,
            played_principal_variation=(root, reply),
        ),
    )

    with pytest.raises(ValueError, match="principal variation"):
        engine_analysis.build_factual_move_analysis(board, root, level=45, budget_s=0.2)
