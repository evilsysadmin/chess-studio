import narrative_cloudflare as provider


def test_opening_banter_uses_background_ai_budget_without_slowing_move_comments(monkeypatch):
    monkeypatch.delenv("CF_AI_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("CF_AI_COMMENT_TIMEOUT_SECONDS", raising=False)

    assert "game_opening_banter" in provider.RICH_ANALYSIS_EVENT_TYPES
    assert provider._circuit_channel("game_opening_banter") == "analysis"
    assert provider._timeout_seconds(provider._circuit_channel("game_opening_banter")) == 5.0

    assert provider._circuit_channel("blunder") == "comments"
    assert provider._timeout_seconds("comments") == 2.0


def _facts(level=50):
    return {"game": {"difficulty": level, "human_color": "white", "mode": "standard"}}


def test_opening_banter_contract_rejects_foreign_script_and_invented_level():
    ok, reason = provider.validate_opening_banter_contract(
        "¡Vaya, otra vez con el难度 11? ¿Te crees en un torneo internacional?",
        _facts(50),
    )
    assert ok is False
    assert reason == "foreign_script"

    ok, reason = provider.validate_opening_banter_contract("¿Nivel 11 otra vez? Valiente decisión.", _facts(50))
    assert ok is False
    assert reason == "difficulty"


def test_opening_banter_contract_accepts_only_grounded_numbers():
    assert provider.validate_opening_banter_contract("Nivel 50. Tú con blancas; empieza el interrogatorio.", _facts(50)) == (True, None)
    assert provider.validate_opening_banter_contract("Nivel 50 y 17 excusas preparadas.", _facts(50)) == (False, "invented_number")


def test_opening_banter_has_a_specific_grounded_fallback():
    text = provider._fallback("game_opening_banter", _facts(50))
    assert "Nivel 50" in text
    assert "Siguiente paso" not in text


def _calibrated_facts(level=0):
    return {"game": {"difficulty": level, "difficulty_source": "calibration", "human_color": "white", "mode": "standard"}}


def test_opening_banter_rechaza_signos_de_apertura_sin_cerrar():
    # #4409: «¡Vaya, el nivel 0 otra vez. Qué cómodo.»
    assert provider.validate_opening_banter_contract("¡Vaya, el nivel 50 otra vez. Qué cómodo.", _facts(50)) == (False, "unbalanced_marks")
    assert provider.validate_opening_banter_contract("¿Blancas otra vez. Valiente.", _facts(50)) == (False, "unbalanced_marks")
    assert provider.validate_opening_banter_contract("¡Vaya! ¿Blancas otra vez? Valiente.", _facts(50)) == (True, None)


def test_opening_banter_no_se_burla_del_nivel_que_fijo_la_calibracion():
    assert provider.validate_opening_banter_contract("Nivel 0 otra vez. Qué cómodo.", _calibrated_facts(0)) == (False, "calibrated_level")
    assert provider.validate_opening_banter_contract("El nivel de siempre, qué cómodo.", _calibrated_facts(0)) == (False, "calibrated_level")
    assert provider.validate_opening_banter_contract("Usted con blancas. Empiece, bitte.", _calibrated_facts(0)) == (True, None)


def test_opening_banter_fallback_calibrado_no_cita_el_nivel():
    for color in ("white", "black"):
        facts = _calibrated_facts(0)
        facts["game"]["human_color"] = color
        text = provider._fallback("game_opening_banter", facts)
        assert "Nivel 0" not in text
        assert provider.validate_opening_banter_contract(text, facts) == (True, None)
