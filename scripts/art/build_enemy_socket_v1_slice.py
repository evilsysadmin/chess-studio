#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path("/tmp/pawn-slug-v1-slice")
BODY = ROOT / "body-import.png"
WEAPON = ROOT / "weapon-import.png"
SOCKETS = ROOT / "socket-contract.json"
CLEAN = ROOT / "enemy-pawn-smg-v1-clean.png"
DEBUG = ROOT / "enemy-pawn-smg-v1-debug.png"
REPORT = ROOT / "slice-report.json"

FRAME_W = 256
FRAME_H = 350
BODY_Y = 52
ORIGIN = (128, 180)
SMG_REGION = (256, 0, 512, 128)
WEAPON_SCALE = 0.34


def _point(origin: tuple[int, int], offset: list[float]) -> tuple[float, float]:
    return origin[0] + float(offset[0]), origin[1] + float(offset[1])


def _diamond(draw: ImageDraw.ImageDraw, xy: tuple[float, float], radius: int, fill: tuple[int, int, int, int]) -> None:
    x, y = xy
    draw.polygon(
        [(x - radius, y), (x, y - radius), (x + radius, y), (x, y + radius)],
        fill=fill,
    )


def main() -> int:
    body = Image.open(BODY).convert("RGBA")
    if body.getchannel("A").getbbox() is None:
        raise SystemExit("body fixture has empty alpha")
    weapon_atlas = Image.open(WEAPON).convert("RGBA")
    if weapon_atlas.getchannel("A").getbbox() is None:
        raise SystemExit("weapon fixture has empty alpha")
    payload = json.loads(SOCKETS.read_text(encoding="utf-8"))
    sockets = payload["frames"]
    if len(sockets) != 8:
        raise SystemExit(f"expected 8 socket frames, got {len(sockets)}")

    smg = weapon_atlas.crop(SMG_REGION)
    smg = smg.resize(
        (round(smg.width * WEAPON_SCALE), round(smg.height * WEAPON_SCALE)),
        Image.Resampling.LANCZOS,
    )

    clean = Image.new("RGBA", (FRAME_W * 8, FRAME_H), (12, 14, 18, 255))
    debug = clean.copy()
    draw = ImageDraw.Draw(debug)
    report = {"schema": 1, "frames": [], "fixture_only": True}

    for frame, socket in enumerate(sockets):
        panel_x = frame * FRAME_W
        body_cell = body.crop((panel_x, 0, panel_x + FRAME_W, 256))
        clean.alpha_composite(body_cell, (panel_x, BODY_Y))
        debug.alpha_composite(body_cell, (panel_x, BODY_Y))

        anchor = _point((panel_x + ORIGIN[0], ORIGIN[1]), socket["anchor"])
        rotated = smg.rotate(
            float(socket["angle"]),
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        top_left = (
            round(anchor[0] - rotated.width / 2),
            round(anchor[1] - rotated.height / 2),
        )
        weapon_box = (
            top_left[0],
            top_left[1],
            top_left[0] + rotated.width,
            top_left[1] + rotated.height,
        )
        panel_box = (panel_x, 0, panel_x + FRAME_W, FRAME_H)
        clipped = (
            weapon_box[0] < panel_box[0]
            or weapon_box[1] < panel_box[1]
            or weapon_box[2] > panel_box[2]
            or weapon_box[3] > panel_box[3]
        )
        if clipped:
            raise SystemExit(f"weapon clipped in frame {frame}: {weapon_box}")

        clean.alpha_composite(rotated, top_left)
        debug.alpha_composite(rotated, top_left)

        rear = _point((panel_x + ORIGIN[0], ORIGIN[1]), socket["rear"])
        front = _point((panel_x + ORIGIN[0], ORIGIN[1]), socket["front"])
        muzzle = _point((panel_x + ORIGIN[0], ORIGIN[1]), socket["muzzle"])
        draw.line([rear, front], fill=(87, 235, 197, 235), width=2)
        _diamond(draw, anchor, 4, (255, 189, 56, 255))
        _diamond(draw, rear, 3, (87, 235, 197, 255))
        _diamond(draw, front, 3, (87, 235, 197, 255))
        _diamond(draw, muzzle, 4, (255, 87, 77, 255))
        draw.text((panel_x + 8, 326), f"frame {frame:02d}", fill=(220, 226, 237, 255))

        report["frames"].append(
            {
                "frame": frame,
                "anchor": socket["anchor"],
                "rear": socket["rear"],
                "front": socket["front"],
                "muzzle": socket["muzzle"],
                "angle": socket["angle"],
                "weapon_box": list(weapon_box),
                "clipped": clipped,
            }
        )

    clean.save(CLEAN, "PNG", compress_level=9)
    debug.save(DEBUG, "PNG", compress_level=9)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("OK enemy socket v1 compositor: clean + debug PNGs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
