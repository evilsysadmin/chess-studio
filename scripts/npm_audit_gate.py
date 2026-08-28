#!/usr/bin/env python3
"""Aplica la política npm audit del proyecto.

- CRITICAL bloquea.
- HIGH/MEDIUM/LOW informan.
- Una caída del endpoint de npm audit NO bloquea: el gate queda explícitamente
  inconcluso y Trivy sigue siendo la barrera de seguridad autoritativa.
- Errores locales de configuración (sin lockfile, lock inconsistente, uso
  inválido) sí bloquean porque no son un problema del servicio remoto.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


LOCAL_CONFIGURATION_ERRORS = {
    "EAUDITNOLOCK",
    "ELOCKVERIFY",
    "EUSAGE",
}


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


def error_fields(error) -> tuple[str, str]:
    if isinstance(error, dict):
        code = str(error.get("code") or "").strip()
        message = " · ".join(
            str(error.get(key) or "").strip()
            for key in ("summary", "detail", "message")
            if str(error.get(key) or "").strip()
        )
        return code, message
    return "", str(error or "").strip()


def audit_unavailable(data: dict) -> tuple[bool, str]:
    """Distingue indisponibilidad remota de un checkout local inválido."""
    error = data.get("error")
    if not error:
        return False, ""
    code, message = error_fields(error)
    if code.upper() in LOCAL_CONFIGURATION_ERRORS:
        return False, f"{code}: {message}".strip(": ")
    # npm puede devolver {error:{summary:'',detail:''}} cuando el endpoint
    # /-/npm/v1/security/audits/quick falla. Sin metadata no existe un informe
    # de vulnerabilidades que interpretar; Trivy cubre el gate CRITICAL después.
    return True, f"{code}: {message}".strip(": ") or "endpoint npm audit sin respuesta utilizable"


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    try:
        data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: informe npm audit ilegible: {exc}", file=sys.stderr)
        return 2

    unavailable, reason = audit_unavailable(data)
    if unavailable:
        print("WARN: npm audit INCONCLUSO · el servicio remoto no devolvió un informe de vulnerabilidades.")
        print(f"      Motivo: {reason}")
        print("      No bloquea este push: Trivy sigue evaluando dependencias y bloquea CRITICAL.")
        gha("warning", "npm audit no disponible", "Auditoría npm inconclusa; Trivy mantiene el gate CRITICAL.")
        return 0

    if data.get("error"):
        code, message = error_fields(data.get("error"))
        detail = f"{code}: {message}".strip(": ") or repr(data.get("error"))
        print(f"ERROR: npm audit no pudo ejecutarse por un problema local: {detail}", file=sys.stderr)
        return 2

    vulns = data.get("metadata", {}).get("vulnerabilities")
    if not isinstance(vulns, dict):
        print("ERROR: faltan metadata.vulnerabilities en la salida de npm audit", file=sys.stderr)
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
