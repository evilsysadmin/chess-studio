#!/usr/bin/env python3
"""Run the intentionally destructive local resilience drill.

This is deliberately separate from the normal CI/pre-push E2E suite. It reuses
existing resilience journeys plus a transport-abort journey that only runs when
CHESS_CHAOS=1 is set.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
E2E = ROOT / "e2e"

CHAOS_GREP = (
    r"chaos local ·|"
    r"Partida rápida · un 503 al restaurar|"
    r"resiliencia · jugada persistida con respuesta perdida|"
    r"storage bloqueado · login y navegación básica siguen utilizables"
)


def run(args: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> None:
    print(f"==> {' '.join(args)}", flush=True)
    subprocess.run(args, cwd=cwd, env=env, check=True)


def main() -> int:
    print("==> CHAOS LOCAL · Chess Studio")
    print("    Rompe transporte/storage y verifica recuperación. No forma parte del gate normal.")
    try:
        run(["make", "ensure-e2e-deps"])
        run(["make", "frontend-build"])
        env = os.environ.copy()
        env["CHESS_CHAOS"] = "1"
        run(
            [
                "./node_modules/.bin/playwright",
                "test",
                "chaos-local.spec.js",
                "smoke.spec.js",
                "compatibility.spec.js",
                "--project=chromium",
                "--workers=1",
                "--grep",
                CHAOS_GREP,
            ],
            cwd=E2E,
            env=env,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"\nCHAOS LOCAL FAIL · {exc}", file=sys.stderr)
        return 1

    print("\nCHAOS LOCAL OK · la aplicación ha sobrevivido al maltrato seleccionado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
