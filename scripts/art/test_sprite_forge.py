#!/usr/bin/env python3
from __future__ import annotations

import unittest

from PIL import Image, ImageDraw

from sprite_forge import (
    GeometryContract,
    GeometryError,
    LintConfig,
    TemporalContract,
    geometry_metrics,
    lint_frame,
    normalize_frame,
    validate_geometry,
    validate_sequence,
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


if __name__ == "__main__":
    unittest.main()
