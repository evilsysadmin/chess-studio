#!/usr/bin/env python3
"""Static, dependency-free contracts for the PR-staging-only V2 art pipeline.

These checks do not pretend to replace a Blender render or runtime Hans test.
"""
from __future__ import annotations

import ast
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts/blender/build_war_room_premium.py"
WORKFLOW = ROOT / ".github/workflows/war-room-blender-art.yml"


def calls_in(function: ast.FunctionDef) -> list[ast.Call]:
    return [n for n in ast.walk(function) if isinstance(n, ast.Call)]


class V2RoomArchitectureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BUILDER.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source, filename=str(BUILDER))
        cls.funcs = {x.name: x for x in cls.tree.body if isinstance(x, ast.FunctionDef)}
        cls.constants = {}
        for node in cls.tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                if node.targets[0].id.startswith("V2_HANS_"):
                    cls.constants[node.targets[0].id] = ast.literal_eval(node.value)

    def test_one_hearth_and_no_secondary_fire_assets_are_built(self):
        created = set()
        for name in ("add_room", "add_gothic_canon_v2", "build_hans_service_v2"):
            for node in calls_in(self.funcs[name]):
                if isinstance(node.func, ast.Name) and node.func.id in {"cube", "cylinder", "sphere", "torus", "light", "anchor"}:
                    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                        created.add(node.args[0].value)
        self.assertIn("WR_FIREPLACE_body", created)
        self.assertIn("WR_CANON_campaign_cabinet_body", created)
        self.assertFalse(any(name.startswith("WR_CANON_right_fireplace_") for name in created))
        self.assertNotIn("WR_CANON_right_fire_light", created)
        self.assertNotIn("WR_ANCHOR_right_fireplace_practical", created)
        authored = ast.get_source_segment(self.source, self.funcs["add_gothic_canon_v2"])
        self.assertNotIn('add_fireplace_blockwork("right"', authored)

    def test_real_gap_in_structural_wall_and_clear_service_doorway(self):
        names = set()
        for call in calls_in(self.funcs["add_room"]):
            if isinstance(call.func, ast.Name) and call.func.id == "cube" and call.args:
                first = call.args[0]
                if isinstance(first, ast.Constant) and isinstance(first.value, str):
                    names.add(first.value)
        self.assertTrue({"WR_ARCH_left_wall", "WR_ARCH_left_wall_back", "WR_ARCH_left_wall_over_door"} <= names)
        y0 = self.constants["V2_HANS_DOOR_Y0"]
        y1 = self.constants["V2_HANS_DOOR_Y1"]
        height = self.constants["V2_HANS_DOOR_HEIGHT"]
        self.assertGreaterEqual(y1 - y0, 1.5)
        self.assertGreaterEqual(height, 2.2)
        self.assertLess(y0, y1)
        self.assertLess(height, 6.7)

    def test_hans_hinge_swing_and_corridor_are_authored(self):
        y0 = self.constants["V2_HANS_DOOR_Y0"]
        y1 = self.constants["V2_HANS_DOOR_Y1"]
        hinge_x, hinge_y = self.constants["V2_HANS_HINGE"]
        depth = self.constants["V2_HANS_ALCOVE_DEPTH"]
        yaw = self.constants["V2_HANS_OPEN_YAW"]
        self.assertGreater(hinge_y, y0)
        self.assertLess(hinge_y, y1)
        # Leaf swings into the depth of the alcove, not into the board.
        free_x = hinge_x + math.sin(yaw) * (hinge_y - y0 - 0.065)
        self.assertGreater(free_x, -8.86 - depth)
        self.assertLess(free_x, -8.86)
        anchors = dict(self.constants["V2_HANS_ANCHORS"])
        self.assertTrue({"WR_ANCHOR_hans_hearth", "WR_ANCHOR_hans_door", "WR_ANCHOR_hans_basket",
                         "WR_ANCHOR_hans_tools", "WR_ANCHOR_hans_corridor_0",
                         "WR_ANCHOR_hans_corridor_1", "WR_ANCHOR_hans_corridor_2"} <= set(anchors))
        self.assertTrue(y0 < anchors["WR_ANCHOR_hans_door"][1] < y1)

    def test_runtime_keeps_door_dynamic_and_exports_hans_anchors(self):
        source = self.source
        self.assertIn('leaf["war_room_runtime_dynamic"] = "v2-hans-door"', source)
        self.assertIn('leaf.name = "WR_HANS_door_leaf"', source)
        self.assertIn('patch_v2_hans_door_extras(path)', source)
        self.assertIn('patch_v2_hans_door_extras', self.funcs)
        self.assertIn('V2_HANS_ANCHORS', ast.get_source_segment(source, self.funcs["export_shell"]))
        self.assertIn('runtime V2 GLB contains retired second hearth', source)

    def test_v2_pr_publish_is_staging_only_and_runtime_remains_manual(self):
        yaml = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", yaml)
        self.assertIn("pull_request:", yaml)
        self.assertIn("'scripts/blender/build_war_room_premium.py'", yaml)
        self.assertNotIn("push:", yaml)
        self.assertIn("github.event.pull_request.head.sha", yaml)
        self.assertIn("github.event.pull_request.head.repo.full_name == github.repository", yaml)
        self.assertIn("github.event_name == 'pull_request' && 'staging' || inputs.channel", yaml)
        self.assertIn("Refuse runtime publication outside main", yaml)
        self.assertIn('if: inputs.channel == \'runtime\'', yaml)


if __name__ == "__main__":
    unittest.main()
