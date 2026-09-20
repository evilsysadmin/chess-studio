"""Structured operational HTTP logs for Chess Studio.

Logs may include the authenticated username for operational usage/debugging,
and sanitized network origin fields for debugging, but never request bodies, FENs, passwords or tokens. Username and IPs are kept out
of metrics labels so observability series remain low-cardinality.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import re
from typing import Any


_UUIDISH_SEGMENT = re.compile(r"^[0-9a-fA-F]{8,}(?:-[0-9a-fA-F]{4,}){2,}$")
_LONG_TOKEN_SEGMENT = re.compile(r"^[A-Za-z0-9_-]{24,}$")
_LONG_NUMBER_SEGMENT = re.compile(r"^\d{4,}$")


def sanitize_ip(value: str | None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


def sanitize_forwarded_for(value: str | None, *, max_entries: int = 8) -> list[str]:
    """Return only syntactically valid IPs from X-Forwarded-For.

    This field is observability-only. It is intentionally not a trusted auth or
    rate-limit identity because arbitrary clients can spoof XFF unless a known
    proxy strips/rebuilds it.
    """
    result: list[str] = []
    for part in str(value or "").split(","):
        clean = sanitize_ip(part)
        if clean:
            result.append(clean)
        if len(result) >= max(1, int(max_entries)):
            break
    return result


def normalize_unmatched_path(value: str | None) -> str | None:
    """Keep 404s actionable without logging likely user/game identifiers."""
    raw = str(value or "").split("?", 1)[0].strip()
    if not raw.startswith("/"):
        return None
    parts = []
    for part in raw.split("/")[1:]:
        clean = re.sub(r"[^A-Za-z0-9._~-]", "-", part)[:80]
        if _UUIDISH_SEGMENT.fullmatch(clean) or _LONG_TOKEN_SEGMENT.fullmatch(clean):
            clean = "{id}"
        elif _LONG_NUMBER_SEGMENT.fullmatch(clean):
            clean = "{n}"
        parts.append(clean)
    normalized = "/" + "/".join(parts)
    return normalized[:200]


def _clean_log_text(value: str | None, *, max_length: int) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()
    return text[:max(1, int(max_length))]


def _password_shape(password: str) -> list[str]:
    value = str(password or "")
    classes: list[str] = []
    if any(ch.islower() for ch in value):
        classes.append("lower")
    if any(ch.isupper() for ch in value):
        classes.append("upper")
    if any(ch.isdigit() for ch in value):
        classes.append("digit")
    if any(ch.isspace() for ch in value):
        classes.append("space")
    if any(not ch.isalnum() and not ch.isspace() for ch in value):
        classes.append("symbol")
    return classes


def _password_fingerprint(password: str, fingerprint_key: str) -> str | None:
    key = str(fingerprint_key or "").encode("utf-8")
    if not key:
        return None
    message = b"chess-studio:auth-login-failed\x00" + str(password or "").encode("utf-8", errors="surrogatepass")
    return hmac.new(key, message, hashlib.sha256).hexdigest()[:20]


def emit_auth_login_failed(
    logger: logging.Logger,
    *,
    request_id: str,
    attempted_username: str,
    password: str,
    fingerprint_key: str,
    account_exists: bool,
    failure_reason: str,
    client_ip: str | None = None,
    peer_ip: str | None = None,
    x_forwarded_for: list[str] | None = None,
    client_country: str | None = None,
    user_agent: str | None = None,
    client_release: str | None = None,
) -> None:
    """Emit bot-forensics metadata for a failed login without logging credentials.

    Password text never leaves process memory. A keyed HMAC fingerprint lets us
    correlate reuse of the same guess inside one environment without making the
    guessed password recoverable from Loki alone.
    """
    payload: dict[str, Any] = {
        "event": "auth_login_failed",
        "status": 401,
        "request_id": str(request_id)[:80],
        "username_attempted": _clean_log_text(attempted_username, max_length=64),
        "account_exists": bool(account_exists),
        "failure_reason": (
            failure_reason if failure_reason in {"unknown_user", "bad_password"} else "invalid_credentials"
        ),
        "password_length": len(str(password or "")),
        "password_classes": _password_shape(password),
    }
    fingerprint = _password_fingerprint(password, fingerprint_key)
    if fingerprint:
        payload["password_fingerprint"] = fingerprint
    if client_release:
        payload["client_release"] = str(client_release)[:40]
    clean_client_ip = sanitize_ip(client_ip)
    clean_peer_ip = sanitize_ip(peer_ip)
    clean_xff = [clean for ip in (x_forwarded_for or []) if (clean := sanitize_ip(ip))]
    if clean_client_ip:
        payload["client_ip"] = clean_client_ip
    if clean_peer_ip:
        payload["peer_ip"] = clean_peer_ip
    if clean_xff:
        payload["x_forwarded_for"] = clean_xff[:8]
    country = _clean_log_text(client_country, max_length=2).upper()
    if re.fullmatch(r"[A-Z]{2}", country or ""):
        payload["client_country"] = country
    clean_ua = _clean_log_text(user_agent, max_length=240)
    if clean_ua:
        payload["user_agent"] = clean_ua
    logger.warning(json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True))


def emit_http_event(
    logger: logging.Logger,
    *,
    request_id: str,
    method: str,
    route: str,
    status_code: int,
    duration_ms: float,
    client_release: str | None = None,
    username: str | None = None,
    request_path: str | None = None,
    exception: bool = False,
    client_ip: str | None = None,
    peer_ip: str | None = None,
    x_forwarded_for: list[str] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "event": "http_request",
        "request_id": str(request_id)[:80],
        "method": str(method or "?").upper()[:8],
        "route": str(route or "unknown")[:160],
        "status": int(status_code or 0),
        "duration_ms": round(max(0.0, float(duration_ms or 0.0)), 2),
    }
    if client_release:
        payload["client_release"] = str(client_release)[:40]
    try:
        from tracing import current_trace_id, current_trace_sampled
        trace_id = current_trace_id()
        trace_sampled = current_trace_sampled()
    except Exception:
        trace_id = None
        trace_sampled = None
    if trace_id:
        payload["trace_id"] = trace_id
        if trace_sampled is not None:
            payload["trace_sampled"] = bool(trace_sampled)
    if exception:
        payload["exception"] = True
    clean_path = normalize_unmatched_path(request_path)
    if clean_path:
        payload["request_path"] = clean_path
    clean_username = str(username or "").strip()[:64]
    if clean_username and clean_username != "-":
        payload["username"] = clean_username
    clean_client_ip = sanitize_ip(client_ip)
    clean_peer_ip = sanitize_ip(peer_ip)
    clean_xff = [clean for ip in (x_forwarded_for or []) if (clean := sanitize_ip(ip))]
    if clean_client_ip:
        payload["client_ip"] = clean_client_ip
    if clean_peer_ip:
        payload["peer_ip"] = clean_peer_ip
    if clean_xff:
        payload["x_forwarded_for"] = clean_xff[:8]
    message = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    if exception:
        logger.exception(message)
    else:
        logger.info(message)
