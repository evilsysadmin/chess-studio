"""test_main.py — Tests de la API vía FastAPI TestClient. `conftest.py` ya
se encarga de que estos tests usen el respaldo en memoria (no intentan
conectar a un Mongo real).
"""

import asyncio
import json

from fastapi.testclient import TestClient

import game_store as store
from main import app

client = TestClient(app)

_auth_counter = 0


def _auth_headers():
    """Registra un usuario nuevo (nombre único por llamada, para no chocar
    entre tests) y devuelve el header Authorization con su token — usado
    en los tests de /api/analyze y /api/analyze-move, que ahora exigen
    sesión (o una API key M2M válida)."""
    global _auth_counter
    _auth_counter += 1
    username = f"analyze_test_{_auth_counter}"
    r = client.post("/api/auth/register", json={"username": username, "password": "clave123456"})
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


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
        headers=_auth_headers(),
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
        headers=_auth_headers(),
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
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "from" in body and "to" in body and "san" in body


def test_analyze_rejects_finished_position():
    fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # fool's mate consumado
    r = client.post("/api/analyze", json={"fen": fen, "level": 30}, headers=_auth_headers())
    assert r.status_code == 400


def test_analyze_move_endpoint():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r = client.post(
        "/api/analyze-move", json={"fen": fen, "from": "e7", "to": "e5", "level": 30}, headers=_auth_headers()
    )
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
    headers = _auth_headers()
    r = client.post("/api/analyze-move", json={"fen": fen, "level": 80}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["suggested"]["san"] == "Ra8#"
    assert body["evalAfterSuggested"] == 100000.0  # finito, no inf

    # mismo caso pero con la jugada explícita que da mate, para activar
    # tambien el otro punto del bug (evalAfterPlayed via evaluate_board directo)
    r2 = client.post("/api/analyze-move", json={"fen": fen, "from": "a1", "to": "a8", "level": 80}, headers=headers)
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


def test_analyze_move_funciona_igual_con_o_sin_api_key_valida(monkeypatch):
    # La key no cambia el RESULTADO del análisis, solo el límite de ritmo
    # (que se verificó en vivo aparte) — entrar con sesión de usuario debe
    # dar exactamente la misma respuesta que entrar con una API key M2M
    # válida. (Antes este test comparaba "sin nada" contra "key inválida" —
    # ya no tiene sentido: el endpoint ahora exige una de las dos formas
    # de entrar, así que hace falta una key de verdad configurada.)
    monkeypatch.setattr("main._M2M_API_KEYS", {"key-de-test-valida"})
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r_con_usuario = client.post(
        "/api/analyze-move", json={"fen": fen, "from": "e7", "to": "e5", "level": 30}, headers=_auth_headers()
    )
    r_con_key = client.post(
        "/api/analyze-move",
        json={"fen": fen, "from": "e7", "to": "e5", "level": 30},
        headers={"X-API-Key": "key-de-test-valida"},
    )
    assert r_con_usuario.status_code == 200
    assert r_con_key.status_code == 200
    assert r_con_usuario.json()["evalAfterSuggested"] == r_con_key.json()["evalAfterSuggested"]


def test_analyze_move_rejects_no_auth_and_no_api_key():
    # El punto central de todo este cambio: sin sesión y sin key, no entra.
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r = client.post("/api/analyze-move", json={"fen": fen, "from": "e7", "to": "e5", "level": 30})
    assert r.status_code == 401


def test_analyze_move_rejects_invalid_api_key_without_session():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"
    r = client.post(
        "/api/analyze-move",
        json={"fen": fen, "from": "e7", "to": "e5", "level": 30},
        headers={"X-API-Key": "esta-key-no-esta-configurada"},
    )
    assert r.status_code == 401


def test_analyze_rejects_no_auth_and_no_api_key():
    r = client.post(
        "/api/analyze",
        json={"fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "level": 30},
    )
    assert r.status_code == 401


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


# ---------- Auth: código de invitación ----------

def test_register_works_without_invite_code_when_not_configured():
    # Sin INVITE_CODES configurado (default), el registro sigue abierto —
    # cero cambio de comportamiento, mismo espíritu que M2M_API_KEYS/ADMIN_USERNAMES.
    r = client.post("/api/auth/register", json={"username": "sin_invitacion", "password": "clave123456"})
    assert r.status_code == 201


def test_register_rejects_missing_invite_code_when_configured(monkeypatch):
    monkeypatch.setattr("main._INVITE_CODES", {"CODIGO-SECRETO"})
    r = client.post("/api/auth/register", json={"username": "sin_codigo", "password": "clave123456"})
    assert r.status_code == 403


def test_register_rejects_wrong_invite_code(monkeypatch):
    monkeypatch.setattr("main._INVITE_CODES", {"CODIGO-SECRETO"})
    r = client.post(
        "/api/auth/register",
        json={"username": "codigo_malo", "password": "clave123456", "inviteCode": "codigo-inventado"},
    )
    assert r.status_code == 403


def test_register_accepts_correct_invite_code(monkeypatch):
    monkeypatch.setattr("main._INVITE_CODES", {"CODIGO-SECRETO"})
    r = client.post(
        "/api/auth/register",
        json={"username": "codigo_bueno", "password": "clave123456", "inviteCode": "CODIGO-SECRETO"},
    )
    assert r.status_code == 201


def test_register_invite_code_is_case_sensitive(monkeypatch):
    # A propósito, a diferencia del username -- un código de invitación
    # es más parecido a una contraseña que a un nombre de usuario.
    monkeypatch.setattr("main._INVITE_CODES", {"CODIGO-SECRETO"})
    r = client.post(
        "/api/auth/register",
        json={"username": "codigo_minuscula", "password": "clave123456", "inviteCode": "codigo-secreto"},
    )
    assert r.status_code == 403


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


# ---------- Auth: panel de admin ----------

def test_me_reports_is_admin_false_for_normal_user(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", set())
    r = client.post("/api/auth/register", json={"username": "usuario_normal", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.json()["isAdmin"] is False


def test_me_reports_is_admin_true_when_configured(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"stan"})
    r = client.post("/api/auth/register", json={"username": "stan", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.json()["isAdmin"] is True


def test_admin_endpoint_rejects_non_admin_user(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"stan"})
    r = client.post("/api/auth/register", json={"username": "no_soy_admin", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403


def test_admin_endpoint_rejects_no_token():
    r = client.get("/api/admin/users")
    assert r.status_code == 401


def test_admin_endpoint_lists_users_with_stats(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_test"})
    r = client.post("/api/auth/register", json={"username": "admin_test", "password": "clave123456"})
    admin_token = r.json()["token"]

    r2 = client.post("/api/auth/register", json={"username": "jugador_con_stats", "password": "clave123456"})
    player_token = r2.json()["token"]
    client.put(
        "/api/profile",
        json={"data": {
            "chess-study-tournament": '{"points": 340, "wins": 7}',
            "chess-study-player-rating": '{"rating": 812}',
        }},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    r3 = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 200
    users = {u["username"]: u for u in r3.json()["users"]}
    assert "jugador_con_stats" in users
    assert users["jugador_con_stats"]["tournamentPoints"] == 340
    assert users["jugador_con_stats"]["tournamentWins"] == 7
    assert users["jugador_con_stats"]["rating"] == 812


def test_admin_endpoint_handles_user_with_no_profile_yet(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_test2"})
    r = client.post("/api/auth/register", json={"username": "admin_test2", "password": "clave123456"})
    admin_token = r.json()["token"]
    client.post("/api/auth/register", json={"username": "recien_registrado", "password": "clave123456"})

    r2 = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200  # no revienta aunque el usuario nunca haya guardado un perfil
    users = {u["username"]: u for u in r2.json()["users"]}
    assert users["recien_registrado"]["tournamentPoints"] is None


def test_admin_endpoint_handles_malformed_profile_json(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_test3"})
    r = client.post("/api/auth/register", json={"username": "admin_test3", "password": "clave123456"})
    admin_token = r.json()["token"]

    r2 = client.post("/api/auth/register", json={"username": "perfil_roto", "password": "clave123456"})
    player_token = r2.json()["token"]
    client.put(
        "/api/profile",
        json={"data": {"chess-study-tournament": "esto no es JSON válido {{{"}},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    r3 = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 200  # un campo roto no tumba el endpoint entero
    users = {u["username"]: u for u in r3.json()["users"]}
    assert users["perfil_roto"]["tournamentPoints"] is None


# ---------- Auth: panel de admin, detalle/editar/borrar usuarios ----------

def test_admin_detail_endpoint_rejects_non_admin():
    r = client.post("/api/auth/register", json={"username": "no_admin_detalle", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/admin/users/cualquiera", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403


def test_admin_detail_endpoint_404_for_nonexistent_user(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_detalle1"})
    r = client.post("/api/auth/register", json={"username": "admin_detalle1", "password": "clave123456"})
    admin_token = r.json()["token"]
    r2 = client.get("/api/admin/users/no-existe-este-usuario", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 404


def test_admin_detail_endpoint_returns_extra_fields(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_detalle2"})
    r = client.post("/api/auth/register", json={"username": "admin_detalle2", "password": "clave123456"})
    admin_token = r.json()["token"]

    r2 = client.post("/api/auth/register", json={"username": "jugador_detalle", "password": "clave123456"})
    player_token = r2.json()["token"]
    client.put(
        "/api/profile",
        json={"data": {
            "chess-study-tournament": '{"points": 300, "wins": 5, "winStreak": 2, "bestWinStreak": 4}',
            "chess-study-achievements": '["first_game", "ten_games"]',
            "chess-study-puzzles-solved": "7",
        }},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    r3 = client.get("/api/admin/users/jugador_detalle", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 200
    body = r3.json()
    assert body["winStreak"] == 2
    assert body["bestWinStreak"] == 4
    assert body["achievementsCount"] == 2
    assert body["puzzlesSolved"] == 7


def test_admin_edit_endpoint_rejects_non_admin():
    r = client.post("/api/auth/register", json={"username": "no_admin_editar", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.patch(
        "/api/admin/users/cualquiera",
        json={"rating": 999},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 403


def test_admin_edit_endpoint_updates_rating_and_tournament(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_editar1"})
    r = client.post("/api/auth/register", json={"username": "admin_editar1", "password": "clave123456"})
    admin_token = r.json()["token"]

    client.post("/api/auth/register", json={"username": "jugador_editar", "password": "clave123456"})

    r2 = client.patch(
        "/api/admin/users/jugador_editar",
        json={"rating": 1500, "tournamentPoints": 800, "tournamentWins": 12},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["rating"] == 1500
    assert body["tournamentPoints"] == 800
    assert body["tournamentWins"] == 12

    # se guardó de verdad -- lo confirma un GET aparte, no solo la respuesta del PATCH
    r3 = client.get("/api/admin/users/jugador_editar", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.json()["rating"] == 1500


def test_admin_edit_endpoint_partial_update_does_not_clobber_other_fields(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_editar2"})
    r = client.post("/api/auth/register", json={"username": "admin_editar2", "password": "clave123456"})
    admin_token = r.json()["token"]

    r2 = client.post("/api/auth/register", json={"username": "jugador_parcial", "password": "clave123456"})
    player_token = r2.json()["token"]
    client.put(
        "/api/profile",
        json={"data": {"chess-study-tournament": '{"points": 200, "wins": 3, "losses": 1}'}},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    # solo se edita wins -- points y losses no deberían tocarse
    client.patch(
        "/api/admin/users/jugador_parcial",
        json={"tournamentWins": 99},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r3 = client.get("/api/profile", headers={"Authorization": f"Bearer {player_token}"})
    tournament = json.loads(r3.json()["data"]["chess-study-tournament"])
    assert tournament["wins"] == 99
    assert tournament["points"] == 200  # intacto
    assert tournament["losses"] == 1  # intacto


def test_admin_delete_endpoint_rejects_non_admin():
    r = client.post("/api/auth/register", json={"username": "no_admin_borrar", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.delete("/api/admin/users/cualquiera", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 403


def test_admin_delete_endpoint_removes_user_and_profile(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_borrar1"})
    r = client.post("/api/auth/register", json={"username": "admin_borrar1", "password": "clave123456"})
    admin_token = r.json()["token"]

    r2 = client.post("/api/auth/register", json={"username": "jugador_borrar", "password": "clave123456"})
    player_token = r2.json()["token"]
    client.put("/api/profile", json={"data": {"a": "1"}}, headers={"Authorization": f"Bearer {player_token}"})

    r3 = client.delete("/api/admin/users/jugador_borrar", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 200
    assert r3.json()["deleted"] is True

    # ya no puede loguearse -- la cuenta de verdad desapareció
    r4 = client.post("/api/auth/login", json={"username": "jugador_borrar", "password": "clave123456"})
    assert r4.status_code == 401


def test_admin_delete_endpoint_404_for_nonexistent_user(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_borrar2"})
    r = client.post("/api/auth/register", json={"username": "admin_borrar2", "password": "clave123456"})
    admin_token = r.json()["token"]
    r2 = client.delete("/api/admin/users/no-existe-nadie-asi", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 404


def test_admin_cannot_delete_own_account_via_this_endpoint(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_no_se_autoborra"})
    r = client.post("/api/auth/register", json={"username": "admin_no_se_autoborra", "password": "clave123456"})
    admin_token = r.json()["token"]
    r2 = client.delete("/api/admin/users/admin_no_se_autoborra", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 400


# ---------- Log de acceso con usuario ----------

def test_access_log_shows_anon_for_unauthenticated_request(caplog):
    with caplog.at_level("INFO", logger="chess.access"):
        client.get("/api/health")
    assert any("user=anon" in msg for msg in caplog.messages)


def test_access_log_shows_username_for_authenticated_request(caplog):
    r = client.post("/api/auth/register", json={"username": "usuario_del_log", "password": "clave123456"})
    token = r.json()["token"]
    with caplog.at_level("INFO", logger="chess.access"):
        client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
    assert any("user=usuario_del_log" in msg for msg in caplog.messages)


def test_access_log_falls_back_to_anon_for_invalid_token(caplog):
    with caplog.at_level("INFO", logger="chess.access"):
        client.get("/api/profile", headers={"Authorization": "Bearer token-invalido"})
    assert any("user=anon" in msg for msg in caplog.messages)
