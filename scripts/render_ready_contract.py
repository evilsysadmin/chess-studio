#!/usr/bin/env python3
"""Validate the Render readiness payload against the commit approved by CI."""
from __future__ import annotations

import json
from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render_ready_contract.py <payload.json> <expected-sha>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    expected = sys.argv[2].strip()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Readiness JSON inválido: {exc}")
        return 1

    actual = str(payload.get("commit") or "").strip()
    storage = str(payload.get("storage") or "").strip()
    if payload.get("ok") is True and storage == "mongo" and actual == expected:
        print(f"Backend ready en commit {actual}")
        return 0

    print(
        "Backend todavía no está listo para este deploy: "
        f"ok={payload.get('ok')!r} storage={storage or 'sin storage'} "
        f"commit={actual or 'sin commit'} expected={expected}"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
