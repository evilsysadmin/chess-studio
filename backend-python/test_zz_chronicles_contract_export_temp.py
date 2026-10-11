"""Temporary CI-only corpus export. Removed after generated fixture is committed."""
import json
import runpy
from pathlib import Path

def test_export_chronicles_python_corpus_for_parity_refresh():
    root = Path(__file__).resolve().parents[1]
    generator = runpy.run_path(str(root / "scripts" / "chronicles_runs_parity_corpus.py"))
    payload = generator["render"](generator["build"]())
    for index in range(0, len(payload), 2000):
        print(f"CHRONICLES_CORPUS_CHUNK {index // 2000:04d} {json.dumps(payload[index:index + 2000], ensure_ascii=True)}")
    assert False, "temporary deterministic corpus export; remove this test after committing fixture"
