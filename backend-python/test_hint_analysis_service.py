import chess

import hint_analysis_service as service
from engine_analysis import PrincipalVariationAnalysis


def test_hint_payload_exposes_proven_reply_and_line(monkeypatch):
    board = chess.Board()
    pv = PrincipalVariationAnalysis(
        moves=(chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5"), chess.Move.from_uci("g1f3")),
        score=18.0,
        depth=3,
        candidate_count=20,
    )
    monkeypatch.setattr(service, "principal_variation", lambda *_args, **_kwargs: pv)

    payload = service.build_hint_payload(board, 95)

    assert payload["from"] == "e2"
    assert payload["to"] == "e4"
    assert payload["san"] == "e4"
    assert payload["reply"]["from"] == "e7"
    assert payload["reply"]["to"] == "e5"
    assert [move["san"] for move in payload["line"]] == ["e4", "e5", "Nf3"]
    assert payload["analysisDepth"] == 3
    assert payload["candidateCount"] == 20


def test_hint_payload_falls_back_when_no_complete_pv_is_available(monkeypatch):
    board = chess.Board()
    suggestion = {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "captured": False}

    def timeout(*_args, **_kwargs):
        raise TimeoutError

    monkeypatch.setattr(service, "principal_variation", timeout)
    monkeypatch.setattr(service, "get_cpu_move", lambda *_args, **_kwargs: suggestion)

    assert service.build_hint_payload(board, 95) == suggestion
