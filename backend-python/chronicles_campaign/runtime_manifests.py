"""Materialize *selected* file-authored Chronicles campaign locations.

The 24 campaign JSON maps remain the authored source. This opt-in exporter
builds runtime-compatible definitions without editing the shipped dungeon
manifests, game state or Go/frontend mirrors. Promotion still requires
make chronicles-contracts + Python/Go/frontend parity + visual QA.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SHIPPED = ROOT.parent / "chronicles_maps"
PASSABLE = frozenset(".:=")
BLOCKED = frozenset("#~^")
COMPASS = {"north": 0, "east": 1, "south": 2, "west": 3}
SAFE_LEGACY_ALIASES = {"swordhaven-square": "swordhaven-campaign"}


def _read(relative: str) -> Any:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def _runtime_id(source_id: str) -> str:
    if source_id in SAFE_LEGACY_ALIASES:
        return SAFE_LEGACY_ALIASES[source_id]
    # Never silently replace a shipped dungeon with an empty campaign shell.
    if (SHIPPED / (source_id + ".json")).is_file():
        raise ValueError(f"Legacy dungeon {source_id} requires an explicit preserved-gameplay adapter")
    return source_id


def _tile_grid(source: dict) -> list[str]:
    src = source["layout"]["grid"]
    if not src or len({len(line) for line in src}) != 1:
        raise ValueError(f"non-rectangular campaign layout: {source['id']}")
    unknown = set("".join(src)) - PASSABLE - BLOCKED
    if unknown:
        raise ValueError(f"unsupported campaign tiles: {source['id']} {sorted(unknown)}")
    return ["".join("." if tile in PASSABLE else "#" for tile in line) for line in src]


def _reachable(grid: list[str], origin: tuple[int, int]) -> set[tuple[int, int]]:
    q = deque([origin])
    seen = {origin}
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= ny < len(grid) and 0 <= nx < len(grid[0]) and grid[ny][nx] != "#" and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


def materialize_campaign_maps(selected: tuple[str, ...] | list[str]) -> dict[str, dict]:
    """Compile selected world locations with reciprocal, reachable portals.

    Unknown destinations are NOT emitted: their authored world links remain in
    the source atlas until those regions are accepted for gameplay.
    """
    world = _read("world.json")
    if world.get("schemaVersion") != 1 or world.get("status") != "design-only":
        raise ValueError("unsupported campaign source version")
    source_ids = tuple(selected)
    if not source_ids or len(set(source_ids)) != len(source_ids):
        raise ValueError("selected map ids must be a nonempty unique list")
    catalog = {item["id"]: item for item in world["locations"]}
    if any(source_id not in catalog for source_id in source_ids):
        raise ValueError("selected campaign map does not exist")
    ids = {source_id: _runtime_id(source_id) for source_id in source_ids}
    if len(set(ids.values())) != len(ids):
        raise ValueError("runtime map ids overlap")
    output = {}
    for source_id in source_ids:
        source = _read(catalog[source_id]["mapFile"])
        if source.get("id") != source_id or source.get("status") != "design-only":
            raise ValueError(f"invalid campaign map source: {source_id}")
        grid = _tile_grid(source)
        origin = source["partyStart"]
        start = (origin["x"], origin["y"])
        if start[1] >= len(grid) or start[0] >= len(grid[0]) or grid[start[1]][start[0]] == "#":
            raise ValueError(f"invalid party start: {source_id}")
        reachable = _reachable(grid, start)
        exits = []
        for portal in source["portals"]:
            target = portal["targetMapId"]
            if target not in ids:
                continue
            if (portal["x"], portal["y"]) not in reachable:
                raise ValueError(f"unreachable portal: {source_id}/{portal['id']}")
            exits.append({
                "id": portal["id"],
                "kind": "exit",
                "x": portal["x"],
                "y": portal["y"],
                "requiresReturn": True,
                "openLabel": f"Ir a {catalog[target]['title']}",
                "lockedLabel": "El paso está sellado",
                "requirements": [
                    {"key":event_id, "truthy": True, "message": "Aún falta una pista para abrir este paso."}
                    for event_id in portal.get("requiresAll", [])
                ],
                "action": {
                    "effects": [{
                        "type": "transition-map",
                        "mapId": ids[target],
                        "entryExitId": portal["targetPortalId"],
                    }],
                    "message": f"La compañía llega a {catalog[target]['title']}.",
                },
            })
        interactions = []
        for point in source["pointsOfInterest"]:
            if (point["x"], point["y"]) not in reachable:
                raise ValueError(f"unreachable point of interest: {source_id}/{point['id']}")
            interactions.append({
                "id": point["id"], "kind": "lore",
                "x": point["x"], "y": point["y"],
                "label": point["label"],
                "when": [{"key": point["eventId"], "falsy": True}],
                "action": {
                    "effects": [{"type": "set", "key": point["eventId"], "value": True}],
                    "message": f"{source['title']}: {point['label']}.",
                    "journal": {
                        "id": f"campaign-{point['eventId']}",
                        "title": point["label"],
                        "body": source["description"],
                        "sigil": "✦",
                    },
                },
            })
        runtime = {
            "id": ids[source_id],
            "version": 1,
            "progressionKey": f"campaign-{source_id}-v1",
            "title": source["title"],
            "regionKind": source["kind"] if source["kind"] in {"settlement", "wilderness"} else "dungeon",
            "layoutMode": "authored",
            "grid": grid,
            "partyStart": {"x": start[0], "y": start[1], "direction": COMPASS[origin["direction"]]},
            "initialFlags": {"swordhavenArrived": True, "campaignRouteV1": True}
            if source_id == "swordhaven-square" else {},
            "enemies": [],
            "triggers": [],
            "interactables": interactions,
            "treasures": [],
            "traps": [],
            "exits": exits,
            "initialJournal": {
                "id": f"campaign-arrival-{source_id}",
                "title": source["title"],
                "body": source["description"],
                "sigil": "I",
            },
            "introMessage": source["description"],
        }
        output[runtime["id"]] = runtime

    # Authoritative bi-directionality: no orphan exits or broken return entry.
    for map_id, runtime in output.items():
        for exit_entry in runtime["exits"]:
            destination = output[exit_entry["action"]["effects"][0]["mapId"]]
            if not any(
                item["action"]["effects"][0]["mapId"] == map_id
                and item["id"] == exit_entry["action"]["effects"][0]["entryExitId"]
                and item["action"]["effects"][0]["entryExitId"] == exit_entry["id"]
                for item in destination["exits"]
            ):
                raise ValueError(f"no reciprocal portal: {map_id}/{exit_entry['id']}")
    return output


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("ids", nargs="+", help="selected source map IDs")
    cli.add_argument("--write", type=Path, help="output directory (NEVER overwrites an existing file)")
    options = cli.parse_args()
    compiled = materialize_campaign_maps(options.ids)
    if options.write:
        options.write.mkdir(parents=True, exist_ok=True)
        conflicts = [name for name in sorted(compiled) if (options.write / f"{name}.json").exists()]
        if conflicts:
            cli.error("refusing to overwrite existing manifests: " + ", ".join(conflicts))
        for map_id, payload in sorted(compiled.items()):
            dest = options.write / f"{map_id}.json"
            with dest.open("x", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
        print(f"wrote {len(compiled)} candidate manifests in {options.write}")
    else:
        print(json.dumps(compiled, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
