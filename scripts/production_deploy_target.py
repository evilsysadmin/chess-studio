#!/usr/bin/env python3
"""Resolve the versioned production backend hosting switch."""
from __future__ import annotations

import argparse
from pathlib import Path

ALLOWED_TARGETS = {"render", "oci"}
DEFAULT_CONFIG = Path(".github/production-deploy.env")


def parse_config(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"missing production deploy target config: {path}")
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit("malformed production deploy target config")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().lower()
        if key in values:
            raise SystemExit(f"duplicate production deploy target key: {key}")
        values[key] = value
    if set(values) != {"DEPLOY_TARGET"}:
        raise SystemExit("production deploy target config must contain only DEPLOY_TARGET")
    target = values["DEPLOY_TARGET"]
    if target not in ALLOWED_TARGETS:
        raise SystemExit(f"DEPLOY_TARGET must be one of {sorted(ALLOWED_TARGETS)}")
    return target


def resolve(path: Path, github_output: str = "") -> str:
    target = parse_config(path)
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"deploy_target={target}\n")
    print(f"Production deploy target: {target}")
    return target


def self_test() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "target.env"
        path.write_text("DEPLOY_TARGET=render\n", encoding="utf-8")
        assert parse_config(path) == "render"
        path.write_text("# switch\nDEPLOY_TARGET=oci\n", encoding="utf-8")
        assert parse_config(path) == "oci"
        for bad in ("DEPLOY_TARGET=banana\n", "DEPLOY_TARGET=oci\nEXTRA=nope\n", "oci\n"):
            path.write_text(bad, encoding="utf-8")
            try:
                parse_config(path)
            except SystemExit:
                pass
            else:
                raise AssertionError(f"unsafe production target config accepted: {bad!r}")
    print("production deploy target self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("resolve",))
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--github-output", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "resolve":
        parser.error("resolve is required unless --self-test is used")
    resolve(args.config, args.github_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
