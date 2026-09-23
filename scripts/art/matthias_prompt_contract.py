#!/usr/bin/env python3
"""Compile Matthias candidate prompts and audit runtime sprites against semantic pose contracts.

The contract file intentionally uses JSON syntax inside .yaml. JSON is valid YAML 1.2,
which lets this CI path stay stdlib-only apart from Pillow, already required by the
Pawn Slug sprite smoke.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw

DEFAULT_CONTRACT = Path(__file__).with_name("contracts") / "matthias_prompt_contract.yaml"


class ContractError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_contract(path: Path = DEFAULT_CONTRACT) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot load prompt contract {path}: {exc}") from exc
    if data.get("schema") != 1:
        raise ContractError("unsupported Matthias prompt contract schema")
    if data.get("id") != "matthias-runtime-authoring":
        raise ContractError("unexpected Matthias prompt contract id")
    return data


def _bullets(title: str, values: Iterable[str]) -> list[str]:
    values = [str(value).strip() for value in values if str(value).strip()]
    if not values:
        return []
    return [title, *(f"- {value}" for value in values), ""]


def _phase_label(action: dict, frame_index: int) -> str:
    phases = action.get("phase_labels", [])
    if not phases:
        return f"frame_{frame_index}"
    if not 0 <= frame_index < len(phases):
        raise ContractError(f"frame index {frame_index} outside action phase list")
    return phases[frame_index]


def compile_prompt(
    contract: dict,
    *,
    weapon: str,
    action_name: str,
    frame_index: int,
    reference_hashes: dict[str, str] | None = None,
) -> str:
    weapons = contract["weapons"]
    actions = contract["actions"]
    if weapon not in weapons:
        raise ContractError(f"unknown Matthias weapon: {weapon}")
    if action_name not in actions:
        raise ContractError(f"unknown Matthias action: {action_name}")
    action = actions[action_name]
    if action.get("row") is None and action_name != "move_fire":
        raise ContractError(f"action {action_name} is not part of the strict runtime atlas")
    stored = int(contract["runtime"]["stored_frames_per_action"])
    if not 0 <= frame_index < stored:
        raise ContractError(f"frame index {frame_index} outside 0..{stored - 1}")
    phase = _phase_label(action, frame_index)
    weapon_spec = weapons[weapon]
    actor = contract["actor"]
    output = contract["output"]
    refs = reference_hashes or {}

    lines = [
        "TASK",
        "",
        "Generate exactly one candidate frame for the Pawn Slug Godot runtime.",
        "",
        "Actor: Matthias",
        f"Weapon: {weapon}",
        f"Action: {action_name}",
        f"Animation phase: {phase}, frame {frame_index + 1}/{stored}",
        "",
        "REFERENCE PRIORITY",
        "",
    ]
    for index, value in enumerate(contract["reference_priority"], start=1):
        lines.append(f"{index}. {value.replace('_', ' ')}")
    lines += [
        "",
        "Reference priority is strict. A lower-priority text instruction must never redesign or override an established higher-priority visual reference.",
        "",
    ]
    if refs:
        lines.extend(["REFERENCE HASHES", ""])
        for key in sorted(refs):
            lines.append(f"- {key}: sha256:{refs[key]}")
        lines.append("")

    lines += _bullets("ACTOR — MUST", actor.get("must", []))
    lines += _bullets("ACTOR — NEVER", actor.get("never", []))
    lines.extend(["WEAPON", "", weapon_spec["description"], ""])
    lines += _bullets("WEAPON — MUST", weapon_spec.get("must", []))
    lines += _bullets("WEAPON — NEVER", weapon_spec.get("never", []))

    lines.extend(["ACTION", "", action["semantic"], ""])
    inherited_must: list[str] = []
    inherited_never: list[str] = []
    for parent in action.get("inherits", []):
        parent_spec = actions[parent]
        inherited_must.append(f"Inherit {parent}: {parent_spec['semantic']}")
        inherited_must.extend(parent_spec.get("must", []))
        inherited_never.extend(parent_spec.get("never", []))
    lines += _bullets("ACTION — MUST", [*inherited_must, *action.get("must", [])])
    lines += _bullets("ACTION — NEVER", [*inherited_never, *action.get("never", [])])
    if "aim_degrees" in action:
        lines.extend([
            "AIM CONTRACT",
            "",
            f"Target weapon/barrel aim is approximately {action['aim_degrees']} degrees in sprite coordinates.",
            "Weapon axis, hands and upper-body support must agree with that aim.",
            "",
        ])

    lines.extend(["TEMPORAL CONTINUITY", ""])
    lines += [*(f"- {rule}" for rule in contract["prompt_rules"]["previous_frame"]), ""]
    if action.get("loop"):
        lines += _bullets("LOOP CLOSURE", contract["prompt_rules"]["loop"])

    audit = action.get("audit", {})
    lines.extend([
        "GEOMETRY / QA INTENT",
        "",
        "The candidate will be measured after generation. Do not fake compliance through canvas translation or uniform actor scaling.",
        f"Automated audit mode: {audit.get('mode', 'review')}; enforcement: {audit.get('enforcement', 'review')}.",
    ])
    if action_name == "crouch":
        lines.extend([
            f"Crouch body-height ratio must be <= {audit['max_body_height_ratio_vs_idle']:.3f} of the canonical idle body-height measurement.",
            f"The body top must drop by >= {audit['min_body_top_drop_ratio_vs_idle']:.3f} idle heights while the footline changes by <= {audit['max_body_footline_delta_ratio_vs_idle']:.3f} idle heights.",
        ])
    elif action_name in {"crouch_walk", "shoot_crouch"}:
        lines.extend([
            f"Stay within {audit['min_height_ratio_vs_crouch']:.3f}..{audit['max_height_ratio_vs_crouch']:.3f} of canonical crouch body height.",
            f"Keep footline change <= {audit['max_footline_delta_ratio_vs_crouch']:.3f} crouch heights.",
        ])
    lines.append("")

    lines += _bullets("WEAPON / BODY OCCLUSION", contract["prompt_rules"]["weapon_occlusion"])
    lines += _bullets("OUTPUT CONTRACT", output["must"])
    lines.extend([
        "CANDIDATE STATUS",
        "",
        "This image is untrusted and enters quarantine after generation. It is not a runtime asset until structural, geometric, semantic, temporal, visual and Godot runtime gates accept the exact candidate hash.",
        "",
    ])
    return "\n".join(lines).rstrip() + "\n"


def validate_reference_set(contract: dict, refs: dict[str, Path]) -> None:
    required = set(contract.get("references", {}).get("required", []))
    missing = sorted(required - set(refs))
    if missing:
        raise ContractError(
            "production candidate generation requires reference(s): " + ", ".join(missing)
        )


def build_sidecar(
    contract: dict,
    *,
    weapon: str,
    action_name: str,
    frame_index: int,
    prompt: str,
    refs: dict[str, Path],
    candidate: Path | None = None,
) -> dict:
    action = contract["actions"][action_name]
    stored = int(contract["runtime"]["stored_frames_per_action"])
    payload = {
        "schema": 1,
        "contract": f"{contract['id']}-v{contract['version']}",
        "actor": "matthias",
        "weapon": weapon,
        "action": action_name,
        "frameIndex": frame_index,
        "storedFrames": stored,
        "phase": frame_index / float(stored),
        "phaseLabel": _phase_label(action, frame_index),
        "promptContractVersion": contract["version"],
        "promptSha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "references": {},
        "candidateSha256": sha256_file(candidate) if candidate else None,
        "state": contract["output"].get("state", "quarantined"),
    }
    for key, path in sorted(refs.items()):
        payload["references"][key] = {"path": str(path), "sha256": sha256_file(path)}
    return payload


@dataclass(frozen=True)
class FrameMetrics:
    path: Path
    bbox: tuple[int, int, int, int]
    body_bbox: tuple[int, int, int, int]
    shape: Image.Image
    lower_shape: Image.Image

    @property
    def body_height(self) -> int:
        return self.body_bbox[3] - self.body_bbox[1]

    @property
    def body_top(self) -> int:
        return self.body_bbox[1]

    @property
    def body_bottom(self) -> int:
        return self.body_bbox[3]


def _binary_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    return alpha.point(lambda value: 255 if value >= 32 else 0, mode="L")


def _normalized_mask(mask: Image.Image, bbox: tuple[int, int, int, int], size: tuple[int, int] = (96, 96)) -> Image.Image:
    crop = mask.crop(bbox)
    if crop.width <= 0 or crop.height <= 0:
        return Image.new("L", size, 0)
    return crop.resize(size, Image.Resampling.NEAREST)


def _measure_frame(path: Path, contract: dict) -> FrameMetrics:
    image = Image.open(path).convert("RGBA")
    mask = _binary_alpha(image)
    bbox = mask.getbbox()
    if bbox is None:
        raise ContractError(f"empty sprite frame: {path}")
    start, end = contract["runtime"]["body_measure_band_x_ratio"]
    x0 = max(0, min(image.width - 1, int(round(float(start) * image.width))))
    x1 = max(x0 + 1, min(image.width, int(round(float(end) * image.width))))
    body_band = mask.crop((x0, 0, x1, image.height))
    local_body = body_band.getbbox()
    if local_body is None:
        raise ContractError(f"no alpha inside Matthias body measurement band: {path}")
    body_bbox = (x0 + local_body[0], local_body[1], x0 + local_body[2], local_body[3])
    shape = _normalized_mask(mask, bbox)

    lower_ratio = float(contract["runtime"]["lower_body_crop_ratio"])
    body_h = body_bbox[3] - body_bbox[1]
    lower_y = body_bbox[3] - max(1, int(round(body_h * lower_ratio)))
    lower_bbox = (body_bbox[0], lower_y, body_bbox[2], body_bbox[3])
    lower_shape = _normalized_mask(mask, lower_bbox, (96, 48))
    return FrameMetrics(path, bbox, body_bbox, shape, lower_shape)


def _mask_difference(first: Image.Image, second: Image.Image) -> float:
    if first.size != second.size:
        raise ContractError("normalized mask sizes do not match")
    diff = ImageChops.difference(first, second)
    histogram = diff.histogram()
    total = sum(index * count for index, count in enumerate(histogram))
    denominator = 255.0 * first.width * first.height
    return 0.0 if denominator <= 0 else total / denominator


def _median(values: Iterable[float]) -> float:
    values = list(values)
    return float(statistics.median(values)) if values else 0.0


def _frames_for_action(smoke_dir: Path, weapon: str, action: dict, contract: dict) -> list[FrameMetrics]:
    row = action.get("row")
    if row is None:
        return []
    frames = []
    stored = int(contract["runtime"]["stored_frames_per_action"])
    for column in range(stored):
        path = smoke_dir / weapon / "frames" / f"matthias_{weapon}_r{int(row):02d}_c{column:02d}.png"
        if path.is_file():
            frames.append(_measure_frame(path, contract))
    return frames


def _action_summary(frames: list[FrameMetrics]) -> dict:
    if not frames:
        return {"frameCount": 0}
    return {
        "frameCount": len(frames),
        "medianBodyHeight": round(_median(frame.body_height for frame in frames), 4),
        "medianBodyTop": round(_median(frame.body_top for frame in frames), 4),
        "medianBodyBottom": round(_median(frame.body_bottom for frame in frames), 4),
        "maxShapePairDifference": round(max((_mask_difference(a.shape, b.shape) for a, b in zip(frames, frames[1:])), default=0.0), 6),
        "maxLowerPairDifference": round(max((_mask_difference(a.lower_shape, b.lower_shape) for a, b in zip(frames, frames[1:])), default=0.0), 6),
        "distinctFrameCount": len({sha256_file(frame.path) for frame in frames}),
    }


def _internal_steps(frames: list[FrameMetrics], reference_height: float) -> dict:
    height_px = [abs(b.body_height - a.body_height) for a, b in zip(frames, frames[1:])]
    foot_px = [abs(b.body_bottom - a.body_bottom) for a, b in zip(frames, frames[1:])]
    top_px = [abs(b.body_top - a.body_top) for a, b in zip(frames, frames[1:])]
    return {
        "maxHeightStepPx": max(height_px, default=0.0),
        "maxHeightStepRatio": round(max(height_px, default=0.0) / reference_height, 6),
        "maxFootStepPx": max(foot_px, default=0.0),
        "maxFootStepRatio": round(max(foot_px, default=0.0) / reference_height, 6),
        "maxTopStepPx": max(top_px, default=0.0),
        "maxTopStepRatio": round(max(top_px, default=0.0) / reference_height, 6),
    }


def _within_ratio_with_pixel_slack(actual_px: float, reference_height: float, ratio_limit: float, pixel_slack: float) -> bool:
    # Raster geometry is integer-valued. A ratio threshold that lands between
    # pixels (for example 0.35 * 170 == 59.5 px) must not turn a coherent 60 px
    # transition into a hard failure. The semantic limit remains unchanged; only
    # one explicitly contracted pixel of quantization slack is permitted.
    return actual_px <= ratio_limit * reference_height + pixel_slack


def _trailing_near_duplicate_count(frames: list[FrameMetrics], threshold: float = 0.01) -> int:
    if not frames:
        return 0
    count = 1
    for index in range(len(frames) - 1, 0, -1):
        if _mask_difference(frames[index].shape, frames[index - 1].shape) > threshold:
            break
        count += 1
    return count


def _record(statuses: list[dict], *, action: str, weapon: str, enforcement: str, ok: bool, check: str, actual, expected: str) -> None:
    statuses.append({
        "action": action,
        "weapon": weapon,
        "enforcement": enforcement,
        "status": "pass" if ok else ("fail" if enforcement == "hard" else "review"),
        "check": check,
        "actual": actual,
        "expected": expected,
    })


def audit_smoke(contract: dict, smoke_dir: Path) -> dict:
    weapons = tuple(contract["weapons"].keys())
    actions = contract["actions"]
    report = {
        "schema": 1,
        "contract": f"{contract['id']}-v{contract['version']}",
        "weapons": {},
        "checks": [],
    }
    summaries: dict[str, dict[str, dict]] = {}
    metrics: dict[str, dict[str, list[FrameMetrics]]] = {}
    for weapon in weapons:
        summaries[weapon] = {}
        metrics[weapon] = {}
        for action_name, action in actions.items():
            if action.get("row") is None:
                continue
            frames = _frames_for_action(smoke_dir, weapon, action, contract)
            metrics[weapon][action_name] = frames
            summaries[weapon][action_name] = _action_summary(frames)
        report["weapons"][weapon] = summaries[weapon]

    checks: list[dict] = report["checks"]
    for weapon in weapons:
        idle = summaries[weapon].get("idle", {})
        crouch = summaries[weapon].get("crouch", {})
        crouch_walk = summaries[weapon].get("crouch_walk", {})
        idle_h = float(idle.get("medianBodyHeight", 0.0))
        crouch_h = float(crouch.get("medianBodyHeight", 0.0))
        if idle_h <= 0 or crouch_h <= 0:
            _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=False, check="required_frames", actual={"idle":idle.get("frameCount",0),"crouch":crouch.get("frameCount",0)}, expected="non-empty idle and crouch rows")
            continue

        c_spec = actions["crouch"]["audit"]
        height_ratio = crouch_h / idle_h
        top_drop = (float(crouch["medianBodyTop"]) - float(idle["medianBodyTop"])) / idle_h
        foot_delta = abs(float(crouch["medianBodyBottom"]) - float(idle["medianBodyBottom"])) / idle_h
        _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=height_ratio <= c_spec["max_body_height_ratio_vs_idle"], check="body_height_vs_idle", actual=round(height_ratio,6), expected=f"<= {c_spec['max_body_height_ratio_vs_idle']}")
        _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=top_drop >= c_spec["min_body_top_drop_ratio_vs_idle"], check="body_top_drop_vs_idle", actual=round(top_drop,6), expected=f">= {c_spec['min_body_top_drop_ratio_vs_idle']}")
        _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=foot_delta <= c_spec["max_body_footline_delta_ratio_vs_idle"], check="body_footline_vs_idle", actual=round(foot_delta,6), expected=f"<= {c_spec['max_body_footline_delta_ratio_vs_idle']}")
        steps = _internal_steps(metrics[weapon]["crouch"], max(1.0, crouch_h))
        _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=steps["maxHeightStepRatio"] <= c_spec["max_internal_height_step_ratio"], check="internal_height_step", actual=steps["maxHeightStepRatio"], expected=f"<= {c_spec['max_internal_height_step_ratio']}")
        _record(checks, action="crouch", weapon=weapon, enforcement="hard", ok=steps["maxFootStepRatio"] <= c_spec["max_internal_foot_step_ratio"], check="internal_foot_step", actual=steps["maxFootStepRatio"], expected=f"<= {c_spec['max_internal_foot_step_ratio']}")

        cw_spec = actions["crouch_walk"]["audit"]
        cw_h = float(crouch_walk.get("medianBodyHeight", 0.0))
        if cw_h > 0:
            ratio = cw_h / crouch_h
            delta = abs(float(crouch_walk["medianBodyBottom"]) - float(crouch["medianBodyBottom"])) / max(1.0, crouch_h)
            _record(checks, action="crouch_walk", weapon=weapon, enforcement="hard", ok=cw_spec["min_height_ratio_vs_crouch"] <= ratio <= cw_spec["max_height_ratio_vs_crouch"], check="body_height_vs_crouch", actual=round(ratio,6), expected=f"{cw_spec['min_height_ratio_vs_crouch']}..{cw_spec['max_height_ratio_vs_crouch']}")
            _record(checks, action="crouch_walk", weapon=weapon, enforcement="hard", ok=delta <= cw_spec["max_footline_delta_ratio_vs_crouch"], check="body_footline_vs_crouch", actual=round(delta,6), expected=f"<= {cw_spec['max_footline_delta_ratio_vs_crouch']}")
            _record(checks, action="crouch_walk", weapon=weapon, enforcement="hard", ok=float(crouch_walk.get("maxLowerPairDifference",0.0)) >= cw_spec["min_max_pair_difference"], check="lower_body_motion", actual=crouch_walk.get("maxLowerPairDifference",0.0), expected=f">= {cw_spec['min_max_pair_difference']}")

        sc = summaries[weapon].get("shoot_crouch", {})
        if sc.get("frameCount", 0) and crouch_h > 0:
            spec = actions["shoot_crouch"]["audit"]
            ratio = float(sc["medianBodyHeight"]) / crouch_h
            delta = abs(float(sc["medianBodyBottom"]) - float(crouch["medianBodyBottom"])) / crouch_h
            _record(checks, action="shoot_crouch", weapon=weapon, enforcement="hard", ok=spec["min_height_ratio_vs_crouch"] <= ratio <= spec["max_height_ratio_vs_crouch"], check="body_height_vs_crouch", actual=round(ratio,6), expected=f"{spec['min_height_ratio_vs_crouch']}..{spec['max_height_ratio_vs_crouch']}")
            _record(checks, action="shoot_crouch", weapon=weapon, enforcement="hard", ok=delta <= spec["max_footline_delta_ratio_vs_crouch"], check="body_footline_vs_crouch", actual=round(delta,6), expected=f"<= {spec['max_footline_delta_ratio_vs_crouch']}")

        for action_name in ("walk", "run"):
            spec = actions[action_name]["audit"]
            summary = summaries[weapon].get(action_name, {})
            _record(checks, action=action_name, weapon=weapon, enforcement=spec["enforcement"], ok=float(summary.get("maxLowerPairDifference",0.0)) >= spec["min_max_pair_difference"], check="lower_body_motion", actual=summary.get("maxLowerPairDifference",0.0), expected=f">= {spec['min_max_pair_difference']}")

        for action_name in ("reload", "hurt", "die", "land"):
            spec = actions[action_name]["audit"]
            frames = metrics[weapon].get(action_name, [])
            summary = summaries[weapon].get(action_name, {})
            if not frames or not summary.get("medianBodyHeight"):
                continue
            reference_height = max(1.0, float(summary["medianBodyHeight"]))
            steps = _internal_steps(frames, reference_height)
            pixel_slack = float(contract["runtime"].get("temporal_pixel_slack", 0.0))
            height_ok = _within_ratio_with_pixel_slack(
                float(steps["maxHeightStepPx"]),
                reference_height,
                float(spec["max_height_step_ratio"]),
                pixel_slack,
            )
            foot_ok = _within_ratio_with_pixel_slack(
                float(steps["maxFootStepPx"]),
                reference_height,
                float(spec["max_foot_step_ratio"]),
                pixel_slack,
            )
            _record(checks, action=action_name, weapon=weapon, enforcement=spec["enforcement"], ok=height_ok, check="temporal_height_step", actual=steps["maxHeightStepRatio"], expected=f"<= {spec['max_height_step_ratio']} (+ {pixel_slack:g}px raster slack)")
            _record(checks, action=action_name, weapon=weapon, enforcement=spec["enforcement"], ok=foot_ok, check="temporal_foot_step", actual=steps["maxFootStepRatio"], expected=f"<= {spec['max_foot_step_ratio']} (+ {pixel_slack:g}px raster slack)")
            if "min_distinct_frame_count" in spec:
                _record(checks, action=action_name, weapon=weapon, enforcement=spec["enforcement"], ok=int(summary.get("distinctFrameCount",0)) >= int(spec["min_distinct_frame_count"]), check="distinct_frames", actual=summary.get("distinctFrameCount",0), expected=f">= {spec['min_distinct_frame_count']}")
            if "max_trailing_near_duplicate_frames" in spec:
                trailing = _trailing_near_duplicate_count(frames)
                _record(checks, action=action_name, weapon=weapon, enforcement=spec["enforcement"], ok=trailing <= int(spec["max_trailing_near_duplicate_frames"]), check="trailing_near_duplicate_frames", actual=trailing, expected=f"<= {spec['max_trailing_near_duplicate_frames']}")

        seen_pairs: set[tuple[str, str]] = set()
        for action_name, action in actions.items():
            spec = action.get("audit", {})
            other = spec.get("compare_to")
            if not other or action_name not in metrics[weapon] or other not in metrics[weapon]:
                continue
            pair_key = tuple(sorted((action_name, other)))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            first = metrics[weapon][action_name]
            second = metrics[weapon][other]
            if not first or not second:
                continue
            shape_diff = _mask_difference(first[0].shape, second[0].shape)
            minimum = float(spec.get("min_shape_difference", 0.0))
            _record(checks, action=action_name, weapon=weapon, enforcement=spec.get("enforcement","review"), ok=shape_diff >= minimum, check=f"shape_distinct_from_{other}", actual=round(shape_diff,6), expected=f">= {minimum}")

    hard_failures = [item for item in checks if item["status"] == "fail"]
    reviews = [item for item in checks if item["status"] == "review"]
    report["summary"] = {
        "hardFailures": len(hard_failures),
        "reviewFindings": len(reviews),
        "passes": sum(item["status"] == "pass" for item in checks),
        "status": "fail" if hard_failures else ("review" if reviews else "pass"),
    }
    return report


def save_review_png(contract: dict, smoke_dir: Path, report: dict, output: Path) -> None:
    weapons = tuple(contract["weapons"].keys())
    actions = ("idle", "walk", "run", "jump", "fall", "land", "crouch", "crouch_walk", "shoot_crouch", "reload", "hurt", "die")
    tile = 152
    label = 34
    board = Image.new("RGBA", (tile * len(actions), (tile + label) * len(weapons)), (22, 24, 28, 255))
    draw = ImageDraw.Draw(board)
    for w_index, weapon in enumerate(weapons):
        for a_index, action_name in enumerate(actions):
            action = contract["actions"][action_name]
            row = action.get("row")
            x = a_index * tile
            y = w_index * (tile + label)
            draw.text((x + 4, y + 4), f"{weapon[:7]} {action_name[:10]}", fill=(238,238,238,255))
            if row is None:
                continue
            frame = smoke_dir / weapon / "frames" / f"matthias_{weapon}_r{int(row):02d}_c00.png"
            if not frame.is_file():
                continue
            image = Image.open(frame).convert("RGBA")
            image.thumbnail((tile - 8, tile - 8), Image.Resampling.NEAREST)
            ox = x + (tile - image.width) // 2
            oy = y + label + (tile - image.height) // 2
            board.alpha_composite(image, (ox, oy))
    output.parent.mkdir(parents=True, exist_ok=True)
    board.save(output, "PNG", optimize=True)


def write_summary(report: dict) -> str:
    lines = [
        "### Matthias semantic pose contract",
        "",
        f"Status: **{report['summary']['status']}** · hard failures: {report['summary']['hardFailures']} · review findings: {report['summary']['reviewFindings']} · passes: {report['summary']['passes']}",
        "",
        "| Weapon | Action | Gate | Status | Actual | Expected |",
        "|---|---|---|---:|---:|---|",
    ]
    for item in report["checks"]:
        if item["status"] == "pass":
            continue
        lines.append(f"| {item['weapon']} | {item['action']} | {item['check']} | {item['status']} | {item['actual']} | {item['expected']} |")
    if len(lines) == 6:
        lines.append("| — | — | — | pass | — | no findings |")
    return "\n".join(lines) + "\n"


def _reference_args(values: list[str]) -> dict[str, Path]:
    refs: dict[str, Path] = {}
    for item in values:
        if "=" not in item:
            raise ContractError(f"invalid reference {item!r}; expected NAME=PATH")
        name, raw = item.split("=", 1)
        path = Path(raw)
        if not path.is_file():
            raise ContractError(f"reference does not exist: {path}")
        refs[name.strip()] = path
    return refs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    sub = parser.add_subparsers(dest="command", required=True)

    compile_cmd = sub.add_parser("compile")
    compile_cmd.add_argument("--weapon", required=True)
    compile_cmd.add_argument("--action", required=True)
    compile_cmd.add_argument("--frame-index", type=int, required=True)
    compile_cmd.add_argument("--reference", action="append", default=[])
    compile_cmd.add_argument("--candidate", type=Path)
    compile_cmd.add_argument("--prompt-output", type=Path, required=True)
    compile_cmd.add_argument("--sidecar-output", type=Path, required=True)

    audit_cmd = sub.add_parser("audit-smoke")
    audit_cmd.add_argument("--smoke-dir", type=Path, required=True)
    audit_cmd.add_argument("--output", type=Path, required=True)
    audit_cmd.add_argument("--review-png", type=Path)
    audit_cmd.add_argument("--summary-output", type=Path)
    audit_cmd.add_argument("--fail-on-hard", action="store_true")

    sub.add_parser("self-test-contract")
    args = parser.parse_args()
    contract = load_contract(args.contract)

    if args.command == "compile":
        refs = _reference_args(args.reference)
        validate_reference_set(contract, refs)
        hashes = {name: sha256_file(path) for name, path in refs.items()}
        prompt = compile_prompt(contract, weapon=args.weapon, action_name=args.action, frame_index=args.frame_index, reference_hashes=hashes)
        sidecar = build_sidecar(contract, weapon=args.weapon, action_name=args.action, frame_index=args.frame_index, prompt=prompt, refs=refs, candidate=args.candidate)
        args.prompt_output.parent.mkdir(parents=True, exist_ok=True)
        args.sidecar_output.parent.mkdir(parents=True, exist_ok=True)
        args.prompt_output.write_text(prompt, encoding="utf-8")
        args.sidecar_output.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"OK compiled {args.weapon}/{args.action}/frame-{args.frame_index}: {sidecar['promptSha256']}")
        return 0

    if args.command == "audit-smoke":
        if not args.smoke_dir.is_dir():
            raise ContractError(f"smoke dir does not exist: {args.smoke_dir}")
        report = audit_smoke(contract, args.smoke_dir)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.review_png:
            save_review_png(contract, args.smoke_dir, report, args.review_png)
        if args.summary_output:
            args.summary_output.write_text(write_summary(report), encoding="utf-8")
        print(json.dumps(report["summary"], sort_keys=True))
        return 2 if args.fail_on_hard and report["summary"]["hardFailures"] else 0

    if args.command == "self-test-contract":
        expected_weapons = {"pistol", "machinegun", "shotgun", "panzerfaust"}
        expected_actions = {"idle","walk","run","jump","fall","land","crouch","crouch_walk","shoot","shoot_up","shoot_down","shoot_diag_up","shoot_diag_up_alt","shoot_diag_down","shoot_crouch","reload","hurt","die","move_fire"}
        if set(contract["weapons"]) != expected_weapons:
            raise ContractError("weapon suite incomplete")
        if set(contract["actions"]) != expected_actions:
            raise ContractError("action suite incomplete")
        rows = [spec["row"] for name, spec in contract["actions"].items() if name != "move_fire"]
        if rows != list(range(18)):
            raise ContractError(f"strict action rows must be exactly 0..17, got {rows}")
        prompt = compile_prompt(contract, weapon="shotgun", action_name="crouch_walk", frame_index=2)
        required = ["never resize Matthias", "Static crouch translated sideways", "transparent background", "frame 3/8"]
        lowered = prompt.lower()
        missing = [item for item in required if item.lower() not in lowered]
        if missing:
            raise ContractError(f"compiled prompt missing required contract text: {missing}")
        print("Matthias prompt contract self-test: OK")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())