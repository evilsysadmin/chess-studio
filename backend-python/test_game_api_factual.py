from fastapi import FastAPI
from fastapi.testclient import TestClient

import game_api
import move_analysis_service as service


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

    def fake_factual(board, played_move, *, level, max_depth):
        seen["fen"] = board.fen()
        seen["played"] = played_move.uci()
        seen["level"] = level
        seen["max_depth"] = max_depth
        return FakeFactual()

    monkeypatch.setattr(service, "build_factual_move_analysis", fake_factual)
    monkeypatch.setattr(service, "evaluate_board", lambda _board: 19.0)
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
    assert seen["max_depth"] == 6
    assert body["suggested"]["san"] == "d4"
    assert body["played"]["san"] == "e4"
    assert body["suggestedReply"]["san"] == "d5"
    assert body["playedReply"]["san"] == "e5"
    assert body["evalAfterSuggested"] == 42.0
    assert body["evalAfterPlayed"] == 19.0
    assert body["factualEvalAfterSuggested"] == 42.0
    assert body["factualEvalAfterPlayed"] == 17.0
    assert body["loss"] == 25.0
    assert body["analysisDepth"] == 2
    assert body["candidateCount"] == 20


def test_analyze_move_falls_back_cleanly_when_factual_budget_times_out(monkeypatch):
    monkeypatch.setattr(
        service,
        "build_factual_move_analysis",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(TimeoutError()),
    )
    monkeypatch.setattr(
        service,
        "deterministic_analyze_move",
        lambda *_args, **_kwargs: {
            "move": {"from": "d2", "to": "d4", "san": "d4", "piece": "p", "promotion": None},
            "score": 30.0,
        },
    )
    monkeypatch.setattr(service, "evaluate_board", lambda _board: 5.0)
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

    monkeypatch.setattr(service, "build_factual_move_analysis", unexpected_factual)
    monkeypatch.setattr(
        service,
        "deterministic_analyze_move",
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


def test_analyze_keeps_legacy_shape_without_candidate_limit(monkeypatch):
    suggestion = {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None, "captured": False}
    monkeypatch.setattr(game_api, "get_cpu_move", lambda *_args, **_kwargs: suggestion)
    monkeypatch.setattr(
        game_api,
        "factual_candidate_payloads_for_level",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("shortlist must stay opt-in")),
    )

    response = _client().post(
        "/api/analyze",
        json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "level": 50},
    )

    assert response.status_code == 200
    assert response.json() == suggestion


def test_analyze_skips_candidate_search_when_only_one_legal_move_exists(monkeypatch):
    suggestion = {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None, "captured": False}

    class OneLegalMoves:
        def count(self):
            return 1

    class ForcedBoard:
        legal_moves = OneLegalMoves()

        def is_game_over(self, claim_draw=True):
            return False

    monkeypatch.setattr(game_api, "board_from_valid_fen", lambda _fen: ForcedBoard())
    monkeypatch.setattr(game_api, "get_cpu_move", lambda *_args, **_kwargs: suggestion)
    monkeypatch.setattr(
        game_api,
        "factual_candidate_payloads_for_level",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("one legal move has no shortlist to rank")),
    )

    response = _client().post(
        "/api/analyze",
        json={
            "fen": "forced-position",
            "level": 70,
            "candidateLimit": 5,
        },
    )

    assert response.status_code == 200
    assert response.json() == suggestion


def test_analyze_adds_bounded_candidates_when_requested(monkeypatch):
    seen = {}
    suggestion = {"from": "e2", "to": "e4", "san": "e4", "piece": "p", "promotion": None, "captured": False}
    candidates = [{**suggestion, "moveKey": "e2e4", "chessScoreCp": 18.0, "isLegal": True, "isMate": False}]
    monkeypatch.setattr(game_api, "get_cpu_move", lambda *_args, **_kwargs: suggestion)

    def fake_candidates(_board, level, limit):
        seen.update(level=level, limit=limit)
        return candidates

    monkeypatch.setattr(game_api, "factual_candidate_payloads_for_level", fake_candidates)
    response = _client().post(
        "/api/analyze",
        json={
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "level": 70,
            "candidateLimit": 5,
        },
    )

    assert response.status_code == 200
    assert seen == {"level": 70, "limit": 5}
    assert response.json() == {**suggestion, "candidates": candidates}
