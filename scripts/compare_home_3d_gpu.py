#!/usr/bin/env python3
"""Fail-closed comparison of two local, real-GPU Home Blender benchmark reports.

Usage: python3 -S scripts/compare_home_3d_gpu.py BASELINE.json CANDIDATE.json

The comparator cannot prove physical machine identity or energy/power state:
matching browser and renderer fingerprints are necessary, not sufficient.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


class IncomparableBenchmarks(ValueError):
    """Inputs do not provide a defensible same-configuration A/B comparison."""


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _check_report(report, label):
    if not isinstance(report, dict) or report.get("schema") != 2:
        raise IncomparableBenchmarks(f"{label}: expected a schema 2 report; rerun both benchmarks")
    if report.get("surface") != "Home Blender 3D" or report.get("mode") != "hardware":
        raise IncomparableBenchmarks(f"{label}: a real hardware Home Blender benchmark is required")
    revision = report.get("revision")
    if not isinstance(revision, str) or not (7 <= len(revision) <= 40) or any(c not in "0123456789abcdefABCDEF" for c in revision):
        raise IncomparableBenchmarks(f"{label}: record the exact git SHA with CHESS_HOME_GPU_REVISION")
    viewport = report.get("viewport")
    if not isinstance(viewport, dict) or any(not _finite_number(viewport.get(k)) or viewport[k] <= 0 for k in ("width", "height", "dpr")):
        raise IncomparableBenchmarks(f"{label}: viewport dimensions / DPR are not measurable")
    browser = report.get("browserVersion")
    if not isinstance(browser, str) or not browser.strip():
        raise IncomparableBenchmarks(f"{label}: Chromium version is missing")
    visits = report.get("visits")
    if not isinstance(visits, list) or len(visits) != 3:
        raise IncomparableBenchmarks(f"{label}: expected three completed, independent visits")
    signatures = []
    for index, visit in enumerate(visits, 1):
        if not isinstance(visit, dict) or visit.get("visit") != index:
            raise IncomparableBenchmarks(f"{label}: visit {index} is missing or misnumbered")
        if visit.get("actual") != "hardware" or visit.get("software") is not False:
            raise IncomparableBenchmarks(f"{label}: visit {index} used an unverified or software renderer")
        fingerprint = visit.get("rendererFingerprint")
        vendor = visit.get("vendor")
        lod = visit.get("lod")
        ambient = visit.get("ambient")
        if not isinstance(fingerprint, str) or len(fingerprint) != 8 or any(c not in "0123456789abcdef" for c in fingerprint):
            raise IncomparableBenchmarks(f"{label}: visit {index} has no stable renderer fingerprint")
        if vendor not in {"nvidia", "amd", "intel", "apple", "adreno", "mali", "powervr"}:
            raise IncomparableBenchmarks(f"{label}: visit {index} renderer vendor is unknown")
        if lod not in {"full", "lite"} or ambient not in {"dawn", "day", "dusk", "night"}:
            raise IncomparableBenchmarks(f"{label}: visit {index} LOD or ambient period is unknown")
        if not all(_finite_number(visit.get(k)) and visit[k] > 0 for k in (
            "canvasWidth", "canvasHeight", "initialDrawCalls", "initialTriangles",
            "allocatedTextures", "allocatedGeometries", "modelRequests", "startupMs",
        )):
            raise IncomparableBenchmarks(f"{label}: visit {index} lacks a ready 3D canvas or GLB")
        # Compare actual in-scene identity across visits and revisions. A
        # missing legacy field remains unknown; missing on just one side,
        # or changing within a run, is not a defensible A/B comparison.
        scene = []
        for key in ("matthiasStation", "shadows"):
            observed = visit.get(key)
            if observed is not None and (not isinstance(observed, str) or not observed.strip()):
                raise IncomparableBenchmarks(f"{label}: visit {index} has invalid {key}")
            scene.append(observed)
        signatures.append((vendor, fingerprint, lod, ambient, visit["canvasWidth"], visit["canvasHeight"], *scene))
    if len(set(signatures)) != 1:
        raise IncomparableBenchmarks(f"{label}: visits have inconsistent renderer, LOD, lighting, framebuffer or scene identity")
    medians = report.get("medians")
    if not isinstance(medians, dict):
        raise IncomparableBenchmarks(f"{label}: medians missing")
    for key in ("startupMs", "initialDrawCalls", "mainDrawCalls", "shadowDrawCalls",
                "firstFrameMainDrawCalls", "firstFrameShadowDrawCalls",
                "mainCastleDrawCalls", "mainMatthiasDrawCalls", "mainRuntimeDrawCalls",
                "shadowCastleDrawCalls", "shadowMatthiasDrawCalls", "shadowRuntimeDrawCalls",
                "allocatedTextures", "allocatedGeometries",
                "cpuP95Ms", "rafGapP95Ms", "gpuMs", "modelDrawSlots",
                "modelShadowCasterSlots", "modelTransparentSlots",
                "modelUniqueGeometries", "modelUniqueMaterials"):
        value = medians.get(key)
        if value is not None and (not _finite_number(value) or value < 0):
            raise IncomparableBenchmarks(f"{label}: invalid {key} median")
    if report.get("requireTimer") is True and medians.get("gpuMs") is None:
        raise IncomparableBenchmarks(f"{label}: required physical GPU samples are missing")
    return (browser, tuple(viewport[k] for k in ("width", "height", "dpr")), bool(report.get("requireTimer")), signatures[0])




# An opt-in production draw census is stronger evidence than a one-time GLB
# material inventory. Never compare a census-enabled run against an
# uncensused one, or silently accept incomplete renderer submissions.
_CENSUS_METRICS = (
    "mainDrawCalls", "shadowDrawCalls",
    "mainCastleDrawCalls", "mainMatthiasDrawCalls", "mainRuntimeDrawCalls",
    "shadowCastleDrawCalls", "shadowMatthiasDrawCalls", "shadowRuntimeDrawCalls",
    "firstFrameMainDrawCalls", "firstFrameShadowDrawCalls",
)


def _check_draw_census(report, label):
    requested = report.get("requireDrawCensus", False)
    if type(requested) is not bool:
        raise IncomparableBenchmarks(f"{label}: requireDrawCensus must be boolean")
    if not requested:
        return False  # Historical non-census reports remain comparable.

    for key in _CENSUS_METRICS:
        value = report["medians"].get(key)
        if not _finite_number(value) or value < 0:
            raise IncomparableBenchmarks(f"{label}: required sustained draw median {key} missing or invalid")
    if report["medians"]["mainDrawCalls"] <= 0:
        raise IncomparableBenchmarks(f"{label}: no sustained main draw submissions")

    for index, visit in enumerate(report["visits"], 1):
        for pass_key in ("drawPass", "firstFrameDrawPass"):
            observed = visit.get(pass_key)
            if not isinstance(observed, dict):
                raise IncomparableBenchmarks(f"{label}: visit {index} missing {pass_key} census")
            counts = ("mainCalls", "shadowCalls", "totalCalls")
            if any(type(observed.get(k)) is not int or observed[k] < 0 for k in counts):
                raise IncomparableBenchmarks(f"{label}: visit {index} invalid {pass_key} draw counts")
            if (observed["totalCalls"] <= 0
                or observed["mainCalls"] + observed["shadowCalls"] != observed["totalCalls"]):
                raise IncomparableBenchmarks(f"{label}: visit {index} inconsistent {pass_key} total")
            families = observed.get("families")
            if not isinstance(families, dict):
                raise IncomparableBenchmarks(f"{label}: visit {index} missing {pass_key} families")
            for phase in ("main", "shadow"):
                group = families.get(phase)
                if not isinstance(group, dict) or any(
                    type(group.get(k)) is not int or group[k] < 0
                    for k in ("castle", "matthias", "runtime")
                ):
                    raise IncomparableBenchmarks(f"{label}: visit {index} invalid {pass_key} {phase} families")
                if sum(group[k] for k in ("castle", "matthias", "runtime")) != observed[f"{phase}Calls"]:
                    raise IncomparableBenchmarks(f"{label}: visit {index} inconsistent {pass_key} {phase} families")
        sustained = visit["drawPass"]["families"]["main"]
        if sustained["castle"] <= 0 or sustained["matthias"] <= 0:
            raise IncomparableBenchmarks(f"{label}: visit {index} castle/Matthias draws missing")
    return True


# A physical run may leave live flames unmeasured (older captures, reduced
# motion, incomplete animation). Never fabricate zero material slots.
_FLAME_LIVE_FIELDS = (
    "flameNodes", "hotNodes", "candleNodes", "materialSlots", "doubleSided",
    "frontSided", "otherSided", "transparentNow",
    "transparentDoubleSidedNow", "singlePassTransparentDoubleSidedNow",
)
_FLAME_IDENTITY_FIELDS = (
    "flameNodes", "hotNodes", "candleNodes", "materialSlots", "transparentNow",
)


def _flame_live_identity(report, label):
    captures = [visit.get("flamePassLiveEligibility") for visit in report["visits"]]
    if all(capture is None for capture in captures):
        return None  # Legacy/missing live evidence is unknown, not zero.
    if any(capture is None for capture in captures):
        raise IncomparableBenchmarks(f"{label}: live flame census is missing from some visits")

    identities = []
    for index, capture in enumerate(captures, 1):
        if not isinstance(capture, dict) or any(
            type(capture.get(key)) is not int or capture[key] < 0
            for key in _FLAME_LIVE_FIELDS
        ):
            raise IncomparableBenchmarks(f"{label}: invalid live flame census in visit {index}")
        if (capture["materialSlots"] != capture["doubleSided"] + capture["frontSided"] + capture["otherSided"]
            or capture["transparentNow"] > capture["materialSlots"]
            or capture["transparentDoubleSidedNow"] > min(capture["transparentNow"], capture["doubleSided"])
            or capture["singlePassTransparentDoubleSidedNow"] > capture["transparentDoubleSidedNow"]):
            raise IncomparableBenchmarks(f"{label}: inconsistent live flame census in visit {index}")
        identities.append(tuple(capture[key] for key in _FLAME_IDENTITY_FIELDS))
    if len(set(identities)) != 1:
        raise IncomparableBenchmarks(f"{label}: live flame population drifted between visits")
    return identities[0]


def compare_reports(baseline, candidate):
    """Return measured per-metric A/B differences; never infer missing timings."""
    old_signature = _check_report(baseline, "baseline")
    new_signature = _check_report(candidate, "candidate")
    if old_signature != new_signature:
        raise IncomparableBenchmarks("Browser, viewport/DPR, timer mode, renderer, LOD, lighting, framebuffer or Matthias/shadows scene identity differs")
    if baseline["revision"].lower() == candidate["revision"].lower():
        raise IncomparableBenchmarks("Same revision on both sides; supply distinct baseline/candidate SHAs")
    before_census = _check_draw_census(baseline, "baseline")
    after_census = _check_draw_census(candidate, "candidate")
    if before_census != after_census:
        raise IncomparableBenchmarks("Required real draw census differs between revisions")
    before_flames = _flame_live_identity(baseline, "baseline")
    after_flames = _flame_live_identity(candidate, "candidate")
    if before_flames is not None and after_flames is not None and before_flames != after_flames:
        raise IncomparableBenchmarks("Live flame population differs between hardware revisions")

    metrics = []
    for key, label, unit in (
        ("gpuMs", "GPU elapsed per draw", "ms"),
        ("cpuP95Ms", "CPU submit p95", "ms"),
        ("rafGapP95Ms", "Adjacent RAF p95", "ms"),
        ("startupMs", "First-ready startup", "ms"),
        ("initialDrawCalls", "Initial draw calls", "calls"),
        # Real sustained renderer.info draw submissions, NOT GLB graph candidates.
        ("mainDrawCalls", "Sustained main draws", "calls"),
        ("shadowDrawCalls", "Sustained shadow draws", "calls"),
        ("mainCastleDrawCalls", "Main castle draws", "calls"),
        ("mainMatthiasDrawCalls", "Main Matthias draws", "calls"),
        ("mainRuntimeDrawCalls", "Main runtime draws", "calls"),
        ("shadowCastleDrawCalls", "Shadow castle draws", "calls"),
        ("shadowMatthiasDrawCalls", "Shadow Matthias draws", "calls"),
        ("shadowRuntimeDrawCalls", "Shadow runtime draws", "calls"),
        ("firstFrameMainDrawCalls", "First-frame main draws", "calls"),
        ("firstFrameShadowDrawCalls", "First-frame shadow draws", "calls"),
        ("allocatedTextures", "Three GPU textures", "count"),
        ("allocatedGeometries", "Three GPU geometries", "count"),
        ("modelDrawSlots", "GLB candidate draw slots", "count"),
        ("modelShadowCasterSlots", "GLB shadow candidates", "count"),
        ("modelTransparentSlots", "GLB transparent slots", "count"),
        ("modelUniqueGeometries", "GLB unique geometries", "count"),
        ("modelUniqueMaterials", "GLB unique materials", "count"),
    ):
        before = baseline["medians"].get(key)
        after = candidate["medians"].get(key)
        if before is None or after is None:
            metrics.append(dict(key=key, label=label, unit=unit, before=before, after=after, delta=None, percent=None))
            continue
        delta = after - before
        metrics.append(dict(key=key, label=label, unit=unit, before=before, after=after, delta=delta,
                            percent=100 * delta / before if before else None))
    return {
        "baseline": baseline["revision"],
        "candidate": candidate["revision"],
        "browser": old_signature[0],
        "vendor": old_signature[3][0],
        "rendererFingerprint": old_signature[3][1],
        "lod": old_signature[3][2],
        "ambient": old_signature[3][3],
        "viewport": old_signature[1],
        "metrics": metrics,
        "gpuTimingAvailable": next(m for m in metrics if m["key"] == "gpuMs")["delta"] is not None,
        "flameEvidenceComplete": before_flames is not None and after_flames is not None,
        "drawCensusEvidenceComplete": before_census and after_census,
    }


def _cell(value):
    return "n/a" if value is None else f"{value:.3f}"


def format_comparison(result):
    width, height, dpr = result["viewport"]
    lines = [
        f"Home 3D · GPU real A/B | {result['baseline'][:12]} -> {result['candidate'][:12]}",
        f"Renderer: {result['vendor']} ({result['rendererFingerprint']}); Chromium {result['browser']}",
        f"Viewport: {width:g}x{height:g} @ DPR {dpr:g}; LOD {result['lod']}; ambient {result['ambient']}",
        "",
        f"{'Metric':<26} {'Baseline':>12} {'Candidate':>12} {'Delta':>12} {'Change %':>12}",
    ]
    for metric in result["metrics"]:
        percent = "n/a" if metric["percent"] is None else "{:+.2f}%".format(metric["percent"])
        lines.append(f"{metric['label']:<26} {_cell(metric['before']):>12} {_cell(metric['after']):>12} "
                     f"{_cell(metric['delta']):>12} {percent:>12}")
    if not result["gpuTimingAvailable"]:
        lines.append("GPU timing: UNAVAILABLE on one/both revisions; CPU times are NOT GPU measurements.")
    if not result["drawCensusEvidenceComplete"]:
        lines.append("Sustained draw census: NOT REQUIRED on both revisions; do not assert actual draw savings.")
    if result["flameEvidenceComplete"]:
        lines.append("Live flame population matches in both revisions; material sidedness may differ intentionally.")
    else:
        lines.append("Live flame evidence: UNAVAILABLE for one/both revisions; do not infer flame optimization savings.")
    lines.append("A matching renderer fingerprint is not proof of the same physical machine.")
    lines.append("Recheck driver, GPU, browser, power mode, assets/network and repeat A/B runs before claiming a gain.")
    lines.append("Draw counts and Three allocations are counts, not GPU FPS or VRAM usage.")
    lines.append("Sustained draw counts are measured renderer submissions, NOT candidate GLB material slots.")
    lines.append("GLB candidate slots are a one-time scene-graph inventory, NOT measured GPU draw calls; they exclude Matthias, particles and sprites.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args(argv)
    try:
        base = json.loads(args.baseline.read_text(encoding="utf-8"))
        next_report = json.loads(args.candidate.read_text(encoding="utf-8"))
        print(format_comparison(compare_reports(base, next_report)))
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(2, f"Home GPU comparison rejected: {exc}\n")


if __name__ == "__main__":
    main()
