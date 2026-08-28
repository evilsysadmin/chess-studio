from operation_idempotency import (
    MAX_OPERATION_LEDGER,
    deterministic_game_id,
    operation_fingerprint,
    operation_replay,
    remember_operation,
)


def test_operation_fingerprint_is_stable_and_payload_sensitive():
    first = operation_fingerprint({"from": "e2", "to": "e4"})
    retry = operation_fingerprint({"to": "e4", "from": "e2"})
    other = operation_fingerprint({"from": "d2", "to": "d4"})
    assert retry == first
    assert other != first


def test_operation_ledger_is_bounded_and_replays_latest_operations():
    entry = {}
    for index in range(MAX_OPERATION_LEDGER + 7):
        remember_operation(entry, f"move-{index:08d}", f"fp-{index}", "move")
    assert len(entry["operationLedger"]) == MAX_OPERATION_LEDGER
    assert entry["operationLedger"][0]["key"] == "move-00000007"
    assert operation_replay(entry, "move-00000022", "fp-22", "move") is True


def test_deterministic_game_id_is_scoped_by_user_and_operation():
    assert deterministic_game_id("alice", "create-0001") == deterministic_game_id("alice", "create-0001")
    assert deterministic_game_id("alice", "create-0001") != deterministic_game_id("bob", "create-0001")
