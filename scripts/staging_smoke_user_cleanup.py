#!/usr/bin/env python3
"""Limpia identidades técnicas del smoke usando exclusivamente la API staging.

GitHub no necesita acceso de red a Atlas. El janitor autentica la cuenta técnica
y usa el borrado propio de cuenta, cuya cascada se ejecuta dentro del backend de
staging. Si la cuenta no existe el cleanup es idempotente; si existe con otra
contraseña, falla cerrado.
"""
from __future__ import annotations

import argparse
import http.client
import io
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.request

from staging_pvp_continuity_probe import companion_username

CI_USER_RE = re.compile(r"^ci_smoke_[0-9a-f]{16}$")
SYNTHETIC_SOURCE = "staging-smoke-cleanup"
TRANSIENT_LOGIN_HTTP = frozenset({502, 503, 504, 520, 521, 522, 523})
MAX_LOGIN_ATTEMPTS = 3


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


def transient_transport_error(error: Exception) -> bool:
    if isinstance(error, urllib.error.URLError):
        return isinstance(error.reason, (
            TimeoutError, ConnectionResetError, http.client.IncompleteRead,
        ))
    return isinstance(error, (
        TimeoutError, ConnectionResetError, http.client.IncompleteRead,
    ))


def request_json(
    method: str,
    url: str,
    payload: dict | None = None,
    token: str | None = None,
    extra_headers: dict[str, str] | None = None,
    *,
    opener=None,
    sleep=time.sleep,
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
    # Repeating synthetic login is safe; retrying account deletion after a
    # timeout is NOT safe because its write may already have committed.
    retry_login = method == "POST" and url.endswith("/auth/login") and token is None
    attempts = MAX_LOGIN_ATTEMPTS if retry_login else 1
    for attempt in range(attempts):
        try:
            with (opener or urllib.request.urlopen)(request, timeout=20) as response:
                raw = response.read().decode("utf-8", "replace")
                return response.status, json.loads(raw) if raw else {}, dict(response.headers.items())
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                body = {"detail": raw[:200]}
            if retry_login and exc.code in TRANSIENT_LOGIN_HTTP and attempt + 1 < attempts:
                print(f"::notice title=Staging janitor retry::login HTTP {exc.code}, intento {attempt + 2}/{attempts}")
                sleep(attempt + 1)
                continue
            return exc.code, body, dict(exc.headers.items())
        except (urllib.error.URLError, TimeoutError, ConnectionResetError,
                http.client.IncompleteRead) as exc:
            if not retry_login or not transient_transport_error(exc) or attempt + 1 == attempts:
                raise
            print(f"::notice title=Staging janitor retry::login sin respuesta, intento {attempt + 2}/{attempts}")
            sleep(attempt + 1)
    raise AssertionError("unreachable janitor retry state")


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

    # A timed-out deletion may already have committed on the backend.
    # Never repeat the write blindly: only a signed unknown_user response
    # from a fresh login can prove this identity was actually removed.
    ambiguous_delete = False
    try:
        status, deleted, _ = request_json(
            "POST",
            f"{api}/auth/delete-account",
            {"password": password},
            token=str(login["token"]),
        )
    except (urllib.error.URLError, TimeoutError, ConnectionResetError,
            http.client.IncompleteRead) as exc:
        if not transient_transport_error(exc):
            raise
        ambiguous_delete = True
    else:
        if status != 200 or deleted.get("deleted") is not True:
            if status not in TRANSIENT_LOGIN_HTTP:
                raise SystemExit(f"Borrado de identidad técnica devolvió HTTP {status}")
            ambiguous_delete = True

    # Both normal 200 and ambiguous 5xx/timeout require positive proof of
    # revocation. A 200 login, bad_password or inconclusive 401 stays fatal.
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
    if ambiguous_delete:
        print("::notice title=Staging janitor reconciled::borrado ambiguo verificado por unknown_user firmado")
    return "deleted"


def cleanup_pair(api: str, username: str, password: str, secret: str, *, cleanup=cleanup_identity) -> None:
    """Both accounts are cleaned, even when the first deletion fails.

    Non-PvP staging smokes harmlessly receive "absent" for the companion.
    """
    primary = validate_ci_username(username)
    failures = []
    for identity in (companion_username(primary), primary):
        try:
            result = cleanup(api, identity, password, secret)
            print(f"Staging smoke janitor: {identity} · {result} · OK")
        except (SystemExit, Exception) as exc:
            failures.append(f"{identity}: {exc}")
    if failures:
        raise SystemExit("Staging smoke janitor failed: " + "; ".join(failures))


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
    companion = companion_username("ci_smoke_0123456789abcdef")
    assert CI_USER_RE.fullmatch(companion)
    seen = []
    def deliberate_companion_failure(api, name, password, secret):
        seen.append(name)
        if name == companion:
            raise SystemExit("synthetic companion failure")
        return "deleted"
    try:
        cleanup_pair("https://example.invalid/api", "ci_smoke_0123456789abcdef",
                     "pw", "secret", cleanup=deliberate_companion_failure)
    except SystemExit as exc:
        assert "synthetic companion failure" in str(exc)
    else:
        raise AssertionError("janitor hid companion cleanup failure")
    assert seen == [companion, "ci_smoke_0123456789abcdef"], "primary cleanup skipped"
    # Read timeout on synthetic login is safe to retry: an exact signed
    # unknown_user still establishes that no cleanup write is needed.
    class FakeResponse:
        status = 200
        headers = {"Content-Type": "application/json"}
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False
        def read(self):
            return b'{"token":"synthetic-only"}'
    calls = []
    pauses = []
    def timeout_once(request, timeout=20):
        calls.append(request.get_method())
        if len(calls) == 1:
            raise TimeoutError("backend read timed out")
        return FakeResponse()
    status, payload, _ = request_json(
        "POST", "https://example.invalid/api/auth/login", {"username": "synthetic"},
        opener=timeout_once, sleep=pauses.append,
    )
    assert status == 200 and payload["token"] == "synthetic-only"
    assert calls == ["POST", "POST"] and pauses == [1]

    # 401 bad-password is terminal, while a 523 may be retried at most twice.
    calls.clear()
    pauses.clear()
    def denied(request, timeout=20):
        calls.append(request.get_method())
        raise urllib.error.HTTPError(request.full_url, 401, "denied",
                                     {"X-Chess-Auth-Failure": "bad_password"},
                                     io.BytesIO(b'{"detail":"bad password"}'))
    status, _, _ = request_json(
        "POST", "https://example.invalid/api/auth/login", {},
        opener=denied, sleep=pauses.append,
    )
    assert status == 401 and calls == ["POST"] and not pauses
    calls.clear()
    pauses.clear()
    def edge_down(request, timeout=20):
        calls.append(request.get_method())
        raise urllib.error.HTTPError(request.full_url, 523, "unavailable", {},
                                     io.BytesIO(b'{"detail":"temporary"}'))
    status, _, _ = request_json(
        "POST", "https://example.invalid/api/auth/login", {},
        opener=edge_down, sleep=pauses.append,
    )
    assert status == 523 and calls == ["POST"] * 3 and pauses == [1, 2]
    calls.clear()
    pauses.clear()
    status, _, _ = request_json(
        "POST", "https://example.invalid/api/auth/delete-account", {"password": "test"},
        token="synthetic-only", opener=edge_down, sleep=pauses.append,
    )
    assert status == 523 and calls == ["POST"] and not pauses

    # A timed-out delete must not be sent again; signed unknown_user is
    # sufficient evidence to accept a write which may already have committed.
    from unittest.mock import patch
    login_ok = (200, {"token": "synthetic-only"}, {})
    absent = (401, {}, {"X-Chess-Auth-Failure": "unknown_user"})
    with patch(f"{__name__}.request_json", side_effect=[
        login_ok, TimeoutError("delete response lost"), absent,
    ]) as mocked:
        assert cleanup_identity("https://example.invalid/api",
                                "ci_smoke_0123456789abcdef", "pw", "secret") == "deleted"
        assert mocked.call_count == 3
        assert sum(call.args[1].endswith("/auth/delete-account") for call in mocked.call_args_list) == 1
    # If the identity still logs in, do not declare an ambiguous delete green.
    with patch(f"{__name__}.request_json", side_effect=[
        login_ok, TimeoutError("delete response lost"), login_ok,
    ]) as mocked:
        try:
            cleanup_identity("https://example.invalid/api",
                             "ci_smoke_0123456789abcdef", "pw", "secret")
        except SystemExit as exc:
            assert "no quedó verificablemente ausente" in str(exc)
        else:
            raise AssertionError("ambiguous delete accepted without proof")
        assert mocked.call_count == 3
    print("staging-smoke-user-cleanup self-test OK · API-only, bounded login retry and verified deletion")


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
    cleanup_pair(api, username, password, synthetic_secret)


if __name__ == "__main__":
    main()
