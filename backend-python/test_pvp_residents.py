import chess

import pvp_residents as residents


def test_resident_profiles_use_calibrated_cpu_elo_anchors(monkeypatch):
    monkeypatch.setenv("CHESS_PVP_SPARRING_ENABLED", "true")
    assert [(row.username, row.rating) for row in residents.RESIDENTS] == [
        ("otto_falk", 850),
        ("marta_stein", 1200),
        ("viktor_kraus", 1450),
    ]

    seen = {}

    def fake_policy(board, level):
        seen["level"] = level
        return {"from": "e2", "to": "e4", "promotion": None}

    monkeypatch.setattr(residents, "get_factual_difficulty_cpu_move", fake_policy)
    move = residents.choose_move(chess.Board(), "marta_stein")

    assert seen["level"] == 45
    assert move == chess.Move.from_uci("e2e4")


def test_resident_move_falls_back_to_stable_legal_move(monkeypatch):
    monkeypatch.setenv("CHESS_PVP_SPARRING_ENABLED", "true")
    monkeypatch.setattr(
        residents,
        "get_factual_difficulty_cpu_move",
        lambda *_args, **_kwargs: {"from": "a1", "to": "a8"},
    )
    board = chess.Board()
    move = residents.choose_move(board, "otto_falk")
    assert move == sorted(board.legal_moves, key=lambda candidate: candidate.uci())[0]


def test_resident_identity_is_inert_when_staging_gate_is_off(monkeypatch):
    monkeypatch.delenv("CHESS_PVP_SPARRING_ENABLED", raising=False)
    assert residents.public_identity("marta_stein") == {}
    assert residents.choose_move(chess.Board(), "marta_stein") is None
