#!/usr/bin/env python3
"""Offline, read-only integrity/restore check for old Chronicles Mongo exports.

No Mongo imports, credentials, network calls, or writes. Never print run IDs,
owners or payloads: exported documents contain private gameplay/account data.
This checks preservation, NOT whether the standalone game can replay a run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


def _unique_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("clave JSON duplicada")
        result[key] = value
    return result


def _reject_constant(_value: str) -> None:
    raise ValueError("constante JSON no válida")


def _parse(text: str) -> Any:
    return json.loads(
        text, object_pairs_hook=_unique_keys, parse_constant=_reject_constant,
    )


def load_export(path: str) -> list[dict[str, Any]]:
    """Accept mongoexport JSON Lines, a JSON array, or a single document."""
    if path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    if not raw.strip():
        return []  # An actually empty mongoexport is a legitimate collection.
    try:
        parsed = _parse(raw)
    except json.JSONDecodeError:
        parsed = []
        for line_no, line in enumerate(raw.splitlines(), 1):
            if not line.strip():
                continue
            try:
                parsed.append(_parse(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"JSONL inválido en línea {line_no}: {exc.msg}") from None
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list) or any(not isinstance(row, dict) for row in parsed):
        raise ValueError("se esperaban documentos JSON (uno, lista o JSONL)")
    return parsed


def _valid_world_version(value: Any) -> bool:
    # mongoexport --jsonFormat canonical wraps BSON Int32/Int64; a plain
    # nonnegative JSON int is valid in relaxed exports and synthetic fixtures.
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return value >= 0
    if not isinstance(value, dict) or len(value) != 1:
        return False
    kind, raw = next(iter(value.items()))
    limit = {"$numberInt": (2 ** 31) - 1, "$numberLong": (2 ** 63) - 1}.get(kind)
    if limit is None or not isinstance(raw, str):
        return False
    if not re.fullmatch(r"0|[1-9][0-9]{0,18}", raw):
        return False
    return int(raw) <= limit


def _identity(row: dict[str, Any]) -> str:
    run_id = row.get("_id")
    if isinstance(run_id, dict) and set(run_id) == {"$oid"}:
        run_id = run_id["$oid"]
    if not isinstance(run_id, str) or not run_id.strip():
        raise ValueError("documento sin _id válido")
    owner = row.get("owner")
    if not isinstance(owner, str) or not owner.strip():
        raise ValueError("documento sin owner válido")
    if "currentMapId" in row and (
        not isinstance(row["currentMapId"], str) or not row["currentMapId"].strip()
    ):
        raise ValueError("currentMapId inválido")
    if "worldVersion" in row and not _valid_world_version(row["worldVersion"]):
        raise ValueError("worldVersion inválido")
    return run_id


def fingerprints(documents: list[dict[str, Any]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for index, row in enumerate(documents, 1):
        try:
            identity = _identity(row)
            encoded = json.dumps(
                row, ensure_ascii=False, sort_keys=True,
                separators=(",", ":"), allow_nan=False,
            ).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"documento {index}: {exc}") from None
        if identity in result:
            raise ValueError(f"documento {index}: _id duplicado")
        result[identity] = hashlib.sha256(encoded).hexdigest()
    return result


def owners_at_or_above_cap(documents: list[dict[str, Any]], cap: int) -> int:
    """Flag possible truncation of the legacy importer without naming owners."""
    counts: dict[str, int] = {}
    for row in documents:
        owner = row["owner"]  # fingerprints() has already validated this.
        counts[owner] = counts.get(owner, 0) + 1
    return sum(total >= cap for total in counts.values())


def aggregate_digest(entries: dict[str, str]) -> str:
    # Sorted IDs make the digest independent of mongoexport record order.
    digest = hashlib.sha256()
    for identity in sorted(entries):
        digest.update(json.dumps([identity, entries[identity]], ensure_ascii=False).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def reconcile_owner_runs(source_docs: list[dict[str, Any]], target_docs: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare original runs to the independent archive; native target runs may coexist.

    Reconciliation is strict about full source-document equality and ownership,
    and never exports owner names or run IDs. It does NOT prove gameplay replay.
    """
    source_hashes = fingerprints(source_docs)
    target_hashes = fingerprints(target_docs)
    source_owners = {_identity(row): row["owner"] for row in source_docs}
    target_owners = {_identity(row): row["owner"] for row in target_docs}
    matched = missing = modified = owner_conflicts = 0
    affected_owners: set[str] = set()
    owners_with_matches: set[str] = set()
    for run_id, owner in source_owners.items():
        if run_id not in target_hashes:
            missing += 1
            affected_owners.add(owner)
        elif target_owners[run_id] != owner:
            owner_conflicts += 1
            affected_owners.add(owner)
        elif target_hashes[run_id] != source_hashes[run_id]:
            modified += 1
            affected_owners.add(owner)
        else:
            matched += 1
            owners_with_matches.add(owner)

    # MongoSource and legacyIdentity in the Go importer currently require
    # string _id. The archive doctor can preserve BSON ObjectIds, but they are
    # NOT valid evidence of successful import by today's Go reader.
    unsupported_ids = sum(not isinstance(row.get("_id"), str) for row in source_docs)
    owners = set(source_owners.values())
    ready = bool(source_docs) and not (missing or modified or owner_conflicts or unsupported_ids)
    return {
        "archiveCheck": "reconciliation-matching" if ready else "reconciliation-incomplete",
        "sourceDocuments": len(source_docs),
        "targetDocuments": len(target_docs),
        "sourceOwners": len(owners),
        "matchedRuns": matched,
        "missingRuns": missing,
        "modifiedRuns": modified,
        "ownerConflicts": owner_conflicts,
        "unsupportedSourceIds": unsupported_ids,
        "ownersAffected": len(affected_owners),
        "ownersWithoutMatchedRuns": len(owners - owners_with_matches),
        "targetNativeExtraRuns": len(target_hashes.keys() - source_hashes.keys()),
        "readOnly": True,
        "provesGameplayCompatibility": False,
        "authorizesLegacyRetirement": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Comprueba un archivo histórico de chronicles_runs sin usar Mongo.")
    parser.add_argument("export", help="mongoexport JSONL/JSON/array; '-' lee stdin")
    parser.add_argument("--baseline", help="export original para comparar tras un restore aislado")
    parser.add_argument("--reconcile-target", help="export privado de destino Chronicles para cotejo por propietario, sin red")
    parser.add_argument("--importer-cap", type=int, help="límite TOTAL por propietario, solo si está acreditado para otra versión/importador; no usar con SetBatchSize(200)")
    args = parser.parse_args(argv)
    if args.baseline == "-" and args.export == "-":
        parser.error("baseline y restore no pueden leer simultáneamente de stdin")
    if args.reconcile_target is not None:
        if args.baseline is not None or args.importer_cap is not None:
            parser.error("--reconcile-target no puede combinarse con --baseline o --importer-cap")
        if args.reconcile_target == "-" and args.export == "-":
            parser.error("origen y destino no pueden leer simultáneamente de stdin")
    if args.importer_cap is not None and args.importer_cap < 1:
        parser.error("--importer-cap debe ser un entero positivo")
    try:
        current_docs = load_export(args.export)
        current = fingerprints(current_docs)
        if args.reconcile_target is not None:
            target_docs = load_export(args.reconcile_target)
            output = reconcile_owner_runs(current_docs, target_docs)
            print(json.dumps(output, ensure_ascii=False, sort_keys=True))
            return 0 if output["archiveCheck"] == "reconciliation-matching" else 1
        baseline_docs = load_export(args.baseline) if args.baseline else None
        baseline = fingerprints(baseline_docs) if baseline_docs is not None else None
    except (OSError, UnicodeError, ValueError) as exc:
        # Validation failures never include owner or run ID values.
        print(json.dumps({"archiveCheck": "input-error", "detail": str(exc)}, ensure_ascii=False))
        return 2

    output: dict[str, Any] = {
        "archiveCheck": "ok",
        "documents": len(current),
        "sha256": aggregate_digest(current),
        "readOnly": True,
        "provesGameplayCompatibility": False,
    }
    if baseline is not None:
        missing = baseline.keys() - current.keys()
        added = current.keys() - baseline.keys()
        modified = sum(baseline[key] != current[key] for key in current.keys() & baseline.keys())
        output.update({
            "missing": len(missing),
            "added": len(added),
            "modified": modified,
        })
        if missing or added or modified:
            output["archiveCheck"] = "restore-mismatch"
    if args.importer_cap is not None:
        # The source archive is the baseline if comparing a restored export.
        source_docs = baseline_docs if baseline_docs is not None else current_docs
        at_cap = owners_at_or_above_cap(source_docs, args.importer_cap)
        output["importerCap"] = args.importer_cap
        output["ownersAtOrAboveCap"] = at_cap
        if at_cap and output["archiveCheck"] == "ok":
            output["archiveCheck"] = "importer-cap-unsafe"
    print(json.dumps(output, ensure_ascii=False, sort_keys=True))
    return 0 if output["archiveCheck"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
