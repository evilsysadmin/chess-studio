#!/usr/bin/env python3
"""Deterministic vector sprite forge for Chess Football."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

CELL_W = 112
CELL_H = 144
COLUMNS = 8
FOOTLINE = 126
DISPLAY_SCALE = 0.72
ANIMATIONS = (
    ("idle", 7.0, True),
    ("run", 12.0, True),
    ("sprint", 12.0, True),
    ("pass", 10.0, False),
    ("shoot", 10.0, False),
    ("tackle", 10.0, False),
    ("celebrate", 10.0, True),
)
TEAMS = {
    "fc_matthias": {"name": "FC Matthias", "torso": "#1d54b0", "torso_dark": "#0e2d69", "head": "#e5dcc0"},
    "real_enroque": {"name": "Real Enroque", "torso": "#a02630", "torso_dark": "#55111d", "head": "#443e3e"},
}
GOLD = "#d4aa4c"
IVORY = "#ece6cf"
BOOT = "#181b21"
OUTLINE = "#12151c"


def _pose(animation: str, frame: int) -> dict[str, float]:
    phase = 2.0 * math.pi * frame / COLUMNS
    pose = {"bob": 0.0, "lean": 0.0, "arm_l": 0.0, "arm_r": 0.0, "leg_l": 0.0, "leg_r": 0.0, "yoff": 0.0}
    if animation == "idle":
        pose["bob"] = math.sin(phase) * 1.4
        pose["arm_l"] = math.sin(phase) * 0.15
        pose["arm_r"] = -pose["arm_l"]
    elif animation == "run":
        pose["bob"] = abs(math.sin(phase)) * 2.2
        pose["lean"] = 2.0
        pose["arm_l"] = math.sin(phase) * 8.0
        pose["arm_r"] = -pose["arm_l"]
        pose["leg_l"] = -math.sin(phase) * 9.0
        pose["leg_r"] = -pose["leg_l"]
    elif animation == "sprint":
        pose["bob"] = abs(math.sin(phase)) * 3.0
        pose["lean"] = 5.0
        pose["arm_l"] = math.sin(phase) * 11.0
        pose["arm_r"] = -pose["arm_l"]
        pose["leg_l"] = -math.sin(phase) * 12.0
        pose["leg_r"] = -pose["leg_l"]
    elif animation == "pass":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(bob=k * 1.5, lean=3.0 * t, leg_r=-3.0 + 20.0 * k, leg_l=-4.0, arm_l=-6.0 * k, arm_r=8.0 * k)
    elif animation == "shoot":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(bob=3.0 * k, lean=7.0 * k, leg_r=22.0 * k - 4.0, leg_l=-7.0 * k, arm_l=-10.0 * k, arm_r=13.0 * k)
    elif animation == "tackle":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(yoff=5.0 * k, lean=10.0 * k, leg_r=20.0 * k, leg_l=-10.0 * k, arm_l=-12.0 * k, arm_r=8.0 * k)
    elif animation == "celebrate":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(yoff=-7.0 * k, bob=2.0 * k, arm_l=-18.0 * k - 7.0, arm_r=18.0 * k + 7.0)
        pose["leg_l"] = -4.0 * math.sin(2.0 * phase)
        pose["leg_r"] = -pose["leg_l"]
    return pose


def _frame_svg(team: dict[str, str], animation: str, frame: int, offset_x: int, offset_y: int) -> str:
    p = _pose(animation, frame)
    bob = p["bob"]
    lean = p["lean"]
    yoff = p["yoff"]
    cx = 56.0 + lean
    foot = float(FOOTLINE) + yoff
    head_cy = 38.0 - bob + yoff
    hip_y = 102.0 - bob + yoff
    shoulder_y = 67.0 - bob + yoff

    def point(x: float, y: float) -> str:
        return f"{offset_x + x:.2f},{offset_y + y:.2f}"

    out: list[str] = []
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + foot:.2f}" rx="25" ry="3" fill="#000" opacity=".22"/>')
    for hip_x, foot_x in ((cx - 10.0, cx - 12.0 + p["leg_l"]), (cx + 10.0, cx + 12.0 + p["leg_r"])):
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{OUTLINE}" stroke-width="7" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{IVORY}" stroke-width="5" stroke-linecap="round"/>')
        out.append(f'<rect x="{offset_x + foot_x - 7.0:.2f}" y="{offset_y + foot - 7.0:.2f}" width="15" height="8" rx="3" fill="{BOOT}" stroke="{GOLD}" stroke-width="1"/>')

    for side, amount in ((-1.0, p["arm_l"]), (1.0, p["arm_r"])):
        sx = cx + side * 19.0
        sy = shoulder_y
        ex = cx + side * (27.0 + abs(amount) * 0.35) + amount * 0.55
        ey = 82.0 - bob + yoff - amount * 0.65
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{OUTLINE}" stroke-width="8" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{IVORY}" stroke-width="5" stroke-linecap="round"/>')
        out.append(f'<circle cx="{offset_x + ex:.2f}" cy="{offset_y + ey:.2f}" r="4" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1"/>')

    body = (
        (cx - 24.0, 67.0 - bob + yoff),
        (cx - 30.0, 96.0 - bob + yoff),
        (cx - 21.0, 109.0 - bob + yoff),
        (cx + 21.0, 109.0 - bob + yoff),
        (cx + 30.0, 96.0 - bob + yoff),
        (cx + 24.0, 67.0 - bob + yoff),
    )
    out.append(f'<polygon points="{" ".join(point(x, y) for x, y in body)}" fill="{team["torso"]}" stroke="{OUTLINE}" stroke-width="2" stroke-linejoin="round"/>')
    lower = (
        (cx - 27.0, 92.0 - bob + yoff),
        (cx + 27.0, 92.0 - bob + yoff),
        (cx + 21.0, 109.0 - bob + yoff),
        (cx - 21.0, 109.0 - bob + yoff),
    )
    out.append(f'<polygon points="{" ".join(point(x, y) for x, y in lower)}" fill="{team["torso_dark"]}" opacity=".94"/>')
    out.append(f'<line x1="{offset_x + cx - 20.0:.2f}" y1="{offset_y + 75.0 - bob + yoff:.2f}" x2="{offset_x + cx + 18.0:.2f}" y2="{offset_y + 102.0 - bob + yoff:.2f}" stroke="#fff" stroke-opacity=".86" stroke-width="5"/>')
    badge_y = 83.0 - bob + yoff
    out.append(f'<polygon points="{point(cx, badge_y - 5.0)} {point(cx + 5.0, badge_y)} {point(cx, badge_y + 5.0)} {point(cx - 5.0, badge_y)}" fill="{GOLD}" stroke="{OUTLINE}" stroke-width=".8"/>')
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + 60.5 - bob + yoff:.2f}" rx="18" ry="7.5" fill="{GOLD}" stroke="{OUTLINE}" stroke-width="2"/>')
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + 59.5 - bob + yoff:.2f}" rx="14" ry="4.5" fill="{team["torso_dark"]}"/>')
    out.append(f'<circle cx="{offset_x + cx:.2f}" cy="{offset_y + head_cy:.2f}" r="17" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="2"/>')
    out.append(f'<circle cx="{offset_x + cx - 6.0:.2f}" cy="{offset_y + head_cy - 8.0:.2f}" r="4" fill="#fff" opacity=".34"/>')
    out.append(f'<line x1="{offset_x + cx + 5.0:.2f}" y1="{offset_y + head_cy + 2.0:.2f}" x2="{offset_x + cx + 11.0:.2f}" y2="{offset_y + head_cy + 2.0:.2f}" stroke="{OUTLINE}" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>')
    out.append(f'<line x1="{offset_x + cx - 23.0:.2f}" y1="{offset_y + 104.0 - bob + yoff:.2f}" x2="{offset_x + cx + 23.0:.2f}" y2="{offset_y + 104.0 - bob + yoff:.2f}" stroke="{GOLD}" stroke-width="2"/>')
    return "\n".join(out)


def _atlas_svg(team: dict[str, str]) -> str:
    rows = len(ANIMATIONS)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CELL_W * COLUMNS}" height="{CELL_H * rows}" viewBox="0 0 {CELL_W * COLUMNS} {CELL_H * rows}">',
        '<g shape-rendering="geometricPrecision">',
    ]
    for row, (animation, _, _) in enumerate(ANIMATIONS):
        for frame in range(COLUMNS):
            parts.append(_frame_svg(team, animation, frame, frame * CELL_W, row * CELL_H))
    parts.append("</g></svg>")
    return "\n".join(parts) + "\n"


def build_outputs() -> dict[str, str]:
    outputs: dict[str, str] = {}
    atlas_meta: dict[str, dict[str, str]] = {}
    for slug, team in TEAMS.items():
        filename = f"{slug}_atlas.svg"
        svg = _atlas_svg(team)
        outputs[filename] = svg
        atlas_meta[slug] = {"name": team["name"], "file": filename, "sha256": hashlib.sha256(svg.encode("utf-8")).hexdigest()}
    manifest = {
        "version": 1,
        "quality_contract": "chess-football-vector-v1",
        "cell": {"width": CELL_W, "height": CELL_H},
        "columns": COLUMNS,
        "rows": len(ANIMATIONS),
        "footline": FOOTLINE,
        "display_scale": DISPLAY_SCALE,
        "atlases": atlas_meta,
        "animations": [
            {"name": name, "row": row, "frames": COLUMNS, "fps": fps, "loop": loop}
            for row, (name, fps, loop) in enumerate(ANIMATIONS)
        ],
    }
    outputs["manifest.json"] = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    return outputs


def write_outputs(target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for filename, content in build_outputs().items():
        (target / filename).write_text(content, encoding="utf-8")


def verify_outputs(target: Path) -> None:
    expected = build_outputs()
    errors: list[str] = []
    for filename, content in expected.items():
        path = target / filename
        if not path.exists():
            errors.append(f"missing {path}")
            continue
        if path.read_text(encoding="utf-8") != content:
            errors.append(f"drift {path}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"chess-football sprite forge: OK ({len(expected)} files)")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    generate = sub.add_parser("generate")
    generate.add_argument("--assets-dir", type=Path, required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--assets-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "generate":
        write_outputs(args.assets_dir)
    else:
        verify_outputs(args.assets_dir)


if __name__ == "__main__":
    main()
