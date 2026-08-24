#!/usr/bin/env python3
"""Smoke real del stack Docker Compose usando sólo stdlib.

Valida que frontend nginx + FastAPI + Mongo + auth + persistencia de perfil
funcionan juntos. No sustituye unit/E2E; cubre el hueco entre ambos.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

FRONTEND = os.getenv("SMOKE_FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")
API = os.getenv("SMOKE_API_URL", "http://127.0.0.1:4000/api").rstrip("/")
TIMEOUT = float(os.getenv("SMOKE_TIMEOUT_SECONDS", "90"))


def request(method: str, url: str, payload=None, token: str | None = None, timeout=5):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read()
        content_type = response.headers.get("Content-Type", "")
        body = json.loads(raw) if raw and "json" in content_type else raw.decode("utf-8", "replace")
        return response.status, body


def wait_ready():
    deadline = time.monotonic() + TIMEOUT
    last = None
    while time.monotonic() < deadline:
        try:
            api_status, health = request("GET", f"{API}/health", timeout=3)
            web_status, html = request("GET", FRONTEND, timeout=3)
            if api_status == 200 and web_status == 200 and "<html" in str(html).lower():
                return health
        except Exception as exc:  # noqa: BLE001 - diagnóstico de smoke
            last = exc
        time.sleep(2)
    raise RuntimeError(f"stack no estuvo listo en {TIMEOUT:.0f}s: {last}")


def main() -> int:
    health = wait_ready()
    stamp = f"{int(time.time())}-{os.getpid()}"
    username = f"smoke_{stamp}"[:28]
    password = "smoke-clave-123456"

    status, registered = request("POST", f"{API}/auth/register", {"username": username, "password": password})
    assert status in (200, 201), (status, registered)
    token = registered.get("token")
    assert token, registered

    status, me = request("GET", f"{API}/auth/me", token=token)
    assert status == 200 and me.get("username") == username, me

    marker = f"compose-smoke-{stamp}"
    profile = {
        "data": {
            "chess-study-compose-smoke": json.dumps({"marker": marker, "wins": 3}),
            "chess-study-player-rating": json.dumps({"rating": 777}),
        }
    }
    status, saved = request("PUT", f"{API}/profile", profile, token=token)
    assert status == 200, saved

    # Partida real persistida en Mongo. La recuperamos después con un token de
    # login nuevo para cubrir el hueco entre tests HTTP en memoria y el E2E
    # de navegador, que deliberadamente simula la API.
    status, created_game = request(
        "POST",
        f"{API}/games",
        {"difficulty": 0, "color": "w"},
        token=token,
    )
    assert status == 201 and created_game.get("id"), created_game
    game_id = created_game["id"]
    game_fen = created_game.get("fen")

    # Login nuevo: prueba bcrypt/JWT/Mongo de verdad, no sólo el token de alta.
    status, logged = request("POST", f"{API}/auth/login", {"username": username, "password": password})
    assert status == 200 and logged.get("token"), logged
    token2 = logged["token"]

    status, loaded = request("GET", f"{API}/profile", token=token2)
    assert status == 200, loaded
    data = loaded.get("data", loaded)
    assert marker in str(data.get("chess-study-compose-smoke", "")), loaded
    assert "777" in str(data.get("chess-study-player-rating", "")), loaded

    status, restored_game = request("GET", f"{API}/games/{game_id}", token=token2)
    assert status == 200, restored_game
    assert restored_game.get("id") == game_id, restored_game
    assert restored_game.get("fen") == game_fen, (created_game, restored_game)
    assert restored_game.get("status") == "playing", restored_game

    # Una ruta privada sin token debe seguir cerrada en el stack real.
    try:
        request("GET", f"{API}/profile")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401, exc.code
    else:
        raise AssertionError("/api/profile aceptó request anónimo")

    print(f"compose-smoke OK · frontend+backend+mongo · user={username} · health={health}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"compose-smoke FAIL: {exc}", file=sys.stderr)
        raise
