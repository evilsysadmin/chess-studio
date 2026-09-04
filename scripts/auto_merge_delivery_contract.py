#!/usr/bin/env python3
"""Static guard for native PR auto-merge -> main CI -> staging delivery."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github/workflows"
ci = (WORKFLOWS / "cicd.yml").read_text(encoding="utf-8")
staging = (WORKFLOWS / "staging-deploy.yml").read_text(encoding="utf-8")

errors: list[str] = []

# Native GitHub auto-merge owns PR -> main. Do not reintroduce Actions-based
# merge watchers or workflow_run handoffs just to compensate for GITHUB_TOKEN.
for retired in ("auto-merge.yml", "main-delivery-handoff.yml"):
    if (WORKFLOWS / retired).exists():
        errors.append(f"{retired} está retirado: PR -> main debe usar auto-merge nativo de GitHub")

if "pull_request:" not in ci:
    errors.append("cicd.yml debe validar pull_request antes del merge")
if "push:" not in ci or "branches: [main]" not in ci:
    errors.append("cicd.yml debe validar el push normal producido por el merge nativo a main")
if "workflow_dispatch:" not in ci:
    errors.append("cicd.yml debe conservar workflow_dispatch como escape hatch manual")

for needle, label in (
    ("workflow_run:", "trigger workflow_run"),
    ("Quality · CI gate", "upstream Quality"),
    ("branches:\n      - main", "filtro de rama main"),
    ("github.event.workflow_run.conclusion == 'success'", "filtro de Quality verde"),
    ("DEPLOY_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}", "SHA acreditado por Quality"),
):
    if needle not in staging:
        errors.append(f"staging-deploy.yml incompleto: falta {label}")

# The normal delivery path must remain event-driven. Explicit CI redispatches
# belong only to manual operator actions, never to an internal handoff workflow.
for workflow in WORKFLOWS.glob("*.yml"):
    text = workflow.read_text(encoding="utf-8")
    if "gh workflow run cicd.yml" in text:
        errors.append(f"{workflow.name} no debe redisparar cicd.yml; usa push normal de main")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Delivery contract OK: PR Quality -> GitHub native auto-merge -> push main -> main Quality -> staging.")
