#!/usr/bin/env python3
"""Fail fast with a useful message before pip resolves an unsupported stack."""
from __future__ import annotations

import sys

MIN_VERSION = (3, 10)
RECOMMENDED = "3.13 (repo .python-version)"


def main() -> int:
    current = sys.version_info[:3]
    if current < MIN_VERSION:
        detected = ".".join(map(str, current))
        minimum = ".".join(map(str, MIN_VERSION))
        print(
            f"ERROR: Chess Studio requiere Python >= {minimum}. Detectado: Python {detected}.\n"
            f"Instala Python moderno (recomendado {RECOMMENDED}) y recrea .venv.",
            file=sys.stderr,
        )
        return 2
    print(f"Python runtime OK: {sys.version.split()[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
