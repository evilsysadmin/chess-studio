"""Resolución mínima IP→país para el panel admin.

Cloudflare sigue siendo la fuente preferida. Este fallback sólo consulta IPs
públicas sin país, cachea el resultado y descarta todo salvo country_code.
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import time

import httpx

_CACHE: dict[str, tuple[float, str | None]] = {}
_PENDING: set[str] = set()
_BACKGROUND_TASKS: set[asyncio.Task] = set()
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


def _public_ip(raw_ip: str | None) -> str | None:
    if network_location_status(raw_ip) != "public":
        return None
    return str(ipaddress.ip_address(str(raw_ip or "").strip()))


def cached_country_code(raw_ip: str | None) -> str | None:
    ip = _public_ip(raw_ip)
    if not ip:
        return None
    cached = _CACHE.get(ip)
    if not cached:
        return None
    if cached[0] <= time.monotonic():
        _CACHE.pop(ip, None)
        return None
    return cached[1]


def schedule_country_resolution(raw_ip: str | None) -> bool:
    """Warm IP->country in the background without adding request latency."""
    ip = _public_ip(raw_ip)
    if not ip:
        return False
    now = time.monotonic()
    cached = _CACHE.get(ip)
    if cached and cached[0] > now:
        return False
    if ip in _PENDING:
        return False
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False

    _PENDING.add(ip)

    async def _runner() -> None:
        try:
            await resolve_country_code(ip)
        except Exception:
            _CACHE[ip] = (time.monotonic() + _FAILURE_TTL_S, None)
        finally:
            _PENDING.discard(ip)

    task = loop.create_task(_runner(), name="chess-studio-ip-country")
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return True


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
