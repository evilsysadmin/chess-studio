import asyncio

from fastapi.testclient import TestClient

from auth import create_token
import feedback_store as fstore
from main import app


client = TestClient(app)


def _auth(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(username)}"}


def setup_function():
    fstore._memory_feedback.clear()


def _create(username: str = "owner") -> dict:
    return asyncio.run(
        fstore.create_feedback(
            username=username,
            category="general",
            message="Quiero poder retirar este comentario.",
            context="Home",
        )
    )


def test_feedback_owner_can_delete_own_submission():
    created = _create()
    response = client.delete(f"/api/feedback/{created['id']}", headers=_auth("owner"))
    assert response.status_code == 204
    assert asyncio.run(fstore.list_feedback_for_user("owner")) == []


def test_feedback_owner_delete_does_not_delete_another_users_submission():
    created = _create("owner")
    response = client.delete(f"/api/feedback/{created['id']}", headers=_auth("intruder"))
    assert response.status_code == 404
    remaining = asyncio.run(fstore.list_feedback_for_user("owner"))
    assert [row["id"] for row in remaining] == [created["id"]]


def test_feedback_owner_delete_hides_missing_and_foreign_ids_the_same_way():
    response = client.delete("/api/feedback/does-not-exist", headers=_auth("owner"))
    assert response.status_code == 404


def test_feedback_owner_delete_requires_authentication():
    created = _create()
    response = client.delete(f"/api/feedback/{created['id']}")
    assert response.status_code == 401
