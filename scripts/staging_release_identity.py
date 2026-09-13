#!/usr/bin/env python3
"""Verify that a staging surface serves the exact accredited Chess Studio SHA."""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from cloudflare_health_contract import validate_health_payload

SHA_RE = re.compile(r"[0-9a-f]{40}")
KINDS = frozenset({"backend", "frontend", "ai"})
RETRYABLE_HTTP_STATUSES = frozenset({403, 408, 425, 429, *range(500, 600)})
DEFAULT_ATTEMPTS = 4
RETRY_BACKOFF_SECONDS = (0.5, 1.0, 2.0)
PROBE_USER_AGENT = "ChessStudio-StagingAccreditation/1"


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes
    headers: tuple[tuple[str, str], ...] = ()

    def header(self, name: str) -> str:
        needle = name.casefold()
        for key, value in self.headers:
            if key.casefold() == needle:
                return value.strip()
        return ""


Requester = Callable[[str, int], Response]
Sleeper = Callable[[float], None]


def normalize_sha(value: str) -> str:
    sha = value.strip().lower()
    if SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"SHA acreditado inválido: {value!r}")
    return sha


def build_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": PROBE_USER_AGENT,
        },
    )


def _headers_tuple(headers: object | None) -> tuple[tuple[str, str], ...]:
    if headers is None or not hasattr(headers, "items"):
        return ()
    return tuple((str(key), str(value)) for key, value in headers.items())


def fetch(url: str, timeout: int = 15) -> Response:
    request = build_request(url)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return Response(
                int(response.status),
                response.read(),
                _headers_tuple(response.headers),
            )
    except urllib.error.HTTPError as exc:
        return Response(int(exc.code), exc.read(), _headers_tuple(exc.headers))


def decode_payload(body: bytes) -> dict:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"respuesta JSON inválida: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("respuesta JSON no es un objeto")
    return payload


def verify_payload(kind: str, payload: dict, expected_sha: str) -> None:
    if kind not in KINDS:
        raise ValueError(f"surface kind inválido: {kind!r}")
    expected = normalize_sha(expected_sha)
    if kind == "ai":
        errors = validate_health_payload(payload)
        if errors:
            raise ValueError("Workers AI health inválido: " + "; ".join(errors))
    actual = str(payload.get("build") or "").strip().lower()
    if actual != expected:
        label = {"backend": "Backend staging", "frontend": "Frontend staging", "ai": "Workers AI staging"}[kind]
        raise ValueError(f"{label} sirve {actual or '<sin build>'}, esperaba {expected}")


def response_diagnostics(response: Response) -> str:
    details: list[str] = []
    server = response.header("server")
    cf_ray = response.header("cf-ray")
    if server:
        details.append(f"server={server}")
    if cf_ray:
        details.append(f"cf-ray={cf_ray}")
    body_preview = " ".join(response.body.decode("utf-8", errors="replace").split())[:180]
    if body_preview:
        details.append(f"body={body_preview!r}")
    return "; ".join(details)


def retry_delay(attempt: int) -> float:
    index = min(max(attempt - 1, 0), len(RETRY_BACKOFF_SECONDS) - 1)
    return RETRY_BACKOFF_SECONDS[index]


def verify(
    kind: str,
    url: str,
    expected_sha: str,
    *,
    requester: Requester = fetch,
    sleeper: Sleeper = time.sleep,
    attempts: int = DEFAULT_ATTEMPTS,
) -> dict:
    if kind not in KINDS:
        raise ValueError(f"surface kind inválido: {kind!r}")
    if not url.startswith("https://"):
        raise ValueError(f"URL staging inválida: {url!r}")
    if attempts < 1:
        raise ValueError("attempts debe ser >= 1")
    expected = normalize_sha(expected_sha)
    label = {"backend": "Backend", "frontend": "Frontend", "ai": "Workers AI"}[kind]

    response: Response | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = requester(url, 15)
        except (OSError, urllib.error.URLError) as exc:
            if attempt >= attempts:
                raise RuntimeError(
                    f"{label} staging release no accesible tras {attempts} intentos: {exc}"
                ) from exc
            delay = retry_delay(attempt)
            print(
                f"::warning::{label} staging release error transitorio "
                f"({type(exc).__name__}: {exc}); reintento {attempt + 1}/{attempts} en {delay:g}s"
            )
            sleeper(delay)
            continue

        if response.status == 200:
            break

        diagnostics = response_diagnostics(response)
        suffix = f" ({diagnostics})" if diagnostics else ""
        if response.status not in RETRYABLE_HTTP_STATUSES or attempt >= attempts:
            raise RuntimeError(
                f"{label} staging release HTTP {response.status or 'error'}{suffix}"
            )

        delay = retry_delay(attempt)
        print(
            f"::warning::{label} staging release HTTP {response.status}{suffix}; "
            f"reintento {attempt + 1}/{attempts} en {delay:g}s"
        )
        sleeper(delay)

    if response is None or response.status != 200:
        raise RuntimeError(f"{label} staging release no verificable")

    payload = decode_payload(response.body)
    verify_payload(kind, payload, expected)
    return payload


def self_test() -> None:
    sha = "a" * 40
    base = {"build": sha}
    verify_payload("backend", dict(base), sha.upper())
    verify_payload("frontend", dict(base), sha)

    request_headers = {key.casefold(): value for key, value in build_request("https://staging.example/release.json").header_items()}
    assert request_headers["accept"] == "application/json"
    assert request_headers["cache-control"] == "no-cache"
    assert request_headers["user-agent"] == PROBE_USER_AGENT

    ai_payload = {
        "ok": True,
        "service": "chess-studio-narrative-ai",
        "model": "@cf/qwen/qwen3-30b-a3b-fp8",
        "models": {
            "comments": "@cf/qwen/qwen3-30b-a3b-fp8",
            "player_portrait": "@cf/qwen/qwen3-30b-a3b-fp8",
            "analysis": "@cf/qwen/qwen3-30b-a3b-fp8",
        },
        "build": sha,
    }
    verify_payload("ai", ai_payload, sha)

    def good_requester(url: str, timeout: int) -> Response:
        assert url == "https://staging.example/release.json"
        assert timeout == 15
        return Response(200, json.dumps(base).encode("utf-8"))

    assert verify(
        "frontend",
        "https://staging.example/release.json",
        sha,
        requester=good_requester,
    )["build"] == sha

    transient_calls = 0
    transient_sleeps: list[float] = []

    def transient_requester(url: str, timeout: int) -> Response:
        nonlocal transient_calls
        transient_calls += 1
        if transient_calls == 1:
            return Response(
                403,
                b"cloudflare transient block",
                (("Server", "cloudflare"), ("CF-Ray", "abc123-MAD")),
            )
        return Response(200, json.dumps(base).encode("utf-8"))

    assert verify(
        "frontend",
        "https://staging.example/release.json",
        sha,
        requester=transient_requester,
        sleeper=transient_sleeps.append,
    )["build"] == sha
    assert transient_calls == 2
    assert transient_sleeps == [0.5]

    persistent_calls = 0

    def persistent_403(url: str, timeout: int) -> Response:
        nonlocal persistent_calls
        persistent_calls += 1
        return Response(
            403,
            b"forbidden by edge policy",
            (("Server", "cloudflare"), ("CF-Ray", "deadbeef-MAD")),
        )

    try:
        verify(
            "frontend",
            "https://staging.example/release.json",
            sha,
            requester=persistent_403,
            sleeper=lambda _: None,
            attempts=3,
        )
    except RuntimeError as exc:
        message = str(exc)
        assert "HTTP 403" in message
        assert "server=cloudflare" in message
        assert "cf-ray=deadbeef-MAD" in message
        assert "forbidden by edge policy" in message
        assert persistent_calls == 3
    else:
        raise AssertionError("persistent 403 must remain fail-closed")

    non_retryable_calls = 0

    def not_found_requester(url: str, timeout: int) -> Response:
        nonlocal non_retryable_calls
        non_retryable_calls += 1
        return Response(404, b"missing")

    try:
        verify(
            "frontend",
            "https://staging.example/release.json",
            sha,
            requester=not_found_requester,
            sleeper=lambda _: None,
        )
    except RuntimeError as exc:
        assert "HTTP 404" in str(exc)
        assert non_retryable_calls == 1
    else:
        raise AssertionError("non-retryable status must fail immediately")

    for payload, needle in (
        ({"build": "b" * 40}, "esperaba"),
        ({}, "<sin build>"),
    ):
        try:
            verify_payload("backend", payload, sha)
        except ValueError as exc:
            assert needle in str(exc)
        else:
            raise AssertionError("build mismatch must fail")

    broken_ai = dict(ai_payload)
    broken_ai["service"] = "other"
    try:
        verify_payload("ai", broken_ai, sha)
    except ValueError as exc:
        assert "health inválido" in str(exc)
    else:
        raise AssertionError("invalid Workers AI health must fail")

    def failing_requester(url: str, timeout: int) -> Response:
        return Response(503, b'{"detail":"warming"}')

    try:
        verify(
            "backend",
            "https://staging.example/api/release",
            sha,
            requester=failing_requester,
            sleeper=lambda _: None,
        )
    except RuntimeError as exc:
        assert "HTTP 503" in str(exc)
    else:
        raise AssertionError("persistent retryable staging response must fail")

    try:
        decode_payload(b"not-json")
    except ValueError as exc:
        assert "JSON inválida" in str(exc)
    else:
        raise AssertionError("invalid JSON must fail")

    print("staging release identity self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=sorted(KINDS))
    parser.add_argument("--url")
    parser.add_argument("--sha")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if not args.kind or not args.url or not args.sha:
        parser.error("--kind, --url and --sha are required unless --self-test is used")

    try:
        verify(args.kind, args.url, args.sha)
    except (ValueError, RuntimeError, OSError, urllib.error.URLError) as exc:
        print(f"::error::{exc}")
        return 1
    print(f"Staging {args.kind} serves accredited SHA {normalize_sha(args.sha)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
