import chess

import game_api


def _move_payload(from_square="e2", to="e4"):
    return {
        "from": from_square,
        "to": to,
        "san": "e4",
        "piece": "p",
        "promotion": None,
        "captured": False,
    }


def test_normal_game_routes_through_factual_difficulty_policy(monkeypatch):
    board = chess.Board()
    calls = []
    monkeypatch.setattr(
        game_api,
        "get_factual_difficulty_cpu_move",
        lambda _board, level: calls.append(("factual", level)) or _move_payload(),
    )
    monkeypatch.setattr(
        game_api,
        "get_cpu_move",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("legacy CPU should not serve a normal game")),
    )

    resolved = game_api.compute_engine_move_or_fallback(board, 20, None)

    assert resolved is not None
    assert resolved[0] == chess.Move.from_uci("e2e4")
    assert calls == [("factual", 20)]


def test_legacy_ghost_profiles_are_ignored_and_use_factual_matthias(monkeypatch):
    board = chess.Board()
    calls = []
    monkeypatch.setattr(
        game_api,
        "get_factual_difficulty_cpu_move",
        lambda _board, level: calls.append(("factual", level)) or _move_payload(),
    )
    monkeypatch.setattr(
        game_api,
        "get_cpu_move",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("retired ghost policy must not run")),
    )

    assert game_api.compute_engine_move_or_fallback(board, 20, {"capture": 1.0}) is not None
    assert game_api.compute_engine_move_or_fallback(board, 20, {"balance": True}) is not None
    assert calls == [("factual", 20), ("factual", 20)]
