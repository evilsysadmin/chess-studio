#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from sprite_forge import (
    BankContractError,
    FixedScaleContract,
    GeometryContract,
    GeometryError,
    LintConfig,
    PlacementContract,
    SocketQualityContract,
    TemporalContract,
    geometry_metrics,
    lint_frame,
    normalize_frame,
    normalize_fixed_scale_frame,
    place_frame_fixed_scale,
    validate_geometry,
    validate_sequence,
    validate_socket_sequence,
    build_bank,
    audit_sprite_batch,
    repair_sprite_parity,
    repair_matthias_stabilization_batch,
    repair_matthias_machinegun_hurt_alpha_v2,
)


def clean_frame() -> Image.Image:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((20, 10, 44, 52), radius=6, fill=(180, 120, 80, 255))
    return image


def frame_with_digit(digit: int) -> Image.Image:
    image = clean_frame()
    draw = ImageDraw.Draw(image)
    rects = {
        "a": (28, 55, 34, 56),
        "b": (34, 55, 35, 59),
        "c": (34, 59, 35, 63),
        "d": (28, 62, 34, 63),
        "e": (27, 59, 28, 63),
        "f": (27, 55, 28, 59),
        "g": (28, 58, 34, 60),
    }
    segments = {
        0: "abcdef",
        1: "bc",
        2: "abdeg",
        3: "abcdg",
        4: "bcfg",
        5: "acdfg",
        6: "acdefg",
        7: "abc",
    }
    for name in segments[digit]:
        draw.rectangle(rects[name], fill=(255, 255, 255, 255))
    return image


class SpriteForgeRawLintTests(unittest.TestCase):
    def test_clean_single_component_passes(self) -> None:
        result = lint_frame(clean_frame())
        self.assertTrue(result.ok, result.errors)
        self.assertEqual(result.detached_components, ())

    def test_known_frame_number_regression_0_to_7_is_rejected(self) -> None:
        for digit in range(8):
            with self.subTest(digit=digit):
                result = lint_frame(frame_with_digit(digit))
                self.assertFalse(result.ok)
                self.assertTrue(
                    any(
                        error.startswith("orphan-components:")
                        for error in result.errors
                    ),
                    result.errors,
                )

    def test_explicit_detached_exception_is_bounded(self) -> None:
        image = clean_frame()
        ImageDraw.Draw(image).rectangle(
            (50, 20, 53, 23),
            fill=(255, 220, 120, 255),
        )
        self.assertFalse(lint_frame(image).ok)
        allowed = lint_frame(
            image,
            LintConfig(allowed_detached_components=1),
        )
        self.assertTrue(allowed.ok, allowed.errors)

    def test_hidden_rgb_under_zero_alpha_is_rejected(self) -> None:
        image = clean_frame()
        image.putpixel((5, 5), (255, 0, 0, 0))
        result = lint_frame(image)
        self.assertFalse(result.ok)
        self.assertIn("hidden-rgb:1", result.errors)

    def test_edge_contact_is_rejected(self) -> None:
        image = clean_frame()
        ImageDraw.Draw(image).rectangle(
            (0, 30, 3, 33),
            fill=(255, 255, 255, 255),
        )
        result = lint_frame(image)
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("edge-contact:") for error in result.errors)
        )


class SpriteForgeGeometryTests(unittest.TestCase):
    def contract(self) -> GeometryContract:
        return GeometryContract(
            canvas_size=(96, 96),
            body_height=48,
            body_center_x=48.0,
            foot_y=80.0,
            alpha_centroid_x=48.0,
            safe_margin_px=8,
            foot_tolerance_px=1.0,
            height_tolerance_px=2.0,
            centroid_tolerance_px=2.0,
        )

    def test_normalize_uses_body_scale_center_and_foot_anchor(self) -> None:
        source = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle(
            (24, 12, 39, 43),
            fill=(180, 120, 80, 255),
        )
        normalized = normalize_frame(source, self.contract())
        result = validate_geometry(normalized, self.contract())
        self.assertTrue(result.ok, result.errors)
        metrics = geometry_metrics(normalized)
        self.assertIsNotNone(metrics)
        self.assertAlmostEqual(metrics.foot_y, 80.0, delta=1.0)
        self.assertAlmostEqual(metrics.body_center_x, 48.0, delta=1.0)

    def test_normalize_does_not_create_resample_orphans(self) -> None:
        source = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        # One connected, jagged silhouette with thin diagonal limbs. This is the
        # shape class that exposed LANCZOS alpha ringing on canonical sprites.
        draw.ellipse((25, 10, 39, 25), fill=(180, 120, 80, 255))
        draw.polygon(
            [(29, 24), (37, 24), (42, 45), (36, 51), (31, 38), (25, 52), (20, 48), (27, 29)],
            fill=(180, 120, 80, 255),
        )
        draw.line((27, 30, 15, 42), fill=(180, 120, 80, 255), width=3)
        draw.line((37, 30, 49, 39), fill=(180, 120, 80, 255), width=3)

        normalized = normalize_frame(source, self.contract())
        lint = lint_frame(
            normalized,
            LintConfig(edge_guard_px=0, min_detached_area=1),
        )
        self.assertTrue(lint.ok, lint.errors)
        self.assertEqual(len(lint.components), 1)

    def test_normalize_refuses_to_clip_allowed_detached_component(self) -> None:
        source = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.rectangle(
            (30, 20, 45, 51),
            fill=(180, 120, 80, 255),
        )
        draw.rectangle(
            (88, 28, 92, 32),
            fill=(255, 220, 120, 255),
        )
        config = LintConfig(allowed_detached_components=1)
        with self.assertRaisesRegex(GeometryError, "would-clip"):
            normalize_frame(source, self.contract(), config)

    def test_geometry_rejects_foot_drift(self) -> None:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle(
            (36, 27, 59, 74),
            fill=(180, 120, 80, 255),
        )
        result = validate_geometry(image, self.contract())
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("foot:") for error in result.errors)
        )

    def test_geometry_uses_centroid_as_independent_anchor(self) -> None:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            (36, 32, 59, 79),
            fill=(180, 120, 80, 255),
        )
        draw.rectangle(
            (58, 40, 80, 60),
            fill=(180, 120, 80, 255),
        )
        result = validate_geometry(image, self.contract())
        self.assertFalse(result.ok)
        self.assertTrue(
            any(
                error.startswith("centroid-x:")
                for error in result.errors
            ),
            result.errors,
        )


class SpriteForgeFixedScalePlacementTests(unittest.TestCase):
    def contract(self, scale: float = 2.5) -> PlacementContract:
        return PlacementContract(
            canvas_size=(416, 416),
            scale=scale,
            body_center_x=208.0,
            foot_y=382.0,
            safe_margin_px=10,
        )

    def test_horizontal_pose_preserves_explicit_scale(self) -> None:
        source = Image.new("RGBA", (160, 100), (0, 0, 0, 0))
        ImageDraw.Draw(source).rounded_rectangle(
            (20, 35, 133, 85),
            radius=12,
            fill=(180, 120, 80, 255),
        )
        placed = place_frame_fixed_scale(source, self.contract())
        metrics = geometry_metrics(placed)
        self.assertIsNotNone(metrics)
        self.assertAlmostEqual(metrics.foot_y, 382.0, delta=2.0)
        self.assertAlmostEqual(metrics.body_center_x, 208.0, delta=3.0)
        self.assertAlmostEqual(
            metrics.body_height,
            51 * 2.5,
            delta=3.0,
        )

    def test_fixed_scale_refuses_horizontal_width_clipping(self) -> None:
        source = Image.new("RGBA", (140, 80), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle(
            (5, 25, 134, 70),
            fill=(180, 120, 80, 255),
        )
        with self.assertRaisesRegex(GeometryError, "would-clip"):
            place_frame_fixed_scale(source, self.contract(scale=3.2))

    def test_fixed_scale_includes_allowed_detached_content_in_clip_check(self) -> None:
        source = Image.new("RGBA", (160, 100), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.rectangle((60, 30, 99, 80), fill=(180, 120, 80, 255))
        draw.rectangle((157, 40, 159, 42), fill=(255, 220, 120, 255))
        config = LintConfig(
            edge_guard_px=0,
            allowed_detached_components=1,
        )
        with self.assertRaisesRegex(GeometryError, "would-clip"):
            place_frame_fixed_scale(
                source,
                self.contract(scale=2.5),
                config,
            )

    def test_fixed_scale_bicubic_does_not_create_alpha_orphans(self) -> None:
        source = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        draw = ImageDraw.Draw(source)
        draw.ellipse((31, 8, 48, 26), fill=(180, 120, 80, 255))
        draw.polygon(
            [(34, 25), (45, 25), (53, 58), (45, 66), (39, 48), (31, 66), (24, 61), (32, 32)],
            fill=(180, 120, 80, 255),
        )
        draw.line((33, 34, 16, 49), fill=(180, 120, 80, 255), width=3)
        placed = place_frame_fixed_scale(source, self.contract(scale=2.3))
        lint = lint_frame(
            placed,
            LintConfig(edge_guard_px=0, min_detached_area=1),
        )
        self.assertTrue(lint.ok, lint.errors)
        self.assertEqual(len(lint.components), 1)


class SpriteForgeFixedScaleTests(unittest.TestCase):
    def test_fixed_scale_preserves_pose_ratio_and_footline(self) -> None:
        source = Image.new("RGBA", (80, 60), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle(
            (10, 20, 69, 49),
            fill=(180, 120, 80, 255),
        )
        out = normalize_fixed_scale_frame(
            source,
            FixedScaleContract(
                canvas_size=(240, 180),
                scale=2.0,
                center_x=120.0,
                foot_y=160.0,
                safe_margin_px=8,
            ),
            LintConfig(edge_guard_px=0),
        )
        bbox = out.getchannel("A").getbbox()
        self.assertIsNotNone(bbox)
        assert bbox is not None
        self.assertAlmostEqual(bbox[2] - bbox[0], 120, delta=3)
        self.assertAlmostEqual(bbox[3] - bbox[1], 60, delta=3)
        self.assertAlmostEqual(bbox[3], 160, delta=2)
        post = lint_frame(out, LintConfig(edge_guard_px=0))
        self.assertTrue(
            post.ok,
            f"fixed-scale output must remain one clean silhouette: {post.errors}",
        )

    def test_fixed_scale_refuses_clipping(self) -> None:
        source = Image.new("RGBA", (100, 60), (0, 0, 0, 0))
        ImageDraw.Draw(source).rectangle(
            (5, 10, 94, 49),
            fill=(180, 120, 80, 255),
        )
        with self.assertRaisesRegex(GeometryError, "would-clip-fixed"):
            normalize_fixed_scale_frame(
                source,
                FixedScaleContract(
                    canvas_size=(180, 180),
                    scale=2.0,
                    center_x=90.0,
                    foot_y=160.0,
                    safe_margin_px=8,
                ),
                LintConfig(edge_guard_px=0),
            )


class SpriteForgeTemporalTests(unittest.TestCase):
    def frame(
        self,
        x: int = 32,
        y: int = 28,
        w: int = 24,
        h: int = 48,
    ) -> Image.Image:
        image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle(
            (x, y, x + w - 1, y + h - 1),
            fill=(180, 120, 80, 255),
        )
        return image

    def test_stable_sequence_passes(self) -> None:
        frames = [
            self.frame(x=32 + shift)
            for shift in (0, 1, 2, 3)
        ]
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=4,
                max_centroid_delta_px=3.0,
                loop=True,
            ),
        )
        self.assertTrue(result.ok, result.errors)

    def test_accidental_duplicate_is_rejected(self) -> None:
        frames = [
            self.frame(x=32),
            self.frame(x=33),
            self.frame(x=33),
        ]
        result = validate_sequence(
            frames,
            TemporalContract(expected_frames=3),
        )
        self.assertFalse(result.ok)
        self.assertIn("duplicate-frame:2==1", result.errors)

    def test_declared_hold_can_repeat_previous_frame(self) -> None:
        frames = [
            self.frame(x=32),
            self.frame(x=33),
            self.frame(x=33),
        ]
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=3,
                allowed_hold_indices=(2,),
            ),
        )
        self.assertTrue(result.ok, result.errors)

    def test_sudden_foot_jump_is_rejected(self) -> None:
        frames = [
            self.frame(y=28),
            self.frame(y=38),
        ]
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=2,
                max_foot_delta_px=4.0,
            ),
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(
                error.startswith("foot-jump:")
                for error in result.errors
            ),
            result.errors,
        )

    def test_scale_and_area_jump_are_rejected(self) -> None:
        frames = [
            self.frame(w=24, h=48),
            self.frame(w=40, h=64),
        ]
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=2,
                max_height_delta_px=4.0,
                max_width_delta_px=4.0,
                max_area_ratio_delta=0.10,
            ),
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(
                error.startswith("height-jump:")
                for error in result.errors
            )
        )
        self.assertTrue(
            any(
                error.startswith("area-jump:")
                for error in result.errors
            )
        )

    def test_loop_seam_is_checked(self) -> None:
        frames = [
            self.frame(x=20),
            self.frame(x=30),
            self.frame(x=40),
        ]
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=3,
                max_centroid_delta_px=15.0,
                loop=True,
            ),
        )
        self.assertTrue(
            any(
                error.startswith("centroid-jump:2->0")
                for error in result.errors
            ),
            result.errors,
        )


class SpriteForgeCompilerTests(unittest.TestCase):
    def _write_frame(self, path: Path, x: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle(
            (x, 12, x + 19, 51),
            fill=(180, 120, 80, 255),
        )
        image.save(path, "PNG", optimize=False, compress_level=9)

    def _contract(self) -> dict:
        return {
            "schema": 1,
            "quality_contract": "sprite-forge-v1",
            "actor": "matthias",
            "weapon": "testgun",
            "cell": {"width": 64, "height": 64},
            "parts": {
                "main": {"columns": 4, "rows": 2},
                "run13": {"columns": 3, "rows": 1},
            },
            "animations": [
                {
                    "name": "idle",
                    "part": "main",
                    "row": 0,
                    "fps": 8,
                    "loop": True,
                    "authored_frames": 2,
                    "slots": [0, 1, 0, 1],
                },
                {
                    "name": "hurt",
                    "part": "main",
                    "row": 1,
                    "fps": 16,
                    "loop": False,
                    "authored_frames": 2,
                    "slots": [0, 1, 1, 1],
                },
                {
                    "name": "run_high_fidelity",
                    "part": "run13",
                    "row": 0,
                    "fps": 26,
                    "loop": True,
                    "authored_frames": 3,
                    "slots": [0, 1, 2],
                },
            ],
        }

    def _fixture(self, root: Path) -> tuple[Path, Path]:
        frames = root / "frames"
        for name, xs in {
            "idle": (20, 21),
            "hurt": (19, 22),
            "run_high_fidelity": (18, 20, 22),
        }.items():
            for index, x in enumerate(xs):
                self._write_frame(frames / name / f"{index:03d}.png", x)
        contract = root / "contract.json"
        contract.write_text(
            json.dumps(self._contract(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return contract, frames

    def test_build_is_byte_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            contract, frames = self._fixture(root)
            left = root / "left"
            right = root / "right"
            first = build_bank(contract, frames, left)
            second = build_bank(contract, frames, right)
            self.assertEqual(first, second)
            self.assertEqual(
                (left / "manifest.json").read_bytes(),
                (right / "manifest.json").read_bytes(),
            )
            for part in ("main.png", "run13.png"):
                self.assertEqual(
                    (left / part).read_bytes(),
                    (right / part).read_bytes(),
                )

    def test_manifest_distinguishes_authored_frames_from_stored_slots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            contract, frames = self._fixture(root)
            manifest = build_bank(contract, frames, root / "out")
            hurt = next(
                animation
                for animation in manifest["animations"]
                if animation["name"] == "hurt"
            )
            self.assertEqual(hurt["authored_frames"], 2)
            self.assertEqual(hurt["stored_frames"], 4)
            self.assertEqual(hurt["slots"], [0, 1, 1, 1])

    def test_bad_slot_reference_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            contract, frames = self._fixture(root)
            data = json.loads(contract.read_text(encoding="utf-8"))
            data["animations"][0]["slots"] = [0, 2]
            contract.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(BankContractError, "missing authored frame 2"):
                build_bank(contract, frames, root / "out")

    def test_duplicate_part_row_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            contract, frames = self._fixture(root)
            data = json.loads(contract.read_text(encoding="utf-8"))
            data["animations"][1]["row"] = 0
            contract.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(BankContractError, "part row reused"):
                build_bank(contract, frames, root / "out")


class SpriteForgeSocketContractTests(unittest.TestCase):
    def _base_contract(self) -> dict:
        return {
            "schema": 1,
            "quality_contract": "sprite-forge-v1",
            "actor": "enemy-pawn",
            "weapon": "none",
            "composition": "socketed-body",
            "cell": {"width": 64, "height": 64},
            "parts": {"main": {"columns": 2, "rows": 1}},
            "animations": [
                {
                    "name": "idle",
                    "part": "main",
                    "row": 0,
                    "fps": 8,
                    "loop": True,
                    "authored_frames": 2,
                    "slots": [0, 1],
                    "sockets": [
                        {
                            "weapon_anchor": [35, 30],
                            "rear_hand": [31, 29],
                            "front_hand": [39, 30],
                            "muzzle": [52, 29],
                            "angle_degrees": -2,
                            "scale": 1.0,
                            "z": "front",
                        },
                        {
                            "weapon_anchor": [36, 30],
                            "rear_hand": [32, 29],
                            "front_hand": [40, 30],
                            "muzzle": [53, 29],
                            "angle_degrees": -1,
                            "scale": 1.0,
                            "z": "front",
                        },
                    ],
                }
            ],
        }

    def test_socketed_body_requires_one_socket_per_authored_frame(self) -> None:
        data = self._base_contract()
        data["animations"][0]["sockets"].pop()
        with self.assertRaisesRegex(BankContractError, "exactly 2"):
            from sprite_forge import _validate_bank_contract
            _validate_bank_contract(data)

    def test_socket_points_must_stay_inside_cell(self) -> None:
        data = self._base_contract()
        data["animations"][0]["sockets"][0]["muzzle"] = [99, 30]
        with self.assertRaisesRegex(BankContractError, "outside cell"):
            from sprite_forge import _validate_bank_contract
            _validate_bank_contract(data)

    def test_compiled_slots_carry_authored_socket_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            frames = root / "frames" / "idle"
            frames.mkdir(parents=True)
            for index, x in enumerate((20, 21)):
                image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                ImageDraw.Draw(image).rectangle(
                    (x, 12, x + 19, 51),
                    fill=(180, 120, 80, 255),
                )
                image.save(frames / f"{index:03d}.png", "PNG")
            contract = root / "contract.json"
            contract.write_text(
                json.dumps(self._base_contract(), indent=2) + "\n",
                encoding="utf-8",
            )
            manifest = build_bank(contract, root / "frames", root / "out")
            animation = manifest["animations"][0]
            self.assertEqual(animation["sockets"][0]["weapon_anchor"], [35.0, 30.0])
            self.assertEqual(animation["sockets"][1]["muzzle"], [53.0, 29.0])


class SpriteForgeSocketQualityTests(unittest.TestCase):
    def sockets(self) -> list[dict]:
        values = [
            ([138, 162], [118, 180], [147, 177], [184, 163], -2.5),
            ([139, 161], [119, 179], [148, 176], [185, 162], -1.8),
            ([140, 160], [120, 178], [149, 175], [186, 161], -1.0),
            ([141, 161], [121, 179], [150, 176], [187, 162], -0.2),
            ([140, 163], [120, 181], [149, 178], [186, 164], 0.8),
            ([139, 164], [119, 182], [148, 179], [185, 165], 0.2),
            ([138, 163], [118, 181], [147, 178], [184, 164], -1.0),
            ([137, 162], [117, 180], [146, 177], [183, 163], -2.0),
        ]
        return [
            {
                "weapon_anchor": anchor,
                "rear_hand": rear,
                "front_hand": front,
                "muzzle": muzzle,
                "angle_degrees": angle,
                "scale": 1.0,
                "z": "front",
            }
            for anchor, rear, front, muzzle, angle in values
        ]

    def test_calibrated_enemy_slice_passes(self) -> None:
        result = validate_socket_sequence(
            self.sockets(),
            SocketQualityContract(
                max_anchor_delta_px=4.0,
                max_angle_delta_degrees=4.0,
            ),
            loop=True,
        )
        self.assertTrue(result.ok, result.errors)

    def test_muzzle_behind_anchor_is_rejected(self) -> None:
        sockets = self.sockets()
        sockets[3]["muzzle"] = [130, 162]
        result = validate_socket_sequence(sockets)
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("muzzle-not-forward:3:") for error in result.errors),
            result.errors,
        )

    def test_detached_hand_is_rejected(self) -> None:
        sockets = self.sockets()
        sockets[2]["front_hand"] = [250, 175]
        result = validate_socket_sequence(sockets)
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("front-hand-detached:2:") for error in result.errors),
            result.errors,
        )

    def test_anchor_teleport_is_rejected(self) -> None:
        sockets = self.sockets()
        sockets[4]["weapon_anchor"] = [180, 163]
        result = validate_socket_sequence(
            sockets,
            SocketQualityContract(max_anchor_delta_px=8.0),
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("socket-anchor-jump:3->4:") for error in result.errors),
            result.errors,
        )

    def test_angle_jump_is_rejected(self) -> None:
        sockets = self.sockets()
        sockets[5]["angle_degrees"] = 40.0
        result = validate_socket_sequence(
            sockets,
            SocketQualityContract(max_angle_delta_degrees=8.0),
        )
        self.assertFalse(result.ok)
        self.assertTrue(
            any(error.startswith("socket-angle-jump:4->5:") for error in result.errors),
            result.errors,
        )

    def test_bank_contract_runs_socket_quality_fail_closed(self) -> None:
        data = SpriteForgeSocketContractTests()._base_contract()
        data["animations"][0]["sockets"][1]["muzzle"] = [34, 30]
        from sprite_forge import _validate_bank_contract
        with self.assertRaisesRegex(BankContractError, "socket quality failed"):
            _validate_bank_contract(data)


class SpriteForgeBatchLabTests(unittest.TestCase):
    ACTIONS = ["jump", "fall"]
    WEAPONS = ["pistol", "machinegun", "shotgun", "panzerfaust"]
    CELL = 64
    COLUMNS = 2

    def _frame(
        self,
        *,
        height: int,
        column: int,
        foot_y: int = 56,
    ) -> Image.Image:
        image = Image.new(
            "RGBA",
            (self.CELL, self.CELL),
            (0, 0, 0, 0),
        )
        left = 20 + column
        top = foot_y - height
        ImageDraw.Draw(image).rectangle(
            (left, top, left + 15, foot_y - 1),
            fill=(180, 120, 80, 255),
        )
        return image

    def _write_frame(
        self,
        root: Path,
        weapon: str,
        row: int,
        column: int,
        height: int,
    ) -> None:
        directory = root / weapon / "frames"
        directory.mkdir(parents=True, exist_ok=True)
        self._frame(
            height=height,
            column=column,
        ).save(
            directory
            / (
                f"matthias_{weapon}_"
                f"r{row:02d}_c{column:02d}.png"
            )
        )

    def _build_fixture(self, root: Path) -> None:
        heights = {
            "pistol": {
                "jump": [30, 36],
                "fall": [34, 28],
            },
            "machinegun": {
                "jump": [30, 36],
                "fall": [34, 28],
            },
            "shotgun": {
                "jump": [28, 34],
                "fall": [25, 22],
            },
            "panzerfaust": {
                "jump": [20, 25],
                "fall": [24, 20],
            },
        }
        for weapon in self.WEAPONS:
            for row, action in enumerate(self.ACTIONS):
                for column, height in enumerate(
                    heights[weapon][action]
                ):
                    self._write_frame(
                        root,
                        weapon,
                        row,
                        column,
                        height,
                    )

    def test_batch_audit_classifies_safe_vs_authored_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._build_fixture(root)
            result = audit_sprite_batch(
                root,
                actor="matthias",
                weapons=self.WEAPONS,
                actions=self.ACTIONS,
                canon_weapons=["pistol", "machinegun"],
                parity_actions={"jump", "fall"},
                columns=self.COLUMNS,
                pass_scale_delta=0.04,
                max_auto_scale_delta=0.12,
            )
            self.assertEqual(
                result["parity"]["jump"]["weapons"]["shotgun"][
                    "status"
                ],
                "safe-normalization",
            )
            self.assertEqual(
                result["parity"]["jump"]["weapons"]["panzerfaust"][
                    "status"
                ],
                "needs-authored-source",
            )
            self.assertEqual(
                result["parity"]["fall"]["weapons"]["shotgun"][
                    "status"
                ],
                "needs-authored-source",
            )

    def test_parity_repair_preserves_unmodified_rows_and_footline(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._build_fixture(root)
            out = root / "candidate.png"
            report_path = root / "health.json"
            preview = root / "review.png"
            report = repair_sprite_parity(
                root,
                actor="matthias",
                target_weapon="shotgun",
                action="jump",
                actions=self.ACTIONS,
                canon_weapons=["pistol", "machinegun"],
                output_atlas=out,
                report_path=report_path,
                preview_path=preview,
                columns=self.COLUMNS,
                cell_size=self.CELL,
                max_auto_scale_delta=0.12,
            )

            self.assertTrue(
                report["untouchedRowsPixelIdentical"]
            )
            self.assertTrue(out.is_file())
            self.assertTrue(report_path.is_file())
            self.assertTrue(preview.is_file())

            atlas = Image.open(out).convert("RGBA")
            for column in range(self.COLUMNS):
                repaired = atlas.crop(
                    (
                        column * self.CELL,
                        0,
                        (column + 1) * self.CELL,
                        self.CELL,
                    )
                )
                metrics = geometry_metrics(repaired)
                self.assertIsNotNone(metrics)
                assert metrics is not None
                self.assertEqual(
                    metrics.body_height,
                    [30, 36][column],
                )
                self.assertEqual(metrics.foot_y, 56.0)

                original_fall = Image.open(
                    root
                    / "shotgun"
                    / "frames"
                    / (
                        "matthias_shotgun_"
                        f"r01_c{column:02d}.png"
                    )
                ).convert("RGBA")
                stored_fall = atlas.crop(
                    (
                        column * self.CELL,
                        self.CELL,
                        (column + 1) * self.CELL,
                        self.CELL * 2,
                    )
                )
                self.assertEqual(
                    stored_fall.tobytes(),
                    original_fall.tobytes(),
                )

    def test_parity_repair_rejects_unsafe_scale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._build_fixture(root)
            with self.assertRaisesRegex(
                GeometryError,
                "needs-authored-source",
            ):
                repair_sprite_parity(
                    root,
                    actor="matthias",
                    target_weapon="panzerfaust",
                    action="jump",
                    actions=self.ACTIONS,
                    canon_weapons=["pistol", "machinegun"],
                    output_atlas=root / "candidate.png",
                    report_path=root / "health.json",
                    preview_path=root / "review.png",
                    columns=self.COLUMNS,
                    cell_size=self.CELL,
                    max_auto_scale_delta=0.12,
                )


class SpriteForgeMatthiasStabilizationTests(unittest.TestCase):
    ACTIONS = ("jump", "idle", "hurt")
    WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
    CELL = 64
    COLUMNS = 8
    FOOT = 56
    HURT_SLOTS = (0, 1, 2, 2, 1, 0, 0, 0)
    CAP_PATCH = (18, 8, 42, 20)

    def _path(
        self,
        root: Path,
        weapon: str,
        row: int,
        column: int,
    ) -> Path:
        return (
            root
            / weapon
            / "frames"
            / f"matthias_{weapon}_r{row:02d}_c{column:02d}.png"
        )

    def _write_body(
        self,
        root: Path,
        weapon: str,
        row: int,
        column: int,
        height: int,
        *,
        cap_hole: bool = False,
        donor_cap: bool = False,
    ) -> None:
        image = Image.new(
            "RGBA",
            (self.CELL, self.CELL),
            (0, 0, 0, 0),
        )
        draw = ImageDraw.Draw(image)
        top = self.FOOT - height
        draw.rectangle(
            (22, top, 37, self.FOOT - 1),
            fill=(45, 52, 56, 255),
        )
        if cap_hole or donor_cap:
            # Keep the same bbox before/after cap repair, matching the real
            # regression where only cap interior alpha was missing.
            draw.rectangle(
                (28, 8, 29, 9),
                fill=(250, 220, 50, 255),
            )
        if donor_cap:
            draw.rectangle(
                (20, 8, 39, 19),
                fill=(28, 32, 34, 255),
            )
            draw.rectangle(
                (28, 8, 29, 9),
                fill=(250, 220, 50, 255),
            )

        path = self._path(root, weapon, row, column)
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path)

    def _build_fixture(self, root: Path) -> None:
        jump = {
            "pistol": (30, 32, 31, 30, 29, 30, 30, 29),
            "machinegun": (30, 32, 31, 30, 29, 30, 30, 29),
            "shotgun": (29, 31, 30, 29, 29, 29, 30, 29),
            "panzerfaust": (26, 27, 27, 26, 26, 26, 27, 26),
        }
        for weapon in self.WEAPONS:
            for column, height in enumerate(jump[weapon]):
                self._write_body(
                    root,
                    weapon,
                    0,
                    column,
                    height,
                )
            for column in range(self.COLUMNS):
                self._write_body(
                    root,
                    weapon,
                    1,
                    column,
                    32,
                )

        for column in range(self.COLUMNS):
            self._write_body(
                root,
                "pistol",
                2,
                column,
                48,
            )
            self._write_body(
                root,
                "machinegun",
                2,
                column,
                36,
                cap_hole=True,
                donor_cap=column == 3,
            )

        shotgun_heights = (48, 47, 46, 14, 13, 12, 12, 12)
        panzer_heights = (46, 44, 42, 14, 13, 12, 12, 12)
        for column, height in enumerate(shotgun_heights):
            self._write_body(
                root,
                "shotgun",
                2,
                column,
                height,
            )
        for column, height in enumerate(panzer_heights):
            self._write_body(
                root,
                "panzerfaust",
                2,
                column,
                height,
            )

    def _run(self, root: Path, output: Path) -> dict:
        return repair_matthias_stabilization_batch(
            root,
            output,
            actions=self.ACTIONS,
            columns=self.COLUMNS,
            cell_size=self.CELL,
            hurt_slots=self.HURT_SLOTS,
            machinegun_donor_column=3,
            machinegun_dx=(0,) * self.COLUMNS,
            machinegun_patch=self.CAP_PATCH,
            machinegun_max_rgb_mean=165.0,
        )

    def test_batch_repairs_hurt_without_touching_unrelated_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "frames"
            output = Path(tmp) / "out"
            self._build_fixture(root)
            report = self._run(root, output)

            self.assertTrue(report["untouchedRowsPixelIdentical"])
            self.assertEqual(
                report["weapons"]["shotgun"]["changedRows"],
                [0, 2],
            )
            self.assertEqual(
                report["weapons"]["panzerfaust"]["changedRows"],
                [2],
            )

            machinegun = Image.open(
                output / "machinegun-stabilized-v1.png"
            ).convert("RGBA")
            shotgun = Image.open(
                output / "shotgun-stabilized-v1.png"
            ).convert("RGBA")
            panzer = Image.open(
                output / "panzerfaust-stabilized-v1.png"
            ).convert("RGBA")

            # Idle is outside the repair surface for every weapon.
            for weapon, atlas in (
                ("machinegun", machinegun),
                ("shotgun", shotgun),
                ("panzerfaust", panzer),
            ):
                for column in range(self.COLUMNS):
                    source = Image.open(
                        self._path(root, weapon, 1, column)
                    ).convert("RGBA")
                    stored = atlas.crop(
                        (
                            column * self.CELL,
                            self.CELL,
                            (column + 1) * self.CELL,
                            self.CELL * 2,
                        )
                    )
                    self.assertEqual(
                        stored.tobytes(),
                        source.tobytes(),
                    )

            # The broken shotgun/panzer prone tail is now deliberate holds of
            # the three authored standing-flinch poses.
            for weapon, atlas in (
                ("shotgun", shotgun),
                ("panzerfaust", panzer),
            ):
                for column, source_column in enumerate(self.HURT_SLOTS):
                    expected = Image.open(
                        self._path(root, weapon, 2, source_column)
                    ).convert("RGBA")
                    actual = atlas.crop(
                        (
                            column * self.CELL,
                            self.CELL * 2,
                            (column + 1) * self.CELL,
                            self.CELL * 3,
                        )
                    )
                    self.assertEqual(
                        actual.tobytes(),
                        expected.tobytes(),
                    )

            # SMG repair may only add pixels into transparent cap holes.
            source = Image.open(
                self._path(root, "machinegun", 2, 0)
            ).convert("RGBA")
            repaired = machinegun.crop(
                (
                    0,
                    self.CELL * 2,
                    self.CELL,
                    self.CELL * 3,
                )
            )
            added = 0
            for before, after in zip(
                source.getdata(),
                repaired.getdata(),
            ):
                if before[3] != 0:
                    self.assertEqual(after, before)
                elif after[3] != 0:
                    added += 1
            self.assertGreater(added, 0)

    def test_batch_rejects_nonstanding_hurt_sources(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "frames"
            output = Path(tmp) / "out"
            self._build_fixture(root)
            self._write_body(
                root,
                "panzerfaust",
                2,
                2,
                20,
            )
            with self.assertRaisesRegex(
                GeometryError,
                "needs-authored-source:panzerfaust:hurt",
            ):
                self._run(root, output)


    def test_machinegun_hurt_alpha_v2_fills_clean_donor_support(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "frames"
            output = Path(tmp) / "out"
            self._build_fixture(root)
            self._write_body(
                root,
                "machinegun",
                2,
                4,
                36,
                cap_hole=True,
                donor_cap=True,
            )

            report = repair_matthias_machinegun_hurt_alpha_v2(
                root,
                output,
                actions=self.ACTIONS,
                columns=self.COLUMNS,
                cell_size=self.CELL,
                donor_column=4,
                dx=(0,) * self.COLUMNS,
                patch=self.CAP_PATCH,
                max_rgb_mean=165.0,
                min_coverage=0.99,
            )

            self.assertTrue(report["untouchedRowsPixelIdentical"])
            self.assertEqual(report["donorColumn"], 4)
            self.assertEqual(len(report["frames"]), self.COLUMNS)
            self.assertTrue(
                all(
                    frame["afterCoverage"] >= 0.99
                    for frame in report["frames"]
                )
            )
            self.assertLess(report["frames"][0]["beforeCoverage"], 0.99)
            self.assertGreater(report["frames"][0]["addedPixels"], 0)

            atlas = Image.open(
                output / "machinegun-hurt-alpha-v2.png"
            ).convert("RGBA")
            source = Image.open(
                self._path(root, "machinegun", 2, 0)
            ).convert("RGBA")
            repaired = atlas.crop(
                (
                    0,
                    self.CELL * 2,
                    self.CELL,
                    self.CELL * 3,
                )
            )
            added = 0
            for before, after in zip(
                source.getdata(),
                repaired.getdata(),
            ):
                if before[3] != 0:
                    self.assertEqual(after, before)
                elif after[3] != 0:
                    added += 1
            self.assertGreater(added, 0)
            self.assertTrue(
                (output / "machinegun-hurt-alpha-v2-review.png").is_file()
            )
            self.assertTrue(
                (output / "machinegun-hurt-alpha-v2-proof.png").is_file()
            )
            self.assertTrue(
                (output / "machinegun-hurt-alpha-v2-health.json").is_file()
            )


if __name__ == "__main__":
    unittest.main()
