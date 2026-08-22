#!/usr/bin/env python3
"""Update only known obsolete contract assertions from the V16.6ax roster change."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / "frontend" / "src" / "armyRosterView.test.js"

if not path.exists():
    print("Roster test not present; nothing to patch.")
    raise SystemExit(0)

source = path.read_text("utf-8")
obsolete = "    expect(source).toContain('16 unidades');"
replacement = """    // Deployment remains 16 canonical slots, while the barracks may grow.
    expect(source).toContain('Los 16 puestos canónicos');
    expect(source).toContain('{deploy.totalRoster} unidades');"""

if obsolete not in source:
    print("Roster contract already current; nothing to patch.")
    raise SystemExit(0)

if "CANONICAL_ROSTER_SLOTS.map" not in source:
    print("REFUSE: roster test shape is unfamiliar; not editing.", file=sys.stderr)
    raise SystemExit(2)

path.write_text(source.replace(obsolete, replacement, 1), "utf-8")
print("Updated obsolete fixed-16 roster assertion.")
