"""Stable public analysis helpers built on top of the chess engine.

Feature code should import analysis contracts from this module instead of
reaching into ``chess_ai`` private search helpers. Keeping that coupling here
lets the engine internals evolve without spreading private imports through
post-game analysis, training, balanced CPU policy, hints, or puzzle validation.
"""
from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Optional

import chess

import chess_ai as _engine

DEFAULT_FACTUAL_MAX_DEPTH = 3


@dataclass(frozen=True)
class RootCandidateAnalysis:
    """Score, immediate reply and proven principal line for one root move."""

    move: chess.Move
    score: float
    reply: Optional[chess.Move]
    principal_variation: tuple[chess.Move, ...] = ()


@dataclass(frozen=True)
class RootAnalysisSnapshot:
    """Deepest complete ranked root pass produced inside one time budget."""

    candidates: tuple[RootCandidateAnalysis, ...]
    depth: int
    candidate_count: int


@dataclass(frozen=True)
class PrincipalVariationAnalysis:
    """Best proven line from the deepest complete root pass."""

    moves: tuple[chess.Move, ...]
    score: float
    depth: int
    candidate_count: int


@dataclass(frozen=True)
class RootMoveComparison:
    """One factual root comparison produced by a single complete search pass."""

    best_move: chess.Move
    played_move: chess.Move
    best_score: float
    played_score: float
    best_reply: Optional[chess.Move]
    played_reply: Optional[chess.Move]
    loss: float
    depth: int
    candidate_count: int
    second_best_move: Optional[chess.Move] = None
    second_best_score: Optional[float] = None
    best_to_second_gap: Optional[float] = None


@dataclass(frozen=True)
class FactualMoveAnalysis:
    """Consumer-ready evidence shared by post-game, coaching and training."""

    suggested: dict
    played: dict
    suggested_reply: Optional[dict]
    played_reply: Optional[dict]
    eval_after_suggested: float
    eval_after_played: float
    loss: float
    depth: int
    candidate_count: int
    second_best: Optional[dict] = None
    eval_after_second_best: Optional[float] = None
    best_to_second_gap: Optional[float] = None

    def to_api_payload(self) -> dict:
        return {
            "suggested": self.suggested,
            "played": self.played,
            "suggestedReply": self.suggested_reply,
            "playedReply": self.played_reply,
            "evalAfterSuggested": self.eval_after_suggested,
            "evalAfterPlayed": self.eval_after_played,
            "loss": self.loss,
            "analysisDepth": self.depth,
            "candidateCount": self.candidate_count,
            "secondBest": self.second_best,
            "evalAfterSecondBest": self.eval_after_second_best,
            "bestToSecondGap": self.best_to_second_gap,
        }


def _principal_variation_from_tt(
    board: chess.Board,
    root_move: chess.Move,
    reply: Optional[chess.Move],
    *,
    depth: int,
    tt: dict[tuple, _engine.TTEntry],
) -> tuple[chess.Move, ...]:
    """Recover only the exact, legal PV already proven by one root search.

    No extra search is launched. The immediate reply is the move returned by
    the child minimax call itself; deeper moves are accepted only from EXACT TT
    entries with enough stored depth. Bound entries are deliberately ignored so
    a cutoff can shorten the line but can never masquerade as an exact PV.
    """
    if root_move not in board.legal_moves:
        return ()

    line = [root_move]
    if depth <= 1 or reply is None:
        return tuple(line)

    probe = board.copy(stack=True)
    probe.push(root_move)
    if reply not in probe.legal_moves:
        return tuple(line)
    line.append(reply)
    probe.push(reply)

    ply = 2
    remaining_depth = depth - 2
    while remaining_depth > 0:
        entry = tt.get((*_engine._tt_key(probe), ply))
        if (
            entry is None
            or entry.flag != "EXACT"
            or entry.depth < remaining_depth
            or entry.move is None
            or entry.move not in probe.legal_moves
        ):
            break
        line.append(entry.move)
        probe.push(entry.move)
        ply += 1
        remaining_depth -= 1

    return tuple(line)


def analyze_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[RootCandidateAnalysis]:
    """Analyze every legal root move with one consistent bounded search pass.

    At depth 2 or greater, ``reply`` is the engine's best immediate response
    from the child position. ``principal_variation`` extends that line only with
    exact legal moves recovered from the same shared transposition table: no
    follow-up search is launched merely to make the line look longer.

    Exactly one of ``deadline`` or ``budget_s`` must be supplied. The function
    is atomic from the caller's point of view: a timeout raises ``TimeoutError``
    instead of returning a partial candidate set. The supplied board is always
    restored before returning or raising.
    """
    if depth < 1:
        raise ValueError("depth must be at least 1")
    if (deadline is None) == (budget_s is None):
        raise ValueError("provide exactly one of deadline or budget_s")
    if deadline is None:
        deadline = time.monotonic() + max(0.0, float(budget_s))

    moves = _engine._order_moves(board, list(board.legal_moves))
    candidates: list[RootCandidateAnalysis] = []
    tt: dict[tuple, _engine.TTEntry] = {}
    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score, reply = _engine._minimax(
                board,
                max(0, depth - 1),
                -_engine.INF,
                _engine.INF,
                1,
                deadline,
                tt,
            )
        finally:
            board.pop()
        candidates.append(RootCandidateAnalysis(
            move=move,
            score=score,
            reply=reply,
            principal_variation=_principal_variation_from_tt(
                board,
                move,
                reply,
                depth=depth,
                tt=tt,
            ),
        ))
    return candidates


def rank_root_candidates(
    board: chess.Board,
    candidates: list[RootCandidateAnalysis],
) -> list[RootCandidateAnalysis]:
    """Return root candidates best-first for the side whose turn it is.

    Engine scores stay on the engine's canonical White-positive scale. This
    helper is the single public place that turns that scale into root ordering,
    so callers do not each reinvent the White=max / Black=min rule.
    """
    return sorted(
        candidates,
        key=lambda candidate: candidate.score,
        reverse=board.turn == chess.WHITE,
    )


def top_root_candidates(
    board: chess.Board,
    *,
    limit: int,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[RootCandidateAnalysis]:
    """Analyze one complete root pass and return its best ``limit`` moves.

    All returned candidates come from the same depth, deadline and transposition
    table, making the list suitable for factual near-best policies such as CPU
    difficulty, Rival Fantasma and puzzle validation.
    """
    if limit < 1:
        raise ValueError("limit must be at least 1")
    analyzed = analyze_root_candidates(
        board,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )
    return rank_root_candidates(board, analyzed)[:limit]


def analyze_root_iterative(
    board: chess.Board,
    *,
    max_depth: int,
    budget_s: float,
) -> RootAnalysisSnapshot:
    """Return the deepest complete ranked root pass inside one time budget.

    A pass that times out is discarded in full. Consumers therefore get a
    coherent candidate set with one explicit completed depth rather than a mix
    of scores from partially explored depths. Terminal roots return an empty
    snapshot as soon as the first complete pass establishes that no moves exist.
    """
    if max_depth < 1:
        raise ValueError("max_depth must be at least 1")

    deadline = time.monotonic() + max(0.0, float(budget_s))
    completed: Optional[RootAnalysisSnapshot] = None
    for depth in range(1, max_depth + 1):
        if time.monotonic() >= deadline:
            break
        try:
            analyzed = analyze_root_candidates(board, depth=depth, deadline=deadline)
        except TimeoutError:
            break
        ranked = tuple(rank_root_candidates(board, analyzed))
        completed = RootAnalysisSnapshot(
            candidates=ranked,
            depth=depth,
            candidate_count=len(ranked),
        )
        if not ranked:
            return completed

    if completed is None:
        raise TimeoutError
    return completed


def top_root_candidates_iterative(
    board: chess.Board,
    *,
    limit: int,
    max_depth: int,
    budget_s: float,
) -> RootAnalysisSnapshot:
    """Return top-N candidates from the deepest complete iterative root pass."""
    if limit < 1:
        raise ValueError("limit must be at least 1")
    snapshot = analyze_root_iterative(board, max_depth=max_depth, budget_s=budget_s)
    return RootAnalysisSnapshot(
        candidates=snapshot.candidates[:limit],
        depth=snapshot.depth,
        candidate_count=snapshot.candidate_count,
    )


def principal_variation(
    board: chess.Board,
    *,
    max_depth: int,
    budget_s: float,
) -> Optional[PrincipalVariationAnalysis]:
    """Return the best proven PV from the deepest complete iterative root pass.

    ``None`` means the supplied position is terminal. The returned line may be
    shorter than ``depth`` when alpha-beta only left bound entries below the
    proven prefix; callers must treat the actual line length as authoritative.
    """
    snapshot = top_root_candidates_iterative(
        board,
        limit=1,
        max_depth=max_depth,
        budget_s=budget_s,
    )
    if not snapshot.candidates:
        return None
    best = snapshot.candidates[0]
    return PrincipalVariationAnalysis(
        moves=best.principal_variation or (best.move,),
        score=best.score,
        depth=snapshot.depth,
        candidate_count=snapshot.candidate_count,
    )


def only_legal_move(board: chess.Board) -> Optional[chess.Move]:
    """Return the sole legal move when the position has exactly one, else None."""
    moves = list(board.legal_moves)
    return moves[0] if len(moves) == 1 else None


def best_root_candidate(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> Optional[RootCandidateAnalysis]:
    """Return the best legal root candidate, or ``None`` in a terminal position."""
    candidates = top_root_candidates(
        board,
        limit=1,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )
    return candidates[0] if candidates else None


def score_root_move(
    board: chess.Board,
    move: chess.Move,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> RootCandidateAnalysis:
    """Return factual evidence for one legal move from a complete root pass.

    This deliberately evaluates the complete root instead of launching a
    one-off child search. Consumers can therefore compare the returned score
    with ``top_root_candidates`` or another scored move without scale drift.
    """
    if move not in board.legal_moves:
        raise ValueError("move must be legal in the supplied position")
    for candidate in analyze_root_candidates(
        board,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    ):
        if candidate.move == move:
            return candidate
    raise RuntimeError("legal root move disappeared during analysis")


def score_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[tuple[chess.Move, float]]:
    """Compatibility score facade over :func:`analyze_root_candidates`."""
    return [
        (candidate.move, candidate.score)
        for candidate in analyze_root_candidates(
            board,
            depth=depth,
            deadline=deadline,
            budget_s=budget_s,
        )
    ]


def compare_root_move(
    board: chess.Board,
    played_move: chess.Move,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> RootMoveComparison:
    """Compare a played move against the best legal root move on one scale.

    ``best_score`` and ``played_score`` always come from the same complete root
    pass at the same depth. ``loss`` is from the perspective of the side to move
    and therefore never negative. At depth 2+, the comparison also carries the
    best immediate reply after each line, giving consumers a legal two-ply
    counterfactual without a second analysis pass. The runner-up and its gap to
    the best move are preserved from that exact same complete root pass so later
    consumers can reason about how constrained the choice really was.
    """
    if played_move not in board.legal_moves:
        raise ValueError("played_move must be legal in the supplied position")

    analyzed = analyze_root_candidates(
        board,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )
    if not analyzed:
        raise ValueError("position has no legal root moves")

    maximizing = board.turn == chess.WHITE
    ordered = rank_root_candidates(board, analyzed)
    best = ordered[0]
    second_best = ordered[1] if len(ordered) > 1 else None
    by_move = {candidate.move: candidate for candidate in analyzed}
    played = by_move[played_move]
    raw_loss = (best.score - played.score) if maximizing else (played.score - best.score)
    if second_best is None:
        best_to_second_gap = None
    elif best.score == second_best.score:
        best_to_second_gap = 0.0
    else:
        raw_gap = (best.score - second_best.score) if maximizing else (second_best.score - best.score)
        best_to_second_gap = max(0.0, raw_gap)

    return RootMoveComparison(
        best_move=best.move,
        played_move=played.move,
        best_score=best.score,
        played_score=played.score,
        best_reply=best.reply,
        played_reply=played.reply,
        loss=max(0.0, raw_loss),
        depth=depth,
        candidate_count=len(analyzed),
        second_best_move=second_best.move if second_best else None,
        second_best_score=second_best.score if second_best else None,
        best_to_second_gap=best_to_second_gap,
    )


def compare_root_move_iterative(
    board: chess.Board,
    played_move: chess.Move,
    *,
    max_depth: int,
    budget_s: float,
) -> RootMoveComparison:
    """Return the deepest complete factual comparison within one time budget.

    A deeper partial pass is never exposed. If depth 1 completes and depth 2
    times out, callers receive the complete depth-1 comparison. If no depth can
    complete, ``TimeoutError`` is raised so consumers can fall back without
    presenting an incomplete or internally inconsistent claim.
    """
    if max_depth < 1:
        raise ValueError("max_depth must be at least 1")
    if played_move not in board.legal_moves:
        raise ValueError("played_move must be legal in the supplied position")

    deadline = time.monotonic() + max(0.0, float(budget_s))
    completed: Optional[RootMoveComparison] = None
    for depth in range(1, max_depth + 1):
        if time.monotonic() >= deadline:
            break
        try:
            candidate = compare_root_move(
                board,
                played_move,
                depth=depth,
                deadline=deadline,
            )
        except TimeoutError:
            break
        completed = candidate

    if completed is None:
        raise TimeoutError
    return completed


def _reply_dict(board: chess.Board, root_move: chess.Move, reply: Optional[chess.Move]) -> Optional[dict]:
    if reply is None:
        return None
    child = board.copy(stack=False)
    child.push(root_move)
    if reply not in child.legal_moves:
        raise ValueError("analysis reply must be legal after its root move")
    return _engine.move_to_dict(child, reply)


def build_factual_move_analysis(
    board: chess.Board,
    played_move: chess.Move,
    *,
    level: float = 45,
    max_depth: int = DEFAULT_FACTUAL_MAX_DEPTH,
    budget_s: Optional[float] = None,
) -> FactualMoveAnalysis:
    """Build one reusable factual comparison for a played move.

    Search depth is capped by both the caller and the engine level. Only fully
    completed iterative depths are exposed, and both root lines plus their first
    legal reply remain on the same minimax scale.
    """
    requested_depth = int(max_depth)
    if requested_depth < 1:
        raise ValueError("max_depth must be at least 1")

    settings = _engine.settings_for_level(level)
    effective_depth = min(requested_depth, settings.max_depth)
    effective_budget = settings.time_budget_s if budget_s is None else max(0.0, float(budget_s))
    comparison = compare_root_move_iterative(
        board,
        played_move,
        max_depth=effective_depth,
        budget_s=effective_budget,
    )

    return FactualMoveAnalysis(
        suggested=_engine.move_to_dict(board, comparison.best_move),
        played=_engine.move_to_dict(board, comparison.played_move),
        suggested_reply=_reply_dict(board, comparison.best_move, comparison.best_reply),
        played_reply=_reply_dict(board, comparison.played_move, comparison.played_reply),
        eval_after_suggested=comparison.best_score,
        eval_after_played=comparison.played_score,
        loss=comparison.loss,
        depth=comparison.depth,
        candidate_count=comparison.candidate_count,
        second_best=(
            _engine.move_to_dict(board, comparison.second_best_move)
            if comparison.second_best_move is not None
            else None
        ),
        eval_after_second_best=comparison.second_best_score,
        best_to_second_gap=comparison.best_to_second_gap,
    )