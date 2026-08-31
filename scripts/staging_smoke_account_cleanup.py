#!/usr/bin/env python3
"""Elimina la identidad técnica del smoke usando exclusivamente la API pública.

No toca Atlas directamente. Si la cuenta no existe, el cleanup es idempotente.
Si existe con una contraseña distinta, falla cerrado para no borrar una cuenta
que no pertenezca al pipeline.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para limpiar el smoke de staging")
    return value


def request_json(method: str, url: str, payload: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "User-Agent": "chess-studio-staging-smoke-cleanup/1",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"detail": raw[:200]}
        return exc.code, body


def main() -> None:
    api = required("STAGING_API_URL").rstrip("/")
    username = required("STAGING_E2E_USERNAME")
    password = required("STAGING_E2E_PASSWORD")
    if not username.startswith("ci_smoke_"):
        raise SystemExit("Refuso limpiar una identidad fuera del namespace ci_smoke_")

    status, login = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
    )
    if status == 401:
        print("Staging smoke cleanup: identidad ausente · OK")
        return
    if status != 200 or not login.get("token"):
        raise SystemExit(f"No se pudo autenticar la identidad técnica para cleanup (HTTP {status})")

    token = str(login["token"])
    status, deleted = request_json(
        "POST",
        f"{api}/auth/delete-account",
        {"password": password},
        token=token,
    )
    if status != 200 or deleted.get("deleted") is not True:
        raise SystemExit(f"Borrado de identidad técnica devolvió HTTP {status}")

    # Verificación externa: la misma credencial ya no debe poder iniciar sesión.
    verify_status, _ = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
    )
    if verify_status != 401:
        raise SystemExit(f"La identidad técnica sigue autenticando tras cleanup (HTTP {verify_status})")

    print("Staging smoke cleanup: identidad eliminada y login revocado · OK")


if __name__ == "__main__":
    main()
