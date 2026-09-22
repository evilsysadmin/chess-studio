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

MATTHIAS_BODY_BANK = "matthias-body-v1"
MATTHIAS_WEAPON_BANK = "matthias-weapons-v1"

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
    bank_id = bank["id"]
    strategy = bank["strategy"]
    actor = bank["actor"]
    weapon = bank["weapon"]

    if strategy == "weapon-layer":
        weapon_names = bank.get("weapons", [])
        if not isinstance(weapon_names, list) or not weapon_names:
            raise ValueError(f"{bank_id}: weapon-layer requires a non-empty weapons list")
        if any(not isinstance(name, str) or not name for name in weapon_names):
            raise ValueError(f"{bank_id}: weapon-layer names must be non-empty strings")
        if len(weapon_names) != len(set(weapon_names)):
            raise ValueError(f"{bank_id}: duplicate weapon-layer names")
        is_matthias = bank_id == MATTHIAS_WEAPON_BANK
        cell = {"width": 416, "height": 256} if is_matthias else {"width": 256, "height": 128}
        return {
            "schema": 1,
            "quality_contract": "sprite-forge-v1",
            "actor": actor,
            "weapon": weapon,
            "composition": strategy,
            "cell": cell,
            "parts": {"main": {"columns": len(weapon_names), "rows": 1}},
            "animations": [{
                "name": "weapons",
                "part": "main",
                "row": 0,
                "fps": 1,
                "loop": False,
                "authored_frames": len(weapon_names),
                "slots": list(range(len(weapon_names))),
            }],
        }

    is_matthias_body = bank_id == MATTHIAS_BODY_BANK
    if strategy == "socketed-body":
        actions = ACTIONS if is_matthias_body else ENEMY_ACTIONS
        cell = {"width": 416, "height": 416} if is_matthias_body else {"width": 320, "height": 416}
    else:
        actions = ACTIONS
        cell = {"width": 416, "height": 416}
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
    return {
        "schema": 1,
        "quality_contract": "sprite-forge-v1",
        "actor": actor,
        "weapon": weapon,
        "composition": strategy,
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


def self_test() -> None:
    body = contract_for({
        "id": MATTHIAS_BODY_BANK,
        "actor": "matthias",
        "weapon": "none",
        "strategy": "socketed-body",
    })
    assert body["composition"] == "socketed-body"
    assert body["cell"] == {"width": 416, "height": 416}
    assert len(body["animations"]) == len(ACTIONS) == 18
    assert all(len(item["sockets"]) == 8 for item in body["animations"])

    weapons = contract_for({
        "id": MATTHIAS_WEAPON_BANK,
        "actor": "matthias",
        "weapon": "shared",
        "strategy": "weapon-layer",
        "weapons": ["pistol", "machinegun", "shotgun", "panzerfaust"],
    })
    assert weapons["cell"] == {"width": 416, "height": 256}
    assert weapons["parts"]["main"]["columns"] == 4
    assert weapons["animations"][0]["authored_frames"] == 4

    enemy = contract_for({
        "id": "enemy-pawn-body-v1",
        "actor": "enemy-pawn",
        "weapon": "none",
        "strategy": "socketed-body",
    })
    assert enemy["cell"] == {"width": 320, "height": 416}
    assert len(enemy["animations"]) == len(ENEMY_ACTIONS) == 5

    try:
        contract_for({
            "id": "broken-weapons",
            "actor": "broken",
            "weapon": "shared",
            "strategy": "weapon-layer",
            "weapons": [],
        })
    except ValueError as exc:
        assert "non-empty weapons list" in str(exc)
    else:
        raise AssertionError("empty weapon layer must fail closed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("catalog", type=Path, nargs="?")
    parser.add_argument("output_dir", type=Path, nargs="?")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("Pawn Slug v1 contract generator self-test: OK")
        return 0

    if args.catalog is None or args.output_dir is None:
        parser.error("catalog and output_dir are required unless --self-test is used")

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
