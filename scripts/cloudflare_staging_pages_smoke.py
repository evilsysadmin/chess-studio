#!/usr/bin/env python3
"""Smoke tests stdlib del bootstrap Cloudflare Pages staging; sin red."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).with_name("cloudflare_staging_pages.py")
spec = importlib.util.spec_from_file_location("cloudflare_staging_pages", path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_pages_project_is_idempotent() -> None:
    calls = []

    def request(method, path, payload=None):
        calls.append((method, path, payload))
        return 200, {"success": True, "result": {"name": module.PAGES_PROJECT, "production_branch": "main"}}

    with (
        patch.dict(module.os.environ, {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "token"}),
        patch.object(module, "request_json", side_effect=request),
    ):
        created = module.ensure_pages_project()
    check(created is False, "un proyecto existente no debe recrearse")
    check(len(calls) == 1 and calls[0][0] == "GET", "la reconciliación estable debe ser sólo lectura")


def test_pages_project_is_created_when_missing() -> None:
    calls = []

    def request(method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET":
            return 404, {"success": False, "errors": [{"message": "not found"}]}
        return 200, {"success": True, "result": {"name": module.PAGES_PROJECT}}

    with (
        patch.dict(module.os.environ, {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "token"}),
        patch.object(module, "request_json", side_effect=request),
    ):
        created = module.ensure_pages_project()
    check(created is True, "debe crear Pages en la primera reconciliación")
    check(calls[-1][2] == {"name": module.PAGES_PROJECT, "production_branch": "main"}, "Pages debe fijar main como producción")


def test_dns_reconciliation_updates_target_and_proxy_mode() -> None:
    calls = []

    def request(method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET":
            return 200, {"success": True, "result": [{
                "id": "dns-1",
                "type": "CNAME",
                "name": module.PAGES_HOSTNAME,
                "content": "old.example",
                "proxied": False,
            }]}
        return 200, {"success": True, "result": {"id": "dns-1"}}

    with (
        patch.dict(module.os.environ, {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "token"}),
        patch.object(module, "request_json", side_effect=request),
    ):
        outcome = module.ensure_cname(
            "zone",
            module.PAGES_HOSTNAME,
            module.PAGES_TARGET,
            proxied=True,
            comment="staging",
        )
    check(outcome == "updated", "un CNAME divergente debe reconciliarse")
    method, path, payload = calls[-1]
    check(method == "PATCH" and path.endswith("/dns-1"), "debe actualizar el record existente")
    check(payload["content"] == module.PAGES_TARGET and payload["proxied"] is True, "Pages staging debe quedar proxied")


def test_web_analytics_permission_is_non_blocking() -> None:
    with (
        patch.dict(module.os.environ, {"CLOUDFLARE_ACCOUNT_ID": "acc", "CLOUDFLARE_API_TOKEN": "token"}),
        patch.object(module, "request_json", return_value=(403, {"success": False, "errors": [{"message": "forbidden"}]})),
    ):
        outcome = module.ensure_web_analytics("zone")
    check(outcome == "permission-missing", "RUM no debe tumbar hosting si el token no tiene Account Settings")


if __name__ == "__main__":
    test_pages_project_is_idempotent()
    test_pages_project_is_created_when_missing()
    test_dns_reconciliation_updates_target_and_proxy_mode()
    test_web_analytics_permission_is_non_blocking()
    print("cloudflare-staging-pages-smoke OK · Pages + DNS + RUM opcional")
