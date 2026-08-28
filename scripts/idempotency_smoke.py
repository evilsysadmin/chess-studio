#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from operation_idempotency import (  # noqa: E402
    MAX_OPERATION_LEDGER,
    deterministic_game_id,
    operation_fingerprint,
    operation_replay,
    remember_operation,
)

first = operation_fingerprint({"from": "e2", "to": "e4"})
assert first == operation_fingerprint({"to": "e4", "from": "e2"})
assert first != operation_fingerprint({"from": "d2", "to": "d4"})
entry = {}
for index in range(MAX_OPERATION_LEDGER + 7):
    remember_operation(entry, f"move-{index:08d}", f"fp-{index}", "move")
assert len(entry["operationLedger"]) == MAX_OPERATION_LEDGER
assert entry["operationLedger"][0]["key"] == "move-00000007"
assert operation_replay(entry, "move-00000022", "fp-22", "move") is True
assert deterministic_game_id("alice", "create-0001") != deterministic_game_id("bob", "create-0001")
print("idempotency-smoke OK · fingerprint + bounded replay ledger + per-user deterministic game IDs")
