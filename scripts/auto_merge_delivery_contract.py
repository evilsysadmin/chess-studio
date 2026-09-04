#!/usr/bin/env python3
"""Static guard for the PR auto-merge -> main CI -> staging delivery contract."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/auto-merge.yml").read_text(encoding="utf-8")
ci = (ROOT / ".github/workflows/cicd.yml").read_text(encoding="utf-8")
staging = (ROOT / ".github/workflows/staging-deploy.yml").read_text(encoding="utf-8")

errors: list[str] = []

if "gh pr merge" not in workflow:
    errors.append("auto-merge.yml debe ejecutar explícitamente el merge de la PR")
if "gh workflow run cicd.yml --ref main" not in workflow:
    errors.append("auto-merge.yml debe reactivar explícitamente Quality en main tras un merge con GITHUB_TOKEN")
if "actions: write" not in workflow:
    errors.append("auto-merge.yml necesita actions: write para workflow_dispatch")
if "--match-head-commit" not in workflow:
    errors.append("auto-merge.yml debe impedir merges de un head distinto al observado")
if "workflow_dispatch:" not in ci:
    errors.append("cicd.yml debe aceptar workflow_dispatch como continuación segura desde auto-merge")
if "push:" not in ci or "branches: [main]" not in ci:
    errors.append("cicd.yml debe conservar el trigger normal push -> main")
if "Quality · CI gate" not in staging or "workflow_run:" not in staging:
    errors.append("staging-deploy.yml debe seguir encadenado al Quality gate")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Auto-merge delivery contract OK: merge -> explicit/main Quality -> staging remains wired.")
