import asyncio
import json

from fastapi.testclient import TestClient

from auth import create_token
from main import app
import profile_store as pstore
import users_store as ustore

client = TestClient(app)


def auth(username):
    return {"Authorization": f"Bearer {create_token(username)}"}


def seed_users():
    asyncio.run(ustore.create_user("admin_rating", "fixture-only"))
    asyncio.run(ustore.create_user("elo_target", "fixture-only"))


def seed_profile():
    rating_history = [{"date": "2026-08-31T10:00:00+00:00", "rating": 812}]
    asyncio.run(pstore.save_profile("elo_target", {
        "data": {
            "chess-study-player-rating": json.dumps({"rating": 812, "games": 7}),
            "chess-study-rating-history": json.dumps(rating_history),
            "chess-study-game-history": json.dumps([{"id": "real-game", "outcome": "loss"}]),
        },
    }))
    return rating_history


def test_admin_can_correct_current_elo_without_fabricating_results(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_rating"})
    seed_users()
    rating_history = seed_profile()

    response = client.post(
        "/api/admin/user-rating",
        json={"username": "elo_target", "rating": 640},
        headers=auth("admin_rating"),
    )
    assert response.status_code == 200
    assert response.json() == {
        "username": "elo_target",
        "rating": 640,
        "games": 7,
        "previousRating": 812,
    }

    profile = asyncio.run(pstore.get_profile("elo_target"))
    data = profile["data"]
    assert json.loads(data["chess-study-player-rating"]) == {"rating": 640, "games": 7}
    assert json.loads(data["chess-study-rating-history"]) == rating_history
    assert json.loads(data["chess-study-game-history"]) == [{"id": "real-game", "outcome": "loss"}]

    audit = json.loads(data["chess-study-admin-rating-audit"])
    assert len(audit) == 1
    assert audit[0]["source"] == "admin"
    assert audit[0]["previousRating"] == 812
    assert audit[0]["rating"] == 640
    assert audit[0]["date"]


def test_admin_users_immediately_exposes_corrected_elo(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_rating"})
    seed_users()
    seed_profile()

    changed = client.post(
        "/api/admin/user-rating",
        json={"username": "elo_target", "rating": 975},
        headers=auth("admin_rating"),
    )
    assert changed.status_code == 200

    listed = client.get("/api/admin/users", headers=auth("admin_rating"))
    assert listed.status_code == 200
    row = next(user for user in listed.json()["users"] if user["username"] == "elo_target")
    assert row["rating"] == 975
    assert row["ratingGames"] == 7


def test_admin_users_uses_batched_reads_and_never_waits_for_geoip(monkeypatch):
    import admin_api
    import main as main_module

    monkeypatch.setattr(main_module, "_ADMIN_USERNAMES", {"admin_rating"})
    seed_users()

    calls = {"users": 0, "profiles": 0, "scheduled": []}

    async def batched_users():
        calls["users"] += 1
        return [{
            "username": "elo_target",
            "created_at": "2026-01-01T00:00:00+00:00",
            "last_client_ip": "8.8.8.8",
        }]

    async def batched_profiles(usernames, keys):
        calls["profiles"] += 1
        assert usernames == ["elo_target"]
        assert "chess-study-player-rating" in keys
        return {
            "elo_target": {
                "data": {
                    "chess-study-player-rating": json.dumps({"rating": 901, "games": 4}),
                }
            }
        }

    async def forbidden_single_read(*_args, **_kwargs):
        raise AssertionError("Admin overview no debe hacer lecturas por usuario")

    monkeypatch.setattr(admin_api.ustore, "list_user_overview", batched_users)
    monkeypatch.setattr(admin_api.pstore, "get_profile_data_for_users", batched_profiles)
    monkeypatch.setattr(admin_api.pstore, "get_profile", forbidden_single_read)
    monkeypatch.setattr(admin_api, "cached_country_code", lambda _ip: None)
    monkeypatch.setattr(admin_api, "schedule_country_resolution", lambda ip: calls["scheduled"].append(ip) or True)

    listed = client.get("/api/admin/users", headers=auth("admin_rating"))

    assert listed.status_code == 200
    assert calls == {"users": 1, "profiles": 1, "scheduled": ["8.8.8.8"]}
    row = listed.json()["users"][0]
    assert row["username"] == "elo_target"
    assert row["rating"] == 901
    assert row["lastClientCountry"] is None
    assert row["networkLocationStatus"] == "public"


def test_non_admin_cannot_correct_elo(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_rating"})
    seed_users()
    seed_profile()

    response = client.post(
        "/api/admin/user-rating",
        json={"username": "elo_target", "rating": 700},
        headers=auth("elo_target"),
    )
    assert response.status_code == 403


def test_admin_rating_is_bounded(monkeypatch):
    monkeypatch.setattr("main._ADMIN_USERNAMES", {"admin_rating"})
    seed_users()

    too_low = client.post(
        "/api/admin/user-rating",
        json={"username": "elo_target", "rating": 399},
        headers=auth("admin_rating"),
    )
    too_high = client.post(
        "/api/admin/user-rating",
        json={"username": "elo_target", "rating": 3001},
        headers=auth("admin_rating"),
    )
    assert too_low.status_code == 422
    assert too_high.status_code == 422
