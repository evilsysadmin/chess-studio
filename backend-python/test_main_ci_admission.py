from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "main_ci_admission.py"


def test_main_ci_admission_self_test_covers_fail_closed_contract():
    completed = subprocess.run(
        [sys.executable, "-S", str(SCRIPT), "--self-test"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert completed.returncode == 0, completed.stderr or completed.stdout
    assert "full/scoped green accepted" in completed.stdout
    assert "direct/stale/wrong-base/failed rejected" in completed.stdout
