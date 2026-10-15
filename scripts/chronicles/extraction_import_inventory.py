#!/usr/bin/env python3
"""Inventory direct ES module dependencies of Chronicles entrypoints.

Standard-library only. Run from the repository root:
    python3 scripts/chronicles/extraction_import_inventory.py

This is a conservative static audit, not a complete bundler resolution pass.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend" / "src"
ENTRYPOINTS = (
    SRC / "components" / "ChroniclesOfMatthias.jsx",
    SRC / "chroniclesOfMatthias.js",
    SRC / "chronicles" / "chroniclesRunClient.js",
    SRC / "components" / "ChroniclesOfMatthiasTactics.jsx",
)
IMPORT = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"]+)\1""",
    re.MULTILINE,
)
EXTENSIONS = (".js", ".jsx", ".mjs", ".ts", ".tsx", ".json")


def resolve_local(origin: Path, specifier: str) -> Path | None:
    candidate = (origin.parent / specifier).resolve()
    if not candidate.is_relative_to(SRC):
        return None
    for path in (candidate, *(Path(str(candidate) + ext) for ext in EXTENSIONS),
                 *(candidate / ("index" + ext) for ext in EXTENSIONS)):
        if path.is_file():
            return path
    return None


def classify(path: Path) -> str:
    relative = path.relative_to(SRC).as_posix()
    if relative.startswith("chronicles/") or relative.startswith("chroniclesOfMatthias"):
        return "chronicles"
    if relative.startswith("components/Chronicles") or relative.startswith("chronicles"):
        return "chronicles"
    return "shared"


def inventory() -> dict:
    pending = list(ENTRYPOINTS)
    visited: set[Path] = set()
    files: list[dict] = []
    unresolved: list[dict] = []
    while pending:
        path = pending.pop()
        if path in visited:
            continue
        if not path.is_file():
            unresolved.append({"from": "entrypoint", "specifier": str(path.relative_to(ROOT))})
            continue
        visited.add(path)
        imports = []
        for match in IMPORT.finditer(path.read_text(encoding="utf-8")):
            specifier = match.group(2)
            if not specifier.startswith("."):
                imports.append({"specifier": specifier, "kind": "package"})
                continue
            target = resolve_local(path, specifier)
            if target is None:
                unresolved.append({"from": path.relative_to(ROOT).as_posix(), "specifier": specifier})
                continue
            imports.append({"specifier": specifier, "kind": classify(target),
                            "target": target.relative_to(ROOT).as_posix()})
            pending.append(target)
        files.append({"path": path.relative_to(ROOT).as_posix(),
                      "ownership": classify(path), "imports": imports})
    files.sort(key=lambda item: item["path"])
    shared = sorted(item["path"] for item in files if item["ownership"] == "shared")
    packages = sorted({edge["specifier"] for item in files for edge in item["imports"] if edge["kind"] == "package"})
    return {"entrypoints": [p.relative_to(ROOT).as_posix() for p in ENTRYPOINTS],
            "files": files, "shared_files": shared, "packages": packages,
            "unresolved": sorted(unresolved, key=lambda x: (x["from"], x["specifier"]))}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fail-unresolved", action="store_true")
    args = parser.parse_args()
    report = inventory()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.fail_unresolved and report["unresolved"]:
        raise SystemExit(1)
