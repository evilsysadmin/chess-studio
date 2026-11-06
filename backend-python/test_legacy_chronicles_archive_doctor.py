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
        "contentVersion": 1, "manifestRevision": "test-fixture-revision",
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
    # The doctor still supports explicit *historical hard-limit* audits, but
    # today's Go reader uses SetBatchSize(200), not a total owner limit.
    # Exercise this optional diagnostic with a synthetic hard limit only.
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


def test_more_than_200_legacy_runs_are_not_a_false_importer_cap_alarm(tmp_path):
    source = tmp_path / "same-owner-205.jsonl"
    # BatchSize(200) is a transport setting; the existing Go importer must
    # read the complete owner cursor, not reject or silently cap 201+ saves.
    rows = [_run(f"secret-{n}", "private-owner") for n in range(205)]
    source.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
    cmd = [sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"), str(source)]
    response = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=10)
    payload = json.loads(response.stdout)
    assert response.returncode == 0, response.stderr
    assert payload["archiveCheck"] == "ok"
    assert payload["documents"] == 205
    assert len(payload["sha256"]) == 64
    assert "importerCap" not in payload and "ownersAtOrAboveCap" not in payload
    assert "private-owner" not in response.stdout and "secret-" not in response.stdout



@pytest.mark.parametrize("value,accepted", [
    ({"$numberInt": "3"}, True),
    ({"$numberLong": "3"}, True),
    ({"$numberInt": "2147483647"}, True),
    ({"$numberLong": "9223372036854775807"}, True),
    ({"$numberInt": "-1"}, False),
    ({"$numberLong": "-1"}, False),
    ({"$numberInt": "2147483648"}, False),
    ({"$numberLong": "9223372036854775808"}, False),
    ({"$numberInt": "03"}, False),
    ({"$numberDouble": "3.0"}, False),
    ({"$numberInt": "3", "other": "bad"}, False),
    ({"$numberInt": True}, False),
    (False, False),
])
def test_canonical_mongoexport_world_version_validation(value, accepted):
    row = _run(worldVersion=value)
    if accepted:
        assert len(doctor.fingerprints([row])) == 1
    else:
        with pytest.raises(ValueError):
            doctor.fingerprints([row])


def test_canonical_jsonl_archive_and_restore_readback(tmp_path):
    source = tmp_path / "archive-canonical.jsonl"
    restored = tmp_path / "restored-canonical.jsonl"
    # MongoDB's canonical Extended JSON preserves BSON integer tags and dates.
    rows = [
        _run("hidden-a", "alice", worldVersion={"$numberInt": "3"},
             seed={"$numberLong": "3299000063"},
             createdAt={"$date": {"$numberLong": "1712345678901"}}),
        _run("hidden-b", "bob", worldVersion={"$numberLong": "4294967297"}),
    ]
    source.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
    restored.write_text(json.dumps([dict(reversed(list(row.items()))) for row in reversed(rows)]), encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
         str(restored), "--baseline", str(source)],
        capture_output=True, text=True, check=False, timeout=10,
    )
    assert result.returncode == 0, result.stdout
    assert json.loads(result.stdout)["archiveCheck"] == "ok"
    assert "hidden-a" not in result.stdout and "alice" not in result.stdout


def test_reconcile_matches_owner_runs_with_legitimate_new_target_runs(tmp_path):
    source = tmp_path / "prod-snapshot.jsonl"
    target = tmp_path / "independent-target.jsonl"
    originals = [
        _run("hidden-a", "alice", worldVersion={"$numberInt": "3"}),
        _run("hidden-b", "alice", worldVersion={"$numberLong": "10"}),
        _run("hidden-c", "bob", worldVersion={"$numberInt": "0"}),
    ]
    new_native = _run("native-d", "charlie", worldVersion={"$numberInt": "0"})
    source.write_text("\n".join(json.dumps(row) for row in originals), encoding="utf-8")
    target.write_text(json.dumps([new_native, *reversed(originals)]), encoding="utf-8")
    command = [
        sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
        str(source), "--reconcile-target", str(target),
    ]
    response = subprocess.run(command, capture_output=True, text=True, check=False, timeout=10)
    metrics = json.loads(response.stdout)
    assert response.returncode == 0, response.stdout
    assert metrics["archiveCheck"] == "reconciliation-matching"
    assert metrics["sourceOwners"] == 2
    assert metrics["matchedRuns"] == 3
    assert metrics["targetNativeExtraRuns"] == 1
    assert metrics["missingRuns"] == metrics["modifiedRuns"] == metrics["ownerConflicts"] == 0
    assert metrics["provesGameplayCompatibility"] is False
    assert metrics["authorizesLegacyRetirement"] is False
    assert metrics["readOnly"] is True
    for token in ("alice", "bob", "charlie", "hidden-a", "native-d"):
        assert token not in response.stdout + response.stderr


@pytest.mark.parametrize("case,expected_field", [
    ("missing", "missingRuns"),
    ("modified", "modifiedRuns"),
    ("wrong-owner", "ownerConflicts"),
    ("object-id-source", "unsupportedSourceIds"),
    ("empty-source", "sourceDocuments"),
])
def test_reconcile_fails_closed_without_disclosing_owners(tmp_path, case, expected_field):
    original = [_run("secret-1", "alice"), _run("secret-2", "alice"),
                _run("secret-3", "bob")]
    target = [dict(row) for row in original]
    if case == "missing":
        target.pop(1)
    elif case == "modified":
        target[0] = {**target[0], "inventory": {"potion": {"quantity": 99}}}
    elif case == "wrong-owner":
        target[0] = {**target[0], "owner": "mallory"}
    elif case == "object-id-source":
        original[0] = {**original[0], "_id": {"$oid": "507f1f77bcf86cd799439011"}}
        target[0] = dict(original[0])
    elif case == "empty-source":
        original.clear()
    source = tmp_path / "source.jsonl"
    target_file = tmp_path / "target.jsonl"
    source.write_text(json.dumps(original), encoding="utf-8")
    target_file.write_text(json.dumps(target), encoding="utf-8")
    result = subprocess.run([
        sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
        str(source), "--reconcile-target", str(target_file),
    ], capture_output=True, text=True, check=False, timeout=10)
    assert result.returncode == 1, result.stdout + result.stderr
    data = json.loads(result.stdout)
    assert data["archiveCheck"] == "reconciliation-incomplete"
    assert data["authorizesLegacyRetirement"] is False
    if expected_field != "sourceDocuments":
        assert data[expected_field] >= 1
    else:
        assert data[expected_field] == 0
    for private in ("alice", "bob", "mallory", "secret-1", "secret-2", "secret-3"):
        assert private not in result.stdout + result.stderr


def test_reconcile_rejects_duplicate_destination_ids(tmp_path):
    src = tmp_path / "source.jsonl"
    dst = tmp_path / "target.jsonl"
    src.write_text(json.dumps([_run("hidden", "alice")]), encoding="utf-8")
    dst.write_text(json.dumps([_run("hidden", "alice"), _run("hidden", "alice")]), encoding="utf-8")
    result = subprocess.run([
        sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
        str(src), "--reconcile-target", str(dst),
    ], capture_output=True, text=True, check=False, timeout=10)
    assert result.returncode == 2
    assert json.loads(result.stdout)["archiveCheck"] == "input-error"
    assert "alice" not in result.stdout and "hidden" not in result.stdout


@pytest.mark.parametrize("field,value", [
    ("seed", None),
    ("seed", "3"),
    ("seed", {"$numberInt": "-1"}),
    ("seed", {"$numberInt": "2147483648"}),
    ("seed", True),
    ("currentMapId", None),
    ("currentMapId", "  "),
    ("contentVersion", None),
    ("contentVersion", {"$numberLong": "9223372036854775808"}),
    ("contentVersion", False),
    ("manifestRevision", None),
    ("manifestRevision", ""),
])
def test_matching_archive_cannot_mask_unresumable_source_shape(tmp_path, field, value):
    # An identical source and target must not be enough if the legacy reader
    # cannot reconstruct essential fields. No sensitive identifiers in output.
    original = _run("hidden-source-id", "private-owner", **{field: value})
    src, dst = tmp_path / "source.jsonl", tmp_path / "target.jsonl"
    src.write_text(json.dumps([original]), encoding="utf-8")
    dst.write_text(json.dumps([original]), encoding="utf-8")
    reply = subprocess.run([
        sys.executable, str(ROOT / "scripts/legacy_chronicles_archive_doctor.py"),
        str(src), "--reconcile-target", str(dst),
    ], capture_output=True, text=True, check=False, timeout=10)
    info = json.loads(reply.stdout)
    # Completely malformed currentMapId is invalid archive input (code 2);
    # absent fields are valid archive data but not usable run-state evidence.
    if field == "currentMapId" and value is not None:
        assert reply.returncode == 2
        assert info["archiveCheck"] == "input-error"
    elif field == "seed" and value in (None, "3"):
        assert reply.returncode == 1
        assert info["unsupportedResumeShape"] == 1
        assert info["matchedRuns"] == 1
    elif field in ("seed", "contentVersion") and value in (True, False):
        assert reply.returncode == 1
        assert info["unsupportedResumeShape"] == 1
    else:
        assert reply.returncode == 1, reply.stdout
        assert info["unsupportedResumeShape"] == 1
        assert info["matchedRuns"] == 1
    if reply.returncode == 1:
        assert info["ownersAffected"] == 1
        assert info["authorizesLegacyRetirement"] is False
        assert info["provesGameplayCompatibility"] is False
    assert "hidden-source-id" not in reply.stdout + reply.stderr
    assert "private-owner" not in reply.stdout + reply.stderr


def test_canonical_required_resume_fields_and_optional_fields_are_supported():
    original = _run("hidden", "private-owner",
                    seed={"$numberLong": "3299000063"},
                    contentVersion={"$numberInt": "1"},
                    worldVersion={"$numberInt": "4"})
    assert doctor._has_minimum_resume_fields(original)
    outcome = doctor.reconcile_owner_runs([original], [dict(original)])
    assert outcome["archiveCheck"] == "reconciliation-matching"
    assert outcome["unsupportedResumeShape"] == 0
    assert outcome["ownersAffected"] == 0
    assert outcome["authorizesLegacyRetirement"] is False


def test_unsupported_resume_shape_and_owner_mismatch_count_once():
    source = [
        _run("one", "private-owner", contentVersion=None),
        _run("two", "private-owner", manifestRevision=""),
        _run("three", "independent-owner"),
    ]
    target = [
        dict(source[0]),
        {**source[1], "owner": "wrong-owner"},
        dict(source[2]),
    ]
    report = doctor.reconcile_owner_runs(source, target)
    assert report["matchedRuns"] == 2
    assert report["ownerConflicts"] == 1
    assert report["unsupportedResumeShape"] == 2
    assert report["ownersAffected"] == 1
    assert report["sourceOwners"] == 2
    assert report["archiveCheck"] == "reconciliation-incomplete"
