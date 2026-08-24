import asyncio
import hashlib
import hmac
import json
import logging

import pytest
import narrative_cloudflare as provider


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
    def json(self): return self._payload

class FakeClient:
    def __init__(self, response):
        self.response = response
        self.request = None
        self.calls = 0
    async def post(self, url, *, content, headers):
        self.calls += 1
        self.request = {"url": url, "content": content, "headers": headers}
        return self.response


def setup_function():
    provider.reset_ai_metrics()
    provider.reset_ai_circuit_breaker()


def test_signature_is_hmac_sha256_over_exact_body():
    secret = "secret"; timestamp = "1760000000"; body = b'{"facts":{"san":"Qh7#"}}'
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    assert provider.sign_request(secret, timestamp, body) == f"sha256={expected}"


def test_payload_is_canonical_and_facts_are_bounded():
    payload = provider.build_payload("blunder", {"san":"Q??", "long":"x"*1000, "list":list(range(30)), "nan": float('nan')})
    decoded = json.loads(provider.canonical_json(payload))
    assert decoded["event_type"] == "blunder"
    assert len(decoded["facts"]["long"]) == provider.MAX_FACT_STRING
    assert len(decoded["facts"]["list"]) == provider.MAX_FACT_ARRAY
    assert decoded["facts"]["nan"] is None


def test_default_tone_is_shared_friendly_sarcasm():
    payload = provider.build_payload("blunder", {"san": "Qd4"})
    assert payload["tone"] == "friendly_sarcastic"


def test_missing_cloud_configuration_uses_local_fallback(monkeypatch):
    monkeypatch.delenv("CF_AI_WORKER_URL", raising=False)
    monkeypatch.delenv("CHESS_AI_SHARED_SECRET", raising=False)
    result = asyncio.run(provider.generate_narrative("blunder", {"san":"Qd4"}))
    assert result["provider"] == "local"
    assert "Qd4" in result["text"]
    metrics = provider.get_ai_metrics()
    assert metrics["local_fallback"] == 1
    assert metrics["reasons"]["not_configured"] == 1


def test_cloud_success_is_used_signed_and_measured(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev/")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "a"*64)
    client = FakeClient(FakeResponse(200, {
        "ok": True,
        "text": "  Magnífico desastre.  ",
        "model": "@cf/meta/llama-3.2-3b-instruct",
        "usage": {"inputTokens": 120, "outputTokens": 18},
    }))
    result = asyncio.run(provider.generate_narrative("blunder", {"san":"Qd4"}, request_kind="default", client=client))
    assert result["provider"] == "cloudflare"
    assert result["text"] == "Magnífico desastre."
    assert client.request["url"].endswith("/narrative")
    assert client.request["headers"]["x-chess-ai-signature"].startswith("sha256=")
    metrics = provider.get_ai_metrics()
    assert metrics["cloudflare"] == 1
    assert metrics["cloudflare_percent"] == 100.0
    assert metrics["cloudflare_p50_ms"] is not None
    assert metrics["usage"]["input_tokens"] == 120
    assert metrics["usage"]["output_tokens"] == 18
    assert metrics["usage"]["estimated_neurons"] > 0
    assert metrics["models"]["@cf/meta/llama-3.2-3b-instruct"] == 1
    assert metrics["request_kinds"]["default"] == 1


def test_cloud_failure_never_breaks_game(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "b"*64)
    result = asyncio.run(provider.generate_narrative("generic", {"piece":"knight"}, client=FakeClient(FakeResponse(502, {"ok":False}))))
    assert result["provider"] == "local"
    assert result["text"]
    assert provider.get_ai_metrics()["reasons"]["http_502"] == 1


def test_worker_error_code_is_preserved_for_diagnostics(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "b" * 64)
    outcome = asyncio.run(
        provider.request_cloud_narrative(
            "player_portrait",
            {"total_games": 8},
            client=FakeClient(FakeResponse(502, {"ok": False, "error": "empty_provider_response"})),
        )
    )
    assert outcome.reason == "http_502"
    assert outcome.worker_error == "empty_provider_response"

def test_worker_provider_error_name_and_code_are_preserved_for_render_logs(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "b" * 64)
    outcome = asyncio.run(
        provider.request_cloud_narrative(
            "player_portrait",
            {"total_games": 8},
            client=FakeClient(FakeResponse(502, {
                "ok": False,
                "error": "provider_failure",
                "error_name": "AiError",
                "error_code": "7000",
            })),
        )
    )
    assert outcome.worker_error == "provider_failure:AiError:7000"


def test_sensitive_fact_keys_are_removed_before_cloud_request(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "c" * 64)

    client = FakeClient(FakeResponse(200, {"ok": True, "text": "Queda registrado."}))
    asyncio.run(
        provider.generate_narrative(
            "generic",
            {
                "san": "e4",
                "email": "private@example.com",
                "jwtToken": "super-secret",
                "nested": {"authorization": "Bearer nope", "safe": "ok"},
            },
            client=client,
        )
    )

    body = json.loads(client.request["content"])
    assert body["facts"]["san"] == "e4"
    assert "email" not in body["facts"]
    assert "jwtToken" not in body["facts"]
    assert "authorization" not in body["facts"]["nested"]
    assert body["facts"]["nested"]["safe"] == "ok"


def test_ungrounded_piece_claim_from_model_falls_back(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "d" * 64)

    client = FakeClient(FakeResponse(200, {"ok": True, "text": "Has regalado la dama con entusiasmo."}))
    result = asyncio.run(
        provider.generate_narrative("generic", {"san": "e4"}, client=client)
    )

    assert result["provider"] == "local"
    assert "dama" not in result["text"].lower()
    metrics = provider.get_ai_metrics()
    assert metrics["reasons"].get("ungrounded_dama", 0) >= 1


def test_grounded_piece_claim_is_allowed(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "e" * 64)

    client = FakeClient(FakeResponse(200, {"ok": True, "text": "La dama acaba de pagar la factura."}))
    result = asyncio.run(
        provider.generate_narrative("blunder", {"san": "Qxd4", "lost_piece": "queen"}, client=client)
    )

    assert result["provider"] == "cloudflare"
    assert "dama" in result["text"].lower()




def test_player_portrait_accepts_only_grounded_profile_claims(monkeypatch):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "p" * 64)

    client = FakeClient(FakeResponse(200, {"ok": True, "text": "Has ganado 6 partidas y tu rating ha subido, así que algo estás haciendo bien. El problema principal todavía necesita más muestra; por una vez no voy a inventarme el incendio. En las próximas partidas, revisa tus resultados antes de cambiar de plan."}))
    result = asyncio.run(
        provider.generate_narrative(
            "player_portrait",
            {"record": {"wins": 6, "losses": 4}, "rating_trend": {"delta": 80}},
            client=client,
        )
    )

    assert result["provider"] == "cloudflare"
    assert "rating" in result["text"].lower()


def test_kill_switch_skips_cloud_entirely(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "false")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "f" * 64)
    client = FakeClient(FakeResponse(200, {"ok": True, "text": "No debería ejecutarse"}))

    result = asyncio.run(provider.generate_narrative("generic", {"san": "e4"}, client=client))

    assert result["provider"] == "local"
    assert client.calls == 0
    metrics = provider.get_ai_metrics()
    assert metrics["enabled"] is False
    assert metrics["reasons"]["disabled"] == 1


def test_circuit_breaker_opens_after_consecutive_failures(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_RESET_SECONDS", "60")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "g" * 64)
    client = FakeClient(FakeResponse(502, {"ok": False}))

    first = asyncio.run(provider.request_cloud_narrative("generic", {}, client=client))
    second = asyncio.run(provider.request_cloud_narrative("generic", {}, client=client))
    third = asyncio.run(provider.request_cloud_narrative("generic", {}, client=client))

    assert first.reason == "http_502"
    assert second.reason == "http_502"
    assert third.reason == "circuit_open"
    assert client.calls == 2
    circuit = provider.get_ai_metrics()["circuit"]
    assert circuit["open"] is True
    assert circuit["consecutive_failures"] == 2
    assert circuit["open_count"] == 1


def test_portrait_circuit_failure_does_not_disable_move_comments(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_RESET_SECONDS", "60")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "g" * 64)

    portrait_fail = FakeClient(FakeResponse(502, {"ok": False, "error": "provider_failure"}))
    assert asyncio.run(provider.request_cloud_narrative("player_portrait", {}, client=portrait_fail)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("player_portrait", {}, client=portrait_fail)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("player_portrait", {}, client=portrait_fail)).reason == "circuit_open"

    comment_ok = FakeClient(FakeResponse(200, {"ok": True, "text": "Movimiento anotado."}))
    comment = asyncio.run(provider.request_cloud_narrative("generic", {"san": "e4"}, client=comment_ok))
    assert comment.reason == "ok"
    assert comment.text == "Movimiento anotado."
    circuit = provider.get_ai_metrics()["circuit"]
    assert circuit["channels"]["player_portrait"]["open"] is True
    assert circuit["channels"]["comments"]["open"] is False


def test_success_resets_consecutive_circuit_failures(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_FAILURES", "3")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "h" * 64)

    fail = FakeClient(FakeResponse(502, {"ok": False}))
    ok = FakeClient(FakeResponse(200, {"ok": True, "text": "Movimiento anotado."}))
    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=fail)).reason == "http_502"
    assert provider.get_ai_metrics()["circuit"]["consecutive_failures"] == 1

    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=ok)).reason == "ok"
    circuit = provider.get_ai_metrics()["circuit"]
    assert circuit["open"] is False
    assert circuit["consecutive_failures"] == 0


@pytest.mark.parametrize(
    ("text", "concept"),
    [
        ("Eso era jaque mate, artista.", "mate"),
        ("Un jaque muy fino para una posición tan triste.", "jaque"),
        ("La captura fue el principio del entierro.", "captura"),
        ("La torre también ha decidido abandonarte.", "torre"),
        ("El caballo contempla el incendio desde lejos.", "caballo"),
        ("Bonita apertura para semejante catástrofe.", "apertura"),
        ("Con ese ELO deberías saberlo.", "rating"),
        ("Otra victoria que se te escapa.", "victoria"),
        ("La racha empieza a oler a tragedia.", "racha"),
    ],
)
def test_aggressive_hallucinations_are_rejected(monkeypatch, text, concept):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "i" * 64)
    client = FakeClient(FakeResponse(200, {"ok": True, "text": text}))

    outcome = asyncio.run(provider.request_cloud_narrative("generic", {"san": "e4"}, client=client))

    assert outcome.text is None
    assert outcome.reason == f"ungrounded_{concept}"


def test_failed_half_open_probe_reopens_immediately(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_RESET_SECONDS", "5")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "j" * 64)

    clock = [100.0]
    monkeypatch.setattr(provider.time, "monotonic", lambda: clock[0])
    client = FakeClient(FakeResponse(502, {"ok": False}))

    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=client)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=client)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=client)).reason == "circuit_open"

    clock[0] += 6.0
    # One half-open probe is allowed and fails.
    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=client)).reason == "http_502"
    # It must re-open immediately rather than allowing another two failures.
    assert asyncio.run(provider.request_cloud_narrative("generic", {}, client=client)).reason == "circuit_open"
    assert client.calls == 3


def test_player_portrait_transport_keeps_more_than_420_chars_and_trims_at_sentence(monkeypatch):
    import narrative_cloudflare as nc

    long_text = ("Primera frase con contexto. " * 20) + "Cierre completo."
    assert len(long_text) > 420
    assert nc._trim_complete_output(long_text, nc._max_output_chars("player_portrait")) == long_text

    too_long = ("Una frase razonablemente completa. " * 40) + "cola sin terminar"
    trimmed = nc._trim_complete_output(too_long, nc._max_output_chars("player_portrait"))
    assert len(trimmed) <= nc.PLAYER_PORTRAIT_MAX_OUTPUT_CHARS
    assert trimmed.endswith(".") or trimmed.endswith("…")
    assert not trimmed.endswith(" e")


def test_ai_provider_emits_operational_logs_without_payload_data(monkeypatch, caplog):
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "z" * 64)
    caplog.set_level(logging.INFO, logger="uvicorn.error")

    success = FakeClient(FakeResponse(200, {
        "ok": True,
        "text": "Movimiento anotado.",
        "model": "@cf/meta/llama-3.2-3b-instruct",
        "usage": {"inputTokens": 10, "outputTokens": 4},
    }))
    asyncio.run(provider.generate_narrative("generic", {"san": "e4", "private_marker": "DO_NOT_LOG"}, client=success))

    failure = FakeClient(FakeResponse(502, {"ok": False, "error": "empty_provider_response"}))
    asyncio.run(provider.generate_narrative("player_portrait", {"total_games": 8, "private_marker": "DO_NOT_LOG"}, client=failure))

    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "workers_ai_ok request_id=- event_type=generic" in text
    assert "model=@cf/meta/llama-3.2-3b-instruct" in text
    assert "workers_ai_fallback request_id=- event_type=player_portrait" in text
    assert "worker_error=empty_provider_response" in text
    assert "DO_NOT_LOG" not in text



def test_training_plan_is_a_rich_analysis_event():
    assert "training_plan" in provider.RICH_ANALYSIS_EVENT_TYPES
    assert provider._circuit_channel("training_plan") == "analysis"
    assert provider._max_output_chars("training_plan") == provider.RICH_ANALYSIS_MAX_OUTPUT_CHARS

def test_rich_analysis_uses_separate_circuit_channel(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_FAILURES", "2")
    monkeypatch.setenv("AI_NARRATIVE_CIRCUIT_RESET_SECONDS", "60")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "k" * 64)

    analysis_fail = FakeClient(FakeResponse(502, {"ok": False, "error": "provider_failure"}))
    assert asyncio.run(provider.request_cloud_narrative("post_game_autopsy", {}, client=analysis_fail)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("post_game_autopsy", {}, client=analysis_fail)).reason == "http_502"
    assert asyncio.run(provider.request_cloud_narrative("post_game_autopsy", {}, client=analysis_fail)).reason == "circuit_open"

    portrait_ok = FakeClient(FakeResponse(200, {"ok": True, "text": "Has completado 8 partidas y ya hay una muestra aprovechable. Todavía hay poco detalle para señalar una catástrofe concreta, milagrosamente. En las próximas partidas, revisa tus errores repetidos antes de cambiar de plan."}))
    portrait = asyncio.run(provider.request_cloud_narrative("player_portrait", {"total_games": 8}, client=portrait_ok))
    assert portrait.reason == "ok"
    circuit = provider.get_ai_metrics()["circuit"]
    assert circuit["channels"]["analysis"]["open"] is True
    assert circuit["channels"]["player_portrait"]["open"] is False
    assert circuit["channels"]["comments"]["open"] is False


def test_player_portrait_rejects_theatrical_letter_and_falls_back(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "m" * 64)
    bad = (
        "Saludos, estimado y nunca bien ponderado evilsysadmin. "
        "Verá usted, una horquilla de caballo me tiene profundamente intrigado. "
        "Quedo a la espera de su infinita sabiduría para resolver semejante asunto."
    )
    client = FakeClient(FakeResponse(200, {"ok": True, "text": bad}))

    result = asyncio.run(provider.generate_narrative(
        "player_portrait",
        {"total_games": 12, "record": {"wins": 6, "losses": 6}},
        request_kind="portrait_manual",
        client=client,
    ))

    assert result["provider"] == "local"
    metrics = provider.get_ai_metrics()
    assert any(key.startswith("portrait_contract_rejected:") for key in metrics["reasons"])


def test_player_portrait_requires_three_grounded_sentences_and_action(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "n" * 64)
    good = (
        "Has ganado 7 de 12 partidas, así que el tablero no te tiene completamente fichado. "
        "Tus datos aún no justifican inventar una debilidad distinta, cosa que te ahorra una humillación gratuita. "
        "En las próximas partidas, revisa tus incidentes repetidos antes de cambiar de plan."
    )
    client = FakeClient(FakeResponse(200, {"ok": True, "text": good}))
    outcome = asyncio.run(provider.request_cloud_narrative(
        "player_portrait", {"total_games": 12, "record": {"wins": 7, "losses": 5}}, client=client
    ))
    assert outcome.reason == "ok"
    assert outcome.text == good


def test_request_id_is_signed_through_to_worker_payload(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "o" * 64)
    client = FakeClient(FakeResponse(200, {"ok": True, "text": "Movimiento anotado."}))
    outcome = asyncio.run(provider.request_cloud_narrative(
        "generic", {"san": "e4"}, request_id="web-test-abc123", client=client
    ))
    assert outcome.reason == "ok"
    sent = json.loads(client.request["content"].decode("utf-8"))
    assert sent["request_id"] == "web-test-abc123"


def test_rich_analysis_transport_keeps_long_compact_output(monkeypatch):
    monkeypatch.setenv("AI_NARRATIVE_ENABLED", "true")
    monkeypatch.setenv("CF_AI_WORKER_URL", "https://example.workers.dev")
    monkeypatch.setenv("CHESS_AI_SHARED_SECRET", "l" * 64)
    long_text = "Diagnóstico útil. " * 30
    client = FakeClient(FakeResponse(200, {"ok": True, "text": long_text}))
    outcome = asyncio.run(provider.request_cloud_narrative("observability_summary", {"api_requests": 100}, client=client))
    assert outcome.reason == "ok"
    assert len(outcome.text) > 420
    assert len(outcome.text) <= provider.RICH_ANALYSIS_MAX_OUTPUT_CHARS

def test_player_portrait_action_detector_accepts_natural_spanish_variants():
    facts = {"total_games": 12, "record": {"wins": 7, "losses": 5}}
    variants = [
        "Has ganado 7 de 12 partidas y eso es una base real. El problema principal sigue siendo medible, no una tragedia griega. En las próximas partidas, mejora la revisión antes de mover.",
        "Has ganado 7 de 12 partidas y eso es una base real. El problema principal sigue siendo medible, no una tragedia griega. En las próximas partidas, repasa tus errores repetidos antes de cambiar de plan.",
        "Has ganado 7 de 12 partidas y eso es una base real. El problema principal sigue siendo medible, no una tragedia griega. En las próximas partidas, fíjate en el patrón repetido antes de acelerar.",
    ]
    for text in variants:
        assert provider.validate_player_portrait_contract(text, facts) == (True, None)


def test_rich_channels_default_to_bounded_five_second_budget(monkeypatch):
    monkeypatch.delenv("CF_AI_TIMEOUT_SECONDS", raising=False)
    assert provider._timeout_seconds("player_portrait") == 5.0
    assert provider._timeout_seconds("analysis") == 5.0


def test_comment_channel_has_hard_two_second_budget_and_fast_circuit(monkeypatch):
    monkeypatch.delenv("CF_AI_COMMENT_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("AI_NARRATIVE_COMMENT_CIRCUIT_FAILURES", raising=False)
    monkeypatch.delenv("AI_NARRATIVE_COMMENT_CIRCUIT_RESET_SECONDS", raising=False)
    assert provider._timeout_seconds("comments") == 2.0
    assert provider._circuit_failure_threshold_for("comments") == 3
    assert provider._circuit_reset_seconds_for("comments") == 60.0
