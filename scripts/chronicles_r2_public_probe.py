#!/usr/bin/env python3
"""Read-only probe of the existing R2 operator's Chronicles bucket.

Never create buckets, alter DNS, upload objects or print Cloudflare secrets.
Run with the existing CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
"""
from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request
from typing import Any, Callable

BUCKET = "chronicles"
KEY = "sprites/ash-goblin.webp"
STAGING_ORIGIN = "https://staging.chronicles.shadowops.dpdns.org"


def active_domain(domains: Any) -> str | None:
    if not isinstance(domains, list):
        raise ValueError("R2 domain inventory malformed")
    active = []
    for item in domains:
        if not isinstance(item, dict):
            raise ValueError("R2 domain row malformed")
        if item.get("enabled") is not True:
            continue
        status = item.get("status")
        name = item.get("domain")
        if not isinstance(status, dict) or not isinstance(name, str):
            raise ValueError("R2 domain settings malformed")
        if status.get("ssl") != "active" or status.get("ownership") != "active":
            continue
        if not name.endswith(".shadowops.dpdns.org") or any(
            c not in "abcdefghijklmnopqrstuvwxyz0123456789.-" for c in name
        ):
            raise ValueError("R2 domain is outside the expected public zone")
        active.append(name)
    if len(active) > 1:
        raise ValueError("More than one active Chronicles R2 domain")
    return active[0] if active else None


def inspect(domains: Any, head: Callable[[str], tuple[int, dict[str, str]]]) -> dict[str, str]:
    host = active_domain(domains)
    if host is None:
        return {"domain": "pending", "asset": "unverified"}
    url = f"https://{host}/{KEY}"
    code, headers = head(url)
    if code != 200:
        return {"domain": host, "asset": f"http-{code}"}
    mime = headers.get("content-type", "").lower().split(";", 1)[0].strip()
    cors = headers.get("access-control-allow-origin", "")
    cache = headers.get("cache-control", "").lower()
    return {
        "domain": host,
        "url": url,
        "asset": "ok" if mime == "image/webp" else "bad-content-type",
        "cors": "ok" if cors in ("*", STAGING_ORIGIN) else "missing-or-denied",
        # This key is NOT content-addressed; do not cache it for a year.
        "cache": "mutable-safe" if "immutable" not in cache and "max-age=31536000" not in cache
                 else "unsafe-ttl",
        "cache_header": cache[:128] or "absent",
    }


def head_public(url: str) -> tuple[int, dict[str, str]]:
    request = urllib.request.Request(
        url, method="HEAD",
        headers={"Origin": STAGING_ORIGIN, "User-Agent": "chess-studio-chronicles-r2-probe/1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}
    except urllib.error.HTTPError as exc:
        return exc.code, {}


def main() -> int:
    from cloudflare_r2_assets import custom_domains, require_env
    try:
        token, account = require_env()
        result = inspect(custom_domains(token, account, BUCKET), head_public)
    except Exception as exc:
        print("CHRONICLES_R2_OPERATOR_PROBE_BLOCKED " + type(exc).__name__, file=sys.stderr)
        return 1
    for key, value in sorted(result.items()):
        print("CHRONICLES_R2_OPERATOR_PROBE " + key + " " + value)
    return 0 if all(result.get(k) == "ok" for k in ("asset", "cors")) and result.get("cache") == "mutable-safe" else 1


if __name__ == "__main__":
    raise SystemExit(main())
