#!/usr/bin/env python3
"""Verify the protected Cloudflare Prometheus exporter after deployment."""
from __future__ import annotations

import argparse
import base64
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes = b""


Probe = Callable[[str, str | None, int], Response]
Sleep = Callable[[float], None]


def basic_auth(username: str, password: str) -> str:
    raw = f"{username}:{password}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def http_probe(url: str, authorization: str | None, timeout: int) -> Response:
    headers = {"Accept": "*/*"}
    if authorization:
        headers["Authorization"] = authorization
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return Response(int(response.status), response.read())
    except urllib.error.HTTPError as exc:
        return Response(int(exc.code), exc.read())
    except (urllib.error.URLError, TimeoutError, OSError):
        return Response(0, b"")


def metrics_present(body: bytes) -> bool:
    return any(line.startswith(b"cloudflare_") for line in body.splitlines())


def verify(
    base_url: str,
    username: str,
    password: str,
    *,
    attempts: int = 60,
    delay_seconds: float = 5,
    probe: Probe = http_probe,
    sleep: Sleep = time.sleep,
) -> tuple[int, int]:
    if not base_url.startswith("https://"):
        raise ValueError("exporter base URL must use https")
    if not username or not password:
        raise ValueError("exporter Basic Auth credentials must not be empty")
    if attempts < 1:
        raise ValueError("attempts must be >= 1")

    auth = basic_auth(username, password)
    last_health = 0
    last_metrics = 0
    for attempt in range(1, attempts + 1):
        health = probe(f"{base_url}/health", auth, 15)
        metrics = probe(f"{base_url}/metrics", auth, 25)
        last_health, last_metrics = health.status, metrics.status
        if health.status == 200 and metrics.status == 200 and metrics_present(metrics.body):
            unauth = probe(f"{base_url}/metrics", None, 10)
            if unauth.status != 401:
                raise RuntimeError(
                    f"/metrics sin auth devolvió HTTP {unauth.status}, esperaba 401"
                )
            return health.status, metrics.status
        print(
            "Exporter aún propagando "
            f"(health={health.status or 'error'} metrics={metrics.status or 'error'} "
            f"intento {attempt}/{attempts})"
        )
        if attempt < attempts:
            sleep(delay_seconds)

    raise RuntimeError(
        "Exporter no quedó healthy con métricas Cloudflare "
        f"(health={last_health or 'error'} metrics={last_metrics or 'error'})"
    )


def self_test() -> None:
    assert basic_auth("alice", "secret") == "Basic YWxpY2U6c2VjcmV0"
    assert metrics_present(b"# HELP x\ncloudflare_requests_total 1\n")
    assert not metrics_present(b"# HELP x\nother_metric 1\n")

    calls: list[tuple[str, bool, int]] = []
    sleeps: list[float] = []
    attempt = {"value": 0}

    def eventual_probe(url: str, authorization: str | None, timeout: int) -> Response:
        calls.append((url, authorization is not None, timeout))
        if url.endswith("/health"):
            attempt["value"] += 1
            return Response(503 if attempt["value"] == 1 else 200)
        if authorization is None:
            return Response(401)
        if attempt["value"] == 1:
            return Response(200, b"not_ready 1\n")
        return Response(200, b"# TYPE cloudflare_worker_requests_total counter\ncloudflare_worker_requests_total 1\n")

    assert verify(
        "https://metrics.example",
        "alice",
        "secret",
        attempts=3,
        delay_seconds=2,
        probe=eventual_probe,
        sleep=sleeps.append,
    ) == (200, 200)
    assert sleeps == [2]
    assert calls[-1] == ("https://metrics.example/metrics", False, 10)

    def exposed_probe(url: str, authorization: str | None, timeout: int) -> Response:
        if url.endswith("/health"):
            return Response(200)
        return Response(200, b"cloudflare_x 1\n")

    try:
        verify("https://metrics.example", "u", "p", attempts=1, probe=exposed_probe)
    except RuntimeError as exc:
        assert "esperaba 401" in str(exc)
    else:
        raise AssertionError("unauthenticated metrics exposure must fail")

    def dead_probe(url: str, authorization: str | None, timeout: int) -> Response:
        return Response(503)

    try:
        verify(
            "https://metrics.example",
            "u",
            "p",
            attempts=2,
            delay_seconds=1,
            probe=dead_probe,
            sleep=lambda _: None,
        )
    except RuntimeError as exc:
        assert "no quedó healthy" in str(exc)
    else:
        raise AssertionError("exhausted health retries must fail")


def append_summary(base_url: str, upstream_sha: str) -> None:
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write(
            "### Cloudflare Prometheus exporter operativo\n\n"
            f"- Upstream pin: `{upstream_sha}`\n"
            f"- Endpoint: `{base_url}/metrics`\n"
            "- Protección: `HTTP Basic Auth`\n"
            "- UI/config API: `disabled`\n"
            "- Modo: `Cloudflare Free only`\n"
            "- Dashboards: `exporter + Workers + certificados`\n"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--attempts", type=int, default=60)
    parser.add_argument("--delay-seconds", type=float, default=5)
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("cloudflare exporter health self-test: OK")
        return 0

    hostname = os.environ.get("EXPORTER_HOSTNAME", "").strip()
    username = os.environ.get("CLOUDFLARE_EXPORTER_BASIC_AUTH_USER", "")
    password = os.environ.get("CLOUDFLARE_EXPORTER_BASIC_AUTH_PASSWORD", "")
    upstream_sha = os.environ.get("EXPORTER_UPSTREAM_SHA", "<unknown>")
    if not hostname:
        raise SystemExit("EXPORTER_HOSTNAME is required")
    base_url = f"https://{hostname}"
    try:
        verify(
            base_url,
            username,
            password,
            attempts=args.attempts,
            delay_seconds=args.delay_seconds,
        )
    except (ValueError, RuntimeError) as exc:
        print(f"::error::{exc}")
        return 1
    append_summary(base_url, upstream_sha)
    print(f"Cloudflare exporter live contract OK · {base_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
