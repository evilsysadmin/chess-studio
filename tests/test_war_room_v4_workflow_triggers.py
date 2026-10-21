"""V4 Blender authoring should run for authored-model changes, not E2E-only edits."""
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BLENDER = ROOT / ".github/workflows/war-room-v4-blender-art.yml"
PIN = ROOT / ".github/workflows/war-room-v4-r2-pin.yml"


class WarRoomV4WorkflowTriggerTests(unittest.TestCase):
    def test_e2e_only_changes_use_public_r2_browser_proof_not_blender_rebuild(self):
        authored = BLENDER.read_text(encoding="utf-8").split("\npermissions:", 1)[0]
        pinned = PIN.read_text(encoding="utf-8").split("\npermissions:", 1)[0]
        self.assertNotIn("- 'e2e/war-room-visual-artifact.spec.js'", authored)
        self.assertIn("- 'e2e/war-room-visual-artifact.spec.js'", pinned)
        # The V4 helper has a special staging-authored GLB route. Changes to
        # that contract must still test an exact *newly built* Blender artifact.
        self.assertEqual(authored.count("- 'e2e/v4-immutable-model.js'"), 2)
        self.assertIn("- 'e2e/v4-immutable-model.js'", pinned)

    def test_authored_model_and_hans_changes_still_run_full_blender_proof(self):
        authored = BLENDER.read_text(encoding="utf-8").split("\npermissions:", 1)[0]
        for required in (
            "scripts/blender/build_war_room_premium.py",
            "scripts/blender/build_war_room_v4.py",
            "scripts/blender/render_war_room_v4_hybrid_preview.py",
            "scripts/blender/configure_eevee_premium.py",
            "scripts/blender/publish_war_room_v4.py",
            "e2e/war-room-v4-hans-clearance-visual.spec.js",
            "frontend/src/components/WarRoomHansActorTelemetry.js",
        ):
            self.assertEqual(authored.count(f"- '{required}'"), 2, required)


if __name__ == "__main__":
    unittest.main()
