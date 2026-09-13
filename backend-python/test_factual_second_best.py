import chess

import engine_analysis
import move_analysis_service as service
from engine_analysis import RootCandidateAnalysis, RootMoveComparison


def test_root_comparison_preserves_second_best_and_gap_for_both_colors(monkeypatch):
    white = chess.Board()
    white_played = chess.Move.from_uci("d2d4")
    white_best = chess.Move.from_uci("e2e4")
    white_second = chess.Move.from_uci("c2c4")
    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            RootCandidateAnalysis(white_played, 12.0, None),
            RootCandidateAnalysis(white_second, 31.0, None),
            RootCandidateAnalysis(white_best, 37.0, None),
        ],
    )

    comparison = engine_analysis.compare_root_move(white, white_played, depth=1, budget_s=1.0)

    assert comparison.best_move == white_best
    assert comparison.second_best_move == white_second
    assert comparison.best_score == 37.0
    assert comparison.second_best_score == 31.0
    assert comparison.best_to_second_gap == 6.0
    assert comparison.loss == 25.0

    black = chess.Board()
    black.push_uci("e2e4")
    black_played = chess.Move.from_uci("d7d5")
    black_best = chess.Move.from_uci("c7c5")
    black_second = chess.Move.from_uci("e7e5")
    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            RootCandidateAnalysis(black_played, 31.0, None),
            RootCandidateAnalysis(black_second, 14.0, None),
            RootCandidateAnalysis(black_best, 9.0, None),
        ],
    )

    comparison = engine_analysis.compare_root_move(black, black_played, depth=1, budget_s=1.0)

    assert comparison.best_move == black_best
    assert comparison.second_best_move == black_second
    assert comparison.best_score == 9.0
    assert comparison.second_best_score == 14.0
    assert comparison.best_to_second_gap == 5.0
    assert comparison.loss == 22.0


def test_root_comparison_handles_equal_or_missing_runner_up_without_nan(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    tied = chess.Move.from_uci("d2d4")
    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [
            RootCandidateAnalysis(played, float("inf"), None),
            RootCandidateAnalysis(tied, float("inf"), None),
        ],
    )

    tied_comparison = engine_analysis.compare_root_move(board, played, depth=1, budget_s=1.0)

    assert tied_comparison.second_best_move == tied
    assert tied_comparison.best_to_second_gap == 0.0

    monkeypatch.setattr(
        engine_analysis,
        "analyze_root_candidates",
        lambda *_args, **_kwargs: [RootCandidateAnalysis(played, 42.0, None)],
    )
    only_comparison = engine_analysis.compare_root_move(board, played, depth=1, budget_s=1.0)

    assert only_comparison.second_best_move is None
    assert only_comparison.second_best_score is None
    assert only_comparison.best_to_second_gap is None


def test_factual_payload_exposes_runner_up_from_same_completed_pass(monkeypatch):
    board = chess.Board()
    played = chess.Move.from_uci("d2d4")
    best = chess.Move.from_uci("e2e4")
    second = chess.Move.from_uci("c2c4")
    monkeypatch.setattr(
        engine_analysis,
        "compare_root_move_iterative",
        lambda *_args, **_kwargs: RootMoveComparison(
            best_move=best,
            played_move=played,
            best_score=42.0,
            played_score=17.0,
            best_reply=chess.Move.from_uci("e7e5"),
            played_reply=chess.Move.from_uci("d7d5"),
            loss=25.0,
            depth=2,
            candidate_count=20,
            second_best_move=second,
            second_best_score=34.0,
            best_to_second_gap=8.0,
        ),
    )

    payload = engine_analysis.build_factual_move_analysis(
        board,
        played,
        level=45,
        budget_s=0.4,
    ).to_api_payload()

    assert payload["secondBest"]["san"] == "c4"
    assert payload["evalAfterSecondBest"] == 34.0
    assert payload["bestToSecondGap"] == 8.0
    assert payload["analysisDepth"] == 2
    assert payload["candidateCount"] == 20


def test_move_analysis_service_sanitizes_infinite_runner_up_evidence(monkeypatch):
    board = chess.Board()

    class FakeFactual:
        suggested = {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None}
        eval_after_suggested = float("inf")

        def to_api_payload(self):
            return {
                "suggested": self.suggested,
                "played": {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None},
                "suggestedReply": None,
                "playedReply": None,
                "evalAfterSuggested": float("inf"),
                "evalAfterPlayed": 17.0,
                "loss": float("inf"),
                "analysisDepth": 3,
                "candidateCount": 20,
                "secondBest": {"from": "c2", "to": "c4", "san": "c4", "piece": "p", "promotion": None},
                "evalAfterSecondBest": float("inf"),
                "bestToSecondGap": float("inf"),
            }

    monkeypatch.setattr(service, "build_factual_move_analysis", lambda *_args, **_kwargs: FakeFactual())
    monkeypatch.setattr(service, "evaluate_board", lambda _board: 19.0)

    payload, _primary = service.analyze_move_payload(
        board,
        from_square="e2",
        to="e4",
        promotion=None,
        level=45,
    )

    assert payload["evalAfterSuggested"] == service.MATE_SCORE_SENTINEL
    assert payload["evalAfterSecondBest"] == service.MATE_SCORE_SENTINEL
    assert payload["bestToSecondGap"] == service.MATE_SCORE_SENTINEL
