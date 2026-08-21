"""test_chess_ai.py — Tests del motor de la CPU (chess_ai.py)."""

import math
import time

import chess_ai as ai_module

import chess

from chess_ai import (
    analyze_move,
    evaluate_board,
    get_cpu_move,
    move_to_dict,
    settings_for_level,
)


def test_evaluate_board_symmetric_at_start():
    board = chess.Board()
    # Posición inicial: material, estructura y movilidad simétricos.
    assert evaluate_board(board) == 0


def test_evaluate_board_checkmate_is_infinite():
    # Fool's mate: mate en 2 al que le toca mover.
    board = chess.Board()
    for san in ["f3", "e5", "g4", "Qh4#"]:
        board.push_san(san)
    assert board.is_checkmate()
    assert evaluate_board(board) == -math.inf  # le toca a blancas, blancas están mate


def test_evaluate_board_insufficient_material_is_draw():
    board = chess.Board("8/8/8/8/8/k7/8/K6N w - - 0 1")  # rey+caballo vs rey solo
    assert evaluate_board(board) == 0


def test_settings_for_level_scales_with_difficulty():
    low = settings_for_level(0)
    high = settings_for_level(100)
    assert low.max_depth <= high.max_depth
    assert low.randomness > high.randomness
    assert low.noise > high.noise
    assert high.randomness == 0
    assert high.noise == 0


def test_settings_for_level_clamps_out_of_range():
    assert settings_for_level(-50).level == 0
    assert settings_for_level(500).level == 100


def test_get_cpu_move_finds_mate_in_one():
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    move = get_cpu_move(board, 100)
    assert move["san"] == "Ra8#"


def test_get_cpu_move_returns_none_without_legal_moves():
    # Jaque mate ya consumado: no hay jugadas legales.
    board = chess.Board()
    for san in ["f3", "e5", "g4", "Qh4#"]:
        board.push_san(san)
    assert get_cpu_move(board, 50) is None


def test_analyze_move_has_no_randomness():
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    # A nivel 0, get_cpu_move tendría ~55% de probabilidad de jugar al azar,
    # pero analyze_move nunca lo hace — siempre busca la jugada real.
    for _ in range(15):
        result = analyze_move(board, 0)
        assert result["move"]["san"] == "Ra8#"


def test_move_to_dict_reports_capture():
    board = chess.Board()
    board.push_san("e4")
    board.push_san("d5")
    move = chess.Move.from_uci("e4d5")
    d = move_to_dict(board, move)
    assert d["captured"] is True
    assert d["from"] == "e4"
    assert d["to"] == "d5"
    assert d["piece"] == "p"


def test_intermediate_and_above_disable_intentional_random_blunders():
    # Desde Intermedio los errores deben venir de la fuerza real de búsqueda,
    # no de una ruleta que pueda escoger cualquier legal después de pensar.
    for level in (45, 60, 70, 90, 100):
        settings = settings_for_level(level)
        assert settings.randomness == 0
        assert settings.noise == 0


def test_beginner_keeps_some_deliberate_imperfection():
    beginner = settings_for_level(10)
    amateur = settings_for_level(30)
    assert beginner.randomness > amateur.randomness > 0
    assert beginner.noise > amateur.noise > 0


def test_high_level_takes_a_free_queen_instead_of_wandering_off():
    # Negras pueden capturar la dama blanca de e4 inmediatamente.
    # Es una guardia de regresión muy barata contra el clásico "nivel alto
    # decide hacer turismo con el rey mientras hay 900 cp gratis".
    board = chess.Board("4k3/8/8/3q4/4Q3/8/8/4K3 b - - 0 1")
    move = get_cpu_move(board, 100)
    assert move is not None
    assert move["from"] == "d5"
    assert move["to"] == "e4"


def test_high_level_promotes_winning_pawn_to_queen():
    board = chess.Board("4k3/P7/8/8/8/8/8/4K3 w - - 0 1")
    move = get_cpu_move(board, 100)
    assert move is not None
    assert move["from"] == "a7"
    assert move["to"] == "a8"
    assert "=Q" in move["san"]


def test_cpu_always_returns_legal_moves_on_representative_core_positions():
    positions = [
        chess.Board(),
        chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"),  # enroques disponibles
        chess.Board("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"),        # en passant disponible
        chess.Board("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"),          # promoción
        chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 0 1"),         # final simple
    ]
    for board in positions:
        before = board.copy(stack=True)
        result = get_cpu_move(board, 45)
        assert result is not None
        move = chess.Move.from_uci(result["from"] + result["to"] + ("q" if "=Q" in result["san"] else ""))
        # Para promociones no-dama reconstruimos por SAN, para el resto UCI basta.
        if move not in board.legal_moves:
            move = board.parse_san(result["san"])
        assert move in board.legal_moves
        assert board.fen() == before.fen()  # pensar nunca muta la partida


def test_endgame_evaluation_wants_the_king_active():
    active = chess.Board("7k/7p/8/8/3K4/8/P7/8 w - - 0 1")
    passive = chess.Board("7k/7p/8/8/8/8/P7/K7 w - - 0 1")
    assert evaluate_board(active) > evaluate_board(passive)


def test_depth_tiers_keep_intermediate_human_and_scale_progressively():
    assert settings_for_level(19).max_depth == 2
    assert settings_for_level(20).max_depth == 3
    assert settings_for_level(45).max_depth == 3
    assert settings_for_level(64).max_depth == 3
    assert settings_for_level(69).max_depth == 3
    assert settings_for_level(70).max_depth == 4
    assert settings_for_level(89).max_depth == 4
    assert settings_for_level(90).max_depth == 5
    assert settings_for_level(97).max_depth == 5
    assert settings_for_level(98).max_depth == 6


def test_time_budget_is_monotonic_but_reserves_cpu_for_high_levels():
    levels = [0, 20, 45, 64, 70, 90, 100]
    budgets = [settings_for_level(level).time_budget_s for level in levels]
    assert budgets == sorted(budgets)
    assert settings_for_level(64).time_budget_s < 1.35
    assert settings_for_level(100).time_budget_s >= 2.4


def test_quiescence_never_uses_stand_pat_while_in_check(monkeypatch):
    # En esta posición blancas están en jaque. Simulamos una evaluación
    # estática muy optimista del tablero EN jaque y mala tras evadirlo. La
    # quiescence antigua podía quedarse con ese +1000 imposible, como si
    # "pasar turno" estando en jaque fuese una opción legal.
    board = chess.Board("7k/8/8/8/8/8/7r/7K w - - 0 1")
    assert board.is_check()

    def fake_eval(position, **_kwargs):
        return 1000.0 if position.is_check() else -500.0

    monkeypatch.setattr(ai_module, "evaluate_board", fake_eval)
    score = ai_module._quiescence(
        board,
        -math.inf,
        math.inf,
        0,
        time.monotonic() + 1.0,
        qdepth=1,
    )
    assert score != 1000.0
    assert board.fen() == "7k/8/8/8/8/8/7r/7K w - - 0 1"


def test_high_level_prefers_mate_over_immediate_stalemate():
    # Qg6?? dejaría a negras sin jugadas y sin jaque (ahogado). Qg7# gana.
    board = chess.Board("7k/5K2/8/6Q1/8/8/8/8 w - - 0 1")
    move = get_cpu_move(board, 100)
    assert move is not None
    trial = board.copy(stack=True)
    trial.push_san(move["san"])
    assert trial.is_checkmate()
    assert not trial.is_stalemate()


def test_high_level_pawn_takes_hanging_queen():
    # Guardia explícita para una de las humillaciones que NO queremos en
    # niveles altos: un peón puede comerse una dama gratis y la CPU la ignora.
    board = chess.Board("4k3/8/8/4q3/3P4/8/8/4K3 w - - 0 1")
    move = get_cpu_move(board, 100)
    assert move is not None
    assert move["from"] == "d4"
    assert move["to"] == "e5"


def test_ghost_style_never_overrides_forced_mate():
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")
    style = {"capture": -1, "pawn": 1, "queen": 1, "check": -1, "castle": 1}
    move = get_cpu_move(board, 100, style)
    assert move["san"] == "Ra8#"


def test_ghost_style_never_refuses_a_free_queen_at_high_level():
    board = chess.Board("4k3/8/8/3q4/4Q3/8/8/4K3 b - - 0 1")
    style = {"capture": -1, "pawn": 1, "queen": -1, "check": -1, "castle": -1}
    move = get_cpu_move(board, 100, style)
    assert move is not None
    assert move["from"] == "d5"
    assert move["to"] == "e4"


def test_ghost_style_score_rewards_only_requested_move_traits():
    board = chess.Board("4k3/8/8/3q4/4Q3/8/8/4K3 b - - 0 1")
    capture = chess.Move.from_uci("d5e4")
    quiet = chess.Move.from_uci("d5d6")
    aggressive = {"capture": 1, "pawn": 0, "queen": 0, "check": 0, "castle": 0}
    shy = {"capture": -1, "pawn": 0, "queen": 0, "check": 0, "castle": 0}
    assert ai_module._ghost_style_score(board, capture, aggressive) > ai_module._ghost_style_score(board, quiet, aggressive)
    assert ai_module._ghost_style_score(board, capture, shy) < ai_module._ghost_style_score(board, quiet, shy)


def test_ghost_tiebreak_does_not_touch_mate_sentinel_scores():
    assert not ai_module._ghost_tiebreak_allowed(ai_module.MATE_SCORE - 2, ai_module.MATE_SCORE - 5, True)
    assert ai_module._ghost_tiebreak_allowed(120.0, 110.0, True)
    assert not ai_module._ghost_tiebreak_allowed(120.0, 90.0, True)
