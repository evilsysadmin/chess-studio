#!/usr/bin/env python3
"""Shared environment for staging browser smokes (deploy, continuity, Pawn Slug).

Each workflow used to carry its own inline Python to read the staging invite and
synthetic secret from the private OCI runtime bundle, plus inline bash for a
disposable smoke identity. One helper, one place for masking rules.

  secrets  [--keys INVITE_CODE=STAGING_INVITE_CODE,...]   -> GITHUB_ENV (masked)
  identity                                                 -> STAGING_E2E_USERNAME/PASSWORD (masked)
"""
from __future__ import annotations

import argparse
import os
import pathlib
import re
import secrets
import sys
from typing import Callable, Mapping

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

DEFAULT_KEYS = "INVITE_CODE=STAGING_INVITE_CODE,CHESS_AI_SHARED_SECRET=STAGING_SYNTHETIC_SECRET"
ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")


def parse_keys(spec: str) -> dict[str, str]:
    """'RUNTIME_KEY=ENV_VAR,...' -> {runtime_key: env_var}."""
    mapping: dict[str, str] = {}
    for item in filter(None, (part.strip() for part in spec.split(","))):
        runtime_key, _, env_var = item.partition("=")
        env_var = env_var or runtime_key
        if not (ENV_NAME.match(runtime_key) and ENV_NAME.match(env_var)):
            raise SystemExit(f"clave inválida: {item!r}")
        mapping[runtime_key] = env_var
    if not mapping:
        raise SystemExit("no se pidió ninguna clave")
    return mapping


def export(values: Mapping[str, str], env_file: str, out: Callable[[str], None] = print) -> None:
    """Mask every value before it reaches GITHUB_ENV; refuse empties/newlines."""
    for name, value in values.items():
        if not value:
            raise SystemExit(f"{name} falta en el bundle privado de OCI de staging")
        if "\n" in value or "\r" in value:
            raise SystemExit(f"{name} contiene saltos de línea; no se exporta")
    for value in values.values():
        out(f"::add-mask::{value}")
    with open(env_file, "a", encoding="utf-8") as handle:
        for name, value in values.items():
            handle.write(f"{name}={value}\n")


def smoke_identity(token: Callable[[int], str] = secrets.token_hex,
                   urlsafe: Callable[[int], str] = secrets.token_urlsafe) -> dict[str, str]:
    # Same shape as before: ci_smoke_ prefix is what the janitor sweeps.
    return {
        "STAGING_E2E_USERNAME": f"ci_smoke_{token(8)}",
        "STAGING_E2E_PASSWORD": f"CS!{urlsafe(32)}",
    }


def read_runtime(keys: Mapping[str, str]) -> dict[str, str]:
    import oci  # noqa: PLC0415 - only available after setup-oci-sdk
    from oci_runtime_bundle import read_private_runtime_values  # noqa: PLC0415

    raw = read_private_runtime_values(oci, list(keys))
    return {env_var: str(raw.get(runtime_key) or "") for runtime_key, env_var in keys.items()}


def self_test() -> None:
    import tempfile

    assert parse_keys(DEFAULT_KEYS) == {
        "INVITE_CODE": "STAGING_INVITE_CODE",
        "CHESS_AI_SHARED_SECRET": "STAGING_SYNTHETIC_SECRET",
    }
    assert parse_keys("INVITE_CODE=CHESS_CAPACITY_INVITE_CODE") == {"INVITE_CODE": "CHESS_CAPACITY_INVITE_CODE"}
    for bad in ("", "lower=X", "A=b c"):
        try:
            parse_keys(bad)
            raise AssertionError(f"debería rechazar {bad!r}")
        except SystemExit:
            pass

    with tempfile.TemporaryDirectory() as tmp:
        env_file = pathlib.Path(tmp) / "env"
        printed: list[str] = []
        export({"A": "s3cr3t", "B": "x"}, str(env_file), printed.append)
        assert printed == ["::add-mask::s3cr3t", "::add-mask::x"]
        assert env_file.read_text() == "A=s3cr3t\nB=x\n"
        for bad in ({"A": ""}, {"A": "multi\nline"}):
            before = env_file.read_text()
            try:
                export(bad, str(env_file), printed.append)
                raise AssertionError("debería rechazar")
            except SystemExit:
                pass
            assert env_file.read_text() == before, "nada se escribe si un valor es inválido"

    ident = smoke_identity()
    assert re.fullmatch(r"ci_smoke_[0-9a-f]{16}", ident["STAGING_E2E_USERNAME"])
    assert ident["STAGING_E2E_PASSWORD"].startswith("CS!") and len(ident["STAGING_E2E_PASSWORD"]) > 40
    assert smoke_identity() != ident
    print("staging-smoke-env self-test OK")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--self-test", action="store_true")
    sub = parser.add_subparsers(dest="command")
    p = sub.add_parser("secrets")
    p.add_argument("--keys", default=DEFAULT_KEYS)
    sub.add_parser("identity")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    env_file = os.environ.get("GITHUB_ENV")
    if args.command in ("secrets", "identity") and not env_file:
        raise SystemExit("GITHUB_ENV ausente")
    if args.command == "secrets":
        export(read_runtime(parse_keys(args.keys)), env_file)
        return 0
    if args.command == "identity":
        export(smoke_identity(), env_file)
        return 0
    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
