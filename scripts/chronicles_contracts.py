#!/usr/bin/env python3
"""Synchronize and validate the committed Chronicles cross-runtime contracts.

The Python backend owns the authored map manifests. Frontend JSON files are
offline/fallback mirrors and Go embeds the same authored bytes. The two Python
parity generators then pin the derived area envelopes and run/API behavior for
Go.

Usage:
    python3 scripts/chronicles_contracts.py
    python3 scripts/chronicles_contracts.py --check
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_MAPS = ROOT / "backend-python" / "chronicles_maps"
MIRROR_MAP_DIRS = (
    ROOT / "frontend" / "src" / "chronicles" / "maps",
    ROOT / "backend-go" / "internal" / "chronicles" / "content" / "maps",
)
PARITY_GENERATORS = (
    ROOT / "scripts" / "chronicles_area_parity_corpus.py",
    ROOT / "scripts" / "chronicles_runs_parity_corpus.py",
)


def json_files(root: Path) -> dict[str, Path]:
    return {path.name: path for path in sorted(root.glob("*.json")) if path.is_file()}


def sync_manifests(*, check: bool) -> bool:
    canonical = json_files(CANONICAL_MAPS)
    if not canonical:
        raise SystemExit(f"no Chronicles manifests found in {CANONICAL_MAPS.relative_to(ROOT)}")

    stale = False
    expected = set(canonical)
    for mirror_root in MIRROR_MAP_DIRS:
        mirror_root.mkdir(parents=True, exist_ok=True)
        mirrors = json_files(mirror_root)
        actual = set(mirrors)
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)

        if missing or extra:
            stale = True
            if check:
                for name in missing:
                    print(f"missing mirror: {mirror_root.relative_to(ROOT) / name}", file=sys.stderr)
                for name in extra:
                    print(f"extra mirror: {mirror_root.relative_to(ROOT) / name}", file=sys.stderr)
            else:
                for name in extra:
                    mirrors[name].unlink()
                    print(f"removed stale mirror: {mirror_root.relative_to(ROOT) / name}")

        for name, source in canonical.items():
            target = mirror_root / name
            source_bytes = source.read_bytes()
            target_bytes = target.read_bytes() if target.exists() else None
            if target_bytes == source_bytes:
                continue
            stale = True
            if check:
                print(
                    f"stale mirror: {target.relative_to(ROOT)} != "
                    f"{source.relative_to(ROOT)}",
                    file=sys.stderr,
                )
            else:
                target.write_bytes(source_bytes)
                print(f"synced mirror: {target.relative_to(ROOT)}")

    return stale


def run_generators(*, check: bool) -> bool:
    failed = False
    for generator in PARITY_GENERATORS:
        command = [sys.executable, str(generator)]
        if check:
            command.append("--check")
        result = subprocess.run(command, cwd=ROOT, check=False)
        if result.returncode != 0:
            failed = True
    return failed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail without writing when mirrors or parity corpora are stale",
    )
    args = parser.parse_args()

    manifests_stale = sync_manifests(check=args.check)
    corpora_failed = run_generators(check=args.check)

    if args.check and (manifests_stale or corpora_failed):
        print("chronicles-contracts FAIL · run 'make chronicles-contracts'", file=sys.stderr)
        return 1
    if corpora_failed:
        return 1

    mode = "OK" if args.check else "synced"
    print(
        f"chronicles-contracts {mode} · "
        f"{len(json_files(CANONICAL_MAPS))} manifests × 3 + "
        f"{len(PARITY_GENERATORS)} parity corpora"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
