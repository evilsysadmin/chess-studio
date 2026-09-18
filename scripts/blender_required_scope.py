#!/usr/bin/env python3
"""Classify which path-scoped Blender workflows must be green for a PR."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


@dataclass(frozen=True)
class Gate:
    workflow: str
    label: str
    exact_paths: frozenset[str] = frozenset()
    prefixes: tuple[str, ...] = ()

    def matches(self, path: str) -> bool:
        return path in self.exact_paths or any(path.startswith(prefix) for prefix in self.prefixes)


GATES = (
    Gate(
        workflow="blender-setup-smoke.yml",
        label="Blender setup",
        exact_paths=frozenset({
            "scripts/blender/blender_setup_smoke.py",
            ".github/workflows/blender-setup-smoke.yml",
        }),
        prefixes=(".github/actions/setup-blender-canonical/",),
    ),
    Gate(
        workflow="home-matthias-blender-art.yml",
        label="Home Matthias art",
        exact_paths=frozenset({
            "scripts/blender/build_home_matthias.py",
            "scripts/blender/home_matthias_parts.py",
            "scripts/blender/home_matthias_animations.py",
            "scripts/blender/home_matthias_contract.py",
            "scripts/blender/validate_home_matthias_contract.py",
            "scripts/blender/compare_glb_semantics.py",
            "frontend/art-source/matthias-home-canonical-reference.webp",
            "frontend/art-source/matthias-home-canonical-reference.txt",
            ".github/workflows/home-matthias-blender-art.yml",
        }),
    ),
    Gate(
        workflow="chronicles-party-blender-art.yml",
        label="Chronicles party art",
        exact_paths=frozenset({
            "scripts/blender/build_chronicles_humanoid_party.py",
            "scripts/blender/refine_chronicles_party_tailoring.py",
            "scripts/blender/refine_chronicles_party_anatomy.py",
            "scripts/blender/render_chronicles_party_preview.py",
            ".github/workflows/chronicles-party-blender-art.yml",
        }),
    ),
    Gate(
        workflow="pawn-slug-blender-art.yml",
        label="Pawn Slug Matthias art",
        exact_paths=frozenset({
            "scripts/blender/render_pawn_slug_matthias_premium.py",
            "scripts/blender/pawn_slug_matthias_premium_common.py",
            "scripts/blender/pawn_slug_matthias_premium_weapons.py",
            "scripts/blender/pawn_slug_matthias_premium_character.py",
            ".github/workflows/pawn-slug-blender-art.yml",
        }),
    ),
    Gate(
        workflow="pawn-slug-godot-strict-atlas.yml",
        label="Pawn Slug Godot strict Matthias atlas",
        exact_paths=frozenset({
            "scripts/art/pack_pawn_slug_godot_strict_v6.py",
            ".github/workflows/pawn-slug-godot-strict-atlas.yml",
        }),
    ),
    Gate(
        workflow="pawn-slug-enemy-blender-art.yml",
        label="Pawn Slug enemy art",
        exact_paths=frozenset({
            "scripts/blender/render_pawn_slug_enemy_sheets_v1.py",
            ".github/workflows/pawn-slug-enemy-blender-art.yml",
        }),
    ),
    Gate(
        workflow="pawn-slug-pow-blender-art.yml",
        label="Pawn Slug POW art",
        exact_paths=frozenset({
            "scripts/blender/build_pawn_slug_pows_v2.py",
            ".github/workflows/pawn-slug-pow-blender-art.yml",
        }),
    ),
    Gate(
        workflow="war-room-blender-art.yml",
        label="War Room premium art",
        exact_paths=frozenset({
            "scripts/blender/build_war_room_premium.py",
            "scripts/blender/publish_war_room_v2_staging.py",
            ".github/workflows/war-room-blender-art.yml",
        }),
    ),
)


def clean_paths(paths: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        if path.startswith("/") or ".." in PurePosixPath(path).parts:
            raise ValueError(f"ruta de diff inválida: {raw!r}")
        cleaned.append(path)
    return cleaned


def classify(paths: Iterable[str]) -> list[Gate]:
    changed = clean_paths(paths)
    return [gate for gate in GATES if any(gate.matches(path) for path in changed)]


def payload(gates: list[Gate]) -> str:
    return json.dumps(
        [{"workflow": gate.workflow, "label": gate.label} for gate in gates],
        separators=(",", ":"),
    )


def output_lines(gates: list[Gate]) -> list[str]:
    return [
        f"blender_required={'true' if gates else 'false'}",
        f"blender_workflows={payload(gates)}",
    ]


def write_outputs(path: Path, gates: list[Gate]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(output_lines(gates)) + "\n")


def self_test() -> None:
    assert classify(["frontend/src/components/Home.css"]) == []
    assert output_lines([]) == ["blender_required=false", "blender_workflows=[]"]
    assert [gate.workflow for gate in classify(["scripts/blender/build_home_matthias.py"])] == [
        "home-matthias-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/compare_glb_semantics.py"])] == [
        "home-matthias-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify([".github/actions/setup-blender-canonical/action.yml"])] == [
        "blender-setup-smoke.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/refine_chronicles_party_anatomy.py"])] == [
        "chronicles-party-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/pawn_slug_matthias_premium_weapons.py"])] == [
        "pawn-slug-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/art/pack_pawn_slug_godot_strict_v6.py"])] == [
        "pawn-slug-godot-strict-atlas.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/render_pawn_slug_enemy_sheets_v1.py"])] == [
        "pawn-slug-enemy-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/build_pawn_slug_pows_v2.py"])] == [
        "pawn-slug-pow-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify(["scripts/blender/build_war_room_premium.py"])] == [
        "war-room-blender-art.yml"
    ]
    assert [gate.workflow for gate in classify([
        "scripts/blender/build_home_matthias.py",
        "scripts/blender/build_pawn_slug_pows_v2.py",
    ])] == ["home-matthias-blender-art.yml", "pawn-slug-pow-blender-art.yml"]
    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("blender scope debe rechazar rutas fuera del repo")
    print("blender-required-scope self-test OK · CSS no despierta Blender; ocho lanes path-aware")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--github-output")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    gates = classify(sys.stdin.read().splitlines())
    if args.github_output:
        write_outputs(Path(args.github_output), gates)
    else:
        print("\n".join(output_lines(gates)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
