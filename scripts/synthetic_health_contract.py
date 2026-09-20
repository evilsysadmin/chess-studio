#!/usr/bin/env python3
"""Cheap no-network contract for the production synthetic probe."""
from synthetic_health_check import _check, api_base, env_enabled, ephemeral_credentials, game_state_matches

assert api_base("https://api.example.test") == "https://api.example.test/api"
assert api_base("https://api.example.test/api/") == "https://api.example.test/api"
assert api_base("api.example.test") == "https://api.example.test/api"

try:
    api_base("")
except ValueError:
    pass
else:
    raise AssertionError("empty synthetic base URL must fail")

assert env_enabled("1")
assert env_enabled("TRUE")
assert not env_enabled("0")
assert not env_enabled(None)

ephemeral_user, ephemeral_password = ephemeral_credentials()
assert ephemeral_user.startswith("ci_smoke_")
assert len(ephemeral_user) == len("ci_smoke_") + 16
assert all(ch in "0123456789abcdef" for ch in ephemeral_user.removeprefix("ci_smoke_"))
assert ephemeral_password.startswith("CS!")
assert len(ephemeral_password) >= 32

created = {"id": "game-1", "fen": "fen-after-create", "moves": []}
loaded = {"id": "game-1", "fen": "fen-after-create", "moves": []}
assert game_state_matches("game-1", created, loaded)
assert not game_state_matches("game-1", created, {**loaded, "moves": ["e4"]})
assert not game_state_matches("game-2", created, loaded)
assert not game_state_matches("game-1", {"id": "game-1", "moves": []}, loaded)

assert _check("slo-pass", 200, {}, 99.0, "req-1", slo_ms=100.0)
assert not _check("slo-fail", 200, {}, 101.0, "req-2", slo_ms=100.0)
assert not _check("status-fail", 503, {"detail": "down"}, 1.0, "req-3", slo_ms=100.0)

print("synthetic-health-contract OK")
