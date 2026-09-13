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
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("legacy CPU should not serve a normal low-level game")),
    )

    resolved = game_api.compute_engine_move_or_fallback(board, 20, None)

    assert resolved is not None
    assert resolved[0] == chess.Move.from_uci("e2e4")
    assert calls == [("factual", 20)]


def test_ghost_and_balanced_profiles_keep_their_existing_paths(monkeypatch):
    board = chess.Board()
    calls = []
    monkeypatch.setattr(
        game_api,
        "get_factual_difficulty_cpu_move",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("factual normal policy leaked into a profile mode")),
    )
    monkeypatch.setattr(
        game_api,
        "get_cpu_move",
        lambda _board, level, style=None: calls.append(("ghost", level, style)) or _move_payload(),
    )
    monkeypatch.setattr(
        game_api,
        "get_balanced_cpu_move",
        lambda _board, level, style=None: calls.append(("balanced", level, style)) or _move_payload(),
    )

    ghost = {"capture": 1.0}
    balanced = {"balance": True}
    assert game_api.compute_engine_move_or_fallback(board, 20, ghost) is not None
    assert game_api.compute_engine_move_or_fallback(board, 20, balanced) is not None
    assert calls == [
        ("ghost", 20, ghost),
        ("balanced", 20, balanced),
    ]
