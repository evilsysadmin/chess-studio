import random

import chess

import cpu_difficulty as policy
from engine_analysis import RootAnalysisSnapshot, RootCandidateAnalysis


def _candidate(uci: str, score: float) -> RootCandidateAnalysis:
    return RootCandidateAnalysis(move=chess.Move.from_uci(uci), score=score, reply=None)


def _snapshot(*candidates: RootCandidateAnalysis) -> RootAnalysisSnapshot:
    return RootAnalysisSnapshot(candidates=tuple(candidates), depth=2, candidate_count=len(candidates))


def test_difficulty_bands_tighten_monotonically_until_strong_play():
    levels = [0, 10, 20, 30, 40, 45]
    bands = [policy.difficulty_band(level) for level in levels]
    assert [band.max_loss_cp for band in bands] == sorted(
        [band.max_loss_cp for band in bands], reverse=True
    )
    assert [band.mistake_chance for band in bands] == sorted(
        [band.mistake_chance for band in bands], reverse=True
    )
    assert bands[-1] is policy.STRONG_PLAY


def test_beginner_can_only_choose_candidates_inside_factual_loss_band(monkeypatch):
    board = chess.Board()
    snap = _snapshot(
        _candidate("e2e4", 100.0),
        _candidate("d2d4", 40.0),
        _candidate("a2a3", -500.0),
    )
    monkeypatch.setattr(policy, "analyze_root_iterative", lambda *_args, **_kwargs: snap)
    monkeypatch.setattr(policy.random, "random", lambda: 0.0)
    monkeypatch.setattr(policy.random, "choice", lambda items: items[-1])

    move = policy.get_factual_difficulty_cpu_move(board, 0)

    assert move["from"] == "d2"
    assert move["to"] == "d4"


def test_black_uses_the_same_loss_band_on_white_positive_engine_scores(monkeypatch):
    board = chess.Board("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1")
    snap = _snapshot(
        _candidate("e7e5", -100.0),
        _candidate("d7d5", -40.0),
        _candidate("a7a6", 500.0),
    )
    monkeypatch.setattr(policy, "analyze_root_iterative", lambda *_args, **_kwargs: snap)
    monkeypatch.setattr(policy.random, "random", lambda: 0.0)
    monkeypatch.setattr(policy.random, "choice", lambda items: items[-1])

    move = policy.get_factual_difficulty_cpu_move(board, 0)

    assert move["from"] == "d7"
    assert move["to"] == "d5"


def test_deliberate_errors_favor_smaller_factual_losses():
    snap = _snapshot(
        _candidate("e2e4", 100.0),
        _candidate("d2d4", 80.0),
        _candidate("g1f3", -80.0),
        _candidate("a2a3", -300.0),
    )
    band = policy.difficulty_band(0)
    alternatives = policy._eligible_alternatives(
        snap,
        maximizing=True,
        band=band,
    )
    weights = policy._imperfect_candidate_weights(
        snap,
        alternatives,
        maximizing=True,
        band=band,
        level=0,
    )

    assert len(weights) == 3
    assert weights[0] > weights[1] > weights[2] > 0


def test_forced_mate_sentinel_is_never_weakened(monkeypatch):
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    snap = _snapshot(
        _candidate("a1a8", policy.MATE_SCORE - 1),
        _candidate("a1a7", policy.MATE_SCORE - 20),
    )
    monkeypatch.setattr(policy, "analyze_root_iterative", lambda *_args, **_kwargs: snap)
    monkeypatch.setattr(policy.random, "random", lambda: 0.0)

    move = policy.get_factual_difficulty_cpu_move(board, 0)

    assert move["from"] == "a1"
    assert move["to"] == "a8"


def test_timeout_falls_back_to_deterministic_analysis_not_legal_roulette(monkeypatch):
    board = chess.Board()

    def timeout(*_args, **_kwargs):
        raise TimeoutError

    monkeypatch.setattr(policy, "analyze_root_iterative", timeout)
    monkeypatch.setattr(
        policy,
        "analyze_move",
        lambda *_args, **_kwargs: {
            "move": {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None, "captured": False},
            "score": 10.0,
        },
    )

    assert policy.get_factual_difficulty_cpu_move(board, 0)["san"] == "e4"


def test_low_level_honors_explicit_game_api_engine_override(monkeypatch):
    import game_api

    board = chess.Board()
    injected = {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None, "captured": False}
    monkeypatch.setattr(game_api, "get_cpu_move", lambda *_args, **_kwargs: injected)
    monkeypatch.setattr(
        policy,
        "analyze_root_iterative",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("explicit provider must win")),
    )

    assert policy.get_factual_difficulty_cpu_move(board, 20) is injected


def test_low_level_forced_move_skips_factual_search(monkeypatch):
    forced = chess.Move.from_uci("e2e4")

    class ForcedBoard:
        legal_moves = [forced]

    monkeypatch.setattr(policy, "_explicit_game_engine_override", lambda *_args: policy._NO_ENGINE_OVERRIDE)
    monkeypatch.setattr(
        policy,
        "analyze_root_iterative",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("forced move must not launch minimax")),
    )
    monkeypatch.setattr(
        policy,
        "move_to_dict",
        lambda _board, move: {"from": chess.square_name(move.from_square), "to": chess.square_name(move.to_square), "san": "e4"},
    )

    assert policy.get_factual_difficulty_cpu_move(ForcedBoard(), 20)["san"] == "e4"


def test_low_level_override_still_precedes_forced_fast_path(monkeypatch):
    import game_api

    forced = chess.Move.from_uci("e2e4")

    class ForcedBoard:
        legal_moves = [forced]

    injected = {"from": "d2", "to": "d4", "san": "d4"}
    monkeypatch.setattr(game_api, "get_cpu_move", lambda *_args, **_kwargs: injected)
    monkeypatch.setattr(
        policy,
        "move_to_dict",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("override must run before forced shortcut")),
    )
    monkeypatch.setattr(
        policy,
        "analyze_root_iterative",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("override must avoid minimax")),
    )

    assert policy.get_factual_difficulty_cpu_move(ForcedBoard(), 20) is injected


def test_level_45_keeps_established_engine_path(monkeypatch):
    board = chess.Board()
    seen = []

    def strong(_board, level):
        seen.append(level)
        return {"from": "e2", "to": "e4", "san": "e4"}

    monkeypatch.setattr(policy, "get_cpu_move", strong)

    assert policy.get_factual_difficulty_cpu_move(board, 45)["san"] == "e4"
    assert seen == [45]


def test_seeded_band_choice_is_reproducible(monkeypatch):
    board = chess.Board()
    snap = _snapshot(
        _candidate("e2e4", 100.0),
        _candidate("d2d4", 80.0),
        _candidate("g1f3", 75.0),
        _candidate("c2c4", 70.0),
    )
    monkeypatch.setattr(policy, "analyze_root_iterative", lambda *_args, **_kwargs: snap)

    random.seed(9123)
    first = policy.get_factual_difficulty_cpu_move(board, 0)["san"]
    random.seed(9123)
    second = policy.get_factual_difficulty_cpu_move(board, 0)["san"]

    assert first == second
