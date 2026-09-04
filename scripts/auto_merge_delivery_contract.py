#!/usr/bin/env python3
"""Static guard for the PR auto-merge -> main CI -> staging delivery contract."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
auto_merge = (ROOT / ".github/workflows/auto-merge.yml").read_text(encoding="utf-8")
handoff = (ROOT / ".github/workflows/main-delivery-handoff.yml").read_text(encoding="utf-8")
ci = (ROOT / ".github/workflows/cicd.yml").read_text(encoding="utf-8")
staging = (ROOT / ".github/workflows/staging-deploy.yml").read_text(encoding="utf-8")

errors: list[str] = []

if "gh pr merge" not in auto_merge:
    errors.append("auto-merge.yml debe ejecutar explícitamente el merge de la PR")
if "--match-head-commit" not in auto_merge:
    errors.append("auto-merge.yml debe impedir merges de un head distinto al observado")
if "gh workflow run cicd.yml" in auto_merge:
    errors.append("auto-merge.yml no debe ser propietario del dispatch a main; evita doble despacho")

for needle, label in (
    ("Wait for required checks to be published", "bootstrap antes del watcher de required checks"),
    ('gh pr checks "$PR_URL" --required --json name', "sondeo de required checks publicados"),
    ("required_count", "contador de required checks antes de --watch"),
    ("headRefOid", "validación del head mientras espera checks"),
    ('gh pr checks "$PR_URL" --required --watch', "watcher terminal de required checks"),
):
    if needle not in auto_merge:
        errors.append(f"auto-merge.yml incompleto: falta {label}")

for needle, label in (
    ("name: Delivery · main handoff", "nombre del handoff"),
    ("workflow_run:", "trigger workflow_run"),
    ("Quality · CI gate", "upstream Quality"),
    ("github.event.workflow_run.event == 'pull_request'", "filtro de Quality de PR"),
    ("actions: write", "permiso para workflow_dispatch"),
    ("pull-requests: read", "lectura segura de la PR mergeada"),
    ("commits/$SOURCE_SHA/pulls", "fallback para resolver la PR desde el SHA"),
    ("valid = base == 'main' and head == expected", "validación exacta de base/head aprobados"),
    ("head_sha=$target_sha", "deduplicación por SHA de main"),
    ('gh workflow run cicd.yml --repo "$GITHUB_REPOSITORY" --ref main', "dispatch explícito con repo fijado"),
    ("runs-on: ubuntu-24.04", "runner fijado del handoff"),
):
    if needle not in handoff:
        errors.append(f"main-delivery-handoff.yml incompleto: falta {label}")

if "workflow_dispatch:" not in ci:
    errors.append("cicd.yml debe aceptar workflow_dispatch como continuación segura del handoff")
if "push:" not in ci or "branches: [main]" not in ci:
    errors.append("cicd.yml debe conservar el trigger normal push -> main")
if "Quality · CI gate" not in staging or "workflow_run:" not in staging:
    errors.append("staging-deploy.yml debe seguir encadenado al Quality gate")

if errors:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Auto-merge delivery contract OK: published required checks -> PR Quality -> independent handoff -> main Quality -> staging.")
