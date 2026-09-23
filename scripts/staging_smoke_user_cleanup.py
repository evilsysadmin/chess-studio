#!/usr/bin/env python3
"""Limpia identidades técnicas del smoke usando exclusivamente la API staging.

GitHub no necesita acceso de red a Atlas. El janitor autentica la cuenta técnica
y usa el borrado propio de cuenta, cuya cascada se ejecuta dentro del backend de
staging. Si la cuenta no existe el cleanup es idempotente; si existe con otra
contraseña, falla cerrado.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request

CI_USER_RE = re.compile(r"^ci_smoke_[0-9a-f]{16}$")
SYNTHETIC_SOURCE = "staging-smoke-cleanup"


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


def synthetic_headers(username: str, secret: str) -> dict[str, str]:
    identity = validate_ci_username(username)
    key = str(secret or "").encode("utf-8")
    if not key:
        raise SystemExit("Falta STAGING_SYNTHETIC_SECRET para firmar el janitor")
    message = f"chess-studio:synthetic:{SYNTHETIC_SOURCE}\x00{identity}".encode("utf-8")
    return {
        "X-Chess-Synthetic-Source": SYNTHETIC_SOURCE,
        "X-Chess-Synthetic-Identity": identity,
        "X-Chess-Synthetic-Signature": hmac.new(key, message, hashlib.sha256).hexdigest(),
    }


def header_value(headers: dict[str, str], name: str) -> str:
    wanted = str(name or "").lower()
    return next((str(value) for key, value in headers.items() if str(key).lower() == wanted), "")


def request_json(
    method: str,
    url: str,
    payload: dict | None = None,
    token: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, dict, dict[str, str]]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "User-Agent": "chess-studio-staging-smoke-cleanup/2",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}, dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"detail": raw[:200]}
        return exc.code, body, dict(exc.headers.items())


def cleanup_identity(api: str, username: str, password: str, synthetic_secret: str) -> str:
    username = validate_ci_username(username)
    signed = synthetic_headers(username, synthetic_secret)
    status, login, login_headers = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
        extra_headers=signed,
    )
    if status == 401:
        reason = header_value(login_headers, "X-Chess-Auth-Failure")
        if reason == "unknown_user":
            return "absent"
        if reason == "bad_password":
            raise SystemExit("La identidad técnica existe pero su contraseña no coincide; cleanup abortado")
        raise SystemExit("Login técnico devolvió 401 sin motivo firmado; cleanup abortado")
    if status != 200 or not login.get("token"):
        raise SystemExit(f"No se pudo autenticar la identidad técnica para cleanup (HTTP {status})")

    status, deleted, _ = request_json(
        "POST",
        f"{api}/auth/delete-account",
        {"password": password},
        token=str(login["token"]),
    )
    if status != 200 or deleted.get("deleted") is not True:
        raise SystemExit(f"Borrado de identidad técnica devolvió HTTP {status}")

    # Verificación desde fuera: las mismas credenciales deben quedar revocadas.
    verify_status, _, verify_headers = request_json(
        "POST",
        f"{api}/auth/login",
        {"username": username, "password": password},
        extra_headers=signed,
    )
    if (
        verify_status != 401
        or header_value(verify_headers, "X-Chess-Auth-Failure") != "unknown_user"
    ):
        raise SystemExit(
            f"La identidad técnica sigue autenticando o no quedó verificablemente ausente tras cleanup (HTTP {verify_status})"
        )
    return "deleted"


def self_test() -> None:
    assert CI_USER_RE.fullmatch("ci_smoke_0123456789abcdef")
    signed = synthetic_headers("ci_smoke_0123456789abcdef", "synthetic-test-secret")
    assert signed["X-Chess-Synthetic-Source"] == SYNTHETIC_SOURCE
    assert signed["X-Chess-Synthetic-Identity"] == "ci_smoke_0123456789abcdef"
    assert len(signed["X-Chess-Synthetic-Signature"]) == 64
    assert "synthetic-test-secret" not in "".join(signed.values())
    for invalid in ("evilsysadmin", "ci_smoke_short", "ci_smoke_0123456789abcdeg"):
        try:
            validate_ci_username(invalid)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"El janitor aceptó un username no técnico: {invalid}")
    print("staging-smoke-user-cleanup self-test OK · API-only")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument(
        "--sweep",
        action="store_true",
        help="Compatibilidad temporal: el sweep legacy de Render está retirado",
    )
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    if args.sweep:
        print("Staging smoke janitor: sweep legacy de Render retirado · OK")
        return

    api = required("STAGING_API_URL").rstrip("/")
    username = required("STAGING_E2E_USERNAME")
    password = required("STAGING_E2E_PASSWORD")
    synthetic_secret = required("STAGING_SYNTHETIC_SECRET")
    result = cleanup_identity(api, username, password, synthetic_secret)
    print(f"Staging smoke janitor: identidad actual · {result} · OK")


if __name__ == "__main__":
    main()
