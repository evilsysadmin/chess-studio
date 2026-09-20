#!/usr/bin/env python3
"""Synthetic probe for a deployed Chess Studio backend (stdlib only).

Always checks liveness + readiness. Authenticated checks use explicit
CHESS_SYNTHETIC_USERNAME/PASSWORD when provided, or a short-lived API-created
identity when CHESS_SYNTHETIC_EPHEMERAL=1. With CHESS_SYNTHETIC_GAMEPLAY=1 it
exercises create/load/move/sync and cleans up both the game and an ephemeral
identity before exiting.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen


def api_base(raw: str) -> str:
    value = str(raw or "").strip().rstrip("/")
    if not value:
        raise ValueError("base URL vacía")
    parsed = urlsplit(value if "://" in value else f"https://{value}")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base URL inválida")
    path = parsed.path.rstrip("/")
    if not path.endswith("/api"):
        path = f"{path}/api" if path else "/api"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def env_enabled(raw: str | None) -> bool:
    return str(raw or "").strip().lower() in {"1", "true", "yes", "on"}


def ephemeral_credentials() -> tuple[str, str]:
    """Generate a disposable identity matching the staging smoke convention."""
    return f"ci_smoke_{secrets.token_hex(8)}", f"CS!{secrets.token_urlsafe(32)}"


def game_state_matches(game_id: str, expected: dict, actual: dict) -> bool:
    """Return whether a reloaded game is the state the previous API call returned."""
    if not isinstance(expected, dict) or not isinstance(actual, dict):
        return False
    expected_fen = str(expected.get("fen") or "")
    if not expected_fen:
        return False
    return (
        actual.get("id") == game_id
        and str(actual.get("fen") or "") == expected_fen
        and list(actual.get("moves") or []) == list(expected.get("moves") or [])
    )


def _call(base: str, path: str, *, method: str = "GET", token: str | None = None, body: dict | None = None, timeout: float = 8.0) -> tuple[int, dict, float, str | None]:
    url = f"{base}{path}"
    request_id = f"synthetic-{uuid.uuid4().hex[:12]}"
    headers = {"Accept": "application/json", "X-Request-ID": request_id, "User-Agent": "ChessStudioSynthetic/1"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    started = time.perf_counter()
    response_request_id = None
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
            response_request_id = response.headers.get("X-Request-ID")
            return int(response.status), payload, (time.perf_counter() - started) * 1000, response_request_id
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            payload = {"detail": raw[:200]}
        response_request_id = exc.headers.get("X-Request-ID") if exc.headers else None
        return int(exc.code), payload, (time.perf_counter() - started) * 1000, response_request_id


def _check(name: str, status: int, payload: dict, latency_ms: float, request_id: str | None, *, expected: int = 200, slo_ms: float | None = None) -> bool:
    status_ok = status == expected
    slo_ok = slo_ms is None or latency_ms <= slo_ms
    ok = status_ok and slo_ok
    if not status_ok:
        detail = str(payload.get("detail") or payload.get("error") or "unexpected status")[:160]
    elif not slo_ok:
        detail = f"latency {latency_ms:.2f}ms > SLO {slo_ms:.2f}ms"
    else:
        detail = None
    print(json.dumps({
        "check": name,
        "ok": ok,
        "status": status,
        "status_ok": status_ok,
        "latency_ms": round(latency_ms, 2),
        "slo_ms": round(slo_ms, 2) if slo_ms is not None else None,
        "slo_ok": slo_ok,
        "request_id": request_id,
        "detail": detail,
    }, separators=(",", ":"), sort_keys=True))
    return ok


def _state_check(name: str, ok: bool, detail: str | None = None) -> bool:
    print(json.dumps({"check": name, "ok": bool(ok), "detail": None if ok else detail}, separators=(",", ":"), sort_keys=True))
    return bool(ok)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("CHESS_SYNTHETIC_BASE_URL", ""))
    parser.add_argument("--username", default=os.getenv("CHESS_SYNTHETIC_USERNAME", ""))
    parser.add_argument("--password", default=os.getenv("CHESS_SYNTHETIC_PASSWORD", ""))
    parser.add_argument("--invite-code", default=os.getenv("CHESS_SYNTHETIC_INVITE_CODE", ""))
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--gameplay", action="store_true", default=env_enabled(os.getenv("CHESS_SYNTHETIC_GAMEPLAY")))
    parser.add_argument("--ephemeral", action="store_true", default=env_enabled(os.getenv("CHESS_SYNTHETIC_EPHEMERAL")))
    parser.add_argument("--health-slo-ms", type=float, default=os.getenv("CHESS_SYNTHETIC_HEALTH_SLO_MS", "0"))
    parser.add_argument("--auth-slo-ms", type=float, default=os.getenv("CHESS_SYNTHETIC_AUTH_SLO_MS", "0"))
    args = parser.parse_args()

    if args.health_slo_ms < 0 or args.auth_slo_ms < 0:
        print("synthetic: los SLO no pueden ser negativos", file=sys.stderr)
        return 2
    health_slo_ms = args.health_slo_ms or None
    auth_slo_ms = args.auth_slo_ms or None

    try:
        base = api_base(args.base_url)
    except ValueError as exc:
        print(f"synthetic: {exc}", file=sys.stderr)
        return 2

    username = str(args.username or "").strip()
    password = str(args.password or "")
    if bool(username) != bool(password):
        print("synthetic: username/password deben configurarse juntos", file=sys.stderr)
        return 2

    passed = True
    ephemeral_created = False
    cleanup_token: str | None = None

    try:
        for name, path in (("liveness", "/health"), ("readiness", "/ready")):
            status, payload, latency, req_id = _call(base, path, timeout=args.timeout)
            passed = _check(name, status, payload, latency, req_id, slo_ms=health_slo_ms) and passed

        if not username and args.ephemeral:
            username, password = ephemeral_credentials()
            registration_body = {"username": username, "password": password}
            invite_code = str(args.invite_code or "").strip()
            if invite_code:
                registration_body["inviteCode"] = invite_code
            status, registered, latency, req_id = _call(
                base,
                "/auth/register",
                method="POST",
                body=registration_body,
                timeout=args.timeout,
            )
            register_ok = _check(
                "register_ephemeral",
                status,
                registered,
                latency,
                req_id,
                expected=201,
                slo_ms=auth_slo_ms,
            )
            passed = register_ok and passed
            ephemeral_created = status == 201
            cleanup_token = str(registered.get("token") or "") or None if isinstance(registered, dict) else None
            if status == 403 and not invite_code:
                passed = _state_check(
                    "ephemeral_registration_policy",
                    False,
                    "production registration requires an invite; configure CHESS_SYNTHETIC_INVITE_CODE or fixed synthetic credentials",
                ) and passed
            if status == 201 and not cleanup_token:
                passed = _state_check(
                    "register_ephemeral_token",
                    False,
                    "registration succeeded without a cleanup token",
                ) and passed

        if username and password and (not args.ephemeral or ephemeral_created or args.username):
            status, payload, latency, req_id = _call(
                base,
                "/auth/login",
                method="POST",
                body={"username": username, "password": password},
                timeout=args.timeout,
            )
            login_ok = _check("login", status, payload, latency, req_id, slo_ms=auth_slo_ms)
            passed = login_ok and passed
            token = str(payload.get("token") or "") or None if isinstance(payload, dict) and status == 200 else None
            if token:
                if ephemeral_created:
                    cleanup_token = token
                status, payload, latency, req_id = _call(base, "/status", token=token, timeout=args.timeout)
                passed = _check("authenticated_status", status, payload, latency, req_id, slo_ms=auth_slo_ms) and passed

                if args.gameplay:
                    game_id = None
                    try:
                        status, created, latency, req_id = _call(
                            base,
                            "/games",
                            method="POST",
                            token=token,
                            body={"difficulty": 0, "color": "w"},
                            timeout=args.timeout,
                        )
                        if status == 201:
                            game_id = str(created.get("id") or "").strip() or None
                        passed = _check("game_create", status, created, latency, req_id, expected=201, slo_ms=auth_slo_ms) and passed
                        if not game_id:
                            passed = _state_check("game_create_state", False, "create response missing game id") and passed
                        else:
                            game_path = f"/games/{quote(game_id, safe='')}"
                            status, loaded, latency, req_id = _call(base, game_path, token=token, timeout=args.timeout)
                            load_ok = _check("game_load", status, loaded, latency, req_id, slo_ms=auth_slo_ms)
                            load_state_ok = status == 200 and game_state_matches(game_id, created, loaded)
                            passed = _state_check("game_load_state", load_state_ok, "reloaded game differs from create response") and load_ok and passed

                            status, moved, latency, req_id = _call(
                                base,
                                f"{game_path}/move",
                                method="POST",
                                token=token,
                                body={"from": "e2", "to": "e4"},
                                timeout=args.timeout,
                            )
                            move_ok = _check("game_move", status, moved, latency, req_id, slo_ms=auth_slo_ms)
                            passed = move_ok and passed

                            if status == 200:
                                status, synced, latency, req_id = _call(base, game_path, token=token, timeout=args.timeout)
                                sync_ok = _check("game_sync", status, synced, latency, req_id, slo_ms=auth_slo_ms)
                                sync_state_ok = status == 200 and game_state_matches(game_id, moved, synced)
                                passed = _state_check("game_sync_state", sync_state_ok, "reloaded game differs from move response") and sync_ok and passed
                    finally:
                        if game_id:
                            status, deleted, latency, req_id = _call(
                                base,
                                f"/games/{quote(game_id, safe='')}",
                                method="DELETE",
                                token=token,
                                timeout=args.timeout,
                            )
                            passed = _check("game_cleanup", status, deleted, latency, req_id, expected=204, slo_ms=auth_slo_ms) and passed
            elif args.gameplay:
                passed = _state_check("gameplay", False, "login did not return a token") and passed
        elif args.gameplay:
            passed = _state_check(
                "gameplay",
                False,
                "authenticated gameplay requested without credentials or ephemeral identity",
            ) and passed
    except (URLError, TimeoutError, OSError) as exc:
        print(json.dumps({"check": "transport", "ok": False, "error": type(exc).__name__, "detail": str(exc)[:160]}, separators=(",", ":"), sort_keys=True))
        passed = False
    finally:
        if ephemeral_created:
            if not cleanup_token:
                passed = _state_check("account_cleanup", False, "ephemeral account has no cleanup token") and passed
            else:
                try:
                    status, deleted, latency, req_id = _call(
                        base,
                        "/auth/delete-account",
                        method="POST",
                        token=cleanup_token,
                        body={"password": password},
                        timeout=args.timeout,
                    )
                    cleanup_ok = _check(
                        "account_cleanup",
                        status,
                        deleted,
                        latency,
                        req_id,
                        expected=200,
                        slo_ms=auth_slo_ms,
                    )
                    passed = cleanup_ok and passed
                    if cleanup_ok:
                        verify_status, verify_payload, verify_latency, verify_req_id = _call(
                            base,
                            "/auth/login",
                            method="POST",
                            body={"username": username, "password": password},
                            timeout=args.timeout,
                        )
                        passed = _check(
                            "account_cleanup_verify",
                            verify_status,
                            verify_payload,
                            verify_latency,
                            verify_req_id,
                            expected=401,
                            slo_ms=auth_slo_ms,
                        ) and passed
                except (URLError, TimeoutError, OSError) as exc:
                    print(json.dumps({"check": "account_cleanup_transport", "ok": False, "error": type(exc).__name__, "detail": str(exc)[:160]}, separators=(",", ":"), sort_keys=True))
                    passed = False

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
