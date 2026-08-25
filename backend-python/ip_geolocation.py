"""Resolución mínima IP→país para el panel admin.

Cloudflare sigue siendo la fuente preferida. Este fallback sólo consulta IPs
públicas sin país, cachea el resultado y descarta todo salvo country_code.
"""
from __future__ import annotations

import ipaddress
import re
import time

import httpx

_CACHE: dict[str, tuple[float, str | None]] = {}
_SUCCESS_TTL_S = 24 * 60 * 60
_FAILURE_TTL_S = 10 * 60


def network_location_status(raw_ip: str | None) -> str:
    if not raw_ip:
        return "missing"
    try:
        address = ipaddress.ip_address(raw_ip)
    except ValueError:
        return "invalid"
    return "public" if address.is_global else "private"


async def resolve_country_code(raw_ip: str | None, *, client: httpx.AsyncClient | None = None) -> str | None:
    if network_location_status(raw_ip) != "public":
        return None
    ip = str(ipaddress.ip_address(raw_ip or ""))
    now = time.monotonic()
    cached = _CACHE.get(ip)
    if cached and cached[0] > now:
        return cached[1]

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(2.0, connect=1.0), follow_redirects=False)
    country = None
    try:
        response = await client.get(f"https://ipwho.is/{ip}")
        response.raise_for_status()
        payload = response.json()
        candidate = str(payload.get("country_code") or "").strip().upper() if payload.get("success") is not False else ""
        if re.fullmatch(r"[A-Z]{2}", candidate) and candidate not in {"XX", "T1"}:
            country = candidate
    except (httpx.HTTPError, ValueError, TypeError):
        country = None
    finally:
        if owns_client and client is not None:
            await client.aclose()

    _CACHE[ip] = (now + (_SUCCESS_TTL_S if country else _FAILURE_TTL_S), country)
    return country
