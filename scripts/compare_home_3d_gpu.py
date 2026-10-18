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
        signatures.append((vendor, fingerprint, lod, ambient, visit["canvasWidth"], visit["canvasHeight"]))
    if len(set(signatures)) != 1:
        raise IncomparableBenchmarks(f"{label}: visits have inconsistent renderer, LOD or framebuffer size")
    medians = report.get("medians")
    if not isinstance(medians, dict):
        raise IncomparableBenchmarks(f"{label}: medians missing")
    for key in ("startupMs", "initialDrawCalls", "allocatedTextures", "allocatedGeometries",
                "cpuP95Ms", "rafGapP95Ms", "gpuMs", "modelDrawSlots",
                "modelShadowCasterSlots", "modelTransparentSlots",
                "modelUniqueGeometries", "modelUniqueMaterials"):
        value = medians.get(key)
        if value is not None and (not _finite_number(value) or value < 0):
            raise IncomparableBenchmarks(f"{label}: invalid {key} median")
    if report.get("requireTimer") is True and medians.get("gpuMs") is None:
        raise IncomparableBenchmarks(f"{label}: required physical GPU samples are missing")
    return (browser, tuple(viewport[k] for k in ("width", "height", "dpr")), bool(report.get("requireTimer")), signatures[0])


def compare_reports(baseline, candidate):
    """Return measured per-metric A/B differences; never infer missing timings."""
    old_signature = _check_report(baseline, "baseline")
    new_signature = _check_report(candidate, "candidate")
    if old_signature != new_signature:
        raise IncomparableBenchmarks("Browser, viewport/DPR, timer mode, renderer, LOD, lighting or framebuffer differs")
    if baseline["revision"].lower() == candidate["revision"].lower():
        raise IncomparableBenchmarks("Same revision on both sides; supply distinct baseline/candidate SHAs")

    metrics = []
    for key, label, unit in (
        ("gpuMs", "GPU elapsed per draw", "ms"),
        ("cpuP95Ms", "CPU submit p95", "ms"),
        ("rafGapP95Ms", "Adjacent RAF p95", "ms"),
        ("startupMs", "First-ready startup", "ms"),
        ("initialDrawCalls", "Initial draw calls", "calls"),
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
    lines.append("A matching renderer fingerprint is not proof of the same physical machine.")
    lines.append("Recheck driver, GPU, browser, power mode, assets/network and repeat A/B runs before claiming a gain.")
    lines.append("Draw counts and Three allocations are counts, not GPU FPS or VRAM usage.")
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
