#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

ACTIONS = [
    ("idle", 8, 8.0, True),
    ("walk", 8, 12.0, True),
    ("run", 8, 16.0, True),
    ("jump", 8, 12.0, False),
    ("fall", 8, 10.0, True),
    ("land", 8, 14.0, False),
    ("shoot", 8, 18.0, False),
    ("shoot_up", 8, 18.0, False),
    ("shoot_down", 8, 18.0, False),
    ("shoot_diag_up", 8, 18.0, False),
    ("shoot_diag_up_alt", 8, 18.0, False),
    ("shoot_diag_down", 8, 18.0, False),
    ("shoot_crouch", 8, 18.0, False),
    ("crouch", 8, 8.0, True),
    ("crouch_walk", 8, 10.0, True),
    ("reload", 8, 12.0, False),
    ("hurt", 8, 14.0, False),
    ("die", 8, 10.0, False),
]

ENEMY_ACTIONS = [
    ("idle", 8, 6.0, True),
    ("run", 8, 10.0, True),
    ("shoot", 8, 12.0, False),
    ("hurt", 8, 8.0, False),
    ("die", 8, 8.0, False),
]


def empty_sockets(count: int) -> list[dict]:
    return [
        {
            "weapon_anchor": [0, 0],
            "rear_hand": [0, 0],
            "front_hand": [0, 0],
            "muzzle": [0, 0],
            "angle_degrees": 0,
            "scale": 1.0,
            "z": "front",
        }
        for _ in range(count)
    ]


def contract_for(bank: dict) -> dict:
    strategy = bank["strategy"]
    actor = bank["actor"]
    weapon = bank["weapon"]
    if strategy == "weapon-layer":
        return {
            "schema": 1,
            "quality_contract": "sprite-forge-v1",
            "actor": actor,
            "weapon": weapon,
            "composition": strategy,
            "cell": {"width": 256, "height": 128},
            "parts": {"main": {"columns": 4, "rows": 1}},
            "animations": [{
                "name": "weapons",
                "part": "main",
                "row": 0,
                "fps": 1,
                "loop": False,
                "authored_frames": 4,
                "slots": [0, 1, 2, 3],
            }],
        }

    actions = ENEMY_ACTIONS if strategy == "socketed-body" else ACTIONS
    cell = {"width": 320, "height": 416} if strategy == "socketed-body" else {"width": 416, "height": 416}
    animations = []
    for row, (name, frames, fps, loop) in enumerate(actions):
        item = {
            "name": name,
            "part": "main",
            "row": row,
            "fps": fps,
            "loop": loop,
            "authored_frames": frames,
            "slots": list(range(frames)),
        }
        if strategy == "socketed-body":
            item["sockets"] = empty_sockets(frames)
        animations.append(item)
    body_parity = (
        {
            "family": "matthias-v1",
            "reference_weapon": "pistol",
            "animations": ["idle", "run", "crouch"],
            "core_x_min_ratio": 0.34,
            "core_x_max_ratio": 0.64,
            "min_core_height_ratio": 0.95,
            "max_core_height_ratio": 1.05,
            "min_core_area_ratio": 0.88,
            "max_core_area_ratio": 1.18,
            "max_spread_extra": 0.04,
        }
        if actor == "matthias" and strategy == "integrated"
        else None
    )
    return {
        "schema": 1,
        "quality_contract": "sprite-forge-v1",
        "actor": actor,
        "weapon": weapon,
        "composition": strategy,
        "body_parity": body_parity,
        "socket_quality": ({
            "min_hand_separation_px": 6.0,
            "max_hand_separation_px": 72.0,
            "max_hand_to_anchor_px": 44.0,
            "min_muzzle_forward_px": 12.0,
            "max_anchor_delta_px": 10.0,
            "max_angle_delta_degrees": 10.0,
            "max_scale_delta": 0.15,
        } if strategy == "socketed-body" else {}),
        "cell": cell,
        "parts": {"main": {"columns": 8, "rows": len(actions)}},
        "animations": animations,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("catalog", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for bank in catalog["banks"]:
        contract = contract_for(bank)
        path = args.output_dir / f'{bank["id"]}.json'
        path.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f'generated {len(catalog["banks"])} v1 contracts')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
