#!/usr/bin/env python3
"""Deterministic vector sprite forge for Chess Football."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

CONTRACT_PATH = Path(__file__).parent / "contracts" / "chess_football_players_v1.json"


def _load_sprite_forge_contract() -> dict:
    data = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if data.get("schema") != 2 or data.get("surface") != "chess-football":
        raise RuntimeError("Chess Football requires Sprite Forge schema 2")
    cell = data.get("cell")
    parts = data.get("parts")
    animations = data.get("animations")
    if not isinstance(cell, dict) or not isinstance(parts, dict) or "main" not in parts:
        raise RuntimeError("Chess Football Sprite Forge contract missing cell/main part")
    if not isinstance(animations, list) or not animations:
        raise RuntimeError("Chess Football Sprite Forge contract missing animations")

    main = parts["main"]
    columns = int(main.get("columns", 0))
    rows = int(main.get("rows", 0))
    ordered = sorted(animations, key=lambda animation: int(animation.get("row", -1)))
    if columns <= 0 or rows != len(ordered):
        raise RuntimeError("Chess Football Sprite Forge grid mismatch")
    for expected_row, animation in enumerate(ordered):
        if animation.get("part") != "main" or int(animation.get("row", -1)) != expected_row:
            raise RuntimeError("Chess Football Sprite Forge rows must be contiguous in main")
        if int(animation.get("authored_frames", 0)) != columns:
            raise RuntimeError("Chess Football authored frame count must match atlas columns")
        if animation.get("slots") != list(range(columns)):
            raise RuntimeError("Chess Football stores one authored frame per slot")
    return data


SPRITE_FORGE_CONTRACT = _load_sprite_forge_contract()
CELL_W = int(SPRITE_FORGE_CONTRACT["cell"]["width"])
CELL_H = int(SPRITE_FORGE_CONTRACT["cell"]["height"])
COLUMNS = int(SPRITE_FORGE_CONTRACT["parts"]["main"]["columns"])
FOOTLINE = 130
DISPLAY_SCALE = 0.72
ANIMATIONS = tuple(
    (
        str(animation["name"]),
        int(animation["fps"]),
        bool(animation["loop"]),
    )
    for animation in sorted(
        SPRITE_FORGE_CONTRACT["animations"],
        key=lambda animation: int(animation["row"]),
    )
)
TEAMS = {
    "fc_matthias": {"name": "FC Matthias", "torso": "#245fc2", "torso_dark": "#102f70", "torso_light": "#4f82df", "head": "#e7dec4", "hair": "#6d4b31"},
    "real_enroque": {"name": "Real Enroque", "torso": "#ad2936", "torso_dark": "#5a121e", "torso_light": "#d1505b", "head": "#885f45", "hair": "#251b19"},
}
KEEPERS = {
    "fc_matthias_keeper": {"name": "FC Matthias · Portero", "torso": "#16856d", "torso_dark": "#0a493d", "torso_light": "#41b89a", "head": "#e7dec4", "hair": "#6d4b31"},
    "real_enroque_keeper": {"name": "Real Enroque · Portero", "torso": "#ce861f", "torso_dark": "#70420c", "torso_light": "#efb64f", "head": "#885f45", "hair": "#251b19"},
}
GOLD = "#d4aa4c"
IVORY = "#ece6cf"
BOOT = "#181b21"
OUTLINE = "#12151c"


def _pose(animation: str, frame: int) -> dict[str, float]:
    phase = 2.0 * math.pi * frame / COLUMNS
    pose = {"bob": 0.0, "lean": 0.0, "arm_l": 0.0, "arm_r": 0.0, "leg_l": 0.0, "leg_r": 0.0, "yoff": 0.0}
    if animation == "idle":
        pose["bob"] = math.sin(phase) * 1.0
        pose["arm_l"] = math.sin(phase) * 0.8
        pose["arm_r"] = -pose["arm_l"]
    elif animation == "run":
        pose["bob"] = abs(math.sin(phase)) * 1.8
        pose["lean"] = 2.5
        pose["arm_l"] = math.sin(phase) * 12.0
        pose["arm_r"] = -pose["arm_l"]
        pose["leg_l"] = -math.sin(phase) * 14.0
        pose["leg_r"] = -pose["leg_l"]
    elif animation == "sprint":
        pose["bob"] = abs(math.sin(phase)) * 2.6
        pose["lean"] = 5.5
        pose["arm_l"] = math.sin(phase) * 16.0
        pose["arm_r"] = -pose["arm_l"]
        pose["leg_l"] = -math.sin(phase) * 18.0
        pose["leg_r"] = -pose["leg_l"]
    elif animation == "pass":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(bob=1.2 * k, lean=4.0 * k, leg_r=22.0 * k - 2.0, leg_l=-4.0 * k, arm_l=-8.0 * k, arm_r=10.0 * k)
    elif animation == "shoot":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(bob=2.4 * k, lean=9.0 * k, leg_r=31.0 * k - 4.0, leg_l=-6.0 * k, arm_l=-14.0 * k, arm_r=16.0 * k)
    elif animation == "tackle":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(yoff=4.0 * k, lean=13.0 * k, leg_r=26.0 * k, leg_l=-13.0 * k, arm_l=-15.0 * k, arm_r=10.0 * k)
    elif animation == "celebrate":
        t = frame / 7.0
        k = math.sin(math.pi * t)
        pose.update(yoff=-8.0 * k, bob=1.5 * k, arm_l=-24.0 * k - 8.0, arm_r=24.0 * k + 8.0)
        pose["leg_l"] = -5.0 * math.sin(2.0 * phase)
        pose["leg_r"] = -pose["leg_l"]
    return pose


def _frame_svg(team: dict[str, str], animation: str, frame: int, offset_x: int, offset_y: int, keeper: bool = False) -> str:
    p = _pose(animation, frame)
    bob = p["bob"]
    lean = p["lean"]
    yoff = p["yoff"]
    cx = 56.0 + lean
    foot = float(FOOTLINE) + yoff
    head_cy = 35.0 - bob + yoff
    hip_y = 94.0 - bob + yoff
    shoulder_y = 63.0 - bob + yoff

    def point(x: float, y: float) -> str:
        return f"{offset_x + x:.2f},{offset_y + y:.2f}"

    out: list[str] = []
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + foot + 1.0:.2f}" rx="21" ry="3.0" fill="#000" opacity=".22"/>')

    for side, stride in ((-1.0, p["leg_l"]), (1.0, p["leg_r"])):
        hip_x = cx + side * 8.5
        foot_x = cx + side * 10.0 + stride
        knee_x = hip_x + stride * 0.52 - side * 1.3
        knee_y = hip_y + 15.0 - min(abs(stride) * 0.12, 3.0)
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + knee_x:.2f}" y2="{offset_y + knee_y:.2f}" stroke="{OUTLINE}" stroke-width="7.2" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + knee_x:.2f}" y2="{offset_y + knee_y:.2f}" stroke="{team["torso_dark"]}" stroke-width="4.8" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{OUTLINE}" stroke-width="6.4" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{IVORY}" stroke-width="4.0" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y + 6.0:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 8.0:.2f}" stroke="{team["torso"]}" stroke-width="1.6" stroke-linecap="round" opacity=".88"/>')
        out.append(f'<rect x="{offset_x + foot_x - 6.6:.2f}" y="{offset_y + foot - 7.0:.2f}" width="14.5" height="7.2" rx="2.7" fill="{BOOT}" stroke="{GOLD}" stroke-width=".9"/>')

    for side, amount in ((-1.0, p["arm_l"]), (1.0, p["arm_r"])):
        sx = cx + side * 17.0
        sy = shoulder_y
        ex = cx + side * 24.0 + amount * 0.72
        ey = 82.0 - bob + yoff - amount * 0.52
        elbow_x = sx + (ex - sx) * 0.50
        elbow_y = sy + (ey - sy) * 0.50
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + elbow_x:.2f}" y2="{offset_y + elbow_y:.2f}" stroke="{OUTLINE}" stroke-width="7.0" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + elbow_x:.2f}" y2="{offset_y + elbow_y:.2f}" stroke="{team["torso_light"]}" stroke-width="4.4" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + elbow_x:.2f}" y1="{offset_y + elbow_y:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{OUTLINE}" stroke-width="6.0" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + elbow_x:.2f}" y1="{offset_y + elbow_y:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{team["head"]}" stroke-width="3.7" stroke-linecap="round"/>')
        out.append(f'<circle cx="{offset_x + ex:.2f}" cy="{offset_y + ey:.2f}" r="{4.6 if keeper else 3.5}" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.0"/>')

    body = (
        (cx - 18.5, 62.0 - bob + yoff),
        (cx - 21.0, 77.0 - bob + yoff),
        (cx - 16.5, 94.0 - bob + yoff),
        (cx + 16.5, 94.0 - bob + yoff),
        (cx + 21.0, 77.0 - bob + yoff),
        (cx + 18.5, 62.0 - bob + yoff),
    )
    out.append(f'<polygon points="{" ".join(point(x, y) for x, y in body)}" fill="{team["torso"]}" stroke="{OUTLINE}" stroke-width="1.8" stroke-linejoin="round"/>')
    out.append(f'<polygon points="{point(cx + 3.0, 64.0 - bob + yoff)} {point(cx + 18.0, 64.0 - bob + yoff)} {point(cx + 19.0, 79.0 - bob + yoff)} {point(cx + 13.0, 92.0 - bob + yoff)}" fill="{team["torso_dark"]}" opacity=".36"/>')
    out.append(f'<line x1="{offset_x + cx - 12.0:.2f}" y1="{offset_y + 66.0 - bob + yoff:.2f}" x2="{offset_x + cx - 5.0:.2f}" y2="{offset_y + 91.0 - bob + yoff:.2f}" stroke="{team["torso_light"]}" stroke-width="1.8" opacity=".76"/>')
    out.append(f'<polygon points="{point(cx - 17.0, 86.0 - bob + yoff)} {point(cx + 17.0, 86.0 - bob + yoff)} {point(cx + 15.0, 99.0 - bob + yoff)} {point(cx - 15.0, 99.0 - bob + yoff)}" fill="{team["torso_dark"]}" stroke="{OUTLINE}" stroke-width="1.2"/>')
    out.append(f'<line x1="{offset_x + cx - 14.0:.2f}" y1="{offset_y + 89.0 - bob + yoff:.2f}" x2="{offset_x + cx + 14.0:.2f}" y2="{offset_y + 89.0 - bob + yoff:.2f}" stroke="{GOLD}" stroke-width="1.2" opacity=".88"/>')
    out.append(f'<line x1="{offset_x + cx - 14.0:.2f}" y1="{offset_y + 69.0 - bob + yoff:.2f}" x2="{offset_x + cx + 11.0:.2f}" y2="{offset_y + 88.0 - bob + yoff:.2f}" stroke="#fff" stroke-opacity=".90" stroke-width="3.8"/>')
    badge_y = 77.0 - bob + yoff
    out.append(f'<polygon points="{point(cx, badge_y - 3.8)} {point(cx + 3.8, badge_y)} {point(cx, badge_y + 3.8)} {point(cx - 3.8, badge_y)}" fill="{GOLD}" stroke="{OUTLINE}" stroke-width=".7"/>')

    out.append(f'<rect x="{offset_x + cx - 6.0:.2f}" y="{offset_y + 52.0 - bob + yoff:.2f}" width="12" height="10" rx="4" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.2"/>')
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + head_cy:.2f}" rx="13.5" ry="15.5" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.8"/>')
    out.append(f'<path d="M {offset_x + cx - 11.5:.2f} {offset_y + head_cy - 6.0:.2f} Q {offset_x + cx:.2f} {offset_y + head_cy - 15.0:.2f} {offset_x + cx + 11.0:.2f} {offset_y + head_cy - 5.0:.2f}" fill="{team["hair"]}" stroke="{OUTLINE}" stroke-width="1.1"/>')
    out.append(f'<circle cx="{offset_x + cx - 4.8:.2f}" cy="{offset_y + head_cy - 1.5:.2f}" r="1.25" fill="{OUTLINE}"/>')
    out.append(f'<circle cx="{offset_x + cx + 4.8:.2f}" cy="{offset_y + head_cy - 1.5:.2f}" r="1.25" fill="{OUTLINE}"/>')
    out.append(f'<line x1="{offset_x + cx - 3.0:.2f}" y1="{offset_y + head_cy + 6.0:.2f}" x2="{offset_x + cx + 4.0:.2f}" y2="{offset_y + head_cy + 6.0:.2f}" stroke="{OUTLINE}" stroke-opacity=".66" stroke-width="1.2" stroke-linecap="round"/>')
    out.append(f'<line x1="{offset_x + cx - 14.0:.2f}" y1="{offset_y + 98.0 - bob + yoff:.2f}" x2="{offset_x + cx + 14.0:.2f}" y2="{offset_y + 98.0 - bob + yoff:.2f}" stroke="{GOLD}" stroke-width="1.5"/>')
    return "\n".join(out)


def _refine_svg(svg: str) -> str:
    """Second-pass polish shared by generated runtime atlases.

    Keep this deliberately boring and deterministic: these replacements trim
    the old chunky/tank-like silhouette without introducing a second asset
    authoring path.
    """
    replacements = (
        ('rx="21" ry="3.0"', 'rx="18.5" ry="2.6"'),
        ('stroke-width="7.2"', 'stroke-width="5.9"'),
        ('stroke-width="4.8"', 'stroke-width="3.9"'),
        ('stroke-width="6.4"', 'stroke-width="5.2"'),
        ('stroke-width="4.0"', 'stroke-width="3.25"'),
        ('stroke-width="7.0"', 'stroke-width="5.7"'),
        ('stroke-width="4.4"', 'stroke-width="3.55"'),
        ('stroke-width="6.0"', 'stroke-width="4.9"'),
        ('stroke-width="3.7"', 'stroke-width="3.0"'),
        ('r="4.6"', 'r="4.15"'),
        ('r="3.5"', 'r="3.15"'),
        ('rx="13.5" ry="15.5"', 'rx="11.9" ry="14.1"'),
    )
    for old, new in replacements:
        svg = svg.replace(old, new)
    return svg


def _atlas_svg(team: dict[str, str], keeper: bool = False) -> str:
    rows = len(ANIMATIONS)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CELL_W * COLUMNS}" height="{CELL_H * rows}" viewBox="0 0 {CELL_W * COLUMNS} {CELL_H * rows}">',
        '<g shape-rendering="geometricPrecision">',
    ]
    for row, (animation, _, _) in enumerate(ANIMATIONS):
        for frame in range(COLUMNS):
            parts.append(_frame_svg(team, animation, frame, frame * CELL_W, row * CELL_H, keeper=keeper))
    parts.append("</g></svg>")
    return _refine_svg("\n".join(parts) + "\n")


def build_outputs() -> dict[str, str]:
    outputs: dict[str, str] = {}
    atlas_meta: dict[str, dict[str, str]] = {}
    for slug, team in TEAMS.items():
        filename = f"{slug}_atlas.svg"
        svg = _atlas_svg(team)
        outputs[filename] = svg
        atlas_meta[slug] = {"name": team["name"], "file": filename}
    for slug, team in KEEPERS.items():
        filename = f"{slug}_atlas.svg"
        svg = _atlas_svg(team, keeper=True)
        outputs[filename] = svg
        atlas_meta[slug] = {"name": team["name"], "file": filename}
    manifest = {
        "version": 4,
        "quality_contract": SPRITE_FORGE_CONTRACT["quality_contract"],
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
    outputs["manifest.json"] = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
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
    print(
        "chess-football sprite forge: OK "
        f"({len(expected)} files, shared contract schema "
        f"{SPRITE_FORGE_CONTRACT['schema']})"
    )


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
