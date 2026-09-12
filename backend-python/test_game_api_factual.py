from fastapi import FastAPI
from fastapi.testclient import TestClient

import game_api


class _NoopLimiter:
    def limit(self, *_args, **_kwargs):
        return lambda function: function


async def _actor():
    return "test-user"


def _client():
    app = FastAPI()
    app.include_router(
        game_api.build_game_router(
            auth_dependency=_actor,
            compute_auth_dependency=_actor,
            limiter=_NoopLimiter(),
            has_valid_api_key=lambda _request: False,
            api_key_bucket=lambda _request: "test",
        )
    )
    return TestClient(app)


def test_analyze_move_uses_shared_factual_contract_for_valid_played_move(monkeypatch):
    seen = {}

    class FakeFactual:
        suggested = {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None}
        eval_after_suggested = 42.0

        def to_api_payload(self):
            return {
                "suggested": self.suggested,
                "played": {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None},
                "suggestedReply": {"from": "d7", "to": "d5", "san": "d5", "piece": "p", "promotion": None},
                "playedReply": {"from": "e7", "to": "e5", "san": "e5", "piece": "p", "promotion": None},
                "evalAfterSuggested": 42.0,
                "evalAfterPlayed": 17.0,
                "loss": 25.0,
                "analysisDepth": 2,
                "candidateCount": 20,
            }

    def fake_factual(board, played_move, *, level):
        seen["fen"] = board.fen()
        seen["played"] = played_move.uci()
        seen["level"] = level
        return FakeFactual()

    monkeypatch.setattr(game_api, "build_factual_move_analysis", fake_factual)
    monkeypatch.setattr(game_api, "maybe_schedule_move_shadow", lambda *_args, **_kwargs: None)

    response = _client().post(
        "/api/analyze-move",
        json={
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "from": "e2",
            "to": "e4",
            "level": 45,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert seen["played"] == "e2e4"
    assert seen["level"] == 45
    assert body["suggested"]["san"] == "d4"
    assert body["played"]["san"] == "e4"
    assert body["suggestedReply"]["san"] == "d5"
    assert body["playedReply"]["san"] == "e5"
    assert body["evalAfterSuggested"] == 42.0
    assert body["evalAfterPlayed"] == 17.0
    assert body["loss"] == 25.0
    assert body["analysisDepth"] == 2
    assert body["candidateCount"] == 20


def test_analyze_move_falls_back_cleanly_when_factual_budget_times_out(monkeypatch):
    monkeypatch.setattr(
        game_api,
        "build_factual_move_analysis",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(TimeoutError()),
    )
    monkeypatch.setattr(
        game_api,
        "ai_analyze_move",
        lambda *_args, **_kwargs: {
            "move": {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None},
            "score": 30.0,
        },
    )
    monkeypatch.setattr(game_api, "evaluate_board", lambda _board: 5.0)
    monkeypatch.setattr(game_api, "maybe_schedule_move_shadow", lambda *_args, **_kwargs: None)

    response = _client().post(
        "/api/analyze-move",
        json={
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "from": "e2",
            "to": "e4",
            "level": 45,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "suggested": {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None},
        "evalAfterSuggested": 30.0,
        "evalAfterPlayed": 5.0,
    }


def test_analyze_move_invalid_played_move_keeps_legacy_null_eval(monkeypatch):
    factual_called = False

    def unexpected_factual(*_args, **_kwargs):
        nonlocal factual_called
        factual_called = True
        raise AssertionError("invalid played move must not enter factual analysis")

    monkeypatch.setattr(game_api, "build_factual_move_analysis", unexpected_factual)
    monkeypatch.setattr(
        game_api,
        "ai_analyze_move",
        lambda *_args, **_kwargs: {
            "move": {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None},
            "score": 30.0,
        },
    )
    monkeypatch.setattr(game_api, "maybe_schedule_move_shadow", lambda *_args, **_kwargs: None)

    response = _client().post(
        "/api/analyze-move",
        json={
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "from": "e2",
            "to": "e5",
            "level": 45,
        },
    )

    assert response.status_code == 200
    assert factual_called is False
    assert response.json()["evalAfterPlayed"] is None
