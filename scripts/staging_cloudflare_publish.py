#!/usr/bin/env python3
"""Guard Cloudflare staging writes against superseded main SHA."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
from typing import Callable

import staging_generation as generation

ROOT = Path(__file__).resolve().parents[1]


def publish(
    surface: str, sha: str, *,
    head: Callable[[], str] = generation.current_main,
    execute: Callable = subprocess.run,
    wrangler: str | None = None,
) -> bool:
    """True if written, False if superseded; unknown HEAD/errors fail closed."""
    expected = generation.valid_sha(sha)
    if surface not in {"pages", "worker"}:
        raise ValueError("unknown Cloudflare staging surface")

    def current() -> bool:
        actual = head()
        if actual != expected:
            print(f"::notice title=Cloudflare staging superseded::{surface} {expected[:12]} != main {actual[:12]}; no write")
            return False
        return True

    if not current():
        return False
    if surface == "pages":
        frontend = ROOT / "frontend"
        execute(
            [sys.executable, "-S", str(ROOT / "scripts/pages_runtime_asset_grace.py"),
             "--dist", "dist", "--site", "staging"],
            cwd=frontend, check=True,
        )
        # Recovery can take minutes; check again immediately before Wrangler.
        if not current():
            return False
        executable = wrangler if wrangler is not None else os.environ.get("WRANGLER_BIN", "")
        if not executable:
            raise RuntimeError("pinned Wrangler toolchain unavailable")
        execute(
            [executable, "pages", "deploy", "dist", "--project-name", "chess-studio-staging",
             "--branch", "main", "--commit-hash", expected, "--commit-dirty=false"],
            cwd=frontend, check=True,
        )
    else:
        execute([sys.executable, str(ROOT / "scripts/deploy_staging_ai_worker.py")],
                cwd=ROOT, check=True)
    return True


def self_test() -> None:
    a, b = "a" * 40, "b" * 40
    calls: list[tuple[list[str], dict]] = []
    def runner(cmd, **kwargs):
        calls.append((cmd, kwargs))
    assert not publish("pages", a, head=lambda: b, execute=runner, wrangler="/pinned")
    assert not calls, "stale SHA still performed a write"
    def heads():
        yield a
        yield b
    states = iter(heads())
    assert not publish("pages", a, head=lambda: next(states), execute=runner, wrangler="/pinned")
    assert len(calls) == 1 and "pages_runtime_asset_grace.py" in calls[0][0][2]
    assert all(row[1].get("check") is True for row in calls)
    calls.clear()
    assert publish("pages", a, head=lambda: a, execute=runner, wrangler="/pinned")
    assert len(calls) == 2 and calls[1][0][:3] == ["/pinned", "pages", "deploy"]
    assert calls[1][0][-3:] == ["--commit-hash", a, "--commit-dirty=false"]
    calls.clear()
    assert not publish("worker", a, head=lambda: b, execute=runner)
    assert not calls
    assert publish("worker", a, head=lambda: a, execute=runner)
    assert len(calls) == 1 and calls[0][0][-1].endswith("deploy_staging_ai_worker.py")
    calls.clear()
    def missing_head():
        raise generation.GenerationError("unreadable origin main")
    try:
        publish("worker", a, head=missing_head, execute=runner)
    except generation.GenerationError:
        pass
    else:
        raise AssertionError("unreadable head allowed Cloudflare write")
    assert not calls
    try:
        publish("pages", "invalid", head=lambda: a, execute=runner)
    except generation.GenerationError:
        pass
    else:
        raise AssertionError("malformed SHA allowed Cloudflare write")
    print("staging-cloudflare-publish self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("surface", nargs="?", choices=("pages", "worker"))
    parser.add_argument("--sha", default=os.environ.get("DEPLOY_SHA"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.surface or not args.sha:
        parser.error("surface and --sha/DEPLOY_SHA required")
    published = publish(args.surface, args.sha)
    out = os.environ.get("GITHUB_OUTPUT", "")
    if out:
        with open(out, "a", encoding="utf-8") as handle:
            handle.write(f"superseded={'false' if published else 'true'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
