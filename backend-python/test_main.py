"""test_main.py — Tests de la API vía FastAPI TestClient. `conftest.py` ya
se encarga de que estos tests usen el respaldo en memoria (no intentan
conectar a un Mongo real).
"""

import asyncio
import json
import logging

import pytest

import chess
from fastapi.testclient import TestClient

import game_store as store
import users_store as ustore
from main import app
from auth import create_token

raw_client = TestClient(app)
_TEST_TOKEN = create_token("testuser")
_TEST_AUTH = {"Authorization": f"Bearer {_TEST_TOKEN}"}


class _AuthenticatedClient:
    """Compatibilidad para los tests históricos: por defecto ejercitan la
    API como un usuario autenticado. Los tests de seguridad usan raw_client
    para verificar explícitamente los 401.
    """
    def request(self, method, url, **kwargs):
        headers = {**_TEST_AUTH, **(kwargs.pop("headers", {}) or {})}
        return raw_client.request(method, url, headers=headers, **kwargs)

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


client = _AuthenticatedClient()


def _seed(game_id: str, moves: list[str], human_color: str, difficulty: int = 0):
    """Sobreescribe una partida ya creada con una secuencia de jugadas SAN
    concreta, para probar posiciones puntuales sin depender de una CPU
    aleatoria ni tener que jugar toda una partida a mano."""
    asyncio.run(
        store.update_game(
            game_id,
            {"owner": "testuser", "moves": moves, "difficulty": difficulty, "humanColor": human_color, "lastMove": None},
        )
    )


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_status_requires_auth_and_counts_recent_users_without_exposing_identities():
    assert raw_client.get("/api/status").status_code == 401
    asyncio.run(ustore.touch_last_activity("testuser", force=True))
    r = client.get("/api/status")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "onlineUsers": 1, "presenceAvailable": True}
    assert "testuser" not in r.text


def test_status_hides_authenticated_admin_from_public_presence(monkeypatch):
    import main as main_module

    monkeypatch.setattr(main_module, "_ADMIN_USERNAMES", {"testuser"})
    asyncio.run(ustore.touch_last_activity("testuser", force=True))
    r = client.get("/api/status")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "onlineUsers": 0, "presenceAvailable": True}


def test_root_identifies_backend_instead_of_returning_404():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == {
        "ok": True,
        "service": "Chess Studio API",
        "health": "/api/health",
    }


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


def test_create_game_accepts_bounded_ghost_style_and_returns_it():
    style = {"capture": 0.5, "pawn": -0.25, "queen": 0.1, "check": 1.0, "castle": -1.0}
    r = client.post("/api/games", json={"difficulty": 50, "color": "w", "ghostStyle": style})
    assert r.status_code == 201
    assert r.json()["ghostStyle"] == style


def test_create_game_rejects_ghost_style_outside_safe_range():
    r = client.post("/api/games", json={"difficulty": 50, "color": "w", "ghostStyle": {"capture": 99}})
    assert r.status_code == 422


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
    assert 99000 <= body["evalAfterSuggested"] <= 100000  # mate decisivo y finito; conserva distancia al mate

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


def test_analyze_move_funciona_igual_con_jwt_y_con_header_api_key_no_configurado():
    # Un header X-API-Key no configurado no invalida una sesión JWT válida.
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


def test_access_log_includes_authenticated_username(caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    registered = client.post(
        "/api/auth/register",
        json={"username": "usuario_logs", "password": "clave123456"},
    )
    token = registered.json()["token"]

    caplog.clear()
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert any(
        "user=usuario_logs method=GET path=/api/auth/me status=200" in record.getMessage()
        for record in caplog.records
    )


def test_request_id_is_echoed_and_logged(caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    request_id = "web-test-abc123"
    caplog.clear()
    response = client.get("/api/health", headers={"X-Request-ID": request_id})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id
    assert any(f"request_id={request_id}" in record.getMessage() for record in caplog.records)


def test_register_access_log_attributes_new_username(caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    response = client.post(
        "/api/auth/register",
        json={"username": "alta_logueada", "password": "clave123456"},
    )

    assert response.status_code == 201
    assert any(
        "user=alta_logueada method=POST path=/api/auth/register status=201" in record.getMessage()
        for record in caplog.records
    )


def test_me_endpoint_without_token_rejected():
    r = raw_client.get("/api/auth/me")
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
    r = raw_client.get("/api/admin/users")
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



def test_admin_can_delete_user_and_cascade_profile_and_games(monkeypatch):
    import asyncio
    import users_store as ustore
    import profile_store as pstore
    import game_store as gstore

    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_delete"})
    admin = raw_client.post("/api/auth/register", json={"username": "admin_delete", "password": "clave123456"})
    admin_token = admin.json()["token"]

    victim = raw_client.post("/api/auth/register", json={"username": "victima_delete", "password": "clave123456"})
    victim_token = victim.json()["token"]
    raw_client.put(
        "/api/profile",
        json={"marker": "to-delete"},
        headers={"Authorization": f"Bearer {victim_token}"},
    )
    game = raw_client.post(
        "/api/games",
        json={"difficulty": 0, "color": "w"},
        headers={"Authorization": f"Bearer {victim_token}"},
    )
    assert game.status_code == 201
    game_id = game.json()["id"]

    deleted = raw_client.post(
        "/api/admin/delete-user",
        json={"username": "victima_delete"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert deleted.json()["username"] == "victima_delete"
    assert deleted.json()["deletedGames"] == 1
    assert asyncio.run(ustore.get_user("victima_delete")) is None
    assert asyncio.run(pstore.get_profile("victima_delete")) is None
    assert asyncio.run(gstore.get_game(game_id)) is None
    assert raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {victim_token}"}).status_code == 401

    relogin = raw_client.post("/api/auth/login", json={"username": "victima_delete", "password": "clave123456"})
    assert relogin.status_code == 401


def test_admin_cannot_delete_own_account(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_self"})
    admin = raw_client.post("/api/auth/register", json={"username": "admin_self", "password": "clave123456"})
    token = admin.json()["token"]
    response = raw_client.post(
        "/api/admin/delete-user",
        json={"username": "admin_self"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 409


def test_admin_delete_user_rejects_non_admin(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"real_admin"})
    user = raw_client.post("/api/auth/register", json={"username": "not_admin_delete", "password": "clave123456"})
    token = user.json()["token"]
    response = raw_client.post(
        "/api/admin/delete-user",
        json={"username": "someone"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

def test_create_game_returns_503_when_configured_mongo_is_down(monkeypatch):
    """Con persistencia configurada, una caída de Mongo no crea partidas efímeras en RAM."""
    monkeypatch.setattr("game_store.persistent_storage_required", lambda: True)

    r = client.post("/api/games", json={"difficulty": 20, "color": "w"})

    assert r.status_code == 503
    assert "base de datos" in r.json()["detail"].lower()


def test_admin_wildcard_makes_every_authenticated_user_admin(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"*"})
    r = client.post("/api/auth/register", json={"username": "cualquiera_local", "password": "clave123456"})
    token = r.json()["token"]
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["isAdmin"] is True


def test_admin_endpoint_exposes_richer_chess_stats(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_stats_rich"})
    admin = client.post("/api/auth/register", json={"username": "admin_stats_rich", "password": "clave123456"})
    admin_token = admin.json()["token"]

    player = client.post("/api/auth/register", json={"username": "cotilla_target", "password": "clave123456"})
    player_token = player.json()["token"]
    game_history = [
        {
            "id": "g1", "date": "2026-01-01T00:00:00Z", "difficulty": 80,
            "humanColor": "w", "outcome": "win",
            "moves": [
                {"san": "e4", "captured": False, "capturedPiece": None},
                {"san": "d5", "captured": False, "capturedPiece": None},
                {"san": "exd5", "captured": True, "capturedPiece": "q"},
            ],
        },
        {
            "id": "g2", "date": "2026-01-02T00:00:00Z", "difficulty": 45,
            "humanColor": "b", "outcome": "loss",
            "moves": [
                {"san": "e4", "captured": False, "capturedPiece": None},
                {"san": "e5", "captured": False, "capturedPiece": None},
                {"san": "Qh5", "captured": False, "capturedPiece": None},
                {"san": "Nc6", "captured": False, "capturedPiece": None},
                {"san": "Qxe5", "captured": True, "capturedPiece": "q"},
            ],
        },
    ]
    worst_cache = {
        "g1": {"worst": {
            "index": 2, "moveNumber": 2,
            "played": "Q??", "playedFrom": "d1", "playedTo": "h5", "playedPiece": "q",
            "suggested": "Qh7#", "suggestedFrom": "d3", "suggestedTo": "h7", "suggestedPiece": "q",
            "loss": 420, "severity": "blunder",
        }, "analyzedAt": "2026-01-03T00:00:00Z"}
    }
    client.put(
        "/api/profile",
        json={"data": {
            "chess-study-player-rating": json.dumps({"rating": 900, "games": 8}),
            "chess-study-rating-history": json.dumps([{"rating": 850}, {"rating": 940}, {"rating": 900}]),
            "chess-study-game-history": json.dumps(game_history),
            "chess-study-combat-history": json.dumps([]),
            "chess-study-worst-move-cache": json.dumps(worst_cache),
            "chess-study-achievements": json.dumps(["first_game", "ten_games"]),
            "chess-study-puzzles-solved": json.dumps(12),
            "chess-study-puzzle-best-streak": json.dumps(5),
        }},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    target = {u["username"]: u for u in response.json()["users"]}["cotilla_target"]
    assert target["totalGames"] == 2
    assert target["wins"] == 1 and target["losses"] == 1
    assert target["bestDifficultyWin"] == 80
    assert target["ratingPeak"] == 940
    assert target["queensCaptured"] == 1
    assert target["queensLost"] == 1
    assert target["worstMove"]["loss"] == 420
    assert target["worstMove"]["index"] == 2
    assert target["worstMove"]["playedFrom"] == "d1"
    assert target["worstMove"]["suggestedTo"] == "h7"
    assert target["achievements"] == 2
    assert target["puzzlesSolved"] == 12



def test_admin_can_load_same_insights_payload_as_player(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_insights"})
    admin = client.post("/api/auth/register", json={"username": "admin_insights", "password": "clave123456"})
    admin_token = admin.json()["token"]

    player = client.post("/api/auth/register", json={"username": "jugador_observable", "password": "clave123456"})
    player_token = player.json()["token"]
    game_history = [{
        "id": "insight-g1", "date": "2026-08-20T18:00:00Z", "difficulty": 65,
        "humanColor": "w", "outcome": "win",
        "moves": [{"san": "e4"}, {"san": "e5"}, {"san": "Nf3"}, {"san": "Nc6"}, {"san": "Bb5"}],
    }]
    rivalry = {"record": {"games": 4, "wins": 2, "draws": 0, "losses": 2}, "incidents": {"human:MISSED_MATE": 2}}
    client.put(
        "/api/profile",
        json={"data": {
            "chess-study-game-history": json.dumps(game_history),
            "chess-study-combat-history": json.dumps([]),
            "chess-study-rating-history": json.dumps([{"rating": 800}, {"rating": 825}]),
            "chess-study-cpu-rivalry": json.dumps(rivalry),
            "chess-study-achievements": json.dumps(["first_game"]),
            "chess-study-puzzles-solved": json.dumps(7),
            "chess-study-personal-puzzles": json.dumps([{"id": "crime-1"}]),
        }},
        headers={"Authorization": f"Bearer {player_token}"},
    )

    response = client.get(
        "/api/admin/users/jugador_observable/insights",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "jugador_observable"
    assert body["gameHistory"][0]["id"] == "insight-g1"
    assert body["ratingHistory"][-1]["rating"] == 825
    assert body["rivalry"]["incidents"]["human:MISSED_MATE"] == 2
    assert body["extras"]["achievementsUnlocked"] == 1
    assert body["extras"]["puzzlesSolved"] == 7
    assert body["extras"]["personalPuzzles"] == 1


def test_admin_insights_rejects_non_admin(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"otro_admin"})
    player = client.post("/api/auth/register", json={"username": "curioso_no_admin", "password": "clave123456"})
    token = player.json()["token"]
    response = client.get(
        "/api/admin/users/curioso_no_admin/insights",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_admin_insights_post_handles_username_outside_url_path(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_json_insights"})
    admin = client.post("/api/auth/register", json={"username": "admin_json_insights", "password": "clave123456"})
    admin_token = admin.json()["token"]

    # Las versiones antiguas no restringían caracteres de username. Un slash
    # dentro del path puede convertirse en 404 al decodificarse; en JSON no.
    odd = client.post("/api/auth/register", json={"username": "usuario/con-barra", "password": "clave123456"})
    assert odd.status_code == 201

    response = client.post(
        "/api/admin/user-insights",
        json={"username": "usuario/con-barra"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "usuario/con-barra"


def test_admin_insights_post_rejects_non_admin(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"solo_admin_post"})
    player = client.post("/api/auth/register", json={"username": "usuario_normal_post", "password": "clave123456"})
    token = player.json()["token"]
    response = client.post(
        "/api/admin/user-insights",
        json={"username": "usuario_normal_post"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# ---------- Security V10 ----------

def test_game_endpoints_reject_anonymous_requests():
    assert raw_client.post("/api/games", json={"difficulty": 10, "color": "w"}).status_code == 401
    assert raw_client.get("/api/games/cualquier-id").status_code == 401
    assert raw_client.post("/api/games/cualquier-id/undo").status_code == 401
    assert raw_client.post("/api/games/cualquier-id/move", json={"from": "e2", "to": "e4"}).status_code == 401
    assert raw_client.delete("/api/games/cualquier-id").status_code == 401


def test_analysis_rejects_anonymous_without_m2m_key():
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    assert raw_client.post("/api/analyze", json={"fen": fen, "level": 10}).status_code == 401
    assert raw_client.post("/api/analyze-move", json={"fen": fen, "level": 10}).status_code == 401


def test_profile_admin_and_root_reject_anonymous_requests():
    assert raw_client.get("/api/profile").status_code == 401
    assert raw_client.put("/api/profile", json={}).status_code == 401
    assert raw_client.get("/api/admin/users").status_code == 401
    assert raw_client.post("/api/admin/user-insights", json={"username": "x"}).status_code == 401
    assert raw_client.get("/").status_code == 401


def test_health_is_intentionally_public():
    response = raw_client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_password_reset_token_cannot_be_used_as_session_bearer():
    from auth import create_password_reset_token
    token = create_password_reset_token("testuser", "fixture-only")
    assert raw_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_auth_fails_closed_when_account_existence_cannot_be_checked(monkeypatch):
    from db import PersistentStorageUnavailable

    async def fail_exists(*_args, **_kwargs):
        raise PersistentStorageUnavailable("mongo down")

    monkeypatch.setattr(ustore, "user_exists", fail_exists)
    response = raw_client.get("/api/auth/me", headers=_TEST_AUTH)
    assert response.status_code == 503


def test_rejects_declared_oversized_request_body():
    response = raw_client.post(
        "/api/auth/login",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": str(2 * 1024 * 1024)},
    )
    assert response.status_code == 413


def test_game_is_private_to_its_owner():
    alice_token = raw_client.post("/api/auth/register", json={"username": "alice", "password": "clave123456"}).json()["token"]
    bob_token = raw_client.post("/api/auth/register", json={"username": "bob", "password": "clave123456"}).json()["token"]
    alice = {"Authorization": f"Bearer {alice_token}"}
    bob = {"Authorization": f"Bearer {bob_token}"}
    created = raw_client.post("/api/games", json={"difficulty": 10, "color": "w"}, headers=alice)
    assert created.status_code == 201
    game_id = created.json()["id"]
    assert raw_client.get(f"/api/games/{game_id}", headers=alice).status_code == 200
    assert raw_client.get(f"/api/games/{game_id}", headers=bob).status_code == 404
    assert raw_client.delete(f"/api/games/{game_id}", headers=bob).status_code == 404


def test_registration_can_be_closed(monkeypatch):
    import main as main_module
    monkeypatch.setattr(main_module, "ALLOW_REGISTRATION", False)
    r = raw_client.post("/api/auth/register", json={"username": "intruso", "password": "clave123456"})
    assert r.status_code == 403

# ---------- Security V11: CORS + invite code ----------

def test_github_pages_login_preflight_is_allowed():
    """Regresión del 400 OPTIONS visto desde evilsysadmin.github.io/chess-studio/."""
    r = raw_client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://evilsysadmin.github.io",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-request-id",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://evilsysadmin.github.io"


def test_cors_config_with_github_pages_path_is_normalized():
    import main as main_module
    assert main_module._normalize_cors_origin("https://evilsysadmin.github.io/chess-studio/") == "https://evilsysadmin.github.io"


def test_registration_requires_invite_code_when_configured(monkeypatch):
    import main as main_module
    monkeypatch.setattr(main_module, "ALLOW_REGISTRATION", True)
    monkeypatch.setattr(main_module, "INVITE_CODE", "caballo-de-troya")

    missing = raw_client.post(
        "/api/auth/register",
        json={"username": "sin_invite", "password": "clave123456"},
    )
    wrong = raw_client.post(
        "/api/auth/register",
        json={"username": "invite_mal", "password": "clave123456", "inviteCode": "nope"},
    )
    ok = raw_client.post(
        "/api/auth/register",
        json={"username": "invite_ok", "password": "clave123456", "inviteCode": "caballo-de-troya"},
    )

    assert missing.status_code == 403
    assert wrong.status_code == 403
    assert ok.status_code == 201


# ---------- V16: presencia admin + core gate ----------

def test_presence_summary_classifies_online_recent_and_offline():
    from datetime import datetime, timedelta, timezone
    from main import _presence_summary

    now = datetime.now(timezone.utc)
    assert _presence_summary(now.isoformat())["presence"] == "online"
    assert _presence_summary((now - timedelta(minutes=5)).isoformat())["presence"] == "recent"
    assert _presence_summary((now - timedelta(hours=2)).isoformat())["presence"] == "offline"
    assert _presence_summary(None)["presence"] == "never"


def test_admin_users_exposes_last_activity_and_presence(monkeypatch):
    import users_store as ustore
    import main as main_module

    monkeypatch.setattr(main_module, "_ADMIN_USERNAMES", {"testuser"})
    asyncio.run(ustore.create_user("active_player", "hash-no-usado"))

    response = client.get("/api/admin/users")
    assert response.status_code == 200
    row = next(u for u in response.json()["users"] if u["username"] == "active_player")
    assert row["lastActivity"]
    assert row["presence"] == "online"
    assert isinstance(row["presenceAgeSeconds"], int)


def test_forced_activity_records_last_login_and_admin_legacy_fallback(monkeypatch):
    import users_store as ustore
    import main as main_module

    monkeypatch.setattr(main_module, "_ADMIN_USERNAMES", {"testuser"})
    asyncio.run(ustore.create_user("legacy_player", "hash-no-usado"))
    # Simula una cuenta antigua sin last_activity, pero que vuelve a entrar en
    # V16.6: el login forzado deja last_login + last_activity.
    ustore._memory_users["legacy_player"].pop("last_activity", None)
    asyncio.run(ustore.touch_last_activity("legacy_player", force=True))
    stored = ustore._memory_users["legacy_player"]
    assert stored["last_login"] == stored["last_activity"]

    # Y si por datos legacy sólo queda last_login, el panel sigue mostrando
    # una última actividad concreta en vez de “Sin actividad”.
    stored.pop("last_activity", None)
    response = client.get("/api/admin/users")
    row = next(u for u in response.json()["users"] if u["username"] == "legacy_player")
    assert row["lastActivity"] == stored["last_login"]
    assert row["presence"] in {"online", "recent", "offline"}


def test_resolve_move_core_rules_cover_castling_en_passant_and_promotion():
    from main import resolve_move

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


def test_activity_heartbeat_is_protected_and_lightweight():
    assert raw_client.post("/api/auth/activity").status_code == 401
    assert client.post("/api/auth/activity").status_code == 204


def test_claimable_threefold_is_consistently_a_finished_draw():
    from main import serialize_game

    board = chess.Board()
    for san in ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]:
        board.push_san(san)
    assert board.can_claim_threefold_repetition()

    entry = {
        "humanColor": "w",
        "difficulty": 50,
        "moves": ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"],
        "lastMove": None,
        "initialFen": None,
        "handicap": None,
    }
    payload = serialize_game("repeat-gate", entry, board)
    assert payload["status"] == "repetition"
    assert payload["isGameOver"] is True


def test_undo_reconstructs_last_move_from_custom_starting_fen():
    start_fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"
    created = client.post("/api/games", json={"difficulty": 45, "color": "w", "startingFen": start_fen})
    assert created.status_code == 201
    game_id = created.json()["id"]

    first = client.post(f"/api/games/{game_id}/move", json={"from": "e2", "to": "e4"})
    assert first.status_code == 200

    # Elegimos dinámicamente una legal del humano después de la respuesta de
    # la CPU para no acoplar el test a una jugada concreta del minimax.
    current = chess.Board(first.json()["fen"])
    human_move = next(iter(current.legal_moves))
    second = client.post(
        f"/api/games/{game_id}/move",
        json={"from": chess.square_name(human_move.from_square), "to": chess.square_name(human_move.to_square)},
    )
    assert second.status_code == 200

    undone = client.post(f"/api/games/{game_id}/undo")
    assert undone.status_code == 200
    # Quedan el primer movimiento humano y la primera respuesta CPU; el
    # lastMove reconstruido debe seguir perteneciendo a la CPU y no explotar
    # intentando reproducir el laboratorio desde la posición inicial normal.
    assert len(undone.json()["history"]) == 2
    assert undone.json()["lastMove"]["by"] == "cpu"


def test_core_serialization_terminal_statuses_are_consistent():
    from main import serialize_game

    cases = [
        (chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), "stalemate"),
        (chess.Board("8/8/8/8/8/2k5/4K3/5R2 w - - 100 51"), "draw"),
        (chess.Board("8/8/8/8/8/k7/8/K6N w - - 0 1"), "draw"),
    ]
    for index, (board, expected_status) in enumerate(cases):
        entry = {
            "humanColor": "w",
            "difficulty": 50,
            "moves": [],
            "lastMove": None,
            "initialFen": board.fen(),
            "handicap": None,
        }
        payload = serialize_game(f"terminal-{index}", entry, board)
        assert payload["status"] == expected_status
        assert payload["isGameOver"] is True


def test_presence_write_failure_never_blocks_authenticated_core(monkeypatch):
    import users_store as ustore
    from db import PersistentStorageUnavailable

    async def fail_presence(*_args, **_kwargs):
        raise PersistentStorageUnavailable("presence down")

    telemetry = raw_client.post("/api/auth/register", json={"username": "telemetry_user", "password": "clave123456"})
    headers = {"Authorization": f"Bearer {telemetry.json()['token']}"}
    monkeypatch.setattr(ustore, "touch_last_activity", fail_presence)
    response = raw_client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["username"] == "telemetry_user"

# ---------- Recuperación de cuenta por email (compatibilidad, desactivada por defecto en V16.6) ----------

@pytest.fixture
def email_recovery_enabled(monkeypatch):
    import main as main_module
    monkeypatch.setattr(main_module, "ENABLE_EMAIL_RECOVERY", True)


def test_register_requires_email_when_recovery_enabled(email_recovery_enabled):
    response = client.post(
        "/api/auth/register",
        json={"username": "sin_correo", "password": "clave123456"},
    )
    assert response.status_code == 400
    assert "email" in response.json()["detail"].lower()


def test_register_stores_normalized_recovery_email(email_recovery_enabled):
    registered = client.post(
        "/api/auth/register",
        json={"username": "correo_ok", "password": "clave123456", "email": "  USER@Example.COM  "},
    )
    assert registered.status_code == 201
    token = registered.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "user@example.com"


def test_register_rejects_recovery_email_already_owned(email_recovery_enabled):
    first = client.post(
        "/api/auth/register",
        json={"username": "correo_uno", "password": "clave123456", "email": "same@example.com"},
    )
    assert first.status_code == 201
    second = client.post(
        "/api/auth/register",
        json={"username": "correo_dos", "password": "clave123456", "email": "SAME@example.com"},
    )
    assert second.status_code == 409


def test_recovery_email_can_be_edited_only_with_current_password(email_recovery_enabled):
    registered = client.post(
        "/api/auth/register",
        json={"username": "edita_correo", "password": "clave123456", "email": "old@example.com"},
    )
    token = registered.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    denied = client.put(
        "/api/auth/email",
        headers=headers,
        json={"email": "new@example.com", "password": "mal"},
    )
    assert denied.status_code == 401

    updated = client.put(
        "/api/auth/email",
        headers=headers,
        json={"email": "NEW@example.com", "password": "clave123456"},
    )
    assert updated.status_code == 200
    assert updated.json()["email"] == "new@example.com"
    assert client.get("/api/auth/me", headers=headers).json()["email"] == "new@example.com"


def test_forgot_password_never_reveals_if_email_exists(monkeypatch, email_recovery_enabled):
    import main as main_module

    sent = []
    monkeypatch.setattr(main_module, "send_password_reset_email", lambda email, url: sent.append((email, url)) or True)

    missing = client.post("/api/auth/forgot-password", json={"email": "nadie@example.com"})
    assert missing.status_code == 200
    assert "Si ese email está registrado" in missing.json()["message"]
    assert sent == []

    client.post(
        "/api/auth/register",
        json={"username": "recuperable", "password": "clave123456", "email": "recover@example.com"},
    )
    existing = client.post("/api/auth/forgot-password", json={"email": "recover@example.com"})
    assert existing.status_code == 200
    assert existing.json()["message"] == missing.json()["message"]
    assert len(sent) == 1
    assert sent[0][0] == "recover@example.com"
    assert "resetToken=" in sent[0][1]


def test_password_reset_token_is_one_use_and_invalidates_old_password(monkeypatch, email_recovery_enabled):
    from urllib.parse import parse_qs, urlsplit
    import main as main_module

    sent = []
    monkeypatch.setattr(main_module, "send_password_reset_email", lambda email, url: sent.append((email, url)) or True)

    client.post(
        "/api/auth/register",
        json={"username": "reset_one_use", "password": "clave-vieja", "email": "reset@example.com"},
    )
    client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    assert len(sent) == 1
    token = parse_qs(urlsplit(sent[0][1]).query)["resetToken"][0]

    reset = client.post(
        "/api/auth/reset-password",
        json={"token": token, "newPassword": "clave-nueva-123"},
    )
    assert reset.status_code == 200
    assert "token" in reset.json()

    assert client.post(
        "/api/auth/login",
        json={"username": "reset_one_use", "password": "clave-vieja"},
    ).status_code == 401
    assert client.post(
        "/api/auth/login",
        json={"username": "reset_one_use", "password": "clave-nueva-123"},
    ).status_code == 200

    # El token lleva una huella del hash anterior. Una vez cambiada la clave,
    # reutilizar el mismo enlace deja de ser válido aunque aún no hayan pasado 30 min.
    reused = client.post(
        "/api/auth/reset-password",
        json={"token": token, "newPassword": "otra-clave-123"},
    )
    assert reused.status_code == 400


def test_password_reset_rejects_garbage_token(email_recovery_enabled):
    response = client.post(
        "/api/auth/reset-password",
        json={"token": "no-es-un-jwt", "newPassword": "clave-nueva-123"},
    )
    assert response.status_code == 400
