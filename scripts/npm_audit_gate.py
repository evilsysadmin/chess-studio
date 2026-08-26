#!/usr/bin/env python3
"""Aplica a npm audit la política: solo CRITICAL bloquea y detalla el resto."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path


def gha(kind: str, title: str, text: str) -> None:
    if os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::{kind} title={title}::{text}")


def fix_text(value) -> str:
    if value is True:
        return "fix disponible"
    if not value:
        return "sin fix automático"
    if isinstance(value, dict):
        version = value.get("version") or "?"
        major = " (major)" if value.get("isSemVerMajor") else ""
        return f"fix: {version}{major}"
    return str(value)


def details_for(data: dict, severity: str) -> list[str]:
    rows = []
    for name, item in (data.get("vulnerabilities") or {}).items():
        if str(item.get("severity", "")).lower() != severity:
            continue
        titles = []
        for via in item.get("via") or []:
            if isinstance(via, dict):
                title = via.get("title")
                if title and title not in titles:
                    titles.append(title)
        direct = "directa" if item.get("isDirect") else "transitiva"
        title = "; ".join(titles[:2]) or "advisory npm"
        rows.append(f"  {severity.upper():8} {name} ({direct}) · {title} · {fix_text(item.get('fixAvailable'))}")
    return rows


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    try:
        data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        if data.get("error"):
            raise ValueError(data["error"])
        vulns = data.get("metadata", {}).get("vulnerabilities")
        if not isinstance(vulns, dict):
            raise ValueError("faltan metadata.vulnerabilities en la salida de npm audit")
    except Exception as exc:
        print(f"ERROR: informe npm audit inválido: {exc}", file=sys.stderr)
        return 2

    critical = int(vulns.get("critical", 0) or 0)
    high = int(vulns.get("high", 0) or 0)
    medium = int(vulns.get("moderate", 0) or 0)
    low = int(vulns.get("low", 0) or 0)
    info = int(vulns.get("info", 0) or 0)
    print(f"npm audit → CRITICAL={critical} HIGH={high} MEDIUM={medium} LOW={low} INFO={info}")

    for sev in ("critical", "high", "moderate", "low"):
        rows = details_for(data, sev)
        if rows:
            print("\n" + "\n".join(rows))

    if high:
        print("\n" + "#" * 78)
        print(f"### HIGH npm: {high} — NO BLOQUEA, PERO ESTO DEBE VERSE DESDE MARTE ###")
        print("#" * 78)
        gha("warning", f"npm: {high} HIGH", "No bloquean por política; revisar dependencias Node.")
    if medium:
        gha("notice", f"npm: {medium} MEDIUM", "Informativo.")
    if low:
        gha("notice", f"npm: {low} LOW", "Inventario informativo.")
    if critical:
        gha("error", f"npm: {critical} CRITICAL", "Build bloqueado.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
