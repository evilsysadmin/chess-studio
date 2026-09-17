import chess
import pytest

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


def test_candidate_payload_keeps_white_positive_score_for_white_root():
    board = chess.Board()
    move = chess.Move.from_uci('e2e4')
    candidate = RootCandidateAnalysis(move, 34.0, None)

    payload = service.candidate_api_payload(board, candidate)

    assert payload['from'] == 'e2'
    assert payload['to'] == 'e4'
    assert payload['moveKey'] == 'e2e4'
    assert payload['chessScoreCp'] == 34.0
    assert payload['isLegal'] is True
    assert payload['isMate'] is False
    assert board.fen() == chess.Board().fen()


def test_candidate_payload_flips_white_positive_score_for_black_root():
    board = chess.Board()
    board.push_san('e4')
    move = chess.Move.from_uci('e7e5')
    candidate = RootCandidateAnalysis(move, -27.0, None)

    payload = service.candidate_api_payload(board, candidate)

    assert payload['moveKey'] == 'e7e5'
    assert payload['chessScoreCp'] == 27.0


def test_candidate_payload_marks_forced_mate_from_root_mover_perspective():
    board = chess.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    move = chess.Move.from_uci('a1a8')
    candidate = RootCandidateAnalysis(move, service.MATE_SCORE, None)

    payload = service.candidate_api_payload(board, candidate)

    assert payload['isMate'] is True
    assert payload['chessScoreCp'] == service.MATE_SCORE


def test_candidate_payload_rejects_move_not_legal_on_root_board():
    board = chess.Board()
    candidate = RootCandidateAnalysis(chess.Move.from_uci('e7e5'), 0.0, None)

    with pytest.raises(ValueError, match='candidate move must be legal'):
        service.candidate_api_payload(board, candidate)
