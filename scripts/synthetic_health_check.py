#!/usr/bin/env python3
"""Synthetic probe for a deployed Chess Studio backend (stdlib only).

Always checks liveness + readiness. If CHESS_SYNTHETIC_USERNAME/PASSWORD are
provided, it also validates login and the authenticated status endpoint.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
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


def _check(name: str, status: int, payload: dict, latency_ms: float, request_id: str | None, *, expected: int = 200) -> bool:
    ok = status == expected
    print(json.dumps({
        "check": name,
        "ok": ok,
        "status": status,
        "latency_ms": round(latency_ms, 2),
        "request_id": request_id,
        "detail": None if ok else str(payload.get("detail") or payload.get("error") or "unexpected status")[:160],
    }, separators=(",", ":"), sort_keys=True))
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("CHESS_SYNTHETIC_BASE_URL", ""))
    parser.add_argument("--username", default=os.getenv("CHESS_SYNTHETIC_USERNAME", ""))
    parser.add_argument("--password", default=os.getenv("CHESS_SYNTHETIC_PASSWORD", ""))
    parser.add_argument("--timeout", type=float, default=8.0)
    args = parser.parse_args()

    try:
        base = api_base(args.base_url)
    except ValueError as exc:
        print(f"synthetic: {exc}", file=sys.stderr)
        return 2

    passed = True
    try:
        for name, path in (("liveness", "/health"), ("readiness", "/ready")):
            status, payload, latency, req_id = _call(base, path, timeout=args.timeout)
            passed = _check(name, status, payload, latency, req_id) and passed

        if bool(args.username) != bool(args.password):
            print("synthetic: username/password deben configurarse juntos", file=sys.stderr)
            return 2
        if args.username and args.password:
            status, payload, latency, req_id = _call(base, "/auth/login", method="POST", body={"username": args.username, "password": args.password}, timeout=args.timeout)
            login_ok = _check("login", status, payload, latency, req_id)
            passed = login_ok and passed
            token = payload.get("token") if login_ok else None
            if token:
                status, payload, latency, req_id = _call(base, "/status", token=token, timeout=args.timeout)
                passed = _check("authenticated_status", status, payload, latency, req_id) and passed
    except (URLError, TimeoutError, OSError) as exc:
        print(json.dumps({"check": "transport", "ok": False, "error": type(exc).__name__, "detail": str(exc)[:160]}, separators=(",", ":"), sort_keys=True))
        return 1

    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
