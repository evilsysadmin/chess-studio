"""The first-person return portal must be authorized by stored provenance."""

from chronicles_api import _legacy_swordhaven_return_allowed


def test_legacy_swordhaven_return_requires_persisted_provenance():
    arrived = {"worldFlags": {"swordhavenArrived": True}}
    assert _legacy_swordhaven_return_allowed(arrived, "crypt-eight-squares", "swordhaven-square")
    for row, origin, target in [
        ({}, "crypt-eight-squares", "swordhaven-square"),
        ({"worldFlags": {"swordhavenArrived": "true"}}, "crypt-eight-squares", "swordhaven-square"),
        ({"worldFlags": {"swordhavenArrived": False}}, "crypt-eight-squares", "swordhaven-square"),
        (arrived, "gallery-of-forks", "swordhaven-square"),
        (arrived, "crypt-eight-squares", "ash-vault"),
    ]:
        assert not _legacy_swordhaven_return_allowed(row, origin, target)
