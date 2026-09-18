"""Security regressions specific to Internet-facing OCI staging."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from fastapi.testclient import TestClient

import main as main_module


BACKEND = Path(__file__).resolve().parent
STRONG_JWT_SECRET = "staging-security-test-secret-32-bytes-minimum"


def _import_module(module: str, *, unset=(), **overrides):
    env = os.environ.copy()
    for key in unset:
        env.pop(key, None)
    env.update({key: str(value) for key, value in overrides.items()})
    return subprocess.run(
        [sys.executable, "-c", f"import {module}"],
        cwd=BACKEND,
        env=env,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )


def _request(*, peer="172.17.0.1", cf_ip="203.0.113.9"):
    return SimpleNamespace(
        state=SimpleNamespace(),
        headers={"cf-ray": "test-ray-FRA", "cf-connecting-ip": cf_ip},
        client=SimpleNamespace(host=peer),
    )


def test_staging_rejects_missing_jwt_secret():
    result = _import_module("auth", unset=("JWT_SECRET",), ENVIRONMENT="staging")
    assert result.returncode != 0
    assert "JWT_SECRET" in result.stderr


def test_staging_rejects_open_registration_without_invite_secret():
    result = _import_module(
        "main",
        unset=("INVITE_CODE",),
        ENVIRONMENT="staging",
        JWT_SECRET=STRONG_JWT_SECRET,
        ALLOW_REGISTRATION="true",
        ADMIN_USERNAMES="evilsysadmin",
    )
    assert result.returncode != 0
    assert "INVITE_CODE" in result.stderr


def test_staging_rejects_admin_wildcard():
    result = _import_module(
        "main",
        ENVIRONMENT="staging",
        JWT_SECRET=STRONG_JWT_SECRET,
        INVITE_CODE="test-invite",
        ALLOW_REGISTRATION="true",
        ADMIN_USERNAMES="*",
    )
    assert result.returncode != 0
    assert "ADMIN_USERNAMES" in result.stderr


def test_staging_uses_cloudflare_client_ip_for_anonymous_rate_limit(monkeypatch):
    monkeypatch.setattr(main_module, "ENVIRONMENT", "staging")
    assert main_module.rate_limit_key(_request()) == "ip:203.0.113.9"


def test_non_tunnel_environment_does_not_trust_cloudflare_ip_for_rate_limit(monkeypatch):
    monkeypatch.setattr(main_module, "ENVIRONMENT", "development")
    assert main_module.rate_limit_key(_request()) == "ip:172.17.0.1"


def test_staging_emits_hsts(monkeypatch):
    monkeypatch.setattr(main_module, "ENVIRONMENT", "staging")
    response = TestClient(main_module.app).get("/api/health")
    assert response.status_code == 200
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
