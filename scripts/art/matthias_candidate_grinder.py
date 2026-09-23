#!/usr/bin/env python3
"""Compile provider-agnostic Matthias image requests and quarantine candidate PNGs.

This module deliberately does not call an image provider. It defines the hard handoff:
contract + references -> request bundle -> external generator -> candidate PNG -> grinder.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from matthias_prompt_contract import (
    ContractError,
    DEFAULT_CONTRACT,
    build_sidecar,
    compile_prompt,
    load_contract,
    sha256_file,
    validate_reference_set,
)


@dataclass(frozen=True)
class RawSpriteMetrics:
    path: Path
    canvas: tuple[int, int]
    alpha_bbox: tuple[int, int, int, int]
    bbox_width: int
    bbox_height: int
    head_anchor_width: int
    primary_alpha_fraction: float


def _parse_references(values: list[str]) -> dict[str, Path]:
    refs: dict[str, Path] = {}
    for item in values:
        if "=" not in item:
            raise ContractError(f"invalid reference {item!r}; expected NAME=PATH")
        name, raw = item.split("=", 1)
        name = name.strip()
        path = Path(raw)
        if not name:
            raise ContractError(f"invalid empty reference name in {item!r}")
        if not path.is_file():
            raise ContractError(f"reference does not exist: {path}")
        refs[name] = path
    return refs


def _alpha_binary(image: Image.Image, threshold: int) -> list[list[bool]]:
    alpha = image.convert("RGBA").getchannel("A")
    width, height = alpha.size
    px = alpha.load()
    return [[px[x, y] >= threshold for x in range(width)] for y in range(height)]


def _bbox_from_binary(mask: list[list[bool]]) -> tuple[int, int, int, int] | None:
    height = len(mask)
    width = len(mask[0]) if height else 0
    xs: list[int] = []
    ys: list[int] = []
    for y in range(height):
        row = mask[y]
        for x in range(width):
            if row[x]:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def _primary_component_fraction(mask: list[list[bool]]) -> float:
    height = len(mask)
    width = len(mask[0]) if height else 0
    visited: set[tuple[int, int]] = set()
    total = 0
    largest = 0
    for y in range(height):
        for x in range(width):
            if not mask[y][x]:
                continue
            total += 1
            if (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            size = 0
            while stack:
                cx, cy = stack.pop()
                size += 1
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny][nx] and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            largest = max(largest, size)
    return 0.0 if total == 0 else largest / float(total)


def measure_raw_sprite(path: Path, contract: dict) -> RawSpriteMetrics:
    cfg = contract["candidate_audit"]
    threshold = int(cfg["alpha_threshold"])
    image = Image.open(path)
    if image.format != "PNG":
        raise ContractError(f"candidate must be PNG, got {image.format!r}: {path}")
    rgba = image.convert("RGBA")
    mask = _alpha_binary(rgba, threshold)
    bbox = _bbox_from_binary(mask)
    if bbox is None:
        raise ContractError(f"candidate has no visible alpha: {path}")
    left, top, right, bottom = bbox
    bbox_w = right - left
    bbox_h = bottom - top
    head_h = max(1, int(round(bbox_h * float(cfg["head_anchor_height_ratio"]))))
    head_y1 = min(bottom, top + head_h)
    head_xs: list[int] = []
    for y in range(top, head_y1):
        for x in range(left, right):
            if mask[y][x]:
                head_xs.append(x)
    head_width = (max(head_xs) - min(head_xs) + 1) if head_xs else 0
    return RawSpriteMetrics(
        path=path,
        canvas=rgba.size,
        alpha_bbox=bbox,
        bbox_width=bbox_w,
        bbox_height=bbox_h,
        head_anchor_width=head_width,
        primary_alpha_fraction=_primary_component_fraction(mask),
    )


def build_request_bundle(
    contract: dict,
    *,
    weapon: str,
    action: str,
    frame_index: int,
    refs: dict[str, Path],
) -> dict:
    validate_reference_set(contract, refs)
    hashes = {name: sha256_file(path) for name, path in refs.items()}
    prompt = compile_prompt(
        contract,
        weapon=weapon,
        action_name=action,
        frame_index=frame_index,
        reference_hashes=hashes,
    )
    return {
        "schema": 1,
        "kind": "matthias-image-generation-request",
        "contract": f"{contract['id']}-v{contract['version']}",
        "actor": "matthias",
        "weapon": weapon,
        "action": action,
        "frameIndex": frame_index,
        "provider": None,
        "prompt": prompt,
        "promptSha256": __import__("hashlib").sha256(prompt.encode("utf-8")).hexdigest(),
        "references": {
            name: {"path": str(path), "sha256": hashes[name]}
            for name, path in sorted(refs.items())
        },
        "outputContract": contract["output"],
        "candidateAudit": contract["candidate_audit"],
        "actionAudit": contract["actions"][action].get("audit", {}),
        "state": "awaiting_generation",
    }


def audit_candidate(
    contract: dict,
    *,
    candidate: Path,
    weapon: str,
    action: str,
    refs: dict[str, Path],
) -> dict:
    validate_reference_set(contract, refs)
    if "weapon" not in refs:
        raise ContractError("candidate audit requires canonical weapon reference")
    cfg = contract["candidate_audit"]
    cand = measure_raw_sprite(candidate, contract)
    weapon_ref = measure_raw_sprite(refs["weapon"], contract)
    identity_ref = measure_raw_sprite(refs.get("identity", refs["weapon"]), contract)

    checks: list[dict] = []

    def record(name: str, ok: bool, actual, expected: str, enforcement: str = "hard") -> None:
        checks.append({
            "check": name,
            "status": "pass" if ok else ("fail" if enforcement == "hard" else "review"),
            "enforcement": enforcement,
            "actual": actual,
            "expected": expected,
        })

    min_head = int(cfg["min_head_anchor_width_px"])
    record("head_anchor_present", cand.head_anchor_width >= min_head, cand.head_anchor_width, f">= {min_head}px")
    record(
        "primary_alpha_component",
        cand.primary_alpha_fraction >= float(cfg["min_primary_alpha_fraction"]),
        round(cand.primary_alpha_fraction, 6),
        f">= {cfg['min_primary_alpha_fraction']}",
        "hard",
    )

    if cand.head_anchor_width <= 0 or weapon_ref.head_anchor_width <= 0:
        scale = 0.0
        width_ratio = math.inf
        normalized_height_ratio = math.inf
    else:
        scale = weapon_ref.head_anchor_width / float(cand.head_anchor_width)
        normalized_width = cand.bbox_width * scale
        normalized_height = cand.bbox_height * scale
        width_ratio = normalized_width / max(1.0, float(weapon_ref.bbox_width))
        normalized_height_ratio = normalized_height / max(1.0, float(weapon_ref.bbox_height))

    min_wr = float(cfg["min_weapon_width_ratio_vs_reference"])
    max_wr = float(cfg["max_weapon_width_ratio_vs_reference"])
    record("weapon_body_width_vs_reference", min_wr <= width_ratio <= max_wr, round(width_ratio, 6), f"{min_wr}..{max_wr}")

    # Head-normalized height is the raw semantic anchor: the head/beret keeps actor
    # scale fixed while crouching is expected to shorten the full actor silhouette.
    if action == "crouch":
        max_hr = float(contract["actions"]["crouch"]["audit"]["max_body_height_ratio_vs_idle"])
        min_drop = float(contract["actions"]["crouch"]["audit"]["min_body_top_drop_ratio_vs_idle"])
        drop = 1.0 - normalized_height_ratio
        record("head_normalized_height_vs_idle", normalized_height_ratio <= max_hr, round(normalized_height_ratio, 6), f"<= {max_hr}")
        record("head_normalized_top_drop_vs_idle", drop >= min_drop, round(drop, 6), f">= {min_drop}")
    else:
        record(
            "pose_semantics",
            True,
            "deferred",
            "action-specific semantic gate runs after canonical normalization",
            "review",
        )

    # Identity reference is deliberately not used to scale the weapon. It is an
    # independent sanity signal for generation drift in head/beret proportions.
    head_ratio_identity = cand.head_anchor_width / max(1.0, float(identity_ref.head_anchor_width))
    record(
        "identity_head_scale_raw",
        0.5 <= head_ratio_identity <= 3.0,
        round(head_ratio_identity, 6),
        "0.5..3.0 raw-provider sanity envelope",
        "review",
    )

    hard = [c for c in checks if c["status"] == "fail"]
    reviews = [c for c in checks if c["status"] == "review"]
    return {
        "schema": 1,
        "kind": "matthias-candidate-grinder-report",
        "candidate": str(candidate),
        "candidateSha256": sha256_file(candidate),
        "weapon": weapon,
        "action": action,
        "metrics": {
            "canvas": list(cand.canvas),
            "alphaBbox": list(cand.alpha_bbox),
            "bboxWidth": cand.bbox_width,
            "bboxHeight": cand.bbox_height,
            "headAnchorWidth": cand.head_anchor_width,
            "primaryAlphaFraction": round(cand.primary_alpha_fraction, 6),
            "headNormalizationScale": round(scale, 6),
            "headNormalizedWidthRatioVsWeaponRef": round(width_ratio, 6) if math.isfinite(width_ratio) else None,
            "headNormalizedHeightRatioVsWeaponRef": round(normalized_height_ratio, 6) if math.isfinite(normalized_height_ratio) else None,
        },
        "checks": checks,
        "summary": {
            "hardFailures": len(hard),
            "reviewFindings": len(reviews),
            "passes": sum(c["status"] == "pass" for c in checks),
            "status": "fail" if hard else ("review" if reviews else "pass"),
        },
        "state": "rejected" if hard else "quarantined_validated",
    }


def write_compact_summary(report: dict) -> str:
    lines = [
        f"status={report['summary']['status']} hardFailures={report['summary']['hardFailures']} reviewFindings={report['summary']['reviewFindings']}",
    ]
    for check in report["checks"]:
        if check["status"] != "pass":
            lines.append(f"{check['status']}: {check['check']} actual={check['actual']} expected={check['expected']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    sub = parser.add_subparsers(dest="command", required=True)

    req = sub.add_parser("compile-request")
    req.add_argument("--weapon", required=True)
    req.add_argument("--action", required=True)
    req.add_argument("--frame-index", type=int, required=True)
    req.add_argument("--reference", action="append", default=[])
    req.add_argument("--output", type=Path, required=True)
    req.add_argument("--prompt-output", type=Path)

    val = sub.add_parser("validate-candidate")
    val.add_argument("--weapon", required=True)
    val.add_argument("--action", required=True)
    val.add_argument("--candidate", type=Path, required=True)
    val.add_argument("--reference", action="append", default=[])
    val.add_argument("--output", type=Path, required=True)
    val.add_argument("--summary-output", type=Path)
    val.add_argument("--fail-on-hard", action="store_true")

    args = parser.parse_args()
    contract = load_contract(args.contract)
    refs = _parse_references(args.reference)

    if args.command == "compile-request":
        bundle = build_request_bundle(
            contract,
            weapon=args.weapon,
            action=args.action,
            frame_index=args.frame_index,
            refs=refs,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.prompt_output:
            args.prompt_output.parent.mkdir(parents=True, exist_ok=True)
            args.prompt_output.write_text(bundle["prompt"], encoding="utf-8")
        print(f"OK request {args.weapon}/{args.action}/{args.frame_index}: {bundle['promptSha256']}")
        return 0

    if args.command == "validate-candidate":
        if not args.candidate.is_file():
            raise ContractError(f"candidate does not exist: {args.candidate}")
        report = audit_candidate(
            contract,
            candidate=args.candidate,
            weapon=args.weapon,
            action=args.action,
            refs=refs,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.summary_output:
            args.summary_output.write_text(write_compact_summary(report), encoding="utf-8")
        print(write_compact_summary(report), end="")
        return 2 if args.fail_on_hard and report["summary"]["hardFailures"] else 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())