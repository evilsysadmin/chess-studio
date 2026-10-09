"""CI collection hook: keep the story/map atlas coherent across edits."""
import subprocess
import sys
from pathlib import Path

def test_chronicles_campaign_atlas_contract():
    script = Path(__file__).resolve().parents[1] / "scripts" / "validate_chronicles_campaign.py"
    result = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr
