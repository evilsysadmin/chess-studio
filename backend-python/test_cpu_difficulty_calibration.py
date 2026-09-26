"""Real-position calibration guards for the factual CPU difficulty policy."""

import chess

import cpu_difficulty as policy
from engine_analysis import analyze_root_iterative


def _loss(best_score: float, score: float, maximizing: bool) -> float:
    raw = (best_score - score) if maximizing else (score - best_score)
    return max(0.0, raw)


def _admitted_moves(snapshot, *, turn: chess.Color, level: int) -> set[str]:
    """Mirror the documented difficulty envelope, not engine internals."""
    band = policy.difficulty_band(level)
    if not snapshot.candidates:
        return set()
    best = snapshot.candidates[0]
    maximizing = turn == chess.WHITE
    admitted = []
    for candidate in snapshot.candidates[1:]:
        if _loss(best.score, candidate.score, maximizing) <= band.max_loss_cp:
            admitted.append(candidate.move.uci())
        if len(admitted) >= max(0, band.candidate_limit - 1):
            break
    return set(admitted)


def test_real_start_position_has_monotonic_admissible_error_sets():
    """Harder low levels must never gain a weaker admissible alternative."""
    board = chess.Board()
    snapshot = analyze_root_iterative(board, max_depth=2, budget_s=1.0)

    assert snapshot.candidate_count == 20
    assert snapshot.depth >= 1

    levels = (0, 20, 45, 60, 90, 100)
    admitted = [_admitted_moves(snapshot, turn=board.turn, level=level) for level in levels]

    for easier, harder in zip(admitted, admitted[1:]):
        assert harder <= easier
    # Candidate limits alone should make the envelope visibly tighter on the
    # initial position even if several opening moves evaluate almost equally.
    assert len(admitted[-1]) < len(admitted[0])


def test_beginner_still_takes_a_completely_free_queen(monkeypatch):
    """450 cp of deliberate weakness is not permission to ignore ~900 cp gratis."""
    board = chess.Board("4k3/8/8/3q4/4Q3/8/8/4K3 b - - 0 1")
    before = board.fen()
    monkeypatch.setattr(policy.random, "random", lambda: 0.0)
    monkeypatch.setattr(policy.random, "choice", lambda items: items[-1])

    move = policy.get_factual_difficulty_cpu_move(board, 0)

    assert move is not None
    assert (move["from"], move["to"]) == ("d5", "e4")
    assert board.fen() == before


def test_beginner_never_uses_difficulty_to_skip_mate_in_one(monkeypatch):
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    before = board.fen()
    monkeypatch.setattr(policy.random, "random", lambda: 0.0)
    monkeypatch.setattr(policy.random, "choice", lambda items: items[-1])

    move = policy.get_factual_difficulty_cpu_move(board, 0)

    assert move is not None
    assert move["san"] == "Ra8#"
    assert board.fen() == before
