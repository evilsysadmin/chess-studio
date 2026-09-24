#!/usr/bin/env python3
"""Strict public-frontend health probe for Chess Studio production.

This deliberately treats the branded static 404 page as a production outage,
even if another edge/POP currently serves the application correctly.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from frontend_asset_convergence import check_frontend_assets_once, frontend_entry_assets

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SPA_PROBE_PATH = "/__chess_studio_spa_probe__/nested/view"
EMERGENCY_404_MARKERS = (
    "<title>404 · Chess Studio</title>",
    "Recurso no encontrado.",
)


def cache_busted(url: str, token: str) -> str:
    parts = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    query.append(("prod-health", token))
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )


def fetch(url: str, *, accept: str, timeout: float = 12.0) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": accept,
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
            "User-Agent": "chess-studio-production-frontend-health/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return (
                int(response.status),
                str(response.headers.get("Content-Type") or ""),
                response.read(),
            )
    except urllib.error.HTTPError as exc:
        return int(exc.code), str(exc.headers.get("Content-Type") or ""), exc.read()


def root_problem(status: int, content_type: str, raw: bytes, base_url: str) -> str | None:
    if status != 200:
        return f"root HTTP {status}"
    if "text/html" not in content_type.lower():
        return f"root MIME {content_type or '<vacío>'}"
    html = raw.decode("utf-8", "replace")
    if any(marker in html for marker in EMERGENCY_404_MARKERS):
        return "root sirve el 404 de emergencia de Chess Studio"
    if not frontend_entry_assets(html, base_url):
        return "root no contiene entrypoints JS/CSS de la app"
    return None


def spa_problem(status: int, content_type: str, raw: bytes, base_url: str) -> str | None:
    problem = root_problem(status, content_type, raw, base_url)
    if problem:
        return problem.replace("root", "deep-link SPA", 1)
    return None


def release_problem(status: int, content_type: str, raw: bytes, expected_sha: str) -> str | None:
    if status != 200:
        return f"release.json HTTP {status}"
    if "json" not in content_type.lower():
        return f"release.json MIME {content_type or '<vacío>'}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return "release.json inválido"
    build = str(payload.get("build") or "").strip().lower() if isinstance(payload, dict) else ""
    if not SHA_RE.fullmatch(build):
        return f"release.json build inválido: {build or '<vacío>'}"
    if expected_sha and build != expected_sha.lower():
        return f"release.json build={build}, esperaba {expected_sha.lower()}"
    return None


def check_once(base_url: str, *, expected_sha: str = "", token: str) -> str | None:
    base = base_url.rstrip("/")
    try:
        root_status, root_type, root_raw = fetch(
            cache_busted(base + "/", token),
            accept="text/html,application/xhtml+xml",
        )
    except (OSError, urllib.error.URLError) as exc:
        return f"root sin respuesta: {exc}"
    problem = root_problem(root_status, root_type, root_raw, base)
    if problem:
        return problem

    try:
        spa_status, spa_type, spa_raw = fetch(
            cache_busted(base + SPA_PROBE_PATH, f"{token}-spa"),
            accept="text/html,application/xhtml+xml",
        )
    except (OSError, urllib.error.URLError) as exc:
        return f"deep-link SPA sin respuesta: {exc}"
    problem = spa_problem(spa_status, spa_type, spa_raw, base)
    if problem:
        return problem

    asset_problem = check_frontend_assets_once(base, token=f"{token}-assets")
    if asset_problem:
        return f"assets incoherentes: {asset_problem}"

    try:
        release_status, release_type, release_raw = fetch(
            cache_busted(base + "/release.json", token),
            accept="application/json",
        )
    except (OSError, urllib.error.URLError) as exc:
        return f"release.json sin respuesta: {exc}"
    return release_problem(release_status, release_type, release_raw, expected_sha)


def wait_healthy(
    base_url: str,
    *,
    expected_sha: str = "",
    attempts: int = 1,
    poll_seconds: float = 2.0,
) -> None:
    last = "sin comprobación"
    for attempt in range(1, attempts + 1):
        token = f"{time.time_ns()}-{attempt}"
        last = check_once(base_url, expected_sha=expected_sha, token=token) or ""
        if not last:
            suffix = f" · sha={expected_sha.lower()}" if expected_sha else ""
            print(f"Production frontend healthy{suffix} (intento {attempt}/{attempts}).")
            return
        print(f"Production frontend unhealthy (intento {attempt}/{attempts}): {last}")
        if attempt < attempts:
            time.sleep(poll_seconds)
    raise SystemExit(last)


def self_test() -> None:
    good_html = b"""<!doctype html><html><head><link rel="stylesheet" href="/assets/app-a.css"></head>
    <body><div id="root"></div><script type="module" src="/assets/app-a.js"></script></body></html>"""
    bad_html = "<!doctype html><title>404 · Chess Studio</title><p>Recurso no encontrado.</p>".encode("utf-8")
    assert root_problem(200, "text/html", good_html, "https://example.test") is None
    assert "404 de emergencia" in str(root_problem(200, "text/html", bad_html, "https://example.test"))
    assert "HTTP 404" in str(root_problem(404, "text/html", bad_html, "https://example.test"))
    assert spa_problem(200, "text/html", good_html, "https://example.test") is None
    assert "deep-link SPA HTTP 404" in str(spa_problem(404, "text/html", bad_html, "https://example.test"))
    payload = json.dumps({"build": "a" * 40}).encode()
    assert release_problem(200, "application/json", payload, "a" * 40) is None
    assert "esperaba" in str(release_problem(200, "application/json", payload, "b" * 40))
    assert "build inválido" in str(
        release_problem(200, "application/json", json.dumps({"build": "main"}).encode(), "")
    )
    assert SPA_PROBE_PATH.startswith("/") and "/nested/" in SPA_PROBE_PATH
    print("production_frontend_health self-test OK · root + deep-link SPA + assets + release")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    parser.add_argument("--expected-sha", default="")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if not args.base_url:
        parser.error("--base-url es obligatorio salvo con --self-test")
    expected = args.expected_sha.strip().lower()
    if expected and not SHA_RE.fullmatch(expected):
        parser.error("--expected-sha debe ser un SHA Git de 40 hex")
    if args.attempts < 1 or args.poll_seconds < 0:
        parser.error("attempts/poll-seconds inválidos")

    wait_healthy(
        args.base_url,
        expected_sha=expected,
        attempts=args.attempts,
        poll_seconds=args.poll_seconds,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
