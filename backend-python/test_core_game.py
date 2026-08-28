"""Gate pequeño y explícito del core de reglas de Chess Studio.

No pretende duplicar todos los tests HTTP. Protege las invariantes que, si se
rompen, significan que el tablero deja de jugar ajedrez correctamente.
"""

import chess
import random

from chess_core import board_from_valid_fen, board_sans, load_board, resolve_move, serialize_game, validate_stored_game_entry


def _entry(*, moves=None, initial_fen=None, human_color="w", handicap=None):
    return {
        "humanColor": human_color,
        "difficulty": 50,
        "moves": moves or [],
        "lastMove": None,
        "initialFen": initial_fen,
        "handicap": handicap,
    }



def test_board_from_valid_fen_rejects_structurally_impossible_positions():
    impossible = "8/8/8/8/8/8/8/4K3 w - - 0 1"  # falta el rey negro
    try:
        chess.Board(impossible)
    except ValueError:
        raise AssertionError("El caso debe ser parseable para probar is_valid(), no sólo sintaxis FEN")
    assert chess.Board(impossible).is_valid() is False
    with __import__("pytest").raises(ValueError):
        board_from_valid_fen(impossible)


def test_load_board_rejects_corrupt_persisted_history_instead_of_inventing_state():
    with __import__("pytest").raises(ValueError):
        load_board(_entry(moves=["e4", "e5", "Qa9"]))


def test_stored_game_shape_rejects_types_that_would_crash_recovery():
    bad_entries = [
        {**_entry(), "moves": 42},
        {**_entry(), "moves": ["e4", None]},
        {**_entry(), "humanColor": "purple"},
        {**_entry(), "difficulty": float("nan")},
        {**_entry(), "lastMove": "e4"},
    ]
    for entry in bad_entries:
        with __import__("pytest").raises(ValueError):
            validate_stored_game_entry(entry)

def test_resolve_move_covers_castling_en_passant_and_promotion():
    castle = chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
    assert resolve_move(castle, "e1", "g1", None) == chess.Move.from_uci("e1g1")
    assert resolve_move(castle, "e1", "c1", None) == chess.Move.from_uci("e1c1")

    ep = chess.Board("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1")
    ep_move = resolve_move(ep, "e5", "d6", None)
    assert ep_move == chess.Move.from_uci("e5d6")
    assert ep.is_en_passant(ep_move)

    promotion = chess.Board("4k3/P7/8/8/8/8/8/4K3 w - - 0 1")
    assert resolve_move(promotion, "a7", "a8", None) == chess.Move.from_uci("a7a8q")
    assert resolve_move(promotion, "a7", "a8", "n") == chess.Move.from_uci("a7a8n")

    normal = chess.Board()
    assert resolve_move(normal, "e2", "e4", "q") is None
    assert resolve_move(normal, None, "e4", None) is None
    assert resolve_move(normal, "e2", None, None) is None


def test_custom_starting_fen_roundtrips_san_and_load_board():
    initial = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"
    board = chess.Board(initial)
    board.push_uci("e2e4")
    board.push_uci("e8d7")

    sans = board_sans(board, initial_fen=initial)
    assert sans == ["e4", "Kd7"]

    restored = load_board(_entry(moves=sans, initial_fen=initial))
    assert restored.fen() == board.fen()
    assert restored.move_stack == board.move_stack


def test_serialize_history_understands_en_passant_from_custom_fen():
    initial = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"
    board = chess.Board(initial)
    board.push_uci("e5d6")
    payload = serialize_game("ep", _entry(moves=["exd6"], initial_fen=initial), board)

    assert payload["history"][-1]["captured"] is True
    assert payload["history"][-1]["capturedPiece"] == "p"
    assert payload["history"][-1]["from"] == "e5"
    assert payload["history"][-1]["to"] == "d6"


def test_claimable_threefold_is_serialized_as_finished_repetition():
    board = chess.Board()
    moves = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]
    for san in moves:
        board.push_san(san)
    assert board.can_claim_threefold_repetition()

    payload = serialize_game("repeat", _entry(moves=moves), board)
    assert payload["status"] == "repetition"
    assert payload["isGameOver"] is True


def test_terminal_draw_statuses_are_consistent():
    cases = [
        (chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), "stalemate"),
        (chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 100 51"), "draw"),
        (chess.Board("8/8/8/8/8/k7/8/K6N w - - 0 1"), "draw"),
    ]
    for index, (board, expected) in enumerate(cases):
        payload = serialize_game(
            f"terminal-{index}",
            _entry(initial_fen=board.fen()),
            board,
        )
        assert payload["status"] == expected
        assert payload["isGameOver"] is True



def test_claimable_fifty_move_rule_is_serialized_as_finished_draw():
    board = chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 100 51")
    assert board.can_claim_fifty_moves()
    payload = serialize_game("fifty", _entry(initial_fen=board.fen()), board)
    assert payload["status"] == "draw"
    assert payload["isGameOver"] is True

def test_checkmate_status_wins_over_generic_game_over():
    board = chess.Board()
    for san in ["f3", "e5", "g4", "Qh4#"]:
        board.push_san(san)
    payload = serialize_game("mate", _entry(moves=["f3", "e5", "g4", "Qh4#"]), board)
    assert payload["status"] == "checkmate"
    assert payload["isGameOver"] is True


def test_serialization_exposes_mating_material_for_clock_flags():
    lone_bishop = chess.Board("8/8/8/8/8/2k5/4K3/5B2 w - - 0 1")
    payload = serialize_game("clock-bishop", _entry(initial_fen=lone_bishop.fen()), lone_bishop)
    assert payload["insufficientMatingMaterial"] == {"w": True, "b": True}

    rook = chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 0 1")
    payload = serialize_game("clock-rook", _entry(initial_fen=rook.fen()), rook)
    assert payload["insufficientMatingMaterial"] == {"w": False, "b": True}


def test_property_random_legal_games_preserve_core_invariants():
    """Mini fuzz determinista: muchas partidas legales, mismo resultado al reconstruir.

    No sustituye tests dirigidos de enroque/promoción/en-passant; busca combinaciones
    no previstas que rompan resolve_move, SAN, serialización o el roundtrip.
    """
    for seed in range(24):
        rng = random.Random(seed)
        board = chess.Board()
        sans = []
        for _ply in range(90):
            assert board.is_valid()
            assert board.king(chess.WHITE) is not None
            assert board.king(chess.BLACK) is not None
            if board.is_game_over(claim_draw=True):
                break
            legal = list(board.legal_moves)
            assert legal
            move = rng.choice(legal)
            promotion = chess.piece_symbol(move.promotion) if move.promotion else None
            resolved = resolve_move(
                board,
                chess.square_name(move.from_square),
                chess.square_name(move.to_square),
                promotion,
            )
            assert resolved == move
            sans.append(board.san(move))
            board.push(move)

        restored = load_board(_entry(moves=sans))
        assert restored.fen() == board.fen()
        assert board_sans(restored) == sans
        payload = serialize_game(f"fuzz-{seed}", _entry(moves=sans), restored)
        assert payload["fen"] == board.fen()
        assert payload["turn"] in {"w", "b"}
        assert payload["status"] in {"playing", "check", "checkmate", "stalemate", "draw", "repetition"}


def test_illegal_king_safety_and_pins_are_rejected_by_core_rules():
    # La torre e2 está clavada contra el rey e1 por la torre negra e8.
    pinned = chess.Board("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1")
    assert resolve_move(pinned, "e2", "d2", None) is None

    # El rey tampoco puede caminar a una casilla atacada.
    attacked = chess.Board("3r2k1/8/8/8/8/8/8/4K3 w - - 0 1")
    assert resolve_move(attacked, "e1", "d1", None) is None


def test_castling_through_check_is_rejected_even_with_castling_rights():
    # El alfil c4 ataca f1: el rey blanco no puede atravesar f1 para O-O.
    board = chess.Board("4k3/8/8/8/2b5/8/8/4K2R w K - 0 1")
    assert board.has_kingside_castling_rights(chess.WHITE)
    assert resolve_move(board, "e1", "g1", None) is None


def test_en_passant_expires_and_all_four_promotions_are_resolved():
    active_ep = chess.Board("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1")
    assert resolve_move(active_ep, "e5", "d6", None) == chess.Move.from_uci("e5d6")

    expired_ep = chess.Board("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1")
    assert resolve_move(expired_ep, "e5", "d6", None) is None

    for symbol in ("q", "r", "b", "n"):
        board = chess.Board("4k3/P7/8/8/8/8/8/4K3 w - - 0 1")
        move = resolve_move(board, "a7", "a8", symbol)
        assert move == chess.Move.from_uci(f"a7a8{symbol}")

    assert resolve_move(board, "a7", "a8", "x") is None


def test_serialized_history_preserves_underpromotion_exactly():
    initial = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"
    board = chess.Board(initial)
    board.push(chess.Move.from_uci("a7a8n"))
    payload = serialize_game("underpromotion", _entry(initial_fen=initial), board)
    assert payload["history"][0]["promotion"] == "n"
    assert payload["history"][0]["san"].startswith("a8=N")


def test_automatic_fivefold_and_seventyfive_move_draws_are_terminal():
    repetition = chess.Board()
    for san in ["Nf3", "Nf6", "Ng1", "Ng8"] * 4:
        repetition.push_san(san)
    assert repetition.is_fivefold_repetition()
    payload = serialize_game("fivefold", _entry(moves=board_sans(repetition)), repetition)
    assert payload["status"] == "repetition"
    assert payload["isGameOver"] is True

    seventyfive = chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 150 76")
    assert seventyfive.is_seventyfive_moves()
    payload = serialize_game("75move", _entry(initial_fen=seventyfive.fen()), seventyfive)
    assert payload["status"] == "draw"
    assert payload["isGameOver"] is True


def test_check_is_not_terminal_but_mate_and_stalemate_are_terminal():
    check = chess.Board("4Q2k/8/8/8/8/8/8/7K b - - 0 1")
    payload = serialize_game("check", _entry(initial_fen=check.fen(), human_color="b"), check)
    assert payload["status"] == "check"
    assert payload["isGameOver"] is False
    assert list(check.legal_moves)

    mate = chess.Board("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1")
    payload = serialize_game("mate-terminal", _entry(initial_fen=mate.fen(), human_color="b"), mate)
    assert payload["status"] == "checkmate"
    assert payload["isGameOver"] is True
    assert not list(mate.legal_moves)

    stale = chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
    payload = serialize_game("stale-terminal", _entry(initial_fen=stale.fen(), human_color="b"), stale)
    assert payload["status"] == "stalemate"
    assert payload["isGameOver"] is True
    assert not list(stale.legal_moves)


def test_custom_fen_preserves_side_to_move_exactly():
    initial = "4k3/8/8/8/8/8/4P3/4K3 b - - 0 23"
    board = load_board(_entry(initial_fen=initial, human_color="b"))
    assert board.turn == chess.BLACK
    assert board.fullmove_number == 23
