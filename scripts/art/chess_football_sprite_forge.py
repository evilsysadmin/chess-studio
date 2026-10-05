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
    stride = math.sin(phase)
    pose = {"bob": 0.0, "lean": 0.0, "arm_l": 0.0, "arm_r": 0.0, "leg_l": 0.0, "leg_r": 0.0, "yoff": 0.0, "crouch": 0.0, "twist": 0.0}
    if animation == "idle":
        pose["bob"] = stride * 0.8
        pose["arm_l"] = stride * 1.2
        pose["arm_r"] = -pose["arm_l"]
        pose["twist"] = stride * 0.7
    elif animation == "run":
        pose.update(bob=abs(stride) * 1.6, lean=3.0, arm_l=stride * 14.0, arm_r=-stride * 14.0, leg_l=-stride * 18.0, leg_r=stride * 18.0, twist=stride * 1.8)
    elif animation == "sprint":
        pose.update(bob=abs(stride) * 2.2, lean=6.0, arm_l=stride * 19.0, arm_r=-stride * 19.0, leg_l=-stride * 25.0, leg_r=stride * 25.0, twist=stride * 2.6)
    else:
        t = frame / 7.0
        k = math.sin(math.pi * t)
        if animation == "pass":
            pose.update(bob=1.4 * k, lean=5.0 * k, leg_r=28.0 * k - 3.0, leg_l=-5.0 * k, arm_l=-10.0 * k, arm_r=12.0 * k, twist=2.0 * k)
        elif animation == "shoot":
            pose.update(bob=2.2 * k, lean=11.0 * k, leg_r=40.0 * k - 5.0, leg_l=-8.0 * k, arm_l=-16.0 * k, arm_r=18.0 * k, twist=3.0 * k)
        elif animation == "tackle":
            pose.update(yoff=2.5 * k, crouch=7.0 * k, lean=16.0 * k, leg_r=38.0 * k, leg_l=-18.0 * k, arm_l=-18.0 * k, arm_r=13.0 * k, twist=3.0 * k)
        elif animation == "celebrate":
            pose.update(yoff=-9.0 * k, bob=1.2 * k, arm_l=-27.0 * k - 8.0, arm_r=27.0 * k + 8.0, twist=stride * 1.4)
            pose["leg_l"] = -6.0 * math.sin(2.0 * phase)
            pose["leg_r"] = -pose["leg_l"]
    return pose


def _frame_svg(team: dict[str, str], animation: str, frame: int, offset_x: int, offset_y: int, keeper: bool = False) -> str:
    p = _pose(animation, frame)
    bob = p["bob"]
    lean = p["lean"]
    yoff = p["yoff"]
    crouch = p["crouch"]
    cx = 56.0 + lean
    foot = float(FOOTLINE) + yoff
    head_cy = 34.0 - bob + yoff + crouch * 0.42
    hip_y = 93.0 - bob + yoff + crouch * 0.34
    shoulder_y = 60.0 - bob + yoff + crouch * 0.58

    def point(x: float, y: float) -> str:
        return f"{offset_x + x:.2f},{offset_y + y:.2f}"

    out: list[str] = []
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + foot + 1.0:.2f}" rx="16.5" ry="2.2" fill="#000" opacity=".20"/>')

    for side, stride in ((-1.0, p["leg_l"]), (1.0, p["leg_r"])):
        hip_x = cx + side * 7.2 + p["twist"] * 0.18
        foot_x = cx + side * 8.5 + stride
        knee_x = hip_x + stride * 0.50 - side * 1.1
        knee_y = hip_y + 15.0 - min(abs(stride) * 0.13, 4.0)
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + knee_x:.2f}" y2="{offset_y + knee_y:.2f}" stroke="{OUTLINE}" stroke-width="5.0" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + hip_x:.2f}" y1="{offset_y + hip_y:.2f}" x2="{offset_x + knee_x:.2f}" y2="{offset_y + knee_y:.2f}" stroke="{team["torso_dark"]}" stroke-width="3.15" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{OUTLINE}" stroke-width="4.4" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 5.0:.2f}" stroke="{IVORY}" stroke-width="2.65" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + knee_x:.2f}" y1="{offset_y + knee_y + 6.0:.2f}" x2="{offset_x + foot_x:.2f}" y2="{offset_y + foot - 8.0:.2f}" stroke="{team["torso"]}" stroke-width="1.35" stroke-linecap="round" opacity=".86"/>')
        out.append(f'<rect x="{offset_x + foot_x - 5.6:.2f}" y="{offset_y + foot - 6.0:.2f}" width="12.0" height="5.8" rx="2.4" fill="{BOOT}" stroke="{GOLD}" stroke-width=".75"/>')

    for side, amount in ((-1.0, p["arm_l"]), (1.0, p["arm_r"])):
        sx = cx + side * 14.7 - p["twist"] * 0.30
        sy = shoulder_y
        ex = cx + side * 22.0 + amount * 0.72
        ey = 80.0 - bob + yoff + crouch * 0.52 - amount * 0.50
        elbow_x = sx + (ex - sx) * 0.50
        elbow_y = sy + (ey - sy) * 0.50
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + elbow_x:.2f}" y2="{offset_y + elbow_y:.2f}" stroke="{OUTLINE}" stroke-width="4.9" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + sx:.2f}" y1="{offset_y + sy:.2f}" x2="{offset_x + elbow_x:.2f}" y2="{offset_y + elbow_y:.2f}" stroke="{team["torso_light"]}" stroke-width="3.0" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + elbow_x:.2f}" y1="{offset_y + elbow_y:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{OUTLINE}" stroke-width="4.2" stroke-linecap="round"/>')
        out.append(f'<line x1="{offset_x + elbow_x:.2f}" y1="{offset_y + elbow_y:.2f}" x2="{offset_x + ex:.2f}" y2="{offset_y + ey:.2f}" stroke="{team["head"]}" stroke-width="2.55" stroke-linecap="round"/>')
        out.append(f'<circle cx="{offset_x + ex:.2f}" cy="{offset_y + ey:.2f}" r="{3.7 if keeper else 2.75}" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width=".85"/>')

    top_y = 59.0 - bob + yoff + crouch * 0.58
    rib_y = 70.0 - bob + yoff + crouch * 0.46
    waist_y = 85.0 - bob + yoff + crouch * 0.30
    base_y = 94.0 - bob + yoff + crouch * 0.18
    body = (
        (cx - 14.5, top_y), (cx - 16.2, rib_y), (cx - 11.4, waist_y), (cx - 13.6, base_y),
        (cx + 13.6, base_y), (cx + 11.4, waist_y), (cx + 16.2, rib_y), (cx + 14.5, top_y),
    )
    out.append(f'<polygon points="{" ".join(point(x, y) for x, y in body)}" fill="{team["torso"]}" stroke="{OUTLINE}" stroke-width="1.5" stroke-linejoin="round"/>')
    out.append(f'<polygon points="{point(cx + 2.5, top_y + 2.0)} {point(cx + 14.1, top_y + 2.0)} {point(cx + 12.2, waist_y)} {point(cx + 7.2, base_y - 1.0)}" fill="{team["torso_dark"]}" opacity=".30"/>')
    out.append(f'<polygon points="{point(cx - 11.8, waist_y + 1.0)} {point(cx + 11.8, waist_y + 1.0)} {point(cx + 12.2, base_y + 5.0)} {point(cx - 12.2, base_y + 5.0)}" fill="{team["torso_dark"]}" stroke="{OUTLINE}" stroke-width="1.05"/>')
    out.append(f'<path d="M {point(cx - 5.0, top_y + 2.0)} L {point(cx, top_y + 8.0)} L {point(cx + 5.0, top_y + 2.0)}" fill="none" stroke="{IVORY}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<line x1="{offset_x + cx - 11.0:.2f}" y1="{offset_y + top_y + 7.0:.2f}" x2="{offset_x + cx + 9.0:.2f}" y2="{offset_y + waist_y + 2.0:.2f}" stroke="#fff" stroke-opacity=".88" stroke-width="2.7"/>')
    badge_y = 76.0 - bob + yoff + crouch * 0.40
    out.append(f'<polygon points="{point(cx, badge_y - 3.2)} {point(cx + 3.2, badge_y)} {point(cx, badge_y + 3.2)} {point(cx - 3.2, badge_y)}" fill="{GOLD}" stroke="{OUTLINE}" stroke-width=".6"/>')

    neck_y = 50.0 - bob + yoff + crouch * 0.46
    out.append(f'<rect x="{offset_x + cx - 4.5:.2f}" y="{offset_y + neck_y:.2f}" width="9" height="10" rx="3.5" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.0"/>')
    out.append(f'<ellipse cx="{offset_x + cx:.2f}" cy="{offset_y + head_cy:.2f}" rx="10.8" ry="12.9" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.5"/>')
    out.append(f'<path d="M {offset_x + cx - 9.4:.2f} {offset_y + head_cy - 5.0:.2f} Q {offset_x + cx:.2f} {offset_y + head_cy - 13.2:.2f} {offset_x + cx + 9.0:.2f} {offset_y + head_cy - 4.2:.2f}" fill="{team["hair"]}" stroke="{OUTLINE}" stroke-width="1.0"/>')
    out.append(f'<circle cx="{offset_x + cx - 3.8:.2f}" cy="{offset_y + head_cy - 1.2:.2f}" r="1.0" fill="{OUTLINE}"/>')
    out.append(f'<circle cx="{offset_x + cx + 3.8:.2f}" cy="{offset_y + head_cy - 1.2:.2f}" r="1.0" fill="{OUTLINE}"/>')
    out.append(f'<line x1="{offset_x + cx - 2.3:.2f}" y1="{offset_y + head_cy + 5.0:.2f}" x2="{offset_x + cx + 3.2:.2f}" y2="{offset_y + head_cy + 5.0:.2f}" stroke="{OUTLINE}" stroke-opacity=".62" stroke-width="1.0" stroke-linecap="round"/>')
    out.append(f'<line x1="{offset_x + cx - 11.5:.2f}" y1="{offset_y + base_y + 5.0:.2f}" x2="{offset_x + cx + 11.5:.2f}" y2="{offset_y + base_y + 5.0:.2f}" stroke="{GOLD}" stroke-width="1.25"/>')
    return "\n".join(out)


def _refine_svg(svg: str) -> str:
    """v5 authoring is explicit; keep the hook as a deterministic no-op."""
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
        "version": 5,
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
        f"({len(expected)} files, "
        f"{SPRITE_FORGE_CONTRACT['surface']}/"
        f"{SPRITE_FORGE_CONTRACT['variant']}, "
        f"shared contract schema {SPRITE_FORGE_CONTRACT['schema']})"
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
