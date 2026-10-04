#!/usr/bin/env python3
"""Cross-language parity corpus for the Chronicles topology generator.

Python is still authoritative for Chronicles. This fixture freezes MapCode v1
+ generator v2 outputs so the Go port can prove byte-for-byte topology parity
before any Chronicles route becomes native.

    python3 scripts/chronicles_topology_parity_corpus.py
    python3 scripts/chronicles_topology_parity_corpus.py --check
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from chronicles_map_code import ChroniclesMapCode, encode_chronicles_map_code  # noqa: E402
from chronicles_map_generator import generate_chronicles_layout  # noqa: E402


FIXTURE = (
    ROOT
    / "backend-go"
    / "internal"
    / "chroniclesmap"
    / "testdata"
    / "python_topology_corpus.json"
)

CASES = (
    ("crypt", 7, 7, ("hunt",), 2, 0, 0, 1, 0),
    ("gallery", 9, 7, ("lever", "traps"), 3, 1, 1, 2, 417),
    ("ash", 11, 9, ("keys", "puzzle", "guardian"), 4, 2, 2, 3, 1),
    ("archive", 13, 10, ("guardian", "treasure"), 5, 3, 3, 4, 2_147_483_647),
    ("iron", 19, 15, ("sluice", "secret"), 6, 4, 0, 5, 17),
    ("basilica", 7, 7, ("guardian", "treasure"), 7, 1, 1, 1, 1),
    ("bell", 9, 7, ("keys", "puzzle"), 8, 2, 2, 2, 2_147_483_647),
    ("glass", 11, 9, ("sluice", "secret"), 2, 3, 3, 3, 17),
    ("water", 13, 10, ("lever", "traps", "guardian"), 3, 4, 0, 4, 0),
    ("crypt", 19, 15, ("keys", "puzzle", "guardian"), 8, 4, 3, 5, 2_147_483_647),
    ("water", 7, 7, ("sluice",), 2, 0, 0, 5, 417),
    ("gallery", 19, 15, ("hunt", "treasure"), 2, 4, 3, 1, 0),
)


def build() -> dict:
    rows = []
    for theme, width, height, verbs, enemies, treasures, secrets, difficulty, seed in CASES:
        recipe = ChroniclesMapCode(
            theme=theme,
            width=width,
            height=height,
            verbs=verbs,
            enemies=enemies,
            treasures=treasures,
            secrets=secrets,
            difficulty=difficulty,
            seed=seed,
        )
        map_code = encode_chronicles_map_code(recipe)
        rows.append(
            {
                "mapCode": map_code,
                "layout": generate_chronicles_layout(map_code).as_dict(),
            }
        )
    return {
        "generator": "scripts/chronicles_topology_parity_corpus.py",
        "mapCodeVersion": 1,
        "generatorVersion": 2,
        "cases": rows,
    }


def render(corpus: dict) -> str:
    head = {key: value for key, value in corpus.items() if key != "cases"}
    rows = ",\n".join(
        json.dumps(row, sort_keys=True, separators=(",", ":"))
        for row in corpus["cases"]
    )
    return json.dumps(head, sort_keys=True)[:-1] + ', "cases": [\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())

    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(
                f"{FIXTURE.relative_to(ROOT)} is stale: "
                "run python3 scripts/chronicles_topology_parity_corpus.py",
                file=sys.stderr,
            )
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date ({len(CASES)} cases)")
        return 0

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)} ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
