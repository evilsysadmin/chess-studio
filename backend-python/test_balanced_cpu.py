import chess

import balanced_cpu as balanced


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
    enabled, style = balanced._split_cpu_profile({'balance': True})
    assert enabled is True
    assert style is None
    enabled, style = balanced._split_cpu_profile({'capture': 0.5})
    assert enabled is False
    assert style == {'capture': 0.5}


def test_near_best_candidates_respect_score_gap():
    base = chess.Move.from_uci('e2e4')
    near = chess.Move.from_uci('d2d4')
    far = chess.Move.from_uci('g1f3')
    scored = [(base, 100.0), (near, 76.0), (far, 20.0)]
    candidates = balanced._near_best_candidates(
        scored,
        base_move=base,
        base_score=100.0,
        maximizing=True,
        margin_cp=30.0,
    )
    assert near in candidates
    assert far not in candidates


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
