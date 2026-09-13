#!/usr/bin/env python3
"""Verify that a staging surface serves the exact accredited Chess Studio SHA."""
from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from cloudflare_health_contract import validate_health_payload

SHA_RE = re.compile(r"[0-9a-f]{40}")
KINDS = frozenset({"backend", "frontend", "ai"})


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes


Requester = Callable[[str, int], Response]


def normalize_sha(value: str) -> str:
    sha = value.strip().lower()
    if SHA_RE.fullmatch(sha) is None:
        raise ValueError(f"SHA acreditado inválido: {value!r}")
    return sha


def fetch(url: str, timeout: int = 15) -> Response:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "Cache-Control": "no-cache"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return Response(int(response.status), response.read())
    except urllib.error.HTTPError as exc:
        return Response(int(exc.code), exc.read())


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


def verify(kind: str, url: str, expected_sha: str, *, requester: Requester = fetch) -> dict:
    if kind not in KINDS:
        raise ValueError(f"surface kind inválido: {kind!r}")
    if not url.startswith("https://"):
        raise ValueError(f"URL staging inválida: {url!r}")
    expected = normalize_sha(expected_sha)
    response = requester(url, 15)
    if response.status != 200:
        label = {"backend": "Backend", "frontend": "Frontend", "ai": "Workers AI"}[kind]
        raise RuntimeError(f"{label} staging release HTTP {response.status or 'error'}")
    payload = decode_payload(response.body)
    verify_payload(kind, payload, expected)
    return payload


def self_test() -> None:
    sha = "a" * 40
    base = {"build": sha}
    verify_payload("backend", dict(base), sha.upper())
    verify_payload("frontend", dict(base), sha)

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
        verify("backend", "https://staging.example/api/release", sha, requester=failing_requester)
    except RuntimeError as exc:
        assert "HTTP 503" in str(exc)
    else:
        raise AssertionError("non-200 staging response must fail")

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
