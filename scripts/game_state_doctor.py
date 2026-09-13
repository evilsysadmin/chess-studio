#!/usr/bin/env python3
"""Read-only CLI for diagnosing exported Chess Studio savegames."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend-python"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from game_state_doctor import compare_restore_baseline, diagnose_game_documents  # noqa: E402


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
