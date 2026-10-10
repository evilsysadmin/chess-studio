#!/usr/bin/env python3
"""Cross-language parity corpus for Chronicles area envelopes.

backend-python/chronicles_api.py turns each authored map into a seeded area:
module, composition and treasure variation, a MapCode recipe, the seeded
layout with its connected anchors, the topology quality gate, optional
planner proposals, seeded exits and optional encounters, the run route and
the party-level combat difficulty, then validates and revisions the result.
This records Python's envelopes (the SHA-256 of the exact response bytes,
plus full envelopes for a few cases so a mismatch can be diffed), the route
plans per seed and the MapCode preview answers; backend-go/internal/chronicles
must agree.

    python3 scripts/chronicles_area_parity_corpus.py           # rewrite the fixture
    python3 scripts/chronicles_area_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from fastapi import HTTPException  # noqa: E402

import chronicles_api as api  # noqa: E402
import chronicles_manifest_procedural as proc  # noqa: E402
from chronicles_map_code import ChroniclesMapCodeError, encode_chronicles_map_code  # noqa: E402
from chronicles_map_generator import ChroniclesMapGenerationError, generate_chronicles_layout  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "chronicles" / "testdata" / "python_chronicles_area_corpus.json"
SEED = 20261009
FIXED_SEEDS = [0, 1, 7, 417, 65535, 2**31 - 1]


def response_bytes(payload) -> bytes:
    # FastAPI's JSONResponse rendering.
    return json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":")).encode("utf-8")


def outcome(fn):
    try:
        payload = fn()
    except HTTPException as exc:
        return {"status": exc.status_code, "detail": exc.detail}
    except Exception as exc:  # unhandled in the route: a 500
        return {"error": type(exc).__name__, "message": str(exc)}
    raw = response_bytes(payload)
    return {"sha256": hashlib.sha256(raw).hexdigest(), "length": len(raw), "payload": payload}


PLANNER_PROPOSALS = [
    {"version": 1, "source": "workers-ai", "verbs": ["lever", "traps"]},
    {"version": 1, "source": "Workers-AI ", "difficulty": 5},
    {"version": 1, "source": "workers-ai", "verbs": ["hunt"], "difficulty": 1},
    {"version": 1, "source": "workers-ai", "verbs": ["dragons"]},
    {"version": 2, "source": "workers-ai", "verbs": ["lever"]},
    {"version": 1, "source": "workers-ai"},
    {"version": 1, "source": "workers-ai", "verbs": ["keys", "puzzle", "guardian", "secret"], "difficulty": 3},
]


def build() -> dict:
    rng = random.Random(SEED)
    # The legacy area corpus validates procedural dungeons. Authored settlements
    # are separately covered by explicit Python/Go layout-preservation tests.
    map_ids = [
        map_id for map_id in api.chronicles_shipped_map_ids()
        if api.load_chronicles_manifest(map_id)[0].get("layoutMode") != "authored"
    ]
    seeds = FIXED_SEEDS + [rng.randrange(0, 2**31) for _ in range(9)]
    areas = []
    full_kept = set()
    for map_id in map_ids:
        for seed in seeds:
            route = api.chronicles_route_snapshot_for_seed(seed)
            configs = [
                {"partyLevel": None, "placement": 0, "route": False},
                {"partyLevel": rng.randint(1, 12), "placement": api.CHRONICLES_CONTENT_PLACEMENT_VERSION, "route": True},
                {"partyLevel": rng.choice([1, 4, 9, 12]), "placement": 1, "route": True},
                {"partyLevel": None, "placement": api.CHRONICLES_CONTENT_PLACEMENT_VERSION, "route": rng.random() < 0.5},
            ]
            for config in configs:
                result = outcome(lambda: api.chronicles_area_envelope(
                    map_id, seed,
                    route_snapshot=route if config["route"] else None,
                    party_level=config["partyLevel"],
                    content_placement_version=config["placement"],
                ))
                keep_full = "payload" in result and (map_id, config["placement"]) not in full_kept and seed in FIXED_SEEDS[:2]
                if keep_full:
                    full_kept.add((map_id, config["placement"]))
                else:
                    result.pop("payload", None)
                areas.append({"mapId": map_id, "seed": seed, **config, "result": result})
    planner = []

    def planner_case(map_id, seed, snapshot, party_level, placement, keep_payload=False):
        result = outcome(lambda: api.chronicles_area_envelope(
            map_id, seed, planner_snapshot=snapshot, party_level=party_level, content_placement_version=placement,
        ))
        if not keep_payload:
            result.pop("payload", None)
        planner.append({"mapId": map_id, "seed": seed, "snapshot": snapshot, "partyLevel": party_level,
                        "placement": placement, "result": result})

    for i, proposal in enumerate(PLANNER_PROPOSALS):
        map_id = map_ids[i % len(map_ids)]
        planner_case(map_id, seeds[i % len(seeds)], {"version": 1, "areas": {map_id: proposal}}, 5, 2)
    # Accepted, quality-rejected (articulation regression) and no-change
    # decisions, across placement versions.
    for map_id, seed, verbs, placement in [
        ("ash-vault", 0, ["hunt"], 0),
        ("black-glass-chapel", 11, ["secret", "guardian"], 2),
        ("black-glass-chapel", 11, ["secret", "guardian"], 1),
        ("menagerie-of-ash", 0, ["secret", "guardian"], 2),
    ]:
        proposal = {"version": 1, "source": "workers-ai", "verbs": verbs, "difficulty": 1}
        planner_case(map_id, seed, {"version": 1, "areas": {map_id: proposal}}, None, placement, keep_payload=seed == 11 and placement == 2)
    for bad in [{"version": 1}, {"version": 1, "areas": {"nope": {}}}, {"version": 2, "areas": {map_ids[0]: PLANNER_PROPOSALS[0]}}, {"version": 1, "areas": {map_ids[0]: {"version": 1}}}]:
        planner_case(map_ids[0], 3, bad, None, 0)
    routes = [{"seed": s, "entry": api.chronicles_entry_map_for_seed(s), "route": api.chronicles_route_snapshot_for_seed(s)}
              for s in seeds + [rng.randrange(0, 2**31) for _ in range(40)]]
    previews = []
    for code in [
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "cm1|seed=417|theme=GALLERY|size=9x7|verbs=traps,lever|enemies=3|treasures=1|secrets=1|difficulty=2",
        "CM1|theme=water|size=19x15|verbs=sluice,secret,guardian|enemies=8|treasures=4|secrets=3|difficulty=5|seed=2147483647",
        "CM1|theme=lava|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=6x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=hunt,hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=dragons|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1",
        "CM1|theme=crypt|theme=ash|size=7x7",
        "CM2|theme=crypt",
        "CM1|nonsense",
        "CM1|theme=crypt|size=7by7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=x|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=2147483648",
        "CM1|theme=crypt|size=7x7|verbs=a,b,c,d,e|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=19x15|verbs=hunt|enemies=8|treasures=4|secrets=3|difficulty=1|seed=5",
        "CM1|theme= |size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=lava|size=7by7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=dragons|enemies=99|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=99999999999999999999|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1|theme=crypt|size=07x07|verbs=hunt|enemies=02|treasures=0|secrets=0|difficulty=1|seed=000",
        "CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=99999999999999999999|secrets=0|difficulty=1|seed=0",
        "CM1|theme=lava|size=6x7|verbs=dragons|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0",
        "CM1||theme=crypt",
        "CM1| =crypt",
        "  ",
    ]:
        def preview(code=code):
            try:
                return generate_chronicles_layout(code).as_dict()
            except (ChroniclesMapCodeError, ChroniclesMapGenerationError) as exc:
                raise HTTPException(400, str(exc)) from exc
        result = outcome(preview)
        result.pop("sha256", None)
        result.pop("length", None)
        previews.append({"mapCode": code, "result": result})
    # Recipe derivation and anchors over synthetic variants of the shipped
    # maps: themes, clamped counts and seeded-placement eligibility that the
    # shipped content alone never reaches.
    themes = {map_id: proc._theme_for_map_id(map_id) for map_id in [
        *map_ids, "", "Water-Works", "old-tower", "bell", "iron-gate", "foundry", "glass", "gallery-ash", "basilica", "x",
    ]}
    recipes = []
    for i, map_id in enumerate(map_ids):
        manifest, _ = api.load_chronicles_manifest(map_id)
        variants = {"authored": manifest}
        bulk = json.loads(json.dumps(manifest))
        filler = {"x": manifest["partyStart"]["x"], "y": manifest["partyStart"]["y"], "action": {"effects": []}}
        bulk.setdefault("treasures", []).extend({"id": f"t-extra-{n}", **filler} for n in range(5))
        bulk.setdefault("triggers", []).extend({"id": f"s-extra-{n}", "kind": "secret-door", **filler} for n in range(4))
        bulk["enemies"] = bulk.get("enemies", [])[:1]
        variants["bulk"] = bulk
        keyed = json.loads(json.dumps(manifest))
        for enemy in keyed.get("enemies", []):
            enemy["positionKey"] = "pk"
        variants["positionKey"] = keyed
        for name, variant in variants.items():
            seed = seeds[i % len(seeds)]
            recipes.append({
                "mapId": map_id, "variant": name, "seed": seed,
                "mapCode": encode_chronicles_map_code(proc.chronicles_map_code_for_manifest(variant, seed)),
                "anchors": {str(v): sorted(proc._anchor_positions(variant, content_placement_version=v)) for v in (0, 1, 2)},
            })
    return {"areas": areas, "planner": planner, "routes": routes, "previews": previews, "themes": themes, "recipes": recipes}


def render(corpus: dict) -> str:
    sections = []
    for key in ("areas", "planner", "routes", "previews", "recipes"):
        rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus[key])
        sections.append(f'"{key}":[\n{rows}\n]')
    sections.append('"themes":' + json.dumps(corpus["themes"], separators=(",", ":")))
    return "{" + ",\n".join(sections) + "}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/chronicles_area_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
