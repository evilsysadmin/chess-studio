#!/usr/bin/env python3
"""Fail-closed public browser transport probe for the PvP roster endpoint.

This intentionally uses an invalid bearer token: it proves DNS/TLS/proxy/CORS and
the public PvP route without mutating roster state or requiring a real account.
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


REQUIRED_METHODS = {"POST", "DELETE"}
REQUIRED_HEADERS = {"authorization", "x-request-id", "x-client-release"}


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


def header_map(headers) -> dict[str, str]:
    return {str(key).strip().lower(): str(value).strip() for key, value in headers.items()}


def transport_request(url: str, *, method: str, headers: dict[str, str], timeout: float) -> tuple[int, dict[str, str]]:
    request = Request(url, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            return int(response.status), header_map(response.headers)
    except HTTPError as exc:
        return int(exc.code), header_map(exc.headers or {})


def validate_preflight(status: int, headers: dict[str, str], origin: str, *, require_go: bool) -> list[str]:
    errors: list[str] = []
    if status not in {200, 204}:
        errors.append(f"preflight status={status}, expected 200/204")
    if headers.get("access-control-allow-origin", "").lower() != origin.lower():
        errors.append("preflight missing canonical Access-Control-Allow-Origin")
    methods = {part.strip().upper() for part in headers.get("access-control-allow-methods", "").split(",") if part.strip()}
    missing_methods = REQUIRED_METHODS - methods
    if missing_methods:
        errors.append(f"preflight missing methods={sorted(missing_methods)}")
    allowed_headers = {part.strip().lower() for part in headers.get("access-control-allow-headers", "").split(",") if part.strip()}
    missing_headers = REQUIRED_HEADERS - allowed_headers
    if missing_headers:
        errors.append(f"preflight missing headers={sorted(missing_headers)}")
    if require_go:
        if headers.get("x-chess-pvp-edge", "").lower() != "go":
            errors.append("preflight did not traverse Go PvP edge")
        if headers.get("x-chess-pvp-native", "").lower() != "roster":
            errors.append("preflight did not hit native roster route")
    return errors


def validate_rejection(
    status: int,
    headers: dict[str, str],
    origin: str,
    request_id: str,
    *,
    require_go: bool,
) -> list[str]:
    errors: list[str] = []
    if status != 401:
        errors.append(f"invalid-auth POST status={status}, expected 401")
    if headers.get("access-control-allow-origin", "").lower() != origin.lower():
        errors.append("invalid-auth POST missing canonical Access-Control-Allow-Origin")
    if headers.get("x-request-id", "") != request_id:
        errors.append("invalid-auth POST did not echo X-Request-ID")
    if require_go:
        if headers.get("x-chess-pvp-edge", "").lower() != "go":
            errors.append("invalid-auth POST did not traverse Go PvP edge")
        if headers.get("x-chess-pvp-native", "").lower() != "roster":
            errors.append("invalid-auth POST did not hit native roster route")
    return errors


def self_test() -> None:
    assert api_base("https://api.example.test") == "https://api.example.test/api"
    assert api_base("https://api.example.test/api/") == "https://api.example.test/api"
    good = {
        "access-control-allow-origin": "https://app.example.test",
        "access-control-allow-methods": "GET, POST, DELETE",
        "access-control-allow-headers": "authorization, x-request-id, x-client-release",
        "x-chess-pvp-edge": "go",
        "x-chess-pvp-native": "roster",
    }
    assert not validate_preflight(204, good, "https://app.example.test", require_go=True)
    response = {
        "access-control-allow-origin": "https://app.example.test",
        "x-request-id": "probe-1",
        "x-chess-pvp-edge": "go",
        "x-chess-pvp-native": "roster",
    }
    assert not validate_rejection(401, response, "https://app.example.test", "probe-1", require_go=True)
    assert validate_preflight(204, {}, "https://app.example.test", require_go=False)
    print("pvp public transport self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="")
    parser.add_argument("--origin", default="")
    parser.add_argument("--timeout", type=float, default=12.0)
    parser.add_argument("--require-go", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if args.timeout <= 0:
        print("pvp transport probe: timeout inválido", file=sys.stderr)
        return 2

    try:
        base = api_base(args.base_url)
    except ValueError as exc:
        print(f"pvp transport probe: {exc}", file=sys.stderr)
        return 2
    origin = str(args.origin or "").strip().rstrip("/")
    parsed_origin = urlsplit(origin)
    if parsed_origin.scheme not in {"http", "https"} or not parsed_origin.netloc or parsed_origin.path not in {"", "/"}:
        print("pvp transport probe: origin inválido", file=sys.stderr)
        return 2

    endpoint = f"{base}/pvp/roster"
    request_id = f"prod-pvp-probe-{uuid.uuid4().hex[:12]}"
    try:
        preflight_status, preflight_headers = transport_request(
            endpoint,
            method="OPTIONS",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,x-request-id,x-client-release",
                "User-Agent": "ChessStudioPvpTransportProbe/1",
            },
            timeout=args.timeout,
        )
        response_status, response_headers = transport_request(
            endpoint,
            method="POST",
            headers={
                "Origin": origin,
                "Accept": "application/json",
                "Authorization": "Bearer deliberately-invalid",
                "X-Request-ID": request_id,
                "X-Client-Release": "production-transport-probe",
                "User-Agent": "ChessStudioPvpTransportProbe/1",
            },
            timeout=args.timeout,
        )
    except (URLError, TimeoutError, OSError) as exc:
        print(json.dumps({
            "check": "pvp_public_browser_transport",
            "ok": False,
            "error": type(exc).__name__,
            "detail": str(exc)[:200],
        }, separators=(",", ":"), sort_keys=True))
        return 1

    errors = [
        *validate_preflight(preflight_status, preflight_headers, origin, require_go=args.require_go),
        *validate_rejection(response_status, response_headers, origin, request_id, require_go=args.require_go),
    ]
    print(json.dumps({
        "check": "pvp_public_browser_transport",
        "ok": not errors,
        "endpoint": endpoint,
        "origin": origin,
        "preflight_status": preflight_status,
        "post_status": response_status,
        "edge": response_headers.get("x-chess-pvp-edge"),
        "native": response_headers.get("x-chess-pvp-native"),
        "errors": errors,
    }, separators=(",", ":"), sort_keys=True))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
