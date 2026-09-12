from fastapi.testclient import TestClient

from auth import create_token
from main import app


client = TestClient(app)
AUTH = {"Authorization": f"Bearer {create_token('testuser')}"}


def test_non_idempotent_game_creation_returns_unique_ids():
    payload = {"difficulty": 50, "color": "w"}

    first = client.post("/api/games", json=payload, headers=AUTH)
    second = client.post("/api/games", json=payload, headers=AUTH)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
