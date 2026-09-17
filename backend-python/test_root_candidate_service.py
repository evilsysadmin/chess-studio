import chess

import root_candidate_service as service
from engine_analysis import RootCandidateAnalysis


def test_factual_root_candidates_clamps_shortlist_and_preserves_contract(monkeypatch):
    board = chess.Board()
    expected = [RootCandidateAnalysis(chess.Move.from_uci('e2e4'), 12.0, None)]
    seen = {}

    def fake_top_root_candidates(candidate_board, **kwargs):
        seen.update(kwargs)
        assert candidate_board is board
        return expected

    monkeypatch.setattr(service, 'top_root_candidates', fake_top_root_candidates)

    result = service.factual_root_candidates(board, depth=2, limit=5, budget_s=0.2)

    assert result == expected
    assert seen == {'limit': 5, 'depth': 2, 'deadline': None, 'budget_s': 0.2}


def test_factual_root_candidates_none_requests_all_legal_moves(monkeypatch):
    board = chess.Board()
    seen = {}

    def fake_top_root_candidates(_board, **kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr(service, 'top_root_candidates', fake_top_root_candidates)
    service.factual_root_candidates(board, depth=1, limit=None, deadline=123.0)

    assert seen['limit'] == 20
    assert seen['deadline'] == 123.0
    assert seen['budget_s'] is None


def test_factual_root_candidates_terminal_position_avoids_search(monkeypatch):
    board = chess.Board('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError('terminal root must not launch candidate search')

    monkeypatch.setattr(service, 'top_root_candidates', fail_if_called)
    assert service.factual_root_candidates(board, depth=2, budget_s=0.1) == []
