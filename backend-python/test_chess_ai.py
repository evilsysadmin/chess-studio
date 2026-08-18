"""test_chess_ai.py — Tests del motor de la CPU (chess_ai.py)."""

import math

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
    # Posición inicial: material simétrico, la única asimetría es el bono de
    # movilidad (le toca a blancas, que tienen 20 jugadas legales).
    assert evaluate_board(board) == board.legal_moves.count()


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
    # Dificultad 100 a propósito, no 95: es la ÚNICA con randomness exactamente
    # en 0 (settings_for_level: 0.55*(1-nivel/100)). A 95 daba ~2.75% de chance
    # de que la CPU jugara al azar en vez de encontrar el mate -- el test era
    # intermitente, fallaba más o menos 1 de cada 36 corridas.
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
