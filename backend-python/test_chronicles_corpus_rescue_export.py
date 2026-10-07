import importlib.util
import json
from pathlib import Path


def test_export_regenerated_chronicles_corpus_for_rescue():
    root = Path(__file__).resolve().parents[1]
    source = root / "scripts" / "chronicles_area_parity_corpus.py"
    spec = importlib.util.spec_from_file_location("chronicles_area_parity_corpus_rescue", source)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    rendered = module.render(module.build())
    chunk_size = 8000
    for index in range(0, len(rendered), chunk_size):
        chunk = rendered[index:index + chunk_size]
        print(f"@@CHRONICLES_CORPUS:{index // chunk_size:06d}@@" + json.dumps(chunk, ensure_ascii=True))

    raise AssertionError("intentional rescue export; remove this temporary test after capturing the corpus")
