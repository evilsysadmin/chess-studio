from copy import deepcopy
from pathlib import Path
import sys

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from game_state_doctor import compare_restore_baseline, diagnose_game_document  # noqa: E402


def persisted_game():
    return {
        "_id": "doctor-game-1",
        "owner": "doctor",
        "moves": ["e4", "e5", "Nf3"],
        "difficulty": 0,
        "humanColor": "w",
        "handicap": None,
        "initialFen": None,
        "lastMove": {
            "from": "g1",
            "to": "f3",
            "by": "human",
            "captured": False,
            "piece": "n",
            "promotion": None,
        },
    }


def test_game_state_doctor_accepts_reconstructible_savegame():
    report = diagnose_game_document(persisted_game())

    assert report["healthy"] is True
    assert report["errors"] == []
    assert report["canonical"]["plies"] == 3
    assert report["canonical"]["turn"] == "b"
    assert report["fingerprint"]


def test_game_state_doctor_rejects_illegal_san_history():
    broken = persisted_game()
    broken["moves"] = ["e4", "Qa9"]

    report = diagnose_game_document(broken)

    assert report["healthy"] is False
    assert "reconstruir" in report["errors"][0]


def test_game_state_doctor_rejects_stale_last_move_metadata():
    broken = persisted_game()
    broken["lastMove"]["to"] = "h3"

    report = diagnose_game_document(broken)

    assert report["healthy"] is False
    assert any("lastMove.to" in error for error in report["errors"])


def test_fingerprint_ignores_operational_timestamp_noise():
    first = persisted_game()
    second = deepcopy(first)
    first["updatedAt"] = {"$date": "2026-09-13T10:00:00Z"}
    second["updatedAt"] = {"$date": "2026-09-13T11:00:00Z"}

    assert diagnose_game_document(first)["fingerprint"] == diagnose_game_document(second)["fingerprint"]


def test_restore_baseline_detects_canonical_drift():
    before = diagnose_game_document(persisted_game())
    changed = persisted_game()
    changed["moves"] = ["e4", "e5"]
    changed["lastMove"] = {
        "from": "e7",
        "to": "e5",
        "by": "cpu",
        "captured": False,
        "piece": "p",
        "promotion": None,
    }
    after = diagnose_game_document(changed)

    assert before["healthy"] and after["healthy"]
    assert compare_restore_baseline([after], [before]) == [
        "estado canónico distinto tras restore: doctor-game-1"
    ]


def test_restore_baseline_accepts_exact_canonical_restore():
    before = diagnose_game_document(persisted_game())
    restored = diagnose_game_document(deepcopy(persisted_game()))

    assert compare_restore_baseline([restored], [before]) == []
