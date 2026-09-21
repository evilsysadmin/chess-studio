from fastapi.testclient import TestClient

import main as main_module


client = TestClient(main_module.app)


def test_blocked_identity_short_circuits_account_lookup(monkeypatch):
    async def blocked(_identity):
        return 73

    async def should_not_lookup(_username):
        raise AssertionError("blocked identity reached account lookup")

    monkeypatch.setattr(main_module.auth_login_guard, "retry_after", blocked)
    monkeypatch.setattr(main_module.ustore, "get_user", should_not_lookup)

    response = client.post(
        "/api/auth/login",
        json={"username": "maybe_real_user", "password": "wrong-password"},
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "73"
    assert response.json()["detail"] == "Demasiados intentos de acceso. Reintenta más tarde."
    assert "maybe_real_user" not in response.text


def test_failure_that_reaches_identity_limit_returns_generic_429(monkeypatch):
    async def not_blocked(_identity):
        return 0

    async def no_user(_username):
        return None

    async def record_and_block(_identity):
        return 300

    monkeypatch.setattr(main_module.auth_login_guard, "retry_after", not_blocked)
    monkeypatch.setattr(main_module.auth_login_guard, "record_failure", record_and_block)
    monkeypatch.setattr(main_module.ustore, "get_user", no_user)

    response = client.post(
        "/api/auth/login",
        json={"username": "unknown_target", "password": "wrong-password"},
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "300"
    assert response.json()["detail"] == "Demasiados intentos de acceso. Reintenta más tarde."
    assert "unknown_target" not in response.text


def test_successful_login_clears_identity_guard(monkeypatch):
    cleared = []

    async def not_blocked(_identity):
        return 0

    async def existing_user(_username):
        return {"password_hash": "irrelevant"}

    async def clear(identity):
        cleared.append(identity)

    async def no_touch(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main_module.auth_login_guard, "retry_after", not_blocked)
    monkeypatch.setattr(main_module.auth_login_guard, "clear", clear)
    monkeypatch.setattr(main_module.ustore, "get_user", existing_user)
    monkeypatch.setattr(main_module, "verify_password", lambda _password, _hash: True)
    monkeypatch.setattr(main_module, "_touch_activity_best_effort", no_touch)

    response = client.post(
        "/api/auth/login",
        json={"username": "Known_User", "password": "correct-password"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "known_user"
    assert len(cleared) == 1
    assert cleared[0] == main_module.auth_login_guard.identity_key(
        "known_user", main_module.JWT_SECRET
    )
