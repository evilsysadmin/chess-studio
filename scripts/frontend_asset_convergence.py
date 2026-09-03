#!/usr/bin/env python3
"""Wait until a frontend origin serves a coherent index + hashed entry assets.

Cloudflare Pages can expose a new release marker before every asset referenced by
the new index has converged on a custom domain. During that window the SPA
fallback may answer text/html for a hashed .js file, which Chromium rejects.
This helper mirrors the live staging contract using only the Python stdlib.
"""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_ATTEMPTS = 30
DEFAULT_POLL_SECONDS = 2.0


class _EntryAssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs if value}
        ref = values.get("src") if tag.lower() == "script" else values.get("href")
        if not ref:
            return
        path = urllib.parse.urlsplit(ref).path.lower()
        if path.endswith((".js", ".css")):
            self.refs.append(ref)


def frontend_entry_assets(html: str, base_url: str) -> list[str]:
    parser = _EntryAssetParser()
    parser.feed(str(html or ""))
    seen: set[str] = set()
    assets: list[str] = []
    for ref in parser.refs:
        absolute = urllib.parse.urljoin(base_url.rstrip("/") + "/", ref)
        if absolute not in seen:
            seen.add(absolute)
            assets.append(absolute)
    return assets


def asset_mime_is_valid(url: str, content_type: str) -> bool:
    path = urllib.parse.urlsplit(url).path.lower()
    mime = str(content_type or "").lower()
    if path.endswith(".css"):
        return "text/css" in mime
    if path.endswith(".js"):
        return "javascript" in mime
    return False


def cache_busted(url: str, token: str) -> str:
    parts = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    query.append(("asset-gate", token))
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(query), parts.fragment)
    )


def _fetch(url: str, *, timeout: float = 12.0) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
            "User-Agent": "chess-studio-frontend-asset-gate/1",
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


def check_frontend_assets_once(base_url: str, *, token: str) -> str | None:
    root_url = cache_busted(base_url.rstrip("/") + "/", token)
    try:
        status, content_type, raw = _fetch(root_url)
    except (OSError, urllib.error.URLError) as exc:
        return f"raíz sin respuesta: {exc}"
    if status != 200:
        return f"raíz HTTP {status}"
    if "text/html" not in content_type.lower():
        return f"raíz MIME {content_type or '<vacío>'}"

    html = raw.decode("utf-8", "replace")
    assets = frontend_entry_assets(html, base_url)
    if not assets:
        return "index.html no contiene JS/CSS versionados"

    failures: list[str] = []
    for index, asset_url in enumerate(assets):
        try:
            status, asset_type, _ = _fetch(cache_busted(asset_url, f"{token}-{index}"))
        except (OSError, urllib.error.URLError) as exc:
            failures.append(f"{urllib.parse.urlsplit(asset_url).path}: {exc}")
            continue
        if status != 200 or not asset_mime_is_valid(asset_url, asset_type):
            failures.append(
                f"{urllib.parse.urlsplit(asset_url).path}: HTTP {status} · "
                f"{asset_type or 'sin content-type'}"
            )
    return " | ".join(failures) if failures else None


def wait_for_frontend_assets(
    base_url: str,
    *,
    label: str,
    attempts: int = DEFAULT_ATTEMPTS,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
) -> None:
    last_problem = "sin respuesta"
    for attempt in range(1, attempts + 1):
        token = f"{time.time_ns()}-{attempt}"
        problem = check_frontend_assets_once(base_url, token=token)
        if problem is None:
            print(f"{label}: index + assets ejecutables convergieron (intento {attempt}/{attempts}).")
            return
        last_problem = problem
        print(f"{label}: aún no converge (intento {attempt}/{attempts}): {problem}")
        if attempt < attempts:
            time.sleep(poll_seconds)
    raise SystemExit(
        f"{label}: no propagó index + assets ejecutables tras {attempts} intentos: {last_problem}"
    )


def self_test() -> None:
    html = """
      <link rel="stylesheet" href="/assets/app-abc.css">
      <script type="module" src="/assets/vendor-react-def.js"></script>
      <script src="https://cdn.example.test/extra.js?v=1"></script>
      <link rel="icon" href="/favicon.svg">
      <script src="/assets/vendor-react-def.js"></script>
    """
    assert frontend_entry_assets(html, "https://example.test") == [
        "https://example.test/assets/app-abc.css",
        "https://example.test/assets/vendor-react-def.js",
        "https://cdn.example.test/extra.js?v=1",
    ]
    assert asset_mime_is_valid("https://x/a.js", "application/javascript; charset=utf-8")
    assert asset_mime_is_valid("https://x/a.css", "text/css")
    assert not asset_mime_is_valid("https://x/a.js", "text/html")
    assert "asset-gate=" in cache_busted("https://x/a.js?foo=1", "abc")
    print("frontend_asset_convergence self-test OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    parser.add_argument("--label", default="frontend")
    parser.add_argument("--attempts", type=int, default=DEFAULT_ATTEMPTS)
    parser.add_argument("--poll-seconds", type=float, default=DEFAULT_POLL_SECONDS)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.base_url:
        parser.error("--base-url es obligatorio salvo con --self-test")
    if args.attempts < 1 or args.poll_seconds < 0:
        parser.error("attempts/poll-seconds inválidos")
    wait_for_frontend_assets(
        args.base_url,
        label=args.label,
        attempts=args.attempts,
        poll_seconds=args.poll_seconds,
    )


if __name__ == "__main__":
    main()
