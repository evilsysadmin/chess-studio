#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

import matthias_prompt_contract as mpc
import matthias_candidate_grinder as mcg


class MatthiasPromptContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.contract = mpc.load_contract(Path(__file__).with_name("contracts") / "matthias_prompt_contract.yaml")

    def test_full_suite_is_complete_and_rows_are_stable(self) -> None:
        self.assertEqual(set(self.contract["weapons"]), {"pistol", "machinegun", "shotgun", "panzerfaust"})
        expected = [
            "idle", "walk", "run", "jump", "fall", "land", "crouch", "crouch_walk",
            "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_up_alt",
            "shoot_diag_down", "shoot_crouch", "reload", "hurt", "die",
        ]
        self.assertEqual([self.contract["actions"][name]["row"] for name in expected], list(range(18)))

    def test_compile_crouch_walk_is_specific_and_fail_closed(self) -> None:
        prompt = mpc.compile_prompt(self.contract, weapon="panzerfaust", action_name="crouch_walk", frame_index=3)
        for needle in (
            "frame 4/8",
            "Grounded locomotion while staying inside the approved crouch-height envelope",
            "Static crouch translated sideways",
            "Frozen legs",
            "Shrink Matthias to fit the launcher",
            "RGBA PNG with transparent background",
            "enters quarantine after generation",
        ):
            self.assertIn(needle.lower(), prompt.lower())

    def test_sidecar_hashes_prompt_reference_and_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ref = root / "ref.png"
            candidate = root / "candidate.png"
            Image.new("RGBA", (8, 8), (255, 255, 255, 255)).save(ref)
            Image.new("RGBA", (8, 8), (0, 0, 0, 255)).save(candidate)
            prompt = mpc.compile_prompt(self.contract, weapon="pistol", action_name="crouch", frame_index=0)
            sidecar = mpc.build_sidecar(
                self.contract,
                weapon="pistol",
                action_name="crouch",
                frame_index=0,
                prompt=prompt,
                refs={"identity": ref},
                candidate=candidate,
            )
            self.assertEqual(sidecar["state"], "quarantined")
            self.assertEqual(sidecar["references"]["identity"]["sha256"], mpc.sha256_file(ref))
            self.assertEqual(sidecar["candidateSha256"], mpc.sha256_file(candidate))
            self.assertEqual(len(sidecar["promptSha256"]), 64)

    @staticmethod
    def _sprite(path: Path, *, top: int, bottom: int, leg_shift: int = 0, pose_shift: int = 0) -> None:
        image = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        # Head/torso live in the central body measurement band.
        draw.rectangle((49 + pose_shift, top, 76 + pose_shift, top + 24), fill=(255, 255, 255, 255))
        torso_top = top + 24
        torso_bottom = max(torso_top, bottom - 26)
        draw.rectangle((43 + pose_shift, torso_top, 80 + pose_shift, torso_bottom), fill=(255, 255, 255, 255))
        # Separate legs make lower-body temporal differences visible.
        draw.rectangle((48 + leg_shift, bottom - 27, 58 + leg_shift, bottom - 1), fill=(255, 255, 255, 255))
        draw.rectangle((65 - leg_shift, bottom - 27, 75 - leg_shift, bottom - 1), fill=(255, 255, 255, 255))
        image.save(path)

    def _smoke_fixture(self, root: Path, *, bad_crouch: bool) -> Path:
        smoke = root / "smoke"
        for weapon in self.contract["weapons"]:
            frames = smoke / weapon / "frames"
            frames.mkdir(parents=True, exist_ok=True)
            for action_name, action in self.contract["actions"].items():
                row = action.get("row")
                if row is None:
                    continue
                for column in range(8):
                    top, bottom = 24, 112
                    leg_shift = 0
                    pose_shift = 0
                    if action_name == "crouch":
                        top = 28 if bad_crouch else 48
                        bottom = 112
                    elif action_name == "crouch_walk":
                        top = 48
                        bottom = 112
                        leg_shift = [-4, -2, 0, 2, 4, 2, 0, -2][column]
                    elif action_name in {"walk", "run"}:
                        amount = 4 if action_name == "walk" else 7
                        leg_shift = [-amount, -2, 0, 2, amount, 2, 0, -2][column]
                    elif action_name == "hurt":
                        pose_shift = [0, 2, 4, 6, 4, 2, 1, 0][column]
                    elif action_name == "die":
                        top = [24, 28, 34, 42, 50, 58, 64, 68][column]
                        bottom = 112
                        pose_shift = [0, 2, 4, 6, 8, 10, 12, 14][column]
                    elif action_name == "reload":
                        pose_shift = [0, 1, 2, 3, 2, 1, 0, 0][column]
                    elif action_name == "land":
                        top = [28, 34, 40, 34, 30, 27, 25, 24][column]
                    elif action_name == "jump":
                        leg_shift = -5
                    elif action_name == "fall":
                        leg_shift = 5
                    elif action_name == "shoot_diag_up_alt":
                        pose_shift = 5
                    elif action_name == "shoot_crouch":
                        top = 48
                    self._sprite(frames / f"matthias_{weapon}_r{row:02d}_c{column:02d}.png", top=top, bottom=bottom, leg_shift=leg_shift, pose_shift=pose_shift)
        return smoke

    def test_semantic_audit_rejects_near_standing_crouch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            smoke = self._smoke_fixture(Path(tmp), bad_crouch=True)
            report = mpc.audit_smoke(self.contract, smoke)
            failures = [item for item in report["checks"] if item["status"] == "fail" and item["action"] == "crouch"]
            self.assertTrue(any(item["check"] == "body_height_vs_idle" for item in failures))
            self.assertGreater(report["summary"]["hardFailures"], 0)

    def test_temporal_ratio_allows_only_contracted_raster_slack(self) -> None:
        self.assertTrue(
            mpc._within_ratio_with_pixel_slack(60.0, 170.0, 0.35, 1.0)
        )
        self.assertFalse(
            mpc._within_ratio_with_pixel_slack(61.0, 170.0, 0.35, 1.0)
        )

    def test_semantic_audit_accepts_real_crouch_height_and_motion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            smoke = self._smoke_fixture(Path(tmp), bad_crouch=False)
            report = mpc.audit_smoke(self.contract, smoke)
            crouch_failures = [item for item in report["checks"] if item["status"] == "fail" and item["action"] in {"crouch", "crouch_walk", "shoot_crouch"}]
            self.assertEqual(crouch_failures, [], json.dumps(crouch_failures, indent=2))


class MatthiasCandidateGrinderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.contract = mpc.load_contract(Path(__file__).with_name("contracts") / "matthias_prompt_contract.yaml")

    @staticmethod
    def _actor(path: Path, *, crouched: bool, weapon_extra: int = 0) -> None:
        image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        # Large beret/head anchor kept invariant across poses.
        top = 52 if not crouched else 78
        draw.rectangle((72, top, 132, top + 20), fill=(255, 255, 255, 255))
        draw.rectangle((80, top + 20, 126, top + 44), fill=(255, 255, 255, 255))
        torso_bottom = 188 if not crouched else 190
        draw.rectangle((76, top + 44, 136, torso_bottom - 28), fill=(255, 255, 255, 255))
        draw.rectangle((78, torso_bottom - 28, 96, torso_bottom), fill=(255, 255, 255, 255))
        draw.rectangle((112, torso_bottom - 28, 130, torso_bottom), fill=(255, 255, 255, 255))
        # Horizontal weapon, canonical unless weapon_extra intentionally bloats it.
        draw.rectangle((128, top + 52, 182 + weapon_extra, top + 62), fill=(255, 255, 255, 255))
        image.save(path)

    def test_request_bundle_contains_full_prompt_hashes_and_targets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            identity = root / "identity.png"
            weapon = root / "weapon.png"
            self._actor(identity, crouched=False)
            self._actor(weapon, crouched=False)
            bundle = mcg.build_request_bundle(
                self.contract,
                weapon="shotgun",
                action="crouch",
                frame_index=0,
                refs={"identity": identity, "weapon": weapon},
            )
            self.assertEqual(bundle["state"], "awaiting_generation")
            self.assertIn("Near-standing pose", bundle["prompt"])
            self.assertIn("Crouch body-height ratio", bundle["prompt"])
            self.assertEqual(len(bundle["promptSha256"]), 64)
            self.assertEqual(bundle["references"]["weapon"]["sha256"], mpc.sha256_file(weapon))

    def test_candidate_grinder_rejects_near_standing_crouch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            identity = root / "identity.png"
            weapon = root / "weapon.png"
            candidate = root / "candidate.png"
            self._actor(identity, crouched=False)
            self._actor(weapon, crouched=False)
            self._actor(candidate, crouched=False)
            report = mcg.audit_candidate(
                self.contract, candidate=candidate, weapon="shotgun", action="crouch",
                refs={"identity": identity, "weapon": weapon},
            )
            self.assertEqual(report["summary"]["status"], "fail")
            failed = {item["check"] for item in report["checks"] if item["status"] == "fail"}
            self.assertIn("head_normalized_height_vs_idle", failed)

    def test_candidate_grinder_rejects_oversized_weapon(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            identity = root / "identity.png"
            weapon = root / "weapon.png"
            candidate = root / "candidate.png"
            self._actor(identity, crouched=False)
            self._actor(weapon, crouched=False)
            self._actor(candidate, crouched=True, weapon_extra=55)
            report = mcg.audit_candidate(
                self.contract, candidate=candidate, weapon="shotgun", action="crouch",
                refs={"identity": identity, "weapon": weapon},
            )
            failed = {item["check"] for item in report["checks"] if item["status"] == "fail"}
            self.assertIn("weapon_body_width_vs_reference", failed)



if __name__ == "__main__":
    unittest.main()