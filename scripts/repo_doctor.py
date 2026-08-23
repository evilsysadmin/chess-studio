#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
checks = []

def add(ok, label, detail=""):
    checks.append((bool(ok), label, detail))

add((root/"backend-python/main.py").exists(), "backend main.py")
add((root/"backend-python/requirements.txt").exists(), "backend requirements")
add((root/"frontend/package.json").exists(), "frontend package.json")
add((root/"frontend/src/narrativeProvider.js").exists(), "NarrativeProvider V16.6ax")
add((root/"backend-python/narrative_cloudflare.py").exists(), "Cloudflare provider overlay")
add((root/"infra/cloudflare/worker/index.js").exists(), "Worker source")
ci = root/".github/workflows/ci.yml"
ci_text = ci.read_text("utf-8", errors="ignore") if ci.exists() else ""
add("scripts/ai_security_gate.py" in ci_text and "infra/cloudflare/worker/index.js" in ci_text, "AI gates integrated in main CI")

main = root/"backend-python/main.py"
if main.exists():
    text = main.read_text("utf-8", errors="ignore")
    add("/api/narrative" in text or "build_narrative_router(" in text, "narrative router integrated")

provider = root/"frontend/src/narrativeProvider.js"
game_screen = root/"frontend/src/components/GameScreen.jsx"
provider_text = provider.read_text("utf-8", errors="ignore") if provider.exists() else ""
game_text = game_screen.read_text("utf-8", errors="ignore") if game_screen.exists() else ""
remote = any(token in provider_text or token in game_text for token in ("requestRemoteNarrative", "requestRemoteNarrativeDetached"))
detached = "requestRemoteNarrativeDetached" in provider_text or "requestRemoteNarrativeDetached" in game_text
add(remote, "remote narrative hooked into noteworthy commentary",
    "manual integration still needed" if not remote else "")
add(detached, "remote narrative is detached from move pipeline",
    "recommended: fire only after move/result persistence" if not detached else "")

roster_test = root/"frontend/src/armyRosterView.test.js"
if roster_test.exists():
    text = roster_test.read_text("utf-8", errors="ignore")
    add("expect(source).toContain('16 unidades')" not in text, "roster test is reserve-aware")

gitignore = root/".gitignore"
if gitignore.exists():
    gi = gitignore.read_text("utf-8", errors="ignore")
    add("*.tfstate" in gi or ".terraform/" in gi, "Terraform transient files ignored")
else:
    add(False, ".gitignore present", "prepare_repo.py can create/update it")

width = max(len(label) for _,label,_ in checks)
failed = 0
for ok,label,detail in checks:
    print(f"{'PASS' if ok else 'WARN'}  {label:<{width}}" + (f"  {detail}" if detail else ""))
    if not ok:
        failed += 1
print(f"\nDoctor: {len(checks)-failed}/{len(checks)} checks ready.")
sys.exit(0)
