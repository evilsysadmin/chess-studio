import pytest

import narrative_cloudflare as provider
from matthias_register import REGISTER_EXEMPT_EVENTS, tuteo_markers, validate_matthias_register


@pytest.mark.parametrize("text", [
    "¿Seguro que no hiciste trampa? Tú sabrás.",
    "Revisa tus últimos errores tácticos.",
    "Eso te ha costado la dama.",
    "Has perdido material en la jugada 12.",
    "Si tienes ventaja, simplifica.",
    "Céntrate en la apertura.",
    "Nivel 3 y contigo, qué remedio.",
])
def test_detects_unequivocal_tuteo(text):
    assert tuteo_markers(text)


@pytest.mark.parametrize("text", [
    "Ha perdido material en la jugada 12. Revise la posición antes de volver a mover.",
    "Usted lleva blancas. Empieza usted; no malgaste el privilegio.",
    "Casi nunca pierde. Sospechosamente bien, la verdad: ¿seguro que no ha hecho trampa?",
    "Matthias revisa sus datos y le señala el problema que más merece atención.",
    "La CPU juega e5 y el caballo tiene pocas casillas.",
    "Eso ha sido bueno. Muy bueno.",
])
def test_accepts_usted_and_third_person(text):
    assert tuteo_markers(text) == []


def test_structured_or_third_person_events_are_exempt():
    for event in REGISTER_EXEMPT_EVENTS:
        assert validate_matthias_register("Revisa tus datos.", event) == (True, None)
    ok, marker = validate_matthias_register("Revisa tus datos.", "matthias_daily")
    assert not ok and marker.startswith("posesivo")


@pytest.mark.parametrize("facts", [
    {}, {"question_kind": "tactics"}, {"question_kind": "strengths"}, {"question_kind": "action"},
    {"question_kind": "openings"}, {"overall": {"losses": 1}}, {"overall": {"draws": 1}},
    {"game": {"difficulty": 3, "human_color": "white"}}, {"game": {"human_color": "white"}},
    {"game": {"human_color": "black"}}, {"played": "e4", "suggested": "d4", "loss_cp": 50},
])
@pytest.mark.parametrize("event", ["matthias_daily", "player_portrait", "game_opening_banter", "post_game_autopsy", "matthias_position", "generic"])
def test_deterministic_fallbacks_already_speak_usted(event, facts):
    assert tuteo_markers(provider._fallback(event, facts)) == []


@pytest.mark.parametrize("summary", [
    {},
    {"returnContext": {"days": 30}},
    {"returnContext": {"days": 30}, "nemesisOpening": {"name": "Siciliana", "games": 5, "win_pct": 20}},
    {"activeChallenge": {"id": "c1", "label": "Sin colgar piezas", "baseline_games": 0, "current_games": 1, "target_games": 3}},
    {"openDebt": {"status": "struggling"}},
    {"activeGoals": [{"label": "Revisar amenazas"}]},
    {"nemesisOpening": {"name": "Siciliana", "games": 5, "win_pct": 20}},
    {"mood": "annoyed"}, {"mood": "pleased"}, {"mood": "skeptical"}, {"mood": "impressed"},
    {"respect": {"tier": "respected"}},
    {"relationship": {"tier": "veteran"}},
])
def test_deterministic_briefings_speak_usted(summary):
    from matthias_memory_store import briefing_text_from_summary

    assert tuteo_markers(briefing_text_from_summary(summary)) == []
