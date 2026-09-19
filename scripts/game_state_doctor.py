#!/usr/bin/env python3
"""Read-only diagnostics for exported Chess Studio savegames.

This operational tool never talks to Mongo and never mutates a savegame. It
reconstructs raw persisted game documents through the production ``chess_core``
contract so restore drills do not invent a second rules implementation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend-python"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from chess_core import load_board, serialize_game  # noqa: E402

_REQUIRED_FIELDS = ("owner", "moves", "difficulty", "humanColor")


def _game_id(document: dict[str, Any]) -> str:
    raw = document.get("_id", document.get("id"))
    if isinstance(raw, dict) and "$oid" in raw:
        raw = raw.get("$oid")
    value = str(raw or "").strip()
    if not value:
        raise ValueError("documento sin _id/id")
    return value


def _stable_fingerprint(game_id: str, entry: dict[str, Any], canonical: dict[str, Any]) -> str:
    payload = {
        "id": game_id,
        "owner": entry.get("owner"),
        "moves": entry.get("moves"),
        "difficulty": entry.get("difficulty"),
        "humanColor": entry.get("humanColor"),
        "handicap": entry.get("handicap"),
        "initialFen": entry.get("initialFen"),
        "fen": canonical.get("fen"),
        "turn": canonical.get("turn"),
        "status": canonical.get("status"),
        "isGameOver": canonical.get("isGameOver"),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _last_move_errors(entry: dict[str, Any], canonical: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    history = canonical.get("history") or []
    last_move = entry.get("lastMove")

    if not history:
        if last_move is not None:
            errors.append("lastMove existe pero el historial reconstruido está vacío")
        return errors, warnings

    if last_move is None:
        warnings.append("historial no vacío sin lastMove; puede ser un savegame legacy")
        return errors, warnings

    if not isinstance(last_move, dict):
        errors.append("lastMove no es un objeto")
        return errors, warnings

    expected = history[-1]
    mover_color = "b" if canonical.get("turn") == "w" else "w"
    expected_by = "human" if mover_color == entry.get("humanColor") else "cpu"
    expected_fields = {
        "from": expected.get("from"),
        "to": expected.get("to"),
        "piece": expected.get("piece"),
        "promotion": expected.get("promotion"),
        "captured": bool(expected.get("captured")),
        "by": expected_by,
    }
    for key, expected_value in expected_fields.items():
        actual = last_move.get(key)
        if actual != expected_value:
            errors.append(f"lastMove.{key}={actual!r} no coincide con {expected_value!r}")
    return errors, warnings


def diagnose_game_document(document: dict[str, Any]) -> dict[str, Any]:
    """Validate one raw persisted game document and return a JSON-safe report."""
    report: dict[str, Any] = {
        "gameId": None,
        "healthy": False,
        "errors": [],
        "warnings": [],
        "fingerprint": None,
        "canonical": None,
    }
    if not isinstance(document, dict):
        report["errors"].append("el documento no es un objeto JSON")
        return report

    try:
        game_id = _game_id(document)
    except ValueError as exc:
        report["errors"].append(str(exc))
        return report
    report["gameId"] = game_id

    entry = {key: value for key, value in document.items() if key not in {"_id", "id", "updatedAt"}}
    missing = [field for field in _REQUIRED_FIELDS if field not in entry]
    if missing:
        report["errors"].append(f"faltan campos persistidos obligatorios: {', '.join(missing)}")
        return report
    owner = entry.get("owner")
    if not isinstance(owner, str) or not owner.strip():
        report["errors"].append("owner ausente o inválido")
        return report

    try:
        board = load_board(entry)
        if not board.is_valid():
            raise ValueError("la posición reconstruida es imposible")
        canonical = serialize_game(game_id, entry, board)
    except (KeyError, TypeError, ValueError) as exc:
        report["errors"].append(f"no se puede reconstruir la partida: {exc}")
        return report

    last_errors, last_warnings = _last_move_errors(entry, canonical)
    report["errors"].extend(last_errors)
    report["warnings"].extend(last_warnings)
    report["canonical"] = {
        "fen": canonical["fen"],
        "turn": canonical["turn"],
        "status": canonical["status"],
        "isGameOver": canonical["isGameOver"],
        "plies": len(canonical.get("history") or []),
    }
    report["fingerprint"] = _stable_fingerprint(game_id, entry, canonical)
    report["healthy"] = not report["errors"]
    return report


def diagnose_game_documents(documents: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [diagnose_game_document(document) for document in documents]


def compare_restore_baseline(
    current_reports: Iterable[dict[str, Any]],
    baseline_reports: Iterable[dict[str, Any]],
) -> list[str]:
    """Return restore drift messages; an empty list means exact canonical parity."""
    current = {str(report.get("gameId")): report for report in current_reports if report.get("gameId")}
    baseline = {str(report.get("gameId")): report for report in baseline_reports if report.get("gameId")}
    errors: list[str] = []

    for game_id in sorted(set(baseline) - set(current)):
        errors.append(f"falta tras restore: {game_id}")
    for game_id in sorted(set(current) - set(baseline)):
        errors.append(f"apareció tras restore sin baseline: {game_id}")
    for game_id in sorted(set(current) & set(baseline)):
        before = baseline[game_id]
        after = current[game_id]
        if not before.get("healthy"):
            errors.append(f"baseline inválido: {game_id}")
            continue
        if not after.get("healthy"):
            errors.append(f"restore inválido: {game_id}")
            continue
        if before.get("fingerprint") != after.get("fingerprint"):
            errors.append(f"estado canónico distinto tras restore: {game_id}")
    return errors


def _read_text(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def load_documents(path: str) -> list[dict]:
    """Accept one JSON object, a JSON array, or mongoexport-style JSON Lines."""
    raw = _read_text(path).strip()
    if not raw:
        raise ValueError("entrada vacía")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        documents = []
        for line_number, line in enumerate(raw.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"JSON inválido en línea {line_number}: {exc.msg}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"línea {line_number}: se esperaba un objeto JSON")
            documents.append(item)
        if not documents:
            raise ValueError("entrada sin documentos JSON")
        return documents

    if isinstance(parsed, dict):
        return [parsed]
    if isinstance(parsed, list) and all(isinstance(item, dict) for item in parsed):
        return parsed
    raise ValueError("se esperaba un objeto, array de objetos o JSON Lines")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Diagnostica exportaciones raw de la colección games sin tocar Mongo.",
    )
    parser.add_argument("input", help="JSON/JSONL exportado; usa - para stdin")
    parser.add_argument(
        "--baseline",
        help="export JSON/JSONL previo al restore; exige fingerprint canónico idéntico por game id",
    )
    args = parser.parse_args()

    try:
        current_reports = diagnose_game_documents(load_documents(args.input))
        baseline_reports = (
            diagnose_game_documents(load_documents(args.baseline)) if args.baseline else None
        )
    except (OSError, ValueError) as exc:
        print(json.dumps({"gameStateDoctor": "input-error", "detail": str(exc)}, ensure_ascii=False))
        return 2

    failed = False
    for report in current_reports:
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        failed = (not report.get("healthy")) or failed

    restore_errors: list[str] = []
    if baseline_reports is not None:
        restore_errors = compare_restore_baseline(current_reports, baseline_reports)
        failed = bool(restore_errors) or failed
        for error in restore_errors:
            print(json.dumps({"restore": "mismatch", "detail": error}, ensure_ascii=False))

    print(
        json.dumps(
            {
                "gameStateDoctor": "fail" if failed else "ok",
                "documents": len(current_reports),
                "healthy": sum(1 for report in current_reports if report.get("healthy")),
                "restoreMismatches": len(restore_errors),
                "readOnly": True,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
