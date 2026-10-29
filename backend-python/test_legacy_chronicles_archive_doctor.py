"""Synthetic-only tests: no real Mongo connection and no player data."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import legacy_chronicles_archive_doctor as doctor  # noqa: E402


def _run(run_id="private-run-1", owner="private-owner", **changes):
    return {
        "_id": run_id, "owner": owner, "seed": 123,
        "currentMapId": "crypt-eight-squares", "worldVersion": 3,
        "inventory": {"potion": {"quantity": 2}},
        **changes,
    }


def test_archive_restore_is_order_and_key_order_independent(tmp_path):
    original = tmp_path / "original.jsonl"
    restored = tmp_path / "restored.jsonl"
    first, second = _run(), _run("private-run-2", "another-owner")
    original.write_text("\n".join(json.dumps(x) for x in (first, second)) + "\n", encoding="utf-8")
    restored.write_text(json.dumps([dict(reversed(list(second.items()))), first]), encoding="utf-8")
    assert doctor.fingerprints(doctor.load_export(str(original))) == doctor.fingerprints(doctor.load_export(str(restored)))
    cmd = [sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"), str(restored), "--baseline", str(original)]
    response = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=10)
    result = json.loads(response.stdout)
    assert response.returncode == 0
    assert result["archiveCheck"] == "ok"
    assert result["documents"] == 2
    assert result["missing"] == result["modified"] == result["added"] == 0
    assert "private-owner" not in response.stdout and "private-run-1" not in response.stdout


def test_restore_detects_missing_extra_and_mutated_records(tmp_path):
    original = tmp_path / "original.jsonl"
    restored = tmp_path / "restore.jsonl"
    original.write_text(json.dumps([_run(), _run("gone", "other")]), encoding="utf-8")
    restored.write_text(json.dumps([_run(inventory={"potion": {"quantity": 999}}), _run("added", "other")]), encoding="utf-8")
    cmd = [sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"), str(restored), "--baseline", str(original)]
    response = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=10)
    result = json.loads(response.stdout)
    assert response.returncode == 1
    assert result["archiveCheck"] == "restore-mismatch"
    assert (result["missing"], result["added"], result["modified"]) == (1, 1, 1)
    assert "private-owner" not in response.stdout and "private-run-1" not in response.stdout


@pytest.mark.parametrize("rows", [
    [_run(), _run()],
    [{"_id": "x", "owner": ""}],
    [{"_id": "x", "owner": "user", "worldVersion": -1}],
    [{"owner": "user"}],
])
def test_bad_archive_fails_closed(rows):
    with pytest.raises(ValueError):
        doctor.fingerprints(rows)


def test_duplicate_json_keys_rejected_without_leaking_values(tmp_path):
    target = tmp_path / "corrupt.jsonl"
    target.write_text('{"_id":"secret-id","owner":"secret-user","owner":"another"}\n', encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"), str(target)],
        capture_output=True, text=True, check=False, timeout=10,
    )
    assert result.returncode == 2
    assert "secret-id" not in result.stdout and "secret-user" not in result.stdout


def test_empty_collection_has_stable_fingerprint(tmp_path):
    file = tmp_path / "empty.jsonl"
    file.write_text("", encoding="utf-8")
    entries = doctor.fingerprints(doctor.load_export(str(file)))
    assert not entries
    assert len(doctor.aggregate_digest(entries)) == 64


def test_legacy_importer_limit_cannot_silently_truncate_owner_runs(tmp_path):
    source = tmp_path / "original.jsonl"
    # Go's existing source reader uses SetLimit(200) per owner. Exercise a
    # lower synthetic cap rather than creating real or expensive save data.
    source.write_text(json.dumps([
        _run("sensitive-one", "same-owner"),
        _run("sensitive-two", "same-owner"),
        _run("sensitive-three", "unrelated-owner"),
    ]), encoding="utf-8")
    cmd = [
        sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
        str(source), "--importer-cap", "2",
    ]
    response = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=10)
    payload = json.loads(response.stdout)
    assert response.returncode == 1
    assert payload["archiveCheck"] == "importer-cap-unsafe"
    assert payload["importerCap"] == 2 and payload["ownersAtOrAboveCap"] == 1
    assert "same-owner" not in response.stdout and "sensitive-one" not in response.stdout
    # A cap above the largest actual owner count is safe to clear this gate.
    response = subprocess.run(cmd[:-1] + ["4"], capture_output=True, text=True, check=False, timeout=10)
    assert response.returncode == 0
    assert json.loads(response.stdout)["ownersAtOrAboveCap"] == 0
