#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "games/pawn-slug-godot/art/sprite-forge-v1/catalog.json"
LEDGER = ROOT / "games/pawn-slug-godot/art/sprite-forge-v1/acceptance.json"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
STATUSES = {"authoring", "validated", "reviewed", "accepted", "rejected"}
ACCEPTED_HASHES = (
    "contract_sha256",
    "manifest_sha256",
    "review_sha256",
    "runtime_capture_sha256",
)


class AcceptanceError(ValueError):
    pass


def _load(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AcceptanceError(f"cannot load {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise AcceptanceError(f"{path} must contain an object")
    return data


def check(catalog_path: Path = CATALOG, ledger_path: Path = LEDGER) -> dict:
    catalog = _load(catalog_path)
    ledger = _load(ledger_path)
    if catalog.get("schema") != 1 or catalog.get("generation") != "v1":
        raise AcceptanceError("catalog must be Sprite Forge v1")
    if ledger.get("schema") != 1 or ledger.get("generation") != "v1":
        raise AcceptanceError("acceptance ledger must be Sprite Forge v1")

    banks = catalog.get("banks")
    if not isinstance(banks, list) or not banks:
        raise AcceptanceError("catalog banks must be a non-empty array")
    ids = []
    for bank in banks:
        if not isinstance(bank, dict) or not isinstance(bank.get("id"), str):
            raise AcceptanceError("catalog bank missing id")
        if "status" in bank:
            raise AcceptanceError(
                f"catalog bank {bank['id']} duplicates acceptance status; ledger is authoritative"
            )
        ids.append(bank["id"])
    if len(ids) != len(set(ids)):
        raise AcceptanceError("duplicate bank id in catalog")

    ledger_banks = ledger.get("banks")
    if not isinstance(ledger_banks, dict):
        raise AcceptanceError("ledger banks must be an object")
    if set(ledger_banks) != set(ids):
        missing = sorted(set(ids) - set(ledger_banks))
        extra = sorted(set(ledger_banks) - set(ids))
        raise AcceptanceError(f"ledger/catalog drift missing={missing} extra={extra}")

    accepted = []
    for bank_id in sorted(ids):
        entry = ledger_banks[bank_id]
        if not isinstance(entry, dict):
            raise AcceptanceError(f"ledger entry {bank_id} must be an object")
        status = entry.get("status")
        if status not in STATUSES:
            raise AcceptanceError(f"invalid status for {bank_id}: {status!r}")

        present_hashes = [name for name in ACCEPTED_HASHES if name in entry]
        if status == "accepted":
            missing = [name for name in ACCEPTED_HASHES if name not in entry]
            if missing:
                raise AcceptanceError(
                    f"accepted bank {bank_id} missing hashes: {','.join(missing)}"
                )
            for name in ACCEPTED_HASHES:
                value = entry[name]
                if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
                    raise AcceptanceError(
                        f"accepted bank {bank_id} has invalid {name}"
                    )
            accepted.append(bank_id)
        elif present_hashes:
            raise AcceptanceError(
                f"bank {bank_id} status={status} carries acceptance hashes prematurely"
            )

    return {
        "banks": len(ids),
        "accepted": accepted,
        "pending": len(ids) - len(accepted),
    }


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        catalog = root / "catalog.json"
        ledger = root / "acceptance.json"
        catalog.write_text(
            json.dumps({
                "schema": 1,
                "generation": "v1",
                "banks": [{"id": "enemy-pawn-body-v1"}],
            }),
            encoding="utf-8",
        )
        ledger.write_text(
            json.dumps({
                "schema": 1,
                "generation": "v1",
                "banks": {"enemy-pawn-body-v1": {"status": "authoring"}},
            }),
            encoding="utf-8",
        )
        assert check(catalog, ledger)["pending"] == 1

        accepted_hashes = {name: _digest(name) for name in ACCEPTED_HASHES}
        ledger.write_text(
            json.dumps({
                "schema": 1,
                "generation": "v1",
                "banks": {
                    "enemy-pawn-body-v1": {
                        "status": "accepted",
                        **accepted_hashes,
                    }
                },
            }),
            encoding="utf-8",
        )
        assert check(catalog, ledger)["accepted"] == ["enemy-pawn-body-v1"]

        broken = json.loads(ledger.read_text(encoding="utf-8"))
        del broken["banks"]["enemy-pawn-body-v1"]["runtime_capture_sha256"]
        ledger.write_text(json.dumps(broken), encoding="utf-8")
        try:
            check(catalog, ledger)
        except AcceptanceError as exc:
            assert "missing hashes" in str(exc)
        else:
            raise AssertionError("accepted bank without runtime hash must fail closed")

        ledger.write_text(
            json.dumps({
                "schema": 1,
                "generation": "v1",
                "banks": {
                    "enemy-pawn-body-v1": {
                        "status": "reviewed",
                        "review_sha256": _digest("review"),
                    }
                },
            }),
            encoding="utf-8",
        )
        try:
            check(catalog, ledger)
        except AcceptanceError as exc:
            assert "prematurely" in str(exc)
        else:
            raise AssertionError("non-accepted bank carrying hashes must fail closed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", default="check", choices=("check",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("Sprite Forge acceptance self-test: OK")
        return 0
    result = check()
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
