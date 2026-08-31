#!/usr/bin/env python3
"""Limpia identidades técnicas del smoke usando exclusivamente la API staging.

GitHub no necesita acceso de red a Atlas. El janitor autentica la cuenta técnica
y usa el borrado propio de cuenta, cuya cascada se ejecuta dentro de Render. Si
la cuenta no existe el cleanup es idempotente; si existe con otra contraseña,
falla cerrado.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.error
import urllib.request

CI_USER_RE = re.compile(r"^ci_smoke_[0-9a-f]{16}$")


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para limpiar el usuario técnico de staging")
    return value


def validate_ci_username(username: str) -> str:
    candidate = str(username or "").strip().lower()
    if not CI_USER_RE.fullmatch(candidate):
        raise SystemExit("Refuso borrar un username fuera de ci_smoke_<16 hex>")
    return candidate


def legacy_credentials(render_api_key: str) -> tuple[str, str]:
    """Credenciales del smoke estable usado antes de los usuarios por-run.

    Permite recoger el único usuario que pudo quedar vivo antes de introducir
    cleanup post-test. El hash contextual no permite recuperar RENDER_API_KEY.
    """
    identity = hashlib.sha256(
        f"chess-studio-staging-smoke-user:v1:{render_api_key}".encode()
    ).hexdigest()[:16]
    secret = hashlib.sha256(
        f"chess-studio-staging-smoke-password:v1:{render_api_key}".encode()
    ).hexdigest()
    return f"ci_smoke_{identity}", f"CS!{secret}"


def request_json(method: str, url: str, payload: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "User-Agent": "chess-studio-staging-smoke-cleanup/2",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"detail": raw[:200]}
        return exc.code, body


def cleanup_identity(api: str, username: str, password: str) -> str:
    username = validate_ci_username(username)
    status, login = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
    )
    if status == 401:
        return "absent"
    if status != 200 or not login.get("token"):
        raise SystemExit(f"No se pudo autenticar la identidad técnica para cleanup (HTTP {status})")

    status, deleted = request_json(
        "POST",
        f"{api}/auth/delete-account",
        {"password": password},
        token=str(login["token"]),
    )
    if status != 200 or deleted.get("deleted") is not True:
        raise SystemExit(f"Borrado de identidad técnica devolvió HTTP {status}")

    # Verificación desde fuera: las mismas credenciales deben quedar revocadas.
    verify_status, _ = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
    )
    if verify_status != 401:
        raise SystemExit(f"La identidad técnica sigue autenticando tras cleanup (HTTP {verify_status})")
    return "deleted"


def self_test() -> None:
    username, password = legacy_credentials("render-key-fixture")
    assert CI_USER_RE.fullmatch(username)
    assert password.startswith("CS!") and len(password) == 67
    assert legacy_credentials("render-key-fixture") == (username, password)
    assert legacy_credentials("other-key") != (username, password)
    try:
        validate_ci_username("evilsysadmin")
    except SystemExit:
        pass
    else:
        raise AssertionError("El janitor aceptó un username no técnico")
    print("staging-smoke-user-cleanup self-test OK · API-only")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument(
        "--sweep",
        action="store_true",
        help="Recoge la identidad estable legacy que pudo quedar antes del cleanup always()",
    )
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    api = required("STAGING_API_URL").rstrip("/")
    if args.sweep:
        username, password = legacy_credentials(required("RENDER_API_KEY"))
        result = cleanup_identity(api, username, password)
        print(f"Staging smoke janitor: cleanup legacy · {result} · OK")
        return

    username = required("STAGING_E2E_USERNAME")
    password = required("STAGING_E2E_PASSWORD")
    result = cleanup_identity(api, username, password)
    print(f"Staging smoke janitor: identidad actual · {result} · OK")


if __name__ == "__main__":
    main()
