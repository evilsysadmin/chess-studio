#!/usr/bin/env python3
"""Build truthful side-by-side diagnostic from actual Blender animation frames."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

CLIPS = ("Idle_Gun", "Gun_Shoot", "Run_Shoot", "Walk", "Death")


def build(folder: Path) -> Path:
    report = json.loads((folder / "motion-report.json").read_text())
    if report["promotable"] or report["two_hand_rifle_contact_verified"]:
        raise ValueError("unreviewed-two-hand-claim")
    sheet = Image.new("RGB", (5 * 286 + 16, 2 * 407 + 92), (11, 20, 29))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 15), "CHESSCOM // V54 REAL BONE POSES — CONTACT QA", fill=(221, 174, 97))
    draw.text((20, 37),
              "5 actual source clips • 2 different frames each • CC0 rig with V53 kit",
              fill=(174, 197, 208))
    draw.text((20, 57),
              "REVIEW ONLY — Rifle two-hand IK / contact is NOT verified",
              fill=(232, 149, 115))
    for col, clip in enumerate(CLIPS):
        pose = report["poses"][clip]
        for row, sample in enumerate(pose["samples"]):
            with Image.open(folder / sample["image"]) as img:
                img.load()
                rgba = img.convert("RGBA")
            if rgba.size != (256, 384) or rgba.getchannel("A").getbbox() is None:
                raise ValueError("bad-motion-image:" + sample["image"])
            x, y = 17 + col * 286, 89 + row * 407
            draw.rounded_rectangle((x - 4, y - 4, x + 260, y + 396), radius=8,
                                   fill=(27, 37, 46), outline=(62, 82, 93))
            sheet.paste(rgba, (x, y), rgba)
            draw.text((x + 8, y + 365), clip + " • " + str(sample["frame"]),
                      fill=(235, 213, 172))
            draw.text((x + 8, y + 382),
                      "hands %.2fm" % sample["hand_separation_m"],
                      fill=(172, 189, 197))
    output = folder / "animation-contact.png"
    sheet.save(output, optimize=True)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    print(build(parser.parse_args().output_dir))
