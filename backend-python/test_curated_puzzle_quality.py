from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "scripts" / "curated_puzzle_quality_check.py"


def test_curated_catalog_passes_dedicated_minimax_gate():
    result = subprocess.run(
        [sys.executable, str(GATE)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
    assert result.returncode == 0, output
