#!/usr/bin/env python3
"""Idempotent local preparation after copying this overlay onto Chess Studio."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]

required = [root/"backend-python", root/"frontend"]
if not all(p.exists() for p in required):
    print("REFUSE: copy the overlay onto the real Chess Studio repo root first.", file=sys.stderr)
    raise SystemExit(2)

def run(script):
    subprocess.run([sys.executable, str(root/"scripts"/script)], cwd=root, check=True)

run("integrate_narrative_router.py")

gitignore = root/".gitignore"
text = gitignore.read_text("utf-8") if gitignore.exists() else ""
block = """
# Cloudflare/Terraform local transient state
infra/cloudflare/.terraform/
infra/cloudflare/.terraform.lock.hcl
infra/cloudflare/*.tfstate
infra/cloudflare/*.tfstate.*
infra/cloudflare/tfplan
"""
if "infra/cloudflare/*.tfstate" not in text:
    gitignore.write_text(text.rstrip() + "\n" + block.lstrip(), "utf-8")
    print("Added Terraform transient state to .gitignore")

makefile = root/"Makefile"
if makefile.exists():
    make = makefile.read_text("utf-8")
    marker = "# BEGIN chess-studio-ai-contract"
    if marker not in make:
        make += r"""

# BEGIN chess-studio-ai-contract
.PHONY: ai-contract ai-security

ai-security:
	python3 scripts/ai_security_gate.py

ai-contract: ai-security
	cd backend-python && python -m pytest -q test_narrative_cloudflare.py test_narrative_api.py test_narrative_main_contract.py
	cd frontend && npx vitest run src/narrativeRemote.test.js src/aiMetrics.test.js src/narrativeProvider.test.js
	node --check infra/cloudflare/worker/index.js
# END chess-studio-ai-contract
"""
        makefile.write_text(make, "utf-8")
        print("Added Makefile ai-contract target")
else:
    print("Makefile not found; CI workflow remains the AI quality gate.")

run("repo_doctor.py")
print("\nPreparation complete. The only intentionally manual step is wiring requestRemoteNarrativeDetached() into the exact existing NarrativeProvider call site if the doctor still shows WARN.")
