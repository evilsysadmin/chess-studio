from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "main_ci_admission_wait.py"


def test_main_ci_admission_wait_self_test_covers_pending_vs_terminal_contract():
    completed = subprocess.run(
        [sys.executable, "-S", str(SCRIPT), "--self-test"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )

    assert completed.returncode == 0, completed.stderr or completed.stdout
    assert "queued/in-progress retried" in completed.stdout
    assert "pre-merge-started late green is deploy-eligible" in completed.stdout
    assert "post-merge reruns are not" in completed.stdout
