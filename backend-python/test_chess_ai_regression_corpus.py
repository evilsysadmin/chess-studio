import chess
import pytest

from chess_ai import _root_search


@pytest.mark.parametrize(
    ("fen", "expected_uci"),
    [
        # Mate en 1 para blancas: Qg7#.
        ("7k/8/5KQ1/8/8/8/8/8 w - - 0 1", "g6g7"),
        # Espejo: mate en 1 para negras: ...Qg2#.
        ("8/8/8/8/8/5kq1/8/7K b - - 0 1", "g3g2"),
        # Captura de dama limpia para blancas.
        ("4q2k/8/8/8/8/8/8/K3R3 w - - 0 1", "e1e8"),
        # Espejo: captura de dama limpia para negras.
        ("k3r3/8/8/8/8/8/8/4Q2K b - - 0 1", "e8e1"),
    ],
)
def test_fixed_depth_regression_corpus_keeps_forced_tactical_move(fen, expected_uci):
    board = chess.Board(fen)
    before_fen = board.fen()
    before_stack = list(board.move_stack)

    move, _score = _root_search(board, depth=3, deadline=float("inf"), tt={})

    assert move is not None
    assert move.uci() == expected_uci
    # La búsqueda debe ser observacional: nunca deja el tablero mutado.
    assert board.fen() == before_fen
    assert list(board.move_stack) == before_stack
