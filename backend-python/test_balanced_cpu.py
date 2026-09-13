import chess

import balanced_cpu as balanced
from api_models import GhostStyle
from engine_analysis import RootCandidateAnalysis


BALANCED_PROFILE = {'balance': True}


def test_concession_profile_is_conservative_and_tapers_with_level():
    assert balanced.concession_profile(44).chance == 0
    assert balanced.concession_profile(45).margin_cp == 55
    assert balanced.concession_profile(60).margin_cp == 42
    assert balanced.concession_profile(70).margin_cp == 30
    assert balanced.concession_profile(80).margin_cp == 18
    assert balanced.concession_profile(90).margin_cp == 8
    assert balanced.concession_profile(95).chance == 0


def test_cpu_profile_separates_balance_flag_from_ghost_style():
    enabled, style = balanced._split_cpu_profile({'balance': True, 'capture': 0.0, 'pawn': 0.0})
    assert enabled is True
    assert style is None
    enabled, style = balanced._split_cpu_profile({'capture': 0.5})
    assert enabled is False
    assert style == {'capture': 0.5}


def test_balance_schema_is_internal_and_legacy_ghost_payload_stays_stable():
    assert GhostStyle(balance=True).model_dump() == {
        'capture': 0.0,
        'pawn': 0.0,
        'queen': 0.0,
        'check': 0.0,
        'castle': 0.0,
        'balance': True,
    }
    legacy = {'capture': 0.5, 'pawn': -0.25, 'queen': 0.1, 'check': 1.0, 'castle': -1.0}
    assert GhostStyle(**legacy).model_dump() == legacy


def test_near_best_candidates_respect_score_gap():
    base = chess.Move.from_uci('e2e4')
    near = chess.Move.from_uci('d2d4')
    far = chess.Move.from_uci('g1f3')
    analyzed = [
        RootCandidateAnalysis(base, 100.0, None),
        RootCandidateAnalysis(near, 76.0, None),
        RootCandidateAnalysis(far, 20.0, None),
    ]
    candidates = balanced._near_best_candidates(
        analyzed,
        base_move=base,
        base_score=100.0,
        maximizing=True,
        margin_cp=30.0,
    )
    assert near in candidates
    assert far not in candidates


def test_balanced_cpu_consumes_ranked_root_facade(monkeypatch):
    board = chess.Board()
    base = chess.Move.from_uci('e2e4')
    near = chess.Move.from_uci('d2d4')
    seen = {}

    monkeypatch.setattr(
        balanced,
        'get_cpu_move',
        lambda *_args, **_kwargs: {'from': 'e2', 'to': 'e4', 'san': 'e4'},
    )
    monkeypatch.setattr(balanced.random, 'random', lambda: 0.0)
    monkeypatch.setattr(balanced.random, 'choice', lambda moves: moves[0])

    def fake_top(_board, **kwargs):
        seen.update(kwargs)
        return [
            RootCandidateAnalysis(base, 40.0, None),
            RootCandidateAnalysis(near, 20.0, None),
        ]

    monkeypatch.setattr(balanced, 'top_root_candidates', fake_top)

    move = balanced.get_balanced_cpu_move(board, 70, BALANCED_PROFILE)

    assert move is not None
    assert move['from'] == 'd2'
    assert move['to'] == 'd4'
    assert seen['depth'] == 2
    assert seen['limit'] == 20
    assert 'deadline' in seen


def test_balanced_cpu_never_overrides_forced_mate(monkeypatch):
    board = chess.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    before = board.fen()
    monkeypatch.setattr(balanced.random, 'random', lambda: 0.0)
    move = balanced.get_balanced_cpu_move(board, 60, BALANCED_PROFILE)
    assert move is not None
    assert move['san'] == 'Ra8#'
    assert board.fen() == before


def test_balanced_cpu_does_not_ignore_free_queen(monkeypatch):
    board = chess.Board('4k3/8/8/3q4/4Q3/8/8/4K3 b - - 0 1')
    before = board.fen()
    monkeypatch.setattr(balanced.random, 'random', lambda: 0.0)
    move = balanced.get_balanced_cpu_move(board, 60, BALANCED_PROFILE)
    assert move is not None
    assert move['from'] == 'd5'
    assert move['to'] == 'e4'
    assert board.fen() == before


def test_ghost_style_bypasses_concession(monkeypatch):
    board = chess.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    monkeypatch.setattr(balanced.random, 'random', lambda: 0.0)
    move = balanced.get_balanced_cpu_move(board, 60, {'capture': 1.0})
    assert move is not None
    assert move['san'] == 'Ra8#'