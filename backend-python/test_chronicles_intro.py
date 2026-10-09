"""The live prologue consumes authored quest data, mirrored byte-for-byte."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend-python/chronicles_campaign/quests/intro.json"
MIRROR = ROOT / "frontend/src/chronicles/campaign/intro.json"
MAIN = ROOT / "backend-python/chronicles_campaign/quests/main.json"

def test_chronicles_live_prologue_contract():
    assert SOURCE.read_bytes() == MIRROR.read_bytes()
    authored = json.loads(SOURCE.read_text(encoding="utf-8"))
    act = json.loads(MAIN.read_text(encoding="utf-8"))["acts"][0]
    assert authored["schemaVersion"] == 1
    assert authored["campaignId"] == "lost-king"
    assert authored["actId"] == act["id"]
    assert authored["start"]["eventId"] == act["objectives"][0]["eventId"]
    assert authored["start"]["mapId"] == act["objectives"][0]["at"]
    assert authored["seal"]["mapId"] == act["objectives"][1]["at"]
    assert authored["report"]["mapId"] == authored["start"]["mapId"]
    assert len({authored[stage]["eventId"] for stage in ("start", "seal", "report")}) == 3
