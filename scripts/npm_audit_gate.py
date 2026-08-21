#!/usr/bin/env python3
"""Aplica a npm audit la política: solo CRITICAL bloquea."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path


def gha(kind: str, title: str, text: str) -> None:
    if os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::{kind} title={title}::{text}")


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    try:
        data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        if data.get('error'):
            raise ValueError(data['error'])
        if 'metadata' not in data or 'vulnerabilities' not in data.get('metadata', {}):
            raise ValueError('faltan metadata.vulnerabilities en la salida de npm audit')
        vulns = data.get("metadata", {}).get("vulnerabilities", {})
    except Exception as exc:
        print(f"ERROR: informe npm audit inválido: {exc}", file=sys.stderr)
        return 2

    critical = int(vulns.get("critical", 0) or 0)
    high = int(vulns.get("high", 0) or 0)
    medium = int(vulns.get("moderate", 0) or 0)
    low = int(vulns.get("low", 0) or 0)
    info = int(vulns.get("info", 0) or 0)
    print(f"npm audit → CRITICAL={critical} HIGH={high} MEDIUM={medium} LOW={low} INFO={info}")

    if high:
        print("\n" + "#" * 78)
        print(f"### HIGH npm: {high} — NO BLOQUEA, PERO ESTO DEBE VERSE DESDE MARTE ###")
        print("#" * 78)
        gha("warning", f"npm: {high} HIGH", "No bloquean por política; revisar dependencias Node.")
    if medium:
        gha("notice", f"npm: {medium} MEDIUM", "Informativo.")
    if critical:
        gha("error", f"npm: {critical} CRITICAL", "Build bloqueado.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
