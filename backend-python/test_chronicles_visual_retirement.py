"""Retired Chronicles producers must be a no-op, never an absent Playwright spec."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_extracted_chronicles_visual_producers_do_not_launch_browser(tmp_path):
    for producer in ("chronicles-gameplay", "chronicles-avatar", "chronicles-tactics"):
        output = tmp_path / f"{producer}.txt"
        env = {**os.environ, "GITHUB_OUTPUT": str(output)}
        result = subprocess.run(
            ["bash", "scripts/app_visual_capture.sh", "canonical",
             "experiments", "chronicles", producer],
            cwd=ROOT, env=env, text=True, capture_output=True, timeout=12,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        assert "no canonical specs" in result.stdout
        assert output.read_text(encoding="utf-8").strip() == "has_specs=false"
