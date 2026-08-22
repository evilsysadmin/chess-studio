import pytest
from fastapi.testclient import TestClient

main = pytest.importorskip("main", reason="integration contract runs after overlay is installed into the real backend")

client = TestClient(main.app)

def test_main_exposes_narrative_but_never_anonymously():
    r = client.post('/api/narrative', json={'eventType':'generic','facts':{}})
    assert r.status_code == 401, f'/api/narrative must exist and require JWT; got {r.status_code}'
