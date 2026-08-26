#!/usr/bin/env python3
"""Resume pip-audit. La severidad/blocking la decide Trivy."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    try:
        data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: informe pip-audit inválido: {exc}", file=sys.stderr)
        return 2
    deps = data.get("dependencies", data if isinstance(data, list) else [])
    findings = []
    for dep in deps or []:
        name = dep.get("name", "?")
        version = dep.get("version", "?")
        for vuln in dep.get("vulns") or []:
            findings.append((name, version, vuln.get("id", "?"), vuln.get("fix_versions") or []))
    print(f"pip-audit → {len(findings)} vulnerabilidad(es) conocida(s) en dependencias Python")
    for name, version, vid, fixes in findings[:20]:
        fix = f" → fix: {', '.join(fixes)}" if fixes else ""
        print(f"  {name} {version}: {vid}{fix}")
    if len(findings) > 20:
        print(f"  ... y {len(findings) - 20} más")
    if findings and os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::notice title=pip-audit: {len(findings)} findings::Informativo; Trivy aplica la severidad y solo CRITICAL bloquea.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
