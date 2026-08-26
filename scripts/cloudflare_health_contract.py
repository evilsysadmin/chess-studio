#!/usr/bin/env python3
"""Shared Cloudflare Workers AI /health contract.

Used by both CI deployment health checks and the local/static preflight so the
expected routing is defined in one place instead of duplicated as inline YAML.
"""
from __future__ import annotations

import json
import pathlib
import sys

EXPECTED_MODELS = {
    "comments": "@cf/qwen/qwen3-30b-a3b-fp8",
    "player_portrait": "@cf/qwen/qwen3-30b-a3b-fp8",
    "analysis": "@cf/qwen/qwen3-30b-a3b-fp8",
}
EXPECTED_SERVICE = "chess-studio-narrative-ai"


def validate_health_payload(payload: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["payload no es un objeto JSON"]
    if payload.get("ok") is not True:
        errors.append("payload no indica ok=true")
    if payload.get("service") != EXPECTED_SERVICE:
        errors.append(f"servicio inesperado {payload.get('service')!r}")
    if payload.get("model") != EXPECTED_MODELS["comments"]:
        errors.append(f"modelo principal inesperado {payload.get('model')!r}")
    models = payload.get("models") if isinstance(payload.get("models"), dict) else {}
    for route, expected in EXPECTED_MODELS.items():
        if models.get(route) != expected:
            errors.append(f"routing {route} inesperado {models.get(route)!r}")
    return errors


def validate_health_file(path: str | pathlib.Path) -> list[str]:
    try:
        payload = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return [f"health JSON inválido: {exc}"]
    return validate_health_payload(payload)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: cloudflare_health_contract.py <health-json-file>", file=sys.stderr)
        return 2
    errors = validate_health_file(args[0])
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
