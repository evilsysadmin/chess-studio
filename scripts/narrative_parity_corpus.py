#!/usr/bin/env python3
"""Cross-language parity corpus for the narrative gateway.

backend-python/narrative_cloudflare.py signs a sanitized dossier for the
Workers AI narrative Worker and fails closed on anything the model returns
outside its contracts: grounding, the player portrait and Matthias' daily
shapes, the opening banter and the "usted" register. This records Python's
own answers (the exact signed bytes, the local fallbacks, the output trim
and every validator verdict) over generated dossiers and model outputs;
backend-go/internal/narrative must agree.

    python3 scripts/narrative_parity_corpus.py           # rewrite the fixture
    python3 scripts/narrative_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))
os.environ.pop("MONGO_URL", None)

import narrative_cloudflare as nc  # noqa: E402
from matthias_register import validate_matthias_register  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "narrative" / "testdata" / "python_narrative_corpus.json"
SEED = 20261008
SECRET = "corpus-secret-ñ"

EVENTS = [
    "blunder", "mistake", "catastrophic_blunder", "brilliant", "tactic", "great_move", "generic", "check",
    "matthias_position", "matthias_daily", "player_portrait", "unit_bio", "game_opening_banter",
    "post_game_autopsy", "combat_briefing", "training_plan", "personal_puzzle_batch", "chronicles_planner",
    "observability_summary", "", "e" * 60,
]
OPENINGS = ["Siciliana", "Italiana", "Gambito de dama", "Caro-Kann", "  Francesa  "]
KEYS = ["san", "result", "played", "suggested", "loss_cp", "question_kind", "overall", "game", "fen", "openings",
        "favorite_opening", "total_games", "record", "password", "Session-Id", "user_email", "api-key", "notes",
        "k" * 70, "", "piece", "elo", "streak"]


def scalar(rng: random.Random):
    return rng.choice([
        0, 1, 3, 7, 12, 40, 250, 520, -4, 2**40, 1.5, 0.25, 33.333333333333336, 1e-05, 1e16, 2.0, 100.0,
        True, False, None,
        "", "e4", "Qxd5+", "Nf3", "1-0", "½-½", "tablas", "mate en 2", "línea\nnueva\ttab", "ctrl\x01\x1fchar",
        "x" * 250, "ñandú ♞ 象棋", OPENINGS[rng.randrange(len(OPENINGS))],
    ])


def value(rng: random.Random, depth: int = 0):
    kind = rng.random()
    if depth >= 5 or kind < 0.6:
        return scalar(rng)
    if kind < 0.8:
        return [value(rng, depth + 1) for _ in range(rng.choice([0, 1, 3, 3, 14]))]
    width = rng.choice([0, 2, 3, 3, 35]) if depth == 0 else rng.choice([0, 1, 2, 3])
    return {rng.choice(KEYS) if width < 30 else f"k{i:02d}": value(rng, depth + 1) for i in range(width)}


def facts(rng: random.Random, event: str) -> dict:
    f = {rng.choice(KEYS): value(rng) for _ in range(rng.randint(0, 8))}
    if event in {"blunder", "brilliant", "generic", "mistake"} and rng.random() < 0.6:
        f["san"] = rng.choice(["Qxd5", "e4", "", 5, "O-O"])
    if rng.random() < 0.3:
        f["result"] = rng.choice(["1-0", "0-1", "", None])
    if event == "matthias_position":
        f.update({"played": rng.choice(["Qxd5", "", None]), "suggested": rng.choice(["Nf3", None]),
                  "loss_cp": rng.choice([250, 87.6, None, "300", True])})
    if event == "matthias_daily":
        f["question_kind"] = rng.choice(["tactics", "strengths", "action", "openings", "improve", "weird", None])
        f["total_games"] = rng.choice([12, 40, 7])
        f["record"] = {"wins": rng.choice([5, 9]), "losses": rng.choice([3, 4]), "draws": 1}
    if event == "player_portrait":
        f["overall"] = rng.choice([{"losses": 3, "draws": 1}, {"losses": 0, "draws": 2}, {"losses": 0, "draws": 0}, "x", {"losses": "2"}])
    if event in {"player_portrait", "matthias_daily"} and rng.random() < 0.8:
        f["openings"] = [{"name": rng.choice(OPENINGS), "games": rng.randint(1, 20), "win_pct": rng.choice([25, 50.5, 33.3])} for _ in range(rng.randint(0, 3))]
        f["favorite_opening"] = rng.choice([{"name": "Siciliana"}, {"name": 4}, None])
    if event == "game_opening_banter":
        f["game"] = rng.choice([
            {"difficulty": rng.choice([3, 5, 7.0, 7.4, 7.46, 3.14159, 2.25, 2.5, None, True, "5"]), "human_color": rng.choice(["white", "black", None])},
            {"difficulty": 6, "difficulty_source": "calibration", "human_color": rng.choice(["white", "black"])},
            "x", None,
        ])
    return f


SENTENCES = [
    "Achtung, su dama sigue colgando.", "Ha ganado 9 partidas y perdido 4.", "La Siciliana le cuesta caro.",
    "Revise jaques, capturas y amenazas antes de mover.", "Bitte, compare dos candidatas en la próxima partida.",
    "Tú sabes que puedes hacerlo mejor.", "Te conviene revisar tus aperturas.", "Has jugado demasiado rápido.",
    "Has visto la torre colgando?", "Céntrate en el centro.", "Saludos cordiales, estimado jugador.",
    "Nivel 5 y usted con blancas.", "¡Vaya, el nivel 3 otra vez.", "Qué dificultad tan cómoda.",
    "Le he calibrado yo mismo.", "El caballo saltó a f7 con jaque.", "Un mate en 2 que nadie vio.",
    "Su racha de 3 victorias impresiona.", "Su elo subió 120 puntos.", "Promoción a dama en la séptima.",
    "Tablas por repetición, qué emoción…", "Enroque largo, valiente.", "Ahogado: la ventaja se evaporó!",
    "Apertura Italiana, como siempre.", "这是中文.", "Мат в два хода.", "Evite regalar el alfil.",
    "Practique finales de peones durante 10 minutos.", "Le quedan 33,3 puntos de ventaja.", "Tiene 2.5 ventaja.",
    "- lista con guión.", "```code```", "CPU: hola.", "Narrador: había una vez.", "by the way, mueva.",
    "Como IA no opino.", "Debería entrenar la defensa siciliana.", "La partida 12a fue rara.", "Juegue 1.e4!",
    "Usted tiene ti en la mano.", "Mire a tus pies.", "Quedo a la espera de su jugada.", "Verá usted, el peón.",
    "Haga la jugada y respire.", "Contigo no se puede.", "Has convertido la ventaja.", "Has argüido mal.",
    "Nivelito de principiante.", "Has ido demasiado lejos.", "Has hecho bien.", "HAS VISTO el alfil.", "Dificultad 7 hoy.", "Nivel 1234 no existe.", "niveles 3 y 4.",
]


GOOD_OPENERS = [
    "Ha ganado 9 partidas y perdido 4 en total.", "La Siciliana le cuesta demasiadas derrotas seguidas.",
    "Sus 12 partidas dejan un patrón bastante claro.", "Con la Italiana suma un 50,5 % de victorias.",
    "Achtung: 40 partidas y la dama sigue sufriendo.",
]
GOOD_MIDDLES = [
    "El problema aparece siempre en el medio juego, cuando acelera.", "No es mala suerte: es un hábito medible.",
    "Bitte, deje de regalar tiempo en las aperturas.",
]
GOOD_ENDINGS = [
    "En la próxima partida revise jaques antes de mover.", "Practique finales de peones durante 10 minutos.",
    "Debería comparar dos candidatas antes de cada jugada crítica.", "Mantenga la calma y calcule.",
    "Juegue rápido y sin pensar.",
]


def model_text(rng: random.Random) -> str:
    if rng.random() < 0.35:
        parts = [rng.choice(GOOD_OPENERS), rng.choice(GOOD_MIDDLES), rng.choice(GOOD_ENDINGS)]
        if rng.random() < 0.3:
            parts = parts[:2] if rng.random() < 0.5 else parts + [rng.choice(GOOD_MIDDLES)]
        return " ".join(parts)
    parts = rng.sample(SENTENCES, rng.choice([1, 2, 3, 3, 4]))
    text = " ".join(parts)
    if rng.random() < 0.2:
        text = "  " + text.replace(" ", "   \n", 2) + "  "
    if rng.random() < 0.1:
        text = text * rng.choice([3, 8])
    return text


def guarded(fn):
    try:
        return fn()
    except Exception as exc:  # Go must refuse the same inputs
        return {"error": type(exc).__name__}


def build() -> dict:
    rng = random.Random(SEED)
    cases = []
    for i in range(470):
        event = rng.choice(EVENTS) if i < 420 else "game_opening_banter"
        f = facts(rng, event) if i < 420 else {"game": facts(rng, event).get("game")}
        tone = rng.choice(["friendly_sarcastic", "", "t" * 40, None])
        locale = rng.choice(["es-ES", "", "l" * 20, None])
        request_id = rng.choice([None, "", "req-123", "bad id!/ñ" * 12])
        text = model_text(rng)
        limit = rng.choice([420, 900, 3200, 60, 75])
        payload = nc.build_payload(event, f, tone=tone, locale=locale, request_id=request_id)
        body = guarded(lambda: nc.canonical_json(payload).decode("utf-8"))
        case = {
            "event": event, "facts": f, "tone": tone, "locale": locale, "request_id": request_id, "text": text, "limit": limit,
            "body": body,
            "signature": nc.sign_request(SECRET, "1790000000", body.encode("utf-8")) if isinstance(body, str) else None,
            "fallback": guarded(lambda: nc._fallback(event, f)),
            "trim": nc._trim_complete_output(text, limit),
            "grounded": list(nc.validate_grounded_output(text, event, f)),
            "portrait": list(nc.validate_player_portrait_contract(text, f)),
            "daily": list(nc.validate_matthias_daily_contract(text, f)),
            "opening": guarded(lambda: list(nc.validate_opening_banter_contract(text, f))),
            "register": list(validate_matthias_register(text, event)),
            "max_chars": nc._max_output_chars(event),
            "channel": nc._circuit_channel(event),
        }
        cases.append(case)
    return {"secret": SECRET, "timestamp": "1790000000", "cases": cases, "metrics": metrics(rng)}


def metrics(rng: random.Random) -> dict:
    """The Admin AI metrics over a stream longer than the 500-event window."""
    import observability_history

    observability_history.record_ai_event = lambda event: None  # history has its own corpus
    nc.reset_ai_metrics()
    nc.reset_ai_circuit_breaker()
    real_time = nc.time.time
    events = []
    try:
        for i in range(560):
            at = 1_790_000_000 + i * 37
            nc.time.time = lambda at=at: at + 0.5
            event = {
                "provider": rng.choice(["cloudflare", "cloudflare", "local"]),
                "event_type": rng.choice(["matthias_daily", "player_portrait", "blunder", "post_game_autopsy", "game_opening_banter", ""]),
                "latency_ms": rng.choice([0.0, 12.345, 250.5, 1999.999, round(rng.uniform(0, 5000), 3)]),
                "reason": rng.choice(["ok", "ok", "timeout", "http_502", "ungrounded_dama", "circuit_open", ""]),
                "text": rng.choice(["", "hola", "ñandú ♞" * 3]),
                "request_kind": rng.choice(["default", "portrait_manual", "", "matthias_tactics"]),
                "input_tokens": rng.choice([0, 120, 845]),
                "output_tokens": rng.choice([0, 64, 300]),
                "model": rng.choice([None, "", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama"]),
                "worker_error": rng.choice([None, "", "AiError:3040", "TimeoutError"]),
            }
            nc._record(event["provider"], event["event_type"], event["latency_ms"], event["reason"], event["text"],
                       request_kind=event["request_kind"], input_tokens=event["input_tokens"],
                       output_tokens=event["output_tokens"], model=event["model"], worker_error=event["worker_error"])
            events.append({"at": at, **event})
    finally:
        nc.time.time = real_time
    summary = nc.get_ai_metrics()
    for key in ("circuit", "enabled"):
        summary.pop(key)
    since = 1_790_000_000 + 300 * 37
    return {
        "events": events,
        "summary": summary,
        "daily_today": nc.get_ai_event_metrics("matthias_daily", since_epoch=since),
        "since": since,
    }


def render(corpus: dict) -> str:
    head = {"secret": corpus["secret"], "timestamp": corpus["timestamp"], "metrics": corpus["metrics"]}
    lines = [json.dumps(case, ensure_ascii=False, separators=(",", ":")) for case in corpus["cases"]]
    return json.dumps(head, ensure_ascii=False)[:-1] + ',"cases":[\n' + ",\n".join(lines) + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text_out = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text_out:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/narrative_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text_out, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
