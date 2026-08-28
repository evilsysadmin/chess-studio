#!/usr/bin/env python3
"""Smoke stdlib del parser de npm audit: éxito, CRITICAL, caída remota y lock roto."""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "scripts" / "npm_audit_gate.py"


def run(payload: dict) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as td:
        report = Path(td) / "audit.json"
        report.write_text(json.dumps(payload), encoding="utf-8")
        return subprocess.run([sys.executable, "-S", str(GATE), str(report)], text=True, capture_output=True)


base = {"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0}}, "vulnerabilities": {}}
assert run(base).returncode == 0
critical = {"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 1}}, "vulnerabilities": {}}
assert run(critical).returncode == 1
remote = {"error": {"summary": "", "detail": ""}}
r = run(remote)
assert r.returncode == 0 and "INCONCLUSO" in r.stdout
local = {"error": {"code": "EAUDITNOLOCK", "summary": "requires an existing lockfile", "detail": ""}}
assert run(local).returncode == 2
print("npm-audit-gate-smoke OK · CRITICAL bloquea · outage remoto no bloquea · lock roto sí bloquea")
