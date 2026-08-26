#!/usr/bin/env python3
"""Local environment + repository sanity check for Chess Studio.

No network access and no dependency installation. Required failures exit non-zero;
optional tooling is reported as WARN so `make doctor` remains useful on laptops.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
checks: list[tuple[str, bool, str, bool]] = []


def add(ok: bool, label: str, detail: str = "", *, required: bool = True) -> None:
    checks.append(("PASS" if ok else ("FAIL" if required else "WARN"), bool(ok), label, detail))


def command_output(*args: str) -> tuple[bool, str]:
    try:
        proc = subprocess.run(args, cwd=root, check=False, text=True, capture_output=True, timeout=4)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)
    text = (proc.stdout or proc.stderr or "").strip().splitlines()
    return proc.returncode == 0, (text[0] if text else f"exit {proc.returncode}")


def major_version(text: str) -> int | None:
    match = re.search(r"(?:v|Python\s+)?(\d+)(?:\.\d+)?", text)
    return int(match.group(1)) if match else None


def make_target_body(source: str, target: str) -> str:
    pattern = rf"(?ms)^{re.escape(target)}:[^\n]*\n(?P<body>(?:\t[^\n]*\n|[ ]*\n)*)"
    match = re.search(pattern, source)
    return match.group("body") if match else ""


# Repository shape / release contract.
for relative, label in (
    ("backend-python/main.py", "backend main.py"),
    ("backend-python/requirements.txt", "backend requirements"),
    ("frontend/package.json", "frontend package.json"),
    ("frontend/package-lock.json", "frontend lockfile"),
    ("frontend/src/narrativeProvider.js", "NarrativeProvider"),
    ("backend-python/narrative_cloudflare.py", "Cloudflare provider"),
    ("infra/cloudflare/worker/index.js", "Worker source"),
    ("RELEASE.txt", "release marker"),
    ("frontend/public/release.json", "frontend release marker"),
):
    add((root / relative).exists(), label, relative)

release = (root / "RELEASE.txt").read_text("utf-8").strip() if (root / "RELEASE.txt").exists() else ""
try:
    public_release = json.loads((root / "frontend/public/release.json").read_text("utf-8")).get("release", "")
except Exception:
    public_release = ""
add(bool(release) and release == public_release, "release markers agree", f"{release or '—'} / {public_release or '—'}")

# Runtime baseline.
python_ok = sys.version_info >= (3, 10)
add(python_ok, "Python >= 3.10", sys.version.split()[0])
recommended_python = (root / ".python-version").read_text("utf-8").strip() if (root / ".python-version").exists() else ""
if recommended_python:
    add(sys.version.split()[0].startswith(recommended_python.rsplit('.', 1)[0]), "recommended Python", f"repo {recommended_python}; current {sys.version.split()[0]}", required=False)

node = shutil.which("node")
if node:
    ok, detail = command_output(node, "--version")
    add(ok and (major_version(detail) or 0) >= 20, "Node >= 20", detail)
else:
    add(False, "Node >= 20", "node no está en PATH")

npm = shutil.which("npm")
if npm:
    ok, detail = command_output(npm, "--version")
    add(ok, "npm disponible", detail)
else:
    add(False, "npm disponible", "npm no está en PATH")

# Existing local environments: do not require them, but flag stale ones.
venv_python = root / ".venv/bin/python"
if venv_python.exists():
    ok, detail = command_output(str(venv_python), "--version")
    add(ok and (major_version(detail) or 0) >= 3, ".venv ejecutable", detail)
    if ok:
        proc = subprocess.run([str(venv_python), "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)"], cwd=root)
        add(proc.returncode == 0, ".venv Python >= 3.10", detail)
else:
    add(False, ".venv presente", "se creará con make backend-install", required=False)

frontend_modules = root / "frontend/node_modules/.bin/vitest"
add(frontend_modules.exists(), "frontend deps instaladas", "npm ci pendiente" if not frontend_modules.exists() else "vitest disponible", required=False)

# Optional platform tooling.
docker = shutil.which("docker")
if docker:
    ok, detail = command_output(docker, "compose", "version")
    add(ok, "Docker Compose", detail, required=False)
else:
    add(False, "Docker Compose", "docker no está en PATH", required=False)

git = shutil.which("git")
add(bool(git), "git disponible", git or "git no está en PATH")

# CI and security wiring. The production workflow intentionally delegates
# cheap structural checks to `make static-preflight`; diagnose the effective
# wiring instead of requiring every script name to appear literally in YAML.
ci = root / ".github/workflows/cicd.yml"
ci_text = ci.read_text("utf-8", errors="ignore") if ci.exists() else ""
makefile_text = (root / "Makefile").read_text("utf-8", errors="ignore") if (root / "Makefile").exists() else ""
static_preflight_line = re.search(r"(?m)^static-preflight:([^\n]*)$", makefile_text)
static_preflight_deps = static_preflight_line.group(1) if static_preflight_line else ""
ci_uses_preflight = "make static-preflight" in ci_text
security_wired = (
    ("scripts/ai_security_gate.py" in ci_text and "scripts/api_surface_gate.py" in ci_text)
    or (ci_uses_preflight and "security-api" in static_preflight_deps)
)
audit_wired = (
    "scripts/test_suite_audit.mjs" in ci_text
    or (ci_uses_preflight and "test-suite-audit-ci" in static_preflight_deps)
)
continuity_wired = ci_uses_preflight and "session-continuity-check" in static_preflight_deps
add(security_wired, "security/API gates in CI", "directos o vía static-preflight")
add(audit_wired, "test-suite audit in CI", "directo o vía static-preflight")
add(continuity_wired, "session continuity gate in CI", "normal/tournament/Combat")

main_text = (root / "backend-python/main.py").read_text("utf-8", errors="ignore") if (root / "backend-python/main.py").exists() else ""
rate_limit_user_aware = "def rate_limit_key(" in main_text and "user:" in main_text and "ip:" in main_text
add(rate_limit_user_aware, "rate-limit identity policy", "usuario autenticado; IP para anónimos")

# Narrative integration remains intentionally detached from the move pipeline.
provider = root / "frontend/src/narrativeProvider.js"
game_screen = root / "frontend/src/components/GameScreen.jsx"
provider_text = provider.read_text("utf-8", errors="ignore") if provider.exists() else ""
game_text = game_screen.read_text("utf-8", errors="ignore") if game_screen.exists() else ""
remote = any(token in provider_text or token in game_text for token in ("requestRemoteNarrative", "requestRemoteNarrativeDetached"))
detached = "requestRemoteNarrativeDetached" in provider_text or "requestRemoteNarrativeDetached" in game_text
add(remote, "remote narrative hooked")
add(detached, "remote narrative detached from move pipeline")

width = max(len(label) for _, _, label, _ in checks)
required_failures = 0
for status, ok, label, detail in checks:
    print(f"{status:<4}  {label:<{width}}" + (f"  {detail}" if detail else ""))
    if status == "FAIL":
        required_failures += 1

passes = sum(1 for status, *_ in checks if status == "PASS")
warns = sum(1 for status, *_ in checks if status == "WARN")
print(f"\nDoctor: {passes} PASS · {warns} WARN · {required_failures} FAIL")
return_code = 2 if required_failures else 0
if return_code:
    print("Corrige los FAIL antes de instalar dependencias o ejecutar los gates.", file=sys.stderr)
sys.exit(return_code)
