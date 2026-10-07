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
    "fc_matthias": {
        "name": "FC Matthias",
        "torso": "#245fc2",
        "torso_dark": "#102f70",
        "torso_light": "#5b8de4",
        "shorts": "#112a5f",
        "sock": "#e9edf7",
        "head": "#e7dec4",
        "hair": "#6d4b31",
        "hair_style": "swept",
    },
    "real_enroque": {
        "name": "Real Enroque",
        "torso": "#ad2936",
        "torso_dark": "#5a121e",
        "torso_light": "#d85b66",
        "shorts": "#53141d",
        "sock": "#f0e7d3",
        "head": "#885f45",
        "hair": "#251b19",
        "hair_style": "crop",
    },
}
KEEPERS = {
    "fc_matthias_keeper": {
        "name": "FC Matthias · Portero",
        "torso": "#16856d",
        "torso_dark": "#0a493d",
        "torso_light": "#45b99d",
        "shorts": "#0b5144",
        "sock": "#eaf0e7",
        "head": "#e7dec4",
        "hair": "#6d4b31",
        "hair_style": "swept",
        "glove": "#f2f0df",
    },
    "real_enroque_keeper": {
        "name": "Real Enroque · Portero",
        "torso": "#ce861f",
        "torso_dark": "#70420c",
        "torso_light": "#efb64f",
        "shorts": "#65400e",
        "sock": "#efe8d1",
        "head": "#885f45",
        "hair": "#251b19",
        "hair_style": "crop",
        "glove": "#f4d86a",
    },
}
GOLD = "#d4aa4c"
IVORY = "#ece6cf"
BOOT = "#15181d"
OUTLINE = "#11151b"


def _pose(animation: str, frame: int) -> dict[str, float]:
    phase = 2.0 * math.pi * frame / COLUMNS
    stride = math.sin(phase)
    lift = abs(stride)
    pose = {
        "bob": 0.0,
        "lean": 0.0,
        "arm_l": 0.0,
        "arm_r": 0.0,
        "leg_l": 0.0,
        "leg_r": 0.0,
        "lift_l": 0.0,
        "lift_r": 0.0,
        "yoff": 0.0,
        "crouch": 0.0,
        "twist": 0.0,
        "head": 0.0,
        "sway": 0.0,
        "support_bend": 0.0,
        "strike_fold": 0.0,
    }
    if animation == "idle":
        pose.update(
            bob=stride * 0.75,
            arm_l=stride * 1.3,
            arm_r=-stride * 1.3,
            leg_l=-stride * 1.0,
            leg_r=stride * 1.0,
            twist=stride * 0.75,
            head=stride * 0.45,
            sway=math.cos(phase) * 0.35,
        )
    elif animation == "run":
        pose.update(
            bob=lift * 1.65,
            lean=4.7,
            arm_l=stride * 16.0,
            arm_r=-stride * 16.0,
            leg_l=-stride * 15.0,
            leg_r=stride * 15.0,
            lift_l=max(0.0, stride) * 8.4 + max(0.0, math.cos(phase)) * 1.2,
            lift_r=max(0.0, -stride) * 8.4 + max(0.0, -math.cos(phase)) * 1.2,
            twist=stride * 3.0,
            head=-1.2 + math.cos(phase) * 0.35,
            sway=math.cos(phase) * 1.30,
        )
    elif animation == "sprint":
        pose.update(
            bob=lift * 2.25,
            lean=7.6,
            arm_l=stride * 21.0,
            arm_r=-stride * 21.0,
            leg_l=-stride * 20.0,
            leg_r=stride * 20.0,
            lift_l=max(0.0, stride) * 11.2 + max(0.0, math.cos(phase)) * 1.7,
            lift_r=max(0.0, -stride) * 11.2 + max(0.0, -math.cos(phase)) * 1.7,
            twist=stride * 4.1,
            head=-2.0 + math.cos(phase) * 0.45,
            sway=math.cos(phase) * 1.75,
        )
    else:
        t = frame / max(COLUMNS - 1, 1)
        k = math.sin(math.pi * t)
        wind = math.sin(math.pi * min(t * 1.22, 1.0))
        follow = math.sin(math.pi * max((t - 0.34) / 0.66, 0.0))
        if animation == "pass":
            pose.update(
                bob=1.0 * k,
                lean=2.0 * wind + 4.2 * follow,
                crouch=2.4 * k,
                leg_l=-4.0 * k,
                leg_r=-16.0 * wind + 29.0 * follow,
                lift_r=7.5 * wind + 5.0 * follow,
                arm_l=-13.0 * wind + 7.0 * follow,
                arm_r=15.0 * wind - 10.0 * follow,
                twist=-3.5 * wind + 6.0 * follow,
                head=-0.5 * wind - 1.3 * follow,
                sway=-1.8 * wind + 1.2 * follow,
                support_bend=4.0 * k,
                strike_fold=5.0 * wind,
            )
        elif animation == "shoot":
            pose.update(
                bob=1.8 * k,
                lean=3.0 * wind + 10.0 * follow,
                crouch=4.2 * k,
                leg_l=-6.0 * k,
                leg_r=-24.0 * wind + 44.0 * follow,
                lift_r=11.0 * wind + 8.0 * follow,
                arm_l=-18.0 * wind + 10.0 * follow,
                arm_r=22.0 * wind - 15.0 * follow,
                twist=-5.5 * wind + 9.0 * follow,
                head=-0.8 * wind - 2.2 * follow,
                sway=-3.0 * wind + 1.5 * follow,
                support_bend=6.0 * k,
                strike_fold=7.0 * wind,
            )
        elif animation == "tackle":
            pose.update(
                yoff=4.0 * k,
                crouch=12.0 * k,
                lean=12.0 * k,
                leg_l=-17.0 * k,
                leg_r=35.0 * k,
                lift_l=2.0 * k,
                arm_l=-20.0 * k,
                arm_r=14.0 * k,
                twist=5.0 * k,
                head=-2.4 * k,
            )
        elif animation == "celebrate":
            pose.update(
                yoff=-10.0 * k,
                bob=1.0 * k,
                arm_l=-31.0 * k - 8.0,
                arm_r=31.0 * k + 8.0,
                leg_l=-6.0 * math.sin(2.0 * phase),
                leg_r=6.0 * math.sin(2.0 * phase),
                lift_l=3.0 * k,
                lift_r=3.0 * k,
                twist=math.sin(phase) * 1.6,
                head=-1.0 * k,
            )
    return pose


def _path(points: list[tuple[float, float]], offset_x: int, offset_y: int, close: bool = True) -> str:
    if not points:
        return ""
    head = f"M {offset_x + points[0][0]:.2f} {offset_y + points[0][1]:.2f}"
    tail = " ".join(
        f"L {offset_x + x:.2f} {offset_y + y:.2f}"
        for x, y in points[1:]
    )
    return f"{head} {tail}{' Z' if close else ''}"


def _limb_path(
    start: tuple[float, float],
    end: tuple[float, float],
    start_half_width: float,
    end_half_width: float,
) -> list[tuple[float, float]]:
    ax, ay = start
    bx, by = end
    dx = bx - ax
    dy = by - ay
    length = max(math.hypot(dx, dy), 0.001)
    nx = -dy / length
    ny = dx / length
    return [
        (ax + nx * start_half_width, ay + ny * start_half_width),
        (bx + nx * end_half_width, by + ny * end_half_width),
        (bx - nx * end_half_width, by - ny * end_half_width),
        (ax - nx * start_half_width, ay - ny * start_half_width),
    ]


def _frame_svg(
    team: dict[str, str],
    animation: str,
    frame: int,
    offset_x: int,
    offset_y: int,
    keeper: bool = False,
) -> str:
    p = _pose(animation, frame)
    if keeper and animation == "idle":
        p = dict(p)
        p["crouch"] += 3.2
        p["arm_l"] -= 5.0
        p["arm_r"] += 5.0
        p["leg_l"] -= 3.4
        p["leg_r"] += 3.4
        p["yoff"] += 0.8
    bob = p["bob"]
    lean = p["lean"]
    yoff = p["yoff"]
    crouch = p["crouch"]

    cx = CELL_W * 0.5 + lean + p["sway"]
    foot = float(FOOTLINE) + yoff
    hip_y = 93.0 - bob + yoff + crouch * 0.34
    shoulder_y = 58.4 - bob + yoff + crouch * 0.58
    torso_turn = 2.6 + p["twist"] * 0.28
    head_cx = cx + 2.8 + p["head"]
    head_cy = 34.8 - bob + yoff + crouch * 0.40

    out: list[str] = []

    shadow_width = 19.0 if animation in ("sprint", "shoot", "tackle") else 17.2
    shadow_x = cx + (4.0 if animation in ("run", "sprint", "shoot") else 1.0)
    out.append(
        f'<ellipse cx="{offset_x + shadow_x:.2f}" cy="{offset_y + foot + 1.0:.2f}" '
        f'rx="{shadow_width:.1f}" ry="2.4" fill="#000" opacity=".20"/>'
    )

    # V9 alternates which leg is in front during locomotion. V8 kept the same
    # screen-side leg in front for the whole cycle, which made run/sprint read
    # like a flat puppet even when the stride itself was asymmetric.
    locomotion = animation in ("run", "sprint")
    ball_action = animation in ("pass", "shoot")
    right_leg_near = p["leg_r"] >= p["leg_l"] if locomotion else True
    legs = [
        (-1.0, p["leg_l"], p["lift_l"], right_leg_near),
        (1.0, p["leg_r"], p["lift_r"], not right_leg_near),
    ]
    legs.sort(key=lambda item: 0 if item[3] else 1)
    for side, stride, lift_amount, far in legs:
        hip_spread = 5.5 if locomotion else (6.0 if ball_action else 6.6)
        foot_spread = 5.9 if locomotion else (6.4 if ball_action else 7.4)
        hip_x = cx + side * hip_spread + p["twist"] * (0.13 if far else 0.25)
        foot_x = cx + side * foot_spread + stride
        foot_y = foot - lift_amount
        knee_x = (
            hip_x
            + stride * (0.50 if locomotion else 0.44)
            + (-0.45 if far else 0.75)
        )
        knee_y = (
            hip_y
            + 16.5
            - min(abs(stride) * 0.15, 5.0)
            - lift_amount * 0.42
        )
        if ball_action and side < 0.0:
            knee_x += p["support_bend"] * 0.72
            knee_y -= p["support_bend"] * 0.18
        elif ball_action and side > 0.0:
            knee_x += p["strike_fold"] * 0.78
            knee_y -= p["strike_fold"] * 0.52
        opacity = ".76" if far and locomotion else (".84" if far else "1")
        thigh = _limb_path(
            (hip_x, hip_y + 1.0),
            (knee_x, knee_y),
            4.5 if far else 5.1,
            3.8 if far else 4.2,
        )
        shin = _limb_path(
            (knee_x, knee_y + 1.0),
            (foot_x, foot_y - 5.6),
            3.4 if far else 3.8,
            2.7 if far else 3.0,
        )
        out.append(
            f'<path d="{_path(thigh, offset_x, offset_y)}" '
            f'fill="{team["head"]}" '
            f'stroke="{OUTLINE}" stroke-width="1.35" opacity="{opacity}"/>'
        )
        out.append(
            f'<circle cx="{offset_x + knee_x:.2f}" cy="{offset_y + knee_y:.2f}" '
            f'r="2.8" fill="{team["head"]}" stroke="{OUTLINE}" '
            f'stroke-width=".85" opacity="{opacity}"/>'
        )
        out.append(
            f'<path d="{_path(shin, offset_x, offset_y)}" '
            f'fill="{team["sock"]}" stroke="{OUTLINE}" '
            f'stroke-width="1.25" opacity="{opacity}"/>'
        )
        out.append(
            f'<line x1="{offset_x + knee_x - 2.2:.2f}" y1="{offset_y + knee_y + 5.3:.2f}" '
            f'x2="{offset_x + knee_x + 2.4:.2f}" y2="{offset_y + knee_y + 5.1:.2f}" '
            f'stroke="{team["torso_light"]}" stroke-width="1.25" opacity="{opacity}"/>'
        )

        toe = 1.0 if stride >= -3.0 else -1.0
        if ball_action and side < 0.0:
            toe = 1.0
        boot_tilt = 0.0
        if ball_action and side > 0.0:
            boot_tilt = max(-3.5, min(4.5, stride * 0.10))
        boot = [
            (foot_x - 4.9, foot_y - 5.8),
            (foot_x + 4.2, foot_y - 5.4),
            (foot_x + 8.6 * toe, foot_y - 2.1 - boot_tilt),
            (foot_x + 7.2 * toe, foot_y + 0.2 - boot_tilt * 0.60),
            (foot_x - 5.7, foot_y - 0.4),
        ]
        out.append(
            f'<path d="{_path(boot, offset_x, offset_y)}" '
            f'fill="{BOOT}" stroke="{OUTLINE}" stroke-width="1.15" opacity="{opacity}"/>'
        )
        out.append(
            f'<path d="M {offset_x + foot_x - 0.8:.2f} {offset_y + foot_y - 3.1:.2f} '
            f'L {offset_x + foot_x + 4.4 * toe:.2f} {offset_y + foot_y - 2.4:.2f}" '
            f'stroke="{GOLD}" stroke-width=".95" opacity="{opacity}"/>'
        )

    # Arms alternate depth opposite the leading leg. This is the main V9
    # parallax cue: as one knee comes forward, the counter-swinging arm also
    # crosses in front instead of both limb layers staying permanently fixed.
    arm_geometry: list[tuple[float, float, float, float, float, float, bool]] = []
    left_arm_near = right_leg_near if locomotion else False
    arms = [
        (-1.0, p["arm_l"], not left_arm_near),
        (1.0, p["arm_r"], left_arm_near),
    ]
    arms.sort(key=lambda item: 0 if item[2] else 1)
    for side, amount, far in arms:
        shoulder_span = 15.0 if keeper else 13.8
        sx = cx + side * shoulder_span - p["twist"] * 0.23
        sy = shoulder_y + (1.0 if far else -0.6)
        hand_x = (
            cx
            + side * (18.7 if locomotion else 20.0)
            + amount * (0.78 if locomotion else 0.72)
            + (-1.0 if far else 2.0)
        )
        hand_y = 79.0 - bob + yoff + crouch * 0.50 - amount * 0.48
        elbow_x = sx + (hand_x - sx) * 0.56 - side * 3.0
        elbow_y = sy + (hand_y - sy) * 0.50 + 4.5
        arm_geometry.append((sx, sy, elbow_x, elbow_y, hand_x, hand_y, far))
        if far:
            sleeve_ratio = 0.62 if keeper else 0.34
            sleeve_x = sx + (elbow_x - sx) * sleeve_ratio
            sleeve_y = sy + (elbow_y - sy) * sleeve_ratio
            sleeve = _limb_path((sx, sy), (sleeve_x, sleeve_y), 3.8, 3.35)
            upper_skin = _limb_path((sleeve_x, sleeve_y), (elbow_x, elbow_y), 3.15, 2.8)
            fore = _limb_path((elbow_x, elbow_y), (hand_x, hand_y), 2.9, 2.3)
            out.append(
                f'<path d="{_path(sleeve, offset_x, offset_y)}" '
                f'fill="{team["torso_dark"]}" stroke="{OUTLINE}" '
                f'stroke-width="1.15" opacity=".84"/>'
            )
            out.append(
                f'<path d="{_path(upper_skin, offset_x, offset_y)}" '
                f'fill="{team["head"]}" stroke="{OUTLINE}" '
                f'stroke-width="1.05" opacity=".84"/>'
            )
            out.append(
                f'<path d="{_path(fore, offset_x, offset_y)}" '
                f'fill="{team["head"]}" stroke="{OUTLINE}" '
                f'stroke-width="1.10" opacity=".84"/>'
            )
            out.append(
                f'<circle cx="{offset_x + hand_x:.2f}" cy="{offset_y + hand_y:.2f}" '
                f'r="{4.2 if keeper else 3.0}" '
                f'fill="{team.get("glove", team["head"]) if keeper else team["head"]}" '
                f'stroke="{OUTLINE}" stroke-width=".95" opacity=".84"/>'
            )

    # Shirt uses curves instead of the old octagonal chest. Asymmetry is
    # intentional: the player now reads as three-quarter footballer rather than
    # a perfectly frontal paper doll.
    top_y = 55.8 - bob + yoff + crouch * 0.58
    waist_y = 84.2 - bob + yoff + crouch * 0.30
    base_y = 96.0 - bob + yoff + crouch * 0.18
    left_sh = cx - (14.8 if keeper else 13.6) - torso_turn * 0.15
    right_sh = cx + (18.5 if keeper else 17.3) + torso_turn * 0.20
    torso = (
        f"M {offset_x + left_sh:.2f} {offset_y + top_y + 3.0:.2f} "
        f"Q {offset_x + cx - 2.0:.2f} {offset_y + top_y - 4.2:.2f} "
        f"{offset_x + right_sh:.2f} {offset_y + top_y + 2.0:.2f} "
        f"Q {offset_x + cx + 19.0:.2f} {offset_y + 69.0 - bob + yoff:.2f} "
        f"{offset_x + cx + 12.4:.2f} {offset_y + waist_y:.2f} "
        f"L {offset_x + cx + 14.0:.2f} {offset_y + base_y:.2f} "
        f"Q {offset_x + cx + 1.8:.2f} {offset_y + base_y + 4.8:.2f} "
        f"{offset_x + cx - 12.4:.2f} {offset_y + base_y:.2f} "
        f"L {offset_x + cx - 10.7:.2f} {offset_y + waist_y:.2f} "
        f"Q {offset_x + cx - 16.8:.2f} {offset_y + 69.5 - bob + yoff:.2f} "
        f"{offset_x + left_sh:.2f} {offset_y + top_y + 3.0:.2f} Z"
    )
    out.append(
        f'<path d="{torso}" fill="{team["torso"]}" '
        f'stroke="{OUTLINE}" stroke-width="1.75"/>'
    )
    out.append(
        f'<path d="M {offset_x + cx + 2.0:.2f} {offset_y + top_y + 0.8:.2f} '
        f'Q {offset_x + cx + 16.0:.2f} {offset_y + 66.0 - bob + yoff:.2f} '
        f'{offset_x + cx + 8.5:.2f} {offset_y + base_y - 1.0:.2f}" '
        f'fill="none" stroke="{team["torso_light"]}" stroke-width="4.2" '
        f'opacity=".30" stroke-linecap="round"/>'
    )
    out.append(
        f'<path d="M {offset_x + cx - 7.0:.2f} {offset_y + top_y + 1.3:.2f} '
        f'L {offset_x + cx - 1.0:.2f} {offset_y + top_y + 7.8:.2f} '
        f'L {offset_x + cx + 5.6:.2f} {offset_y + top_y + 1.0:.2f}" '
        f'fill="none" stroke="{IVORY}" stroke-width="1.7" stroke-linecap="round"/>'
    )
    out.append(
        f'<path d="M {offset_x + cx - 10.4:.2f} {offset_y + top_y + 8.0:.2f} '
        f'L {offset_x + cx + 9.6:.2f} {offset_y + waist_y + 1.8:.2f}" '
        f'stroke="#fff" stroke-opacity=".88" stroke-width="2.5"/>'
    )

    shorts = [
        (cx - 12.6, waist_y - 0.5),
        (cx + 12.0, waist_y - 0.5),
        (cx + 14.2, base_y + 6.7),
        (cx + 2.4, base_y + 5.6),
        (cx, base_y + 2.4),
        (cx - 2.4, base_y + 5.6),
        (cx - 13.7, base_y + 6.5),
    ]
    out.append(
        f'<path d="{_path(shorts, offset_x, offset_y)}" '
        f'fill="{team["shorts"]}" stroke="{OUTLINE}" stroke-width="1.35"/>'
    )
    out.append(
        f'<line x1="{offset_x + cx - 11.6:.2f}" y1="{offset_y + waist_y + 1.9:.2f}" '
        f'x2="{offset_x + cx + 10.8:.2f}" y2="{offset_y + waist_y + 1.9:.2f}" '
        f'stroke="{GOLD}" stroke-width="1.15" opacity=".82"/>'
    )
    badge_y = 73.8 - bob + yoff + crouch * 0.40
    out.append(
        f'<path d="M {offset_x + cx + 5.8:.2f} {offset_y + badge_y - 3.2:.2f} '
        f'L {offset_x + cx + 9.0:.2f} {offset_y + badge_y:.2f} '
        f'L {offset_x + cx + 5.8:.2f} {offset_y + badge_y + 3.3:.2f} '
        f'L {offset_x + cx + 2.6:.2f} {offset_y + badge_y:.2f} Z" '
        f'fill="{GOLD}" stroke="{OUTLINE}" stroke-width=".65"/>'
    )

    for sx, sy, elbow_x, elbow_y, hand_x, hand_y, far in arm_geometry:
        if far:
            continue
        sleeve_ratio = 0.64 if keeper else 0.36
        sleeve_x = sx + (elbow_x - sx) * sleeve_ratio
        sleeve_y = sy + (elbow_y - sy) * sleeve_ratio
        sleeve = _limb_path((sx, sy), (sleeve_x, sleeve_y), 4.1, 3.55)
        upper_skin = _limb_path((sleeve_x, sleeve_y), (elbow_x, elbow_y), 3.3, 3.0)
        fore = _limb_path((elbow_x, elbow_y), (hand_x, hand_y), 3.1, 2.4)
        out.append(
            f'<path d="{_path(sleeve, offset_x, offset_y)}" '
            f'fill="{team["torso_light"]}" stroke="{OUTLINE}" stroke-width="1.25"/>'
        )
        out.append(
            f'<path d="{_path(upper_skin, offset_x, offset_y)}" '
            f'fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.12"/>'
        )
        out.append(
            f'<path d="{_path(fore, offset_x, offset_y)}" '
            f'fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.15"/>'
        )
        out.append(
            f'<circle cx="{offset_x + hand_x:.2f}" cy="{offset_y + hand_y:.2f}" '
            f'r="{4.5 if keeper else 3.1}" '
            f'fill="{team.get("glove", team["head"]) if keeper else team["head"]}" '
            f'stroke="{OUTLINE}" stroke-width="1.0"/>'
        )
        if keeper:
            out.append(
                f'<path d="M {offset_x + hand_x - 3.2:.2f} {offset_y + hand_y:.2f} '
                f'L {offset_x + hand_x + 3.0:.2f} {offset_y + hand_y:.2f}" '
                f'stroke="{team["torso_dark"]}" stroke-width=".85" opacity=".75"/>'
            )

    # V10 retains the V8 face proportions and V9 locomotion. This iteration
    # concentrates on planted support, strike-leg folding and follow-through.
    neck_y = 49.4 - bob + yoff + crouch * 0.45
    out.append(
        f'<path d="M {offset_x + cx - 3.1:.2f} {offset_y + neck_y:.2f} '
        f'L {offset_x + cx + 4.1:.2f} {offset_y + neck_y - 0.2:.2f} '
        f'L {offset_x + cx + 4.4:.2f} {offset_y + neck_y + 7.1:.2f} '
        f'L {offset_x + cx - 2.8:.2f} {offset_y + neck_y + 7.3:.2f} Z" '
        f'fill="{team["head"]}" stroke="{OUTLINE}" stroke-width=".95"/>'
    )
    out.append(
        f'<path d="M {offset_x + cx - 5.0:.2f} {offset_y + neck_y + 4.8:.2f} '
        f'L {offset_x + cx + 5.5:.2f} {offset_y + neck_y + 4.6:.2f} '
        f'L {offset_x + cx + 6.2:.2f} {offset_y + neck_y + 8.7:.2f} '
        f'L {offset_x + cx - 5.6:.2f} {offset_y + neck_y + 8.9:.2f} Z" '
        f'fill="{team["torso_dark"]}" stroke="{OUTLINE}" stroke-width=".8"/>'
    )

    head_scale = 0.91
    def hx(delta: float) -> float:
        return offset_x + head_cx + delta * head_scale

    def hy(delta: float) -> float:
        return offset_y + head_cy + delta * head_scale

    head = (
        f"M {hx(-8.1):.2f} {hy(-9.9):.2f} "
        f"Q {hx(0.5):.2f} {hy(-13.7):.2f} "
        f"{hx(8.0):.2f} {hy(-7.8):.2f} "
        f"Q {hx(10.7):.2f} {hy(-0.6):.2f} "
        f"{hx(7.4):.2f} {hy(8.5):.2f} "
        f"Q {hx(0.3):.2f} {hy(12.6):.2f} "
        f"{hx(-6.4):.2f} {hy(8.1):.2f} "
        f"Q {hx(-9.5):.2f} {hy(0.2):.2f} "
        f"{hx(-8.1):.2f} {hy(-9.9):.2f} Z"
    )
    out.append(
        f'<path d="{head}" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width="1.45"/>'
    )
    out.append(
        f'<ellipse cx="{hx(-8.0):.2f}" cy="{hy(0.0):.2f}" '
        f'rx="1.65" ry="2.35" fill="{team["head"]}" stroke="{OUTLINE}" stroke-width=".7"/>'
    )
    out.append(
        f'<path d="M {hx(7.3):.2f} {hy(-1.0):.2f} '
        f'L {hx(9.9):.2f} {hy(1.0):.2f} '
        f'L {hx(7.4):.2f} {hy(1.9):.2f}" '
        f'fill="{team["head"]}" stroke="{OUTLINE}" stroke-width=".7"/>'
    )

    hair_style = team.get("hair_style", "swept")
    if hair_style == "crop":
        out.append(
            f'<path d="M {hx(-7.6):.2f} {hy(-5.9):.2f} '
            f'Q {hx(-2.2):.2f} {hy(-12.3):.2f} {hx(6.8):.2f} {hy(-8.2):.2f} '
            f'L {hx(7.2):.2f} {hy(-5.7):.2f} '
            f'Q {hx(1.7):.2f} {hy(-7.2):.2f} {hx(-3.8):.2f} {hy(-4.6):.2f} '
            f'Q {hx(-6.2):.2f} {hy(-3.5):.2f} {hx(-7.6):.2f} {hy(-5.9):.2f} Z" '
            f'fill="{team["hair"]}" stroke="{OUTLINE}" stroke-width=".9"/>'
        )
    else:
        out.append(
            f'<path d="M {hx(-7.5):.2f} {hy(-5.6):.2f} '
            f'Q {hx(-1.8):.2f} {hy(-13.3):.2f} {hx(7.2):.2f} {hy(-7.4):.2f} '
            f'Q {hx(3.8):.2f} {hy(-8.4):.2f} {hx(0.6):.2f} {hy(-6.0):.2f} '
            f'L {hx(3.0):.2f} {hy(-3.9):.2f} '
            f'Q {hx(-2.0):.2f} {hy(-5.3):.2f} {hx(-7.5):.2f} {hy(-5.6):.2f} Z" '
            f'fill="{team["hair"]}" stroke="{OUTLINE}" stroke-width=".9"/>'
        )

    out.append(
        f'<path d="M {hx(1.3):.2f} {hy(-3.8):.2f} '
        f'Q {hx(4.2):.2f} {hy(-4.6):.2f} {hx(6.0):.2f} {hy(-3.4):.2f}" '
        f'fill="none" stroke="{OUTLINE}" stroke-width=".95" stroke-linecap="round" opacity=".78"/>'
    )
    out.append(
        f'<ellipse cx="{hx(3.8):.2f}" cy="{hy(-1.3):.2f}" '
        f'rx="1.05" ry=".82" fill="{OUTLINE}"/>'
    )
    out.append(
        f'<path d="M {hx(2.5):.2f} {hy(4.7):.2f} '
        f'Q {hx(4.7):.2f} {hy(5.5):.2f} {hx(6.4):.2f} {hy(4.0):.2f}" '
        f'fill="none" stroke="{OUTLINE}" stroke-width=".82" '
        f'stroke-linecap="round" opacity=".68"/>'
    )
    out.append(
        f'<path d="M {hx(-2.0):.2f} {hy(7.3):.2f} '
        f'Q {hx(1.4):.2f} {hy(9.0):.2f} {hx(5.1):.2f} {hy(7.1):.2f}" '
        f'fill="none" stroke="{team["torso_dark"]}" stroke-width=".72" '
        f'stroke-linecap="round" opacity=".32"/>'
    )

    return "\n".join(out)


def _atlas_svg(team: dict[str, str], keeper: bool = False) -> str:
    rows = len(ANIMATIONS)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CELL_W * COLUMNS}" '
        f'height="{CELL_H * rows}" viewBox="0 0 {CELL_W * COLUMNS} {CELL_H * rows}">',
        '<g shape-rendering="geometricPrecision">',
    ]
    for row, (animation, _, _) in enumerate(ANIMATIONS):
        for frame in range(COLUMNS):
            parts.append(
                _frame_svg(
                    team,
                    animation,
                    frame,
                    frame * CELL_W,
                    row * CELL_H,
                    keeper=keeper,
                )
            )
    parts.append("</g></svg>")
    return "\n".join(parts) + "\n"


def build_outputs() -> dict[str, str]:
    outputs: dict[str, str] = {}
    atlas_meta: dict[str, dict[str, str]] = {}
    for slug, team in TEAMS.items():
        filename = f"{slug}_atlas.svg"
        outputs[filename] = _atlas_svg(team)
        atlas_meta[slug] = {"name": team["name"], "file": filename}
    for slug, team in KEEPERS.items():
        filename = f"{slug}_atlas.svg"
        outputs[filename] = _atlas_svg(team, keeper=True)
        atlas_meta[slug] = {"name": team["name"], "file": filename}
    manifest = {
        "version": 10,
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
