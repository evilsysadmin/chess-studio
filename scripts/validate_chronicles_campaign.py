#!/usr/bin/env python3
"""Fail-closed checks for the authored Chronicles campaign atlas (design-only)."""
import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend-python" / "chronicles_campaign"
PASSABLE = {".", ":", "=", "+"}

def load(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))

def validate():
    world = load("world.json")
    main = load("quests/main.json")
    side = load("quests/side.json")
    assert world["schemaVersion"] == main["schemaVersion"] == 1
    assert world["status"] == main["status"] == "design-only"
    places = world["locations"]
    ids = [p["id"] for p in places]
    assert len(ids) == len(set(ids)) and world["startMapId"] in ids
    regions = {r["id"] for r in world["regions"]}
    maps = {}
    known_events = set()
    for place in places:
        assert place["regionId"] in regions
        assert place["mapFile"] == "maps/" + place["id"] + ".json"
        m = load(place["mapFile"])
        assert m["id"] == place["id"] and m["regionId"] == place["regionId"]
        assert m["status"] == "design-only" and m["layout"]["mode"] == "authored-fixed"
        grid = m["layout"]["grid"]
        assert grid and len({len(row) for row in grid}) == 1 and min(map(len, grid)) >= 7
        start = m["partyStart"]
        assert grid[start["y"]][start["x"]] in PASSABLE
        reached = {(start["x"], start["y"])}
        queue = deque(reached)
        while queue:
            x, y = queue.popleft()
            for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if 0 <= ny < len(grid) and 0 <= nx < len(grid[0]) and grid[ny][nx] in PASSABLE and (nx,ny) not in reached:
                    reached.add((nx,ny))
                    queue.append((nx,ny))
        for obj in m["portals"] + m["pointsOfInterest"]:
            assert (obj["x"], obj["y"]) in reached, (m["id"], obj["id"])
        events = [p["eventId"] for p in m["pointsOfInterest"]]
        assert len(events) == len(set(events))
        known_events.update(events)
        maps[m["id"]] = m
    assert {p.name for p in (ROOT / "maps").glob("*.json")} == {p["id"]+".json" for p in places}
    adj = {id: set() for id in ids}
    for link in world["links"]:
        a, b = link["from"], link["to"]
        assert a in maps and b in maps and a != b
        adj[a].add(b); adj[b].add(a)
        portals_a = [p for p in maps[a]["portals"] if p["targetMapId"] == b and p["linkId"] == link["id"]]
        portals_b = [p for p in maps[b]["portals"] if p["targetMapId"] == a and p["linkId"] == link["id"]]
        assert len(portals_a) == len(portals_b) == 1
        pa, pb = portals_a[0], portals_b[0]
        assert pa["id"] == pb["targetPortalId"] and pb["id"] == pa["targetPortalId"]
        assert pa["requiresAll"] == pb["requiresAll"] == link["requiresAll"]
        assert set(link["requiresAll"]) <= known_events
    reached = {world["startMapId"]}
    pending = list(reached)
    while pending:
        for other in adj[pending.pop()]:
            if other not in reached: reached.add(other); pending.append(other)
    assert reached == set(ids), "orphan location"
    for act in main["acts"]:
        for obj in act["objectives"]:
            assert obj["at"] in maps
            assert obj["eventId"] in [p["eventId"] for p in maps[obj["at"]]["pointsOfInterest"]]
        rule = act["completion"]
        assert set(rule.get("all", [])) <= known_events
        assert set(rule.get("of", [])) <= known_events
        if "anyAtLeast" in rule: assert 0 < rule["anyAtLeast"] <= len(rule["of"])
    for end in main["endings"]:
        assert set(end["requiresAll"]) <= known_events
        if "requiresAtLeast" in end:
            rule = end["requiresAtLeast"]
            assert set(rule["of"]) <= known_events and 0 < rule["count"] <= len(rule["of"])
    for q in side:
        assert q["at"] in maps and q["eventId"] in known_events
    return len(maps), len(world["links"]), len(main["acts"]), len(main["endings"])

if __name__ == "__main__":
    counts = validate()
    print("Chronicles campaign atlas OK: %s maps, %s links, %s acts, %s endings" % counts)
