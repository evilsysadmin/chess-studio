#!/usr/bin/env python3
"""Resume un JSON de Trivy y aplica la política de severidad del proyecto.

Política: solo CRITICAL bloquea. HIGH grita, MEDIUM/LOW informan.
El script sirve igual en local y GitHub Actions.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN")


def annotation(kind: str, title: str, message: str) -> None:
    if os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::{kind} title={title}::{message}")


def main() -> int:
    if len(sys.argv) != 2:
        print("uso: security_report.py <trivy.json>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: no puedo leer el informe Trivy {path}: {exc}", file=sys.stderr)
        return 2

    counts: Counter[str] = Counter()
    examples: dict[str, list[str]] = {sev: [] for sev in SEVERITIES}

    for result in data.get("Results") or []:
        target = result.get("Target") or "?"
        for vuln in result.get("Vulnerabilities") or []:
            sev = str(vuln.get("Severity") or "UNKNOWN").upper()
            counts[sev] += 1
            if len(examples.setdefault(sev, [])) < 8:
                pkg = vuln.get("PkgName") or "package"
                vid = vuln.get("VulnerabilityID") or "CVE/?"
                examples[sev].append(f"{target}: {pkg} · {vid}")
        for mis in result.get("Misconfigurations") or []:
            sev = str(mis.get("Severity") or "UNKNOWN").upper()
            counts[sev] += 1
            if len(examples.setdefault(sev, [])) < 8:
                mid = mis.get("ID") or "MISCONF/?"
                title = mis.get("Title") or "misconfiguration"
                examples[sev].append(f"{target}: {mid} · {title}")
        for secret in result.get("Secrets") or []:
            sev = str(secret.get("Severity") or "CRITICAL").upper()
            counts[sev] += 1
            if len(examples.setdefault(sev, [])) < 8:
                rule = secret.get("RuleID") or secret.get("Category") or "secret"
                examples[sev].append(f"{target}: secret · {rule}")

    print("\n== Chess Studio · Security severity report ==")
    for sev in SEVERITIES:
        print(f"{sev:8} {counts[sev]}")

    critical = counts["CRITICAL"]
    high = counts["HIGH"]
    medium = counts["MEDIUM"]
    low = counts["LOW"]

    if high:
        print("\n" + "!" * 78)
        print("!!!  HIGH VULNERABILITIES DETECTED — NO ROMPEN EL BUILD, PERO MÍRALAS  !!!")
        print("!!!  TIMES NEW ROMAN 200000 EMULATOR: ACTIVADO                         !!!")
        print("!" * 78)
        for item in examples["HIGH"]:
            print(f"  HIGH  {item}")
        annotation("warning", f"{high} HIGH security findings", "No bloquean el build por política, pero requieren revisión.")

    if medium:
        print(f"\nINFO: {medium} hallazgo(s) MEDIUM. Revisar/priorizar; no bloquean.")
        for item in examples["MEDIUM"]:
            print(f"  MEDIUM  {item}")
        annotation("notice", f"{medium} MEDIUM security findings", "Informativos; no bloquean el build.")
    if low:
        print(f"\nINFO: {low} hallazgo(s) LOW. Inventario informativo; no bloquean.")
        for item in examples["LOW"]:
            print(f"  LOW  {item}")
    if counts["UNKNOWN"]:
        print(f"INFO: {counts['UNKNOWN']} hallazgo(s) UNKNOWN. Conviene clasificar su severidad.")

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write("\n# 🔐 Security gate\n\n")
            fh.write("| Severidad | Hallazgos | Política |\n|---|---:|---|\n")
            fh.write(f"| 💀 CRITICAL | **{critical}** | **BLOQUEA** |\n")
            fh.write(f"| 🚨 HIGH | **{high}** | No bloquea · revisar |\n")
            fh.write(f"| ⚠️ MEDIUM | {medium} | Informativo |\n")
            fh.write(f"| ℹ️ LOW | {low} | Informativo |\n")
            fh.write(f"| ❔ UNKNOWN | {counts['UNKNOWN']} | Informativo / clasificar |\n")
            if high:
                fh.write("\n# 🚨🚨🚨 HIGH DETECTADAS 🚨🚨🚨\n")
                fh.write("No bloquean por política del proyecto, **pero no deben pasar desapercibidas**.\n")
                for item in examples["HIGH"]:
                    fh.write(f"- `{item}`\n")
            if medium:
                fh.write("\n## ⚠️ MEDIUM — informativo\n")
                for item in examples["MEDIUM"]:
                    fh.write(f"- `{item}`\n")
            if low:
                fh.write("\n## ℹ️ LOW — inventario\n")
                for item in examples["LOW"]:
                    fh.write(f"- `{item}`\n")
            if critical:
                fh.write("\n# 💀 CRITICAL: BUILD BLOQUEADO\n")
                for item in examples["CRITICAL"]:
                    fh.write(f"- `{item}`\n")

    if critical:
        print(f"\nFATAL: {critical} hallazgo(s) CRITICAL. Quality gate BLOQUEADO.", file=sys.stderr)
        annotation("error", f"{critical} CRITICAL security findings", "El build se bloquea hasta corregirlas o documentar una excepción explícita.")
        return 1

    print("\nSecurity gate: sin CRITICAL. Build permitido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
