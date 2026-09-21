"""Tests for the health endpoint."""

import os
import pytest
from fastapi.testclient import TestClient

# Import the top‑level FastAPI app.  The repository defines the app in
# `backend-python/main.py`.  If the entry point differs, adjust the import.
from backend_python.main import app  # type: ignore

client = TestClient(app)


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    """Ensure deterministic environment variables for the test."""
    monkeypatch.setenv("DEPLOY_TARGET", "test")
    monkeypatch.setenv("GIT_SHA", "deadbeef1234567890")
    yield
    # Cleanup is automatic via monkeypatch fixture


def test_health_endpoint_success():
    """The /health endpoint should return status 200 and the expected JSON."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["environment"] == "test"
    assert data["version"] == "deadbeef1234567890"


def test_health_endpoint_without_env(monkeypatch):
    """When env vars are missing, defaults should be used."""
    monkeypatch.delenv("DEPLOY_TARGET", raising=False)
    monkeypatch.delenv("GIT_SHA", raising=False)

    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["environment"] == "local"
    assert data["version"] == "unknown"
