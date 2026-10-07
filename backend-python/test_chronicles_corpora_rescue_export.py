import importlib.util
import json
from pathlib import Path


def _load(root: Path, name: str, relative: str):
    source = root / relative
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _emit(label: str, rendered: str):
    chunk_size = 8000
    for index in range(0, len(rendered), chunk_size):
        chunk = rendered[index:index + chunk_size]
        print(f"@@{label}:{index // chunk_size:06d}@@" + json.dumps(chunk, ensure_ascii=True))


def test_export_regenerated_chronicles_corpora_for_rescue():
    root = Path(__file__).resolve().parents[1]
    area = _load(root, "chronicles_area_parity_corpus_rescue", "scripts/chronicles_area_parity_corpus.py")
    runs = _load(root, "chronicles_runs_parity_corpus_rescue", "scripts/chronicles_runs_parity_corpus.py")

    _emit("CHRONICLES_AREA_CORPUS", area.render(area.build()))
    _emit("CHRONICLES_RUNS_CORPUS", runs.render(runs.build()))

    raise AssertionError("intentional rescue export; remove this temporary test after capturing both corpora")
