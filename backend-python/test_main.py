"""test_main.py — Tests de la API vía FastAPI TestClient. `conftest.py` ya
se encarga de que estos tests usen el respaldo en memoria (no intentan
conectar a un Mongo real).
"""

import asyncio

from fastapi.testclient import TestClient

import game_store as store
from main import app

client = TestClient(app)


def _seed(game_id: str, moves: list[str], human_color: str, difficulty: int = 0):
    """Sobreescribe una partida ya creada con una secuencia de jugadas SAN
    concreta, para probar posiciones puntuales sin depender de una CPU
    aleatoria ni tener que jugar toda una partida a mano."""
    asyncio.run(
        store.update_game(
            game_id,
            {"moves": moves, "difficulty": difficulty, "humanColor": human_color, "lastMove": None},
        )
    )


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_create_game_default():
    r = client.post("/api/games", json={"difficulty": 50, "color": "w"})
    assert r.status_code == 201
    body = r.json()
    assert body["humanColor"] == "w"
    assert body["turn"] == "w"
    assert body["history"] == []
    assert body["isGameOver"] is False


def test_create_game_rejects_invalid_difficulty():
    r = client.post("/api/games", json={"difficulty": 500, "color": "w"})
    assert r.status_code == 400


def test_create_game_rejects_invalid_color():
    r = client.post("/api/games", json={"difficulty": 50, "color": "purple"})
    assert r.status_code == 400


def test_create_game_black_gets_opening_move_from_cpu():
    r = client.post("/api/games", json={"difficulty": 30, "color": "b"})
    body = r.json()
    assert body["humanColor"] == "b"
    assert len(body["history"]) == 1
    assert body["lastMove"]["by"] == "cpu"


def test_create_game_with_handicap_removes_cpu_piece_not_human_piece():
    # humano juega blancas -> el handicap le saca la pieza a las NEGRAS (la CPU)
    r = client.post("/api/games", json={"difficulty": 50, "color": "w", "handicap": "queen"})
    body = r.json()
    assert body["fen"].split(" ")[0] == "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    # confirma que es la dama NEGRA (d8) la que falta, no la blanca (d1) -- las blancas
    # (fila de abajo del FEN, "RNBQKBNR") siguen con las 16 piezas completas


def test_create_game_with_handicap_survives_get():
    r = client.post("/api/games", json={"difficulty": 50, "color": "b", "handicap": "rook"})
    game_id = r.json()["id"]
    # humano juega negras -> el handicap le saca la pieza a las BLANCAS (la CPU) — que además
    # ya movió su apertura acá (por eso no comparamos un string de fila exacto: la apertura de
    # la CPU tiene algo de azar, y si desarrolla el caballo en vez de un peón, la fila 1 cambia
    # igual sin que eso tenga nada que ver con el hándicap).
    fen_after_create = r.json()["fen"]
    assert fen_after_create.split(" ")[0].count("R") == 1  # empezaba con 2 torres blancas, el hándicap sacó una

    r2 = client.get(f"/api/games/{game_id}")
    assert r2.json()["fen"] == fen_after_create  # el GET reconstruye exactamente el mismo estado, hándicap incluido


def test_create_game_with_handicap_survives_after_move():
    r = client.post("/api/games", json={"difficulty": 30, "color": "b", "handicap": "rook"})
    game_id = r.json()["id"]

    r2 = client.post(f"/api/games/{game_id}/move", json={"from": "d7", "to": "d5"})
    assert r2.status_code == 200
    fen_after_move = r2.json()["fen"]
    # la torre blanca sigue faltando después de jugar, no reaparece al reconstruir el tablero
    white_rank1 = fen_after_move.split(" ")[0].split("/")[7]  # última fila del FEN = fila 1 (blancas)
    assert white_rank1.count("R") == 1  # empezaba con 2 torres blancas, el hándicap sacó una


def test_create_game_invalid_handicap_is_ignored_silently():
    r = client.post("/api/games", json={"difficulty": 50, "color": "w", "handicap": "algo-que-no-existe"})
    assert r.status_code == 201
    assert r.json()["fen"].split(" ")[0] == "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"  # posición estándar, sin romper nada


def test_get_game_not_found():
    r = client.get("/api/games/no-existe")
    assert r.status_code == 404


def test_play_legal_move():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    r = client.post(f"/api/games/{created['id']}/move", json={"from": "e2", "to": "e4"})
    assert r.status_code == 200
    body = r.json()
    # el humano jugó e4, y la CPU ya debería haber respondido
    assert body["history"][0]["san"] == "e4"
    assert len(body["history"]) == 2
    assert body["lastMove"]["by"] == "cpu"


def test_play_illegal_move_rejected():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    r = client.post(f"/api/games/{created['id']}/move", json={"from": "e2", "to": "e5"})
    assert r.status_code == 400


def test_play_move_wrong_turn_rejected():
    created = client.post("/api/games", json={"difficulty": 20, "color": "b"}).json()
    # Le tocó abrir a la CPU (blancas). Que el humano (negras) intente
    # mover una pieza blanca tiene que rechazarse.
    r = client.post(f"/api/games/{created['id']}/move", json={"from": "a2", "to": "a4"})
    assert r.status_code == 400


def test_promotion_move_via_analyze():
    # El endpoint /move siempre arranca desde la posición inicial (el store
    # solo guarda una lista de jugadas SAN, no un FEN arbitrario) — para
    # probar coronación sin jugar una partida entera hasta ahí, usamos
    # analyze-move, que sí acepta cualquier FEN directo.
    fen = "8/P6k/8/8/8/8/7K/8 w - - 0 1"  # peón blanco a punto de coronar en a8
    r = client.post(
        "/api/analyze-move",
        json={"fen": fen, "from": "a7", "to": "a8", "promotion": "n", "level": 10},
    )
    assert r.status_code == 200
    body = r.json()
    # Rey + caballo contra rey solo: material insuficiente, tablas (eval 0).
    assert body["evalAfterPlayed"] == 0


def test_castling_move_via_analyze():
    fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"
    r = client.post(
        "/api/analyze-move",
        json={"fen": fen, "from": "e1", "to": "g1", "level": 10},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["evalAfterPlayed"] is not None  # no revienta, da una evaluación real


def test_undo_no_moves_yet():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    r = client.post(f"/api/games/{created['id']}/undo")
    assert r.status_code == 400


def test_undo_after_human_and_cpu_move():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    game_id = created["id"]
    client.post(f"/api/games/{game_id}/move", json={"from": "e2", "to": "e4"})
    r = client.post(f"/api/games/{game_id}/undo")
    assert r.status_code == 200
    assert r.json()["history"] == []


def test_undo_twice_then_error():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    game_id = created["id"]
    client.post(f"/api/games/{game_id}/move", json={"from": "e2", "to": "e4"})
    client.post(f"/api/games/{game_id}/move", json={"from": "d2", "to": "d4"})
    r1 = client.post(f"/api/games/{game_id}/undo")
    assert len(r1.json()["history"]) == 2  # vuelve justo despues de la 1ra jugada+respuesta
    r2 = client.post(f"/api/games/{game_id}/undo")
    assert r2.json()["history"] == []
    r3 = client.post(f"/api/games/{game_id}/undo")
    assert r3.status_code == 400


def test_delete_game():
    created = client.post("/api/games", json={"difficulty": 20, "color": "w"}).json()
    r = client.delete(f"/api/games/{created['id']}")
    assert r.status_code == 204
    r2 = client.get(f"/api/games/{created['id']}")
    assert r2.status_code == 404


def test_delete_nonexistent_game():
    r = client.delete("/api/games/no-existe")
    assert r.status_code == 404


def test_analyze_endpoint():
    r = client.post(
        "/api/analyze",
        json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "level": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert "from" in body and "to" in body and "san" in body


def test_analyze_rejects_finished_position():
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # fool's mate consumado
    r = client.post("/api/analyze", json={"fen": fen, "level": 30})
    assert r.status_code == 400


def test_analyze_move_endpoint():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r = client.post("/api/analyze-move", json={"fen": fen, "from": "e7", "to": "e5", "level": 30})
    assert r.status_code == 200
    body = r.json()
    assert "suggested" in body
    assert body["evalAfterSuggested"] is not None
    assert body["evalAfterPlayed"] is not None
    # Bug real reportado por el usuario: el mensaje de "peor jugada" salía
    # sin la letra de la pieza sugerida (ej. "h8-a8" en vez de "Rh8-a8"),
    # porque este campo se calculaba en el motor pero se descartaba al
    # armar la respuesta — el frontend nunca tenía con qué mostrarla,
    # y una jugada de torre perfectamente legal (mover por la última fila)
    # se leía como si fuera un salto de rey imposible.
    assert body["suggested"]["piece"] is not None


def test_analyze_move_with_forced_mate_does_not_crash():
    # Bug real visto en producción: una posición con mate forzado hace que
    # evaluate_board devuelva +-inf, y el encoder JSON de Starlette usa
    # allow_nan=False — sin sanear, esto tiraba un 500 crudo
    # ("Out of range float values are not JSON compliant: -inf") en vez de
    # una respuesta válida. Torre y rey solos contra rey — mate en 1 con Ra8#.
    fen = "6k1/5ppp/8/8/8/8/8/R6K w - - 0 1"
    r = client.post("/api/analyze-move", json={"fen": fen, "level": 80})
    assert r.status_code == 200
    body = r.json()
    assert body["suggested"]["san"] == "Ra8#"
    assert body["evalAfterSuggested"] == 100000.0  # finito, no inf

    # mismo caso pero con la jugada explícita que da mate, para activar
    # tambien el otro punto del bug (evalAfterPlayed via evaluate_board directo)
    r2 = client.post("/api/analyze-move", json={"fen": fen, "from": "a1", "to": "a8", "level": 80})
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["evalAfterPlayed"] == 100000.0


# ---------- Auth M2M: get_api_key / has_valid_api_key ----------
#
# La lógica en sí (¿esta key está en la lista configurada?) se prueba acá
# como funciones puras, sin depender del volumen de requests necesario
# para de verdad chocar contra un límite de ritmo — ESO se verificó en
# vivo contra un servidor real corriendo (curl, cientos de requests
# seguidos, con y sin key, key inválida incluida), no automatizado acá
# por sería lento y redundante con esta verificación más directa.

from starlette.requests import Request  # noqa: E402

import main as main_module  # noqa: E402


def _fake_request(headers: dict) -> Request:
    scope = {"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]}
    return Request(scope)


def test_get_api_key_sin_keys_configuradas(monkeypatch):
    monkeypatch.setattr(main_module, "_M2M_API_KEYS", set())
    request = _fake_request({"x-api-key": "cualquier-cosa"})
    assert main_module.get_api_key(request) is None
    assert main_module.has_valid_api_key(request) is False


def test_get_api_key_valida(monkeypatch):
    monkeypatch.setattr(main_module, "_M2M_API_KEYS", {"clave-real"})
    request = _fake_request({"x-api-key": "clave-real"})
    assert main_module.get_api_key(request) == "clave-real"
    assert main_module.has_valid_api_key(request) is True


def test_get_api_key_invalida(monkeypatch):
    monkeypatch.setattr(main_module, "_M2M_API_KEYS", {"clave-real"})
    request = _fake_request({"x-api-key": "otra-cosa-que-no-esta-en-la-lista"})
    assert main_module.get_api_key(request) is None
    assert main_module.has_valid_api_key(request) is False


def test_get_api_key_sin_header(monkeypatch):
    monkeypatch.setattr(main_module, "_M2M_API_KEYS", {"clave-real"})
    request = _fake_request({})
    assert main_module.get_api_key(request) is None
    assert main_module.has_valid_api_key(request) is False


def test_analyze_move_funciona_igual_con_o_sin_api_key_valida():
    # La key no cambia el RESULTADO del análisis, solo el límite de ritmo
    # (que se verificó en vivo aparte) — una request individual con key
    # válida debe dar exactamente la misma respuesta que sin key.
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r_sin_key = client.post("/api/analyze-move", json={"fen": fen, "from": "e7", "to": "e5", "level": 30})
    r_con_key = client.post(
        "/api/analyze-move",
        json={"fen": fen, "from": "e7", "to": "e5", "level": 30},
        headers={"X-API-Key": "no-configurada-en-este-entorno-de-test"},
    )
    assert r_sin_key.status_code == 200
    assert r_con_key.status_code == 200
    assert r_sin_key.json()["evalAfterSuggested"] == r_con_key.json()["evalAfterSuggested"]


def test_game_ends_in_checkmate_and_cpu_does_not_respond():
    # Fool's mate: f3 e5 g4 Qh4# — sembramos las primeras 3 jugadas directo
    # en el store (sin depender del azar de la CPU) y el humano (negras)
    # remata con la última.
    created = client.post("/api/games", json={"difficulty": 0, "color": "b"}).json()
    game_id = created["id"]
    _seed(game_id, ["f3", "e5", "g4"], human_color="b")

    r = client.post(f"/api/games/{game_id}/move", json={"from": "d8", "to": "h4"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "checkmate"
    assert body["isGameOver"] is True
    # Como la partida terminó con la jugada del humano, la CPU NO debe
    # responder — el último movimiento sigue siendo el del humano.
    assert body["lastMove"]["by"] == "human"
    assert len(body["history"]) == 4


# ---------- Auth: registro y login ----------

def test_register_new_user():
    r = client.post("/api/auth/register", json={"username": "nuevo_usuario", "password": "clave123456"})
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "nuevo_usuario"
    assert "token" in body


def test_register_rejects_short_username():
    r = client.post("/api/auth/register", json={"username": "ab", "password": "clave123456"})
    assert r.status_code == 400


def test_register_rejects_short_password():
    r = client.post("/api/auth/register", json={"username": "usuarioval", "password": "123"})
    assert r.status_code == 400


def test_register_rejects_duplicate_username():
    client.post("/api/auth/register", json={"username": "repetido", "password": "clave123456"})
    r = client.post("/api/auth/register", json={"username": "repetido", "password": "otraclave123"})
    assert r.status_code == 409


def test_register_username_case_insensitive():
    # "Juan" y "juan" son el mismo usuario -- evita que la gente se registre
    # dos veces sin querer solo por mayúsculas distintas.
    client.post("/api/auth/register", json={"username": "Juan", "password": "clave123456"})
    r = client.post("/api/auth/register", json={"username": "juan", "password": "otraclave123"})
    assert r.status_code == 409


def test_login_with_correct_password():
    client.post("/api/auth/register", json={"username": "login_ok", "password": "clave123456"})
    r = client.post("/api/auth/login", json={"username": "login_ok", "password": "clave123456"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_with_wrong_password_rejected():
    client.post("/api/auth/register", json={"username": "login_mal", "password": "clave123456"})
    r = client.post("/api/auth/login", json={"username": "login_mal", "password": "clave-incorrecta"})
    assert r.status_code == 401


def test_login_nonexistent_user_rejected():
    r = client.post("/api/auth/login", json={"username": "no-existe-este-usuario", "password": "cualquiera123"})
    assert r.status_code == 401


def test_me_endpoint_with_valid_token():
    r = client.post("/api/auth/register", json={"username": "usuario_me", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["username"] == "usuario_me"


def test_me_endpoint_without_token_rejected():
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_endpoint_with_garbage_token_rejected():
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer esto-no-es-un-token-valido"})
    assert r.status_code == 401
