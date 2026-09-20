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


def test_main_admission_workflow_falls_back_to_full_exact_head_gate():
    workflow = (ROOT / ".github" / "workflows" / "main-admission.yml").read_text(encoding="utf-8")

    assert "id: pr_admission" in workflow
    assert "continue-on-error: true" in workflow
    assert "if: steps.pr_admission.outcome == 'success'" in workflow
    assert "if: steps.pr_admission.outcome == 'failure'" in workflow
    assert "Full exact-HEAD quality fallback" in workflow
    assert "run: make tests security-images compose-smoke" in workflow
    assert "fetch-depth: 0" in workflow
