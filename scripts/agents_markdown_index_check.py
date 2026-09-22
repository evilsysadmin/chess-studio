#!/usr/bin/env python3
"""Fail when tracked Markdown drifts from the root AGENTS.md index."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "AGENTS.md"
MARKDOWN_LINK_RE = re.compile(r"\]\(([^)#?]+\.md)(?:#[^)]*)?\)")


def tracked_markdown() -> set[str]:
    proc = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.md"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return {
        item.decode("utf-8").strip()
        for item in proc.stdout.split(b"\0")
        if item
    }


def indexed_markdown(text: str) -> set[str]:
    result: set[str] = set()
    for raw in MARKDOWN_LINK_RE.findall(text):
        value = raw.strip()
        if "://" in value or value.startswith("mailto:"):
            continue
        while value.startswith("./"):
            value = value[2:]
        result.add(Path(value).as_posix())
    return result


def main() -> int:
    tracked = tracked_markdown()
    tracked.discard("AGENTS.md")

    indexed = indexed_markdown(AGENTS.read_text("utf-8"))
    missing = sorted(tracked - indexed)
    broken = sorted(indexed - tracked)

    if missing or broken:
        print("agents-markdown-index-check FAIL", file=sys.stderr)
        if missing:
            print(" - Markdown tracked but not indexed in AGENTS.md:", file=sys.stderr)
            for path in missing:
                print(f"   - {path}", file=sys.stderr)
        if broken:
            print(" - AGENTS.md links to missing/untracked Markdown:", file=sys.stderr)
            for path in broken:
                print(f"   - {path}", file=sys.stderr)
        return 1

    print(f"agents-markdown-index-check OK · {len(tracked)} Markdown indexed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
