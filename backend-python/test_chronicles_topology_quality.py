import pytest

import chronicles_api
import chronicles_manifest_procedural
from chronicles_topology_quality import (
    ChroniclesTopologyQuality,
    compare_chronicles_topology,
    evaluate_chronicles_topology,
)


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


def _quality(
    *,
    accepted=True,
    reasons=(),
    open_ratio=0.60,
    dead_end_ratio=0.10,
    articulation_ratio=0.20,
    min_exit_distance=10,
    cycle_rank=3,
):
    return ChroniclesTopologyQuality(
        accepted=accepted,
        reasons=tuple(reasons),
        warnings=(),
        walkable_count=40,
        reachable_count=40,
        exit_count=1,
        min_exit_distance=min_exit_distance,
        max_exit_distance=min_exit_distance,
        open_ratio=open_ratio,
        dead_end_count=round(dead_end_ratio * 40),
        dead_end_ratio=dead_end_ratio,
        articulation_count=round(articulation_ratio * 40),
        articulation_ratio=articulation_ratio,
        cycle_rank=cycle_rank,
        corridor_ratio=0.50,
        critical_anchor_count=5,
        unreachable_anchor_count=0,
        enemy_exit_overlap_count=0,
    )


def test_relative_quality_accepts_small_shape_changes():
    baseline = _quality()
    candidate = _quality(
        open_ratio=0.51,
        dead_end_ratio=0.20,
        articulation_ratio=0.31,
        min_exit_distance=7,
        cycle_rank=2,
    )

    assert compare_chronicles_topology(candidate, baseline) == ()


def test_relative_quality_rejects_material_regressions():
    baseline = _quality()
    candidate = _quality(
        open_ratio=0.20,
        dead_end_ratio=0.50,
        articulation_ratio=0.80,
        min_exit_distance=3,
        cycle_rank=0,
    )

    assert compare_chronicles_topology(candidate, baseline) == (
        "open-ratio-regression",
        "dead-end-regression",
        "articulation-regression",
        "exit-distance-regression",
    )


def test_relative_quality_always_propagates_hard_candidate_failure():
    baseline = _quality()
    candidate = _quality(
        accepted=False,
        reasons=("unreachable-exit",),
    )

    assert compare_chronicles_topology(candidate, baseline) == (
        "unreachable-exit",
    )


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
    local_quality = _quality()
    planned_quality = _quality(
        open_ratio=0.20,
        dead_end_ratio=0.50,
        articulation_ratio=0.80,
        min_exit_distance=3,
        cycle_rank=0,
    )
    reports = iter((local_quality, planned_quality))
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
        "open-ratio-regression",
        "dead-end-regression",
        "articulation-regression",
        "exit-distance-regression",
    ]
    assert metadata["topologyQuality"]["accepted"] is True
    assert metadata["topologyBaselineQuality"]["accepted"] is True
