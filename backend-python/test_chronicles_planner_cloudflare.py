import json

import chronicles_planner_cloudflare


async def _result(value):
    return value


def test_cloudflare_planner_parses_only_real_provider_json(monkeypatch):
    async def fake_generate(*args, **kwargs):
        assert args[0] == "chronicles_planner"
        assert args[1]["requested_areas"] == 1
        assert kwargs["request_kind"] == "chronicles_bootstrap"
        return {
            "provider": "cloudflare",
            "text": json.dumps(
                {
                    "version": 1,
                    "areas": {
                        "echo-cistern": {
                            "version": 1,
                            "source": "workers-ai",
                            "verbs": ["sluice", "guardian"],
                            "difficulty": 4,
                        }
                    },
                }
            ),
        }

    monkeypatch.setattr(chronicles_planner_cloudflare, "generate_narrative", fake_generate)
    payload = __import__("asyncio").run(
        chronicles_planner_cloudflare.request_chronicles_planner_snapshot(
            [
                {
                    "map_id": "echo-cistern",
                    "theme": "water",
                    "current_verbs": "sluice,guardian",
                    "difficulty": 3,
                    "allowed_verbs": "sluice,guardian",
                }
            ],
            request_id="chronicles:test",
        )
    )
    assert payload["areas"]["echo-cistern"]["source"] == "workers-ai"


def test_cloudflare_planner_discards_local_fallback_and_malformed_json(monkeypatch):
    responses = iter(
        (
            {"provider": "local", "text": "fallback"},
            {"provider": "cloudflare", "text": "not-json"},
        )
    )

    async def fake_generate(*_args, **_kwargs):
        return next(responses)

    monkeypatch.setattr(chronicles_planner_cloudflare, "generate_narrative", fake_generate)

    for _ in range(2):
        assert __import__("asyncio").run(
            chronicles_planner_cloudflare.request_chronicles_planner_snapshot(
                [{"map_id": "echo-cistern"}]
            )
        ) is None
