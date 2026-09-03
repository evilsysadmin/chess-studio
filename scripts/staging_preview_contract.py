#!/usr/bin/env python3
"""Fail closed if the manual Pages preview can enter the production chain."""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREVIEW = ROOT / ".github/workflows/staging-preview.yml"
PROMOTE = ROOT / ".github/workflows/production-promote.yml"
STAGING_AI = ROOT / ".github/workflows/staging-ai-worker.yml"


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PREVIEW, PROMOTE, STAGING_AI):
        if not path.exists():
            errors.append(f"falta {path.relative_to(ROOT)}")
    if errors:
        for error in errors:
            print(f"staging-preview-contract FAIL · {error}", file=sys.stderr)
        return 1

    preview = PREVIEW.read_text(encoding="utf-8")
    promote = PROMOTE.read_text(encoding="utf-8")
    staging_ai = STAGING_AI.read_text(encoding="utf-8")

    require(preview, "name: Staging · preview", "preview name", errors)
    require(preview, "workflow_dispatch:", "preview manual-only trigger", errors)
    require(preview, "PAGES_PROJECT: chess-studio-staging", "preview staging Pages project", errors)
    require(preview, '[[ "$PAGES_BRANCH" =~ ^preview(-[ab])?$ ]]', "preview slot allowlist", errors)
    require(preview, "El ref resuelve al SHA actual de main", "preview main SHA refusal", errors)
    require(preview, '--branch "$PAGES_BRANCH"', "preview Pages branch deployment", errors)
    require(preview, "production_branch != 'main'", "preview verifies Pages production branch", errors)
    require(preview, "no acredita staging oficial", "preview non-accreditation summary", errors)

    # Preview must never auto-run or pretend to be the canonical staging chain.
    for forbidden in ("workflow_run:", "pull_request:", "\npush:", "--branch main"):
        if forbidden in preview:
            errors.append(f"preview contiene trigger/target prohibido: {forbidden!r}")

    # Production remains provenance-bound to the canonical AI staging workflow.
    require(promote, "workflows:\n      - Staging · AI Worker", "production source workflow", errors)
    require(promote, "branches:\n      - main", "production main-only source", errors)
    if "Staging · preview" in promote:
        errors.append("production-promote escucha Staging · preview")

    # AI staging also remains downstream of canonical Staging · deploy, not preview.
    require(staging_ai, "Staging · deploy", "staging AI canonical source", errors)
    if "Staging · preview" in staging_ai:
        errors.append("staging AI escucha Staging · preview")

    if errors:
        print("staging-preview-contract FAIL", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("staging-preview-contract OK · manual Pages branch preview cannot enter production promotion")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
