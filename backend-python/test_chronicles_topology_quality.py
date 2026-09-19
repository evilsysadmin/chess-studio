import pytest

import chronicles_api
import chronicles_manifest_procedural
from chronicles_topology_quality import evaluate_chronicles_topology


def _manifest(grid):
    return {
        "grid": grid,
        "partyStart": {"x": 1, "y": 1},
        "enemies": [],
        "triggers": [],
        "interactables": [],
        "treasures": [],
        "traps": [],
        "exits": [{"id": "exit", "tile": "X"}],
    }


def test_quality_gate_accepts_connected_room_with_reachable_exit():
    report = evaluate_chronicles_topology(
        _manifest(
            [
                "#########",
                "#P......#",
                "#.......#",
                "#..###..#",
                "#.......#",
                "#.......#",
                "#......X#",
                "#########",
            ]
        )
    )

    assert report.accepted is True
    assert report.reasons == ()
    assert report.warnings == ()
    assert report.reachable_count == report.walkable_count
    assert report.min_exit_distance >= 4
    assert report.exit_count == 1
    assert report.articulation_ratio < 0.82


def test_quality_gate_rejects_disconnected_exit():
    report = evaluate_chronicles_topology(
        _manifest(
            [
                "#########",
                "#P..#####",
                "#...#####",
                "#########",
                "#####...#",
                "#####..X#",
                "#########",
            ]
        )
    )

    assert report.accepted is False
    assert "disconnected-walkable-cells" in report.reasons
    assert "unreachable-exit" in report.reasons


def test_quality_gate_reports_corridor_dominance_as_advisory():
    report = evaluate_chronicles_topology(
        _manifest(
            [
                "#########################",
                "#P.....................X#",
                "#########################",
            ]
        )
    )

    assert report.accepted is True
    assert report.reasons == ()
    assert "corridor-dominated" in report.warnings
    assert report.cycle_rank == 0
    assert report.corridor_ratio > 0.75


def test_quality_gate_reports_authored_guard_on_exit_without_rejecting_it():
    manifest = _manifest(
        [
            "#########",
            "#P......#",
            "#.......#",
            "#..###..#",
            "#.......#",
            "#.......#",
            "#......X#",
            "#########",
        ]
    )
    manifest["enemies"] = [{"id": "gate-guard", "x": 7, "y": 6}]

    report = evaluate_chronicles_topology(manifest)

    assert report.accepted is True
    assert report.enemy_exit_overlap_count == 1
    assert report.as_dict()["enemyExitOverlapCount"] == 1


@pytest.mark.parametrize("seed", range(6))
def test_shipped_local_procedural_areas_pass_quality_gate(seed):
    for map_id in chronicles_api.chronicles_shipped_map_ids():
        area = chronicles_api.chronicles_area_envelope(map_id, seed)
        quality = area["manifest"]["generation"]["topologyQuality"]
        assert quality["accepted"] is True, (map_id, seed, quality)
        assert quality["reachableCount"] == quality["walkableCount"]
        assert quality["exitCount"] >= 1


def test_planner_quality_rejection_falls_back_to_local_recipe(monkeypatch):
    base, _revision = chronicles_api.load_chronicles_manifest("echo-cistern")

    class FakeQuality:
        def __init__(self, accepted, reasons):
            self.accepted = accepted
            self.reasons = reasons

        def as_dict(self):
            return {
                "version": 1,
                "accepted": self.accepted,
                "reasons": list(self.reasons),
            }

    reports = iter(
        (
            FakeQuality(False, ("exit-too-close",)),
            FakeQuality(True, ()),
        )
    )
    monkeypatch.setattr(
        chronicles_manifest_procedural,
        "evaluate_chronicles_topology",
        lambda _manifest: next(reports),
    )

    generated = chronicles_manifest_procedural.proceduralize_chronicles_manifest(
        base,
        417,
        planner_proposal={
            "version": 1,
            "source": "workers-ai",
            "verbs": ["guardian", "sluice"],
            "difficulty": 5,
        },
    )

    metadata = generated.manifest["generation"]
    assert metadata["plannerAccepted"] is False
    assert metadata["plannerReason"] == "quality-rejected"
    assert metadata["plannerQualityFallback"] is True
    assert metadata["plannerQualityRejectedReasons"] == [
        "exit-too-close"
    ]
    assert metadata["topologyQuality"]["accepted"] is True
