#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image


@dataclass(frozen=True)
class Component:
    area: int
    bbox: tuple[int, int, int, int]
    centroid: tuple[float, float]


@dataclass(frozen=True)
class LintConfig:
    alpha_threshold: int = 8
    edge_guard_px: int = 2
    min_detached_area: int = 4
    allowed_detached_components: int = 0
    reject_hidden_rgb: bool = True


@dataclass(frozen=True)
class LintResult:
    ok: bool
    errors: tuple[str, ...]
    components: tuple[Component, ...]
    main_component: Component | None
    detached_components: tuple[Component, ...]
    hidden_rgb_pixels: int
    edge_pixels: int

    def to_json(self) -> dict:
        return {
            "ok": self.ok,
            "errors": list(self.errors),
            "components": [asdict(c) for c in self.components],
            "main_component": asdict(self.main_component) if self.main_component else None,
            "detached_components": [asdict(c) for c in self.detached_components],
            "hidden_rgb_pixels": self.hidden_rgb_pixels,
            "edge_pixels": self.edge_pixels,
        }


def _neighbors(x: int, y: int, width: int, height: int) -> Iterable[tuple[int, int]]:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                yield nx, ny


def connected_components(image: Image.Image, alpha_threshold: int = 8) -> list[Component]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A")
    alpha_data = alpha.load()
    visited = bytearray(width * height)
    out: list[Component] = []

    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if visited[idx] or alpha_data[x, y] < alpha_threshold:
                continue

            queue = deque([(x, y)])
            visited[idx] = 1
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            sum_x = 0
            sum_y = 0

            while queue:
                px, py = queue.popleft()
                area += 1
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)
                sum_x += px
                sum_y += py

                for nx, ny in _neighbors(px, py, width, height):
                    nidx = ny * width + nx
                    if visited[nidx] or alpha_data[nx, ny] < alpha_threshold:
                        continue
                    visited[nidx] = 1
                    queue.append((nx, ny))

            out.append(
                Component(
                    area=area,
                    bbox=(min_x, min_y, max_x + 1, max_y + 1),
                    centroid=(sum_x / area, sum_y / area),
                )
            )

    out.sort(key=lambda component: component.area, reverse=True)
    return out


def lint_frame(image: Image.Image, config: LintConfig = LintConfig()) -> LintResult:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    if width <= 0 or height <= 0:
        return LintResult(False, ("empty-canvas",), (), None, (), 0, 0)

    pixels = rgba.load()
    hidden_rgb = 0
    edge_pixels = 0
    guard = max(0, config.edge_guard_px)

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if config.reject_hidden_rgb and a == 0 and (r or g or b):
                hidden_rgb += 1
            if a >= config.alpha_threshold and (
                x < guard or y < guard or x >= width - guard or y >= height - guard
            ):
                edge_pixels += 1

    components = connected_components(rgba, config.alpha_threshold)
    main = components[0] if components else None
    detached = tuple(
        component
        for component in components[1:]
        if component.area >= config.min_detached_area
    )

    errors: list[str] = []
    if not main:
        errors.append("empty-frame")
    if hidden_rgb:
        errors.append(f"hidden-rgb:{hidden_rgb}")
    if edge_pixels:
        errors.append(f"edge-contact:{edge_pixels}")
    if len(detached) > config.allowed_detached_components:
        errors.append(
            f"orphan-components:{len(detached)}>{config.allowed_detached_components}"
        )

    return LintResult(
        ok=not errors,
        errors=tuple(errors),
        components=tuple(components),
        main_component=main,
        detached_components=detached,
        hidden_rgb_pixels=hidden_rgb,
        edge_pixels=edge_pixels,
    )



@dataclass(frozen=True)
class GeometryContract:
    canvas_size: tuple[int, int]
    body_height: int
    body_center_x: float
    foot_y: float
    alpha_centroid_x: float
    safe_margin_px: int = 8
    foot_tolerance_px: float = 1.0
    height_tolerance_px: float = 2.0
    centroid_tolerance_px: float = 6.0


@dataclass(frozen=True)
class GeometryMetrics:
    body_bbox: tuple[int, int, int, int]
    body_height: int
    body_center_x: float
    foot_y: float
    alpha_centroid_x: float


@dataclass(frozen=True)
class GeometryResult:
    ok: bool
    errors: tuple[str, ...]
    metrics: GeometryMetrics | None


class GeometryError(ValueError):
    pass


def _foreground_bbox(
    image: Image.Image,
    alpha_threshold: int,
) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    if alpha_threshold <= 1:
        return alpha.getbbox()
    mask = alpha.point(lambda value: 255 if value >= alpha_threshold else 0)
    return mask.getbbox()


def geometry_metrics(
    image: Image.Image,
    alpha_threshold: int = 8,
) -> GeometryMetrics | None:
    components = connected_components(image, alpha_threshold)
    if not components:
        return None
    body = components[0]
    left, top, right, bottom = body.bbox
    return GeometryMetrics(
        body_bbox=body.bbox,
        body_height=bottom - top,
        body_center_x=(left + right) / 2.0,
        foot_y=float(bottom),
        alpha_centroid_x=body.centroid[0],
    )


def validate_geometry(
    image: Image.Image,
    contract: GeometryContract,
    alpha_threshold: int = 8,
) -> GeometryResult:
    if image.size != contract.canvas_size:
        return GeometryResult(
            False,
            (f"canvas:{image.size}!={contract.canvas_size}",),
            None,
        )

    metrics = geometry_metrics(image, alpha_threshold)
    if metrics is None:
        return GeometryResult(False, ("empty-frame",), None)

    errors: list[str] = []
    margin = max(0, contract.safe_margin_px)
    left, top, right, bottom = metrics.body_bbox
    width, height = image.size

    if (
        left < margin
        or top < margin
        or right > width - margin
        or bottom > height - margin
    ):
        errors.append(
            f"safe-envelope:{metrics.body_bbox} outside margin={margin}"
        )
    if abs(metrics.foot_y - contract.foot_y) > contract.foot_tolerance_px:
        errors.append(
            f"foot:{metrics.foot_y:.2f}!={contract.foot_y:.2f}"
        )
    if (
        abs(metrics.body_height - contract.body_height)
        > contract.height_tolerance_px
    ):
        errors.append(
            f"height:{metrics.body_height}!={contract.body_height}"
        )
    if (
        abs(metrics.alpha_centroid_x - contract.alpha_centroid_x)
        > contract.centroid_tolerance_px
    ):
        errors.append(
            f"centroid-x:{metrics.alpha_centroid_x:.2f}!="
            f"{contract.alpha_centroid_x:.2f}"
        )

    return GeometryResult(not errors, tuple(errors), metrics)


def _clean_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 and (r or g or b):
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def normalize_frame(
    image: Image.Image,
    contract: GeometryContract,
    lint_config: LintConfig = LintConfig(),
) -> Image.Image:
    raw = image.convert("RGBA")
    lint = lint_frame(raw, lint_config)
    if not lint.ok or lint.main_component is None:
        raise GeometryError("raw-lint:" + ",".join(lint.errors))

    foreground = _foreground_bbox(raw, lint_config.alpha_threshold)
    if foreground is None:
        raise GeometryError("empty-frame")

    body = lint.main_component
    body_height = body.bbox[3] - body.bbox[1]
    if body_height <= 0:
        raise GeometryError("invalid-body-height")

    scale = contract.body_height / body_height
    if scale <= 0:
        raise GeometryError("invalid-scale")

    fx0, fy0, _, _ = foreground
    crop = raw.crop(foreground)
    scaled_size = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    # LANCZOS rings around hard alpha silhouettes and can create detached
    # low-alpha islands that did not exist in the authored source. BICUBIC keeps
    # anti-aliased edges without manufacturing orphan components.
    scaled = crop.resize(scaled_size, Image.Resampling.BICUBIC)

    body_left = (body.bbox[0] - fx0) * scale
    body_right = (body.bbox[2] - fx0) * scale
    body_bottom = (body.bbox[3] - fy0) * scale
    body_center_in_crop = (body_left + body_right) / 2.0

    dest_x = round(contract.body_center_x - body_center_in_crop)
    dest_y = round(contract.foot_y - body_bottom)

    margin = max(0, contract.safe_margin_px)
    canvas_w, canvas_h = contract.canvas_size
    placed_bbox = (
        dest_x,
        dest_y,
        dest_x + scaled.width,
        dest_y + scaled.height,
    )
    if (
        placed_bbox[0] < margin
        or placed_bbox[1] < margin
        or placed_bbox[2] > canvas_w - margin
        or placed_bbox[3] > canvas_h - margin
    ):
        raise GeometryError(
            f"would-clip:{placed_bbox} outside "
            f"canvas={contract.canvas_size} margin={margin}"
        )

    out = Image.new("RGBA", contract.canvas_size, (0, 0, 0, 0))
    out.alpha_composite(scaled, (dest_x, dest_y))
    out = _clean_transparent_rgb(out)

    result = validate_geometry(
        out,
        contract,
        lint_config.alpha_threshold,
    )
    if not result.ok:
        raise GeometryError("geometry:" + ",".join(result.errors))
    return out


@dataclass(frozen=True)
class TemporalContract:
    expected_frames: int
    max_foot_delta_px: float = 6.0
    max_centroid_delta_px: float = 10.0
    max_height_delta_px: float = 8.0
    max_width_delta_px: float = 16.0
    max_area_ratio_delta: float = 0.20
    allowed_hold_indices: tuple[int, ...] = ()
    loop: bool = False


@dataclass(frozen=True)
class TemporalResult:
    ok: bool
    errors: tuple[str, ...]
    frame_count: int
    unique_frames: int


def _body_temporal_metrics(
    image: Image.Image,
    alpha_threshold: int,
) -> tuple[float, float, int, int, int] | None:
    components = connected_components(image, alpha_threshold)
    if not components:
        return None
    body = components[0]
    left, top, right, bottom = body.bbox
    return (
        float(bottom),
        float(body.centroid[0]),
        bottom - top,
        right - left,
        body.area,
    )


def validate_sequence(
    frames: list[Image.Image],
    contract: TemporalContract,
    alpha_threshold: int = 8,
) -> TemporalResult:
    errors: list[str] = []
    if len(frames) != contract.expected_frames:
        errors.append(
            f"frame-count:{len(frames)}!={contract.expected_frames}"
        )

    rgba_frames = [frame.convert("RGBA") for frame in frames]
    hashes = [
        hashlib.sha256(frame.tobytes()).hexdigest()
        for frame in rgba_frames
    ]
    seen: dict[str, int] = {}
    allowed_holds = set(contract.allowed_hold_indices)

    for index, digest in enumerate(hashes):
        if digest in seen and index not in allowed_holds:
            errors.append(f"duplicate-frame:{index}=={seen[digest]}")
        seen.setdefault(digest, index)

    metrics = [
        _body_temporal_metrics(frame, alpha_threshold)
        for frame in rgba_frames
    ]
    for index, metric in enumerate(metrics):
        if metric is None:
            errors.append(f"empty-frame:{index}")

    pairs = [
        (index - 1, index)
        for index in range(1, len(frames))
    ]
    if contract.loop and len(frames) > 1:
        pairs.append((len(frames) - 1, 0))

    for left_index, right_index in pairs:
        left = metrics[left_index]
        right = metrics[right_index]
        if left is None or right is None:
            continue

        (
            left_foot,
            left_centroid,
            left_height,
            left_width,
            left_area,
        ) = left
        (
            right_foot,
            right_centroid,
            right_height,
            right_width,
            right_area,
        ) = right
        label = f"{left_index}->{right_index}"

        if abs(right_foot - left_foot) > contract.max_foot_delta_px:
            errors.append(
                f"foot-jump:{label}:"
                f"{abs(right_foot-left_foot):.2f}"
            )
        if (
            abs(right_centroid - left_centroid)
            > contract.max_centroid_delta_px
        ):
            errors.append(
                f"centroid-jump:{label}:"
                f"{abs(right_centroid-left_centroid):.2f}"
            )
        if (
            abs(right_height - left_height)
            > contract.max_height_delta_px
        ):
            errors.append(
                f"height-jump:{label}:"
                f"{abs(right_height-left_height)}"
            )
        if abs(right_width - left_width) > contract.max_width_delta_px:
            errors.append(
                f"width-jump:{label}:"
                f"{abs(right_width-left_width)}"
            )

        area_delta = abs(right_area - left_area) / max(
            1,
            max(right_area, left_area),
        )
        if area_delta > contract.max_area_ratio_delta:
            errors.append(
                f"area-jump:{label}:{area_delta:.4f}"
            )

    return TemporalResult(
        ok=not errors,
        errors=tuple(errors),
        frame_count=len(frames),
        unique_frames=len(set(hashes)),
    )


@dataclass(frozen=True)
class SocketQualityContract:
    min_hand_separation_px: float = 6.0
    max_hand_separation_px: float = 72.0
    max_hand_to_anchor_px: float = 44.0
    min_muzzle_forward_px: float = 12.0
    max_anchor_delta_px: float = 10.0
    max_angle_delta_degrees: float = 10.0
    max_scale_delta: float = 0.15


@dataclass(frozen=True)
class SocketQualityResult:
    ok: bool
    errors: tuple[str, ...]


def _point_distance(left: list[float], right: list[float]) -> float:
    return math.hypot(float(right[0]) - float(left[0]), float(right[1]) - float(left[1]))


def _angle_delta(left: float, right: float) -> float:
    delta = (float(right) - float(left) + 180.0) % 360.0 - 180.0
    return abs(delta)


def validate_socket_sequence(
    sockets: list[dict],
    contract: SocketQualityContract = SocketQualityContract(),
    *,
    loop: bool = False,
) -> SocketQualityResult:
    errors: list[str] = []
    if not sockets:
        return SocketQualityResult(False, ("socket-sequence-empty",))

    for index, socket in enumerate(sockets):
        anchor = socket["weapon_anchor"]
        rear = socket["rear_hand"]
        front = socket["front_hand"]
        muzzle = socket["muzzle"]

        hand_span = _point_distance(rear, front)
        if hand_span < contract.min_hand_separation_px:
            errors.append(f"hand-span-too-small:{index}:{hand_span:.2f}")
        if hand_span > contract.max_hand_separation_px:
            errors.append(f"hand-span-too-large:{index}:{hand_span:.2f}")

        rear_distance = _point_distance(rear, anchor)
        front_distance = _point_distance(front, anchor)
        if rear_distance > contract.max_hand_to_anchor_px:
            errors.append(f"rear-hand-detached:{index}:{rear_distance:.2f}")
        if front_distance > contract.max_hand_to_anchor_px:
            errors.append(f"front-hand-detached:{index}:{front_distance:.2f}")

        muzzle_forward = float(muzzle[0]) - float(anchor[0])
        if muzzle_forward < contract.min_muzzle_forward_px:
            errors.append(f"muzzle-not-forward:{index}:{muzzle_forward:.2f}")

    pairs = [(index - 1, index) for index in range(1, len(sockets))]
    if loop and len(sockets) > 1:
        pairs.append((len(sockets) - 1, 0))

    for left_index, right_index in pairs:
        left = sockets[left_index]
        right = sockets[right_index]
        label = f"{left_index}->{right_index}"
        anchor_delta = _point_distance(
            left["weapon_anchor"],
            right["weapon_anchor"],
        )
        if anchor_delta > contract.max_anchor_delta_px:
            errors.append(f"socket-anchor-jump:{label}:{anchor_delta:.2f}")

        angle_delta = _angle_delta(
            left["angle_degrees"],
            right["angle_degrees"],
        )
        if angle_delta > contract.max_angle_delta_degrees:
            errors.append(f"socket-angle-jump:{label}:{angle_delta:.2f}")

        scale_delta = abs(float(right["scale"]) - float(left["scale"]))
        if scale_delta > contract.max_scale_delta:
            errors.append(f"socket-scale-jump:{label}:{scale_delta:.4f}")

    return SocketQualityResult(not errors, tuple(errors))


class BankContractError(ValueError):
    pass


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require_int(value: object, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise BankContractError(f"{label} must be an integer >= {minimum}")
    return value


def _require_number(
    value: object,
    label: str,
    *,
    minimum: float = 0.0,
    strict: bool = False,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BankContractError(f"{label} must be numeric")
    number = float(value)
    if (strict and number <= minimum) or (not strict and number < minimum):
        op = ">" if strict else ">="
        raise BankContractError(f"{label} must be {op} {minimum}")
    return number


def _validate_bank_contract(data: object) -> dict:
    if not isinstance(data, dict):
        raise BankContractError("contract must be an object")
    if data.get("schema") != 1:
        raise BankContractError("contract schema must be 1")

    for key in ("quality_contract", "actor", "weapon"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            raise BankContractError(f"{key} must be a non-empty string")

    composition = data.get("composition", "integrated")
    if composition not in {"integrated", "socketed-body", "weapon-layer"}:
        raise BankContractError(
            "composition must be integrated, socketed-body or weapon-layer"
        )

    socket_quality_data = data.get("socket_quality", {})
    if not isinstance(socket_quality_data, dict):
        raise BankContractError("socket_quality must be an object")
    socket_quality = SocketQualityContract(
        min_hand_separation_px=_require_number(
            socket_quality_data.get("min_hand_separation_px", 6.0),
            "socket_quality.min_hand_separation_px",
        ),
        max_hand_separation_px=_require_number(
            socket_quality_data.get("max_hand_separation_px", 72.0),
            "socket_quality.max_hand_separation_px",
            strict=True,
        ),
        max_hand_to_anchor_px=_require_number(
            socket_quality_data.get("max_hand_to_anchor_px", 44.0),
            "socket_quality.max_hand_to_anchor_px",
            strict=True,
        ),
        min_muzzle_forward_px=_require_number(
            socket_quality_data.get("min_muzzle_forward_px", 12.0),
            "socket_quality.min_muzzle_forward_px",
        ),
        max_anchor_delta_px=_require_number(
            socket_quality_data.get("max_anchor_delta_px", 10.0),
            "socket_quality.max_anchor_delta_px",
            strict=True,
        ),
        max_angle_delta_degrees=_require_number(
            socket_quality_data.get("max_angle_delta_degrees", 10.0),
            "socket_quality.max_angle_delta_degrees",
            strict=True,
        ),
        max_scale_delta=_require_number(
            socket_quality_data.get("max_scale_delta", 0.15),
            "socket_quality.max_scale_delta",
        ),
    )
    if socket_quality.min_hand_separation_px >= socket_quality.max_hand_separation_px:
        raise BankContractError(
            "socket_quality hand separation minimum must be smaller than maximum"
        )

    cell = data.get("cell")
    if not isinstance(cell, dict):
        raise BankContractError("cell must be an object")
    width = _require_int(cell.get("width"), "cell.width", minimum=1)
    height = _require_int(cell.get("height"), "cell.height", minimum=1)

    parts = data.get("parts")
    if not isinstance(parts, dict) or not parts:
        raise BankContractError("parts must be a non-empty object")
    normalized_parts: dict[str, dict] = {}
    for name, part in sorted(parts.items()):
        if not isinstance(name, str) or not name:
            raise BankContractError("part names must be non-empty strings")
        if not isinstance(part, dict):
            raise BankContractError(f"part {name} must be an object")
        columns = _require_int(part.get("columns"), f"parts.{name}.columns", minimum=1)
        rows = _require_int(part.get("rows"), f"parts.{name}.rows", minimum=1)
        normalized_parts[name] = {"columns": columns, "rows": rows}

    animations = data.get("animations")
    if not isinstance(animations, list) or not animations:
        raise BankContractError("animations must be a non-empty array")

    seen_names: set[str] = set()
    seen_rows: set[tuple[str, int]] = set()
    normalized_animations: list[dict] = []
    for index, animation in enumerate(animations):
        if not isinstance(animation, dict):
            raise BankContractError(f"animations[{index}] must be an object")
        name = animation.get("name")
        if not isinstance(name, str) or not name:
            raise BankContractError(f"animations[{index}].name must be a non-empty string")
        if name in seen_names:
            raise BankContractError(f"duplicate animation name: {name}")
        seen_names.add(name)

        part_name = animation.get("part")
        if part_name not in normalized_parts:
            raise BankContractError(f"animation {name} references unknown part {part_name!r}")
        row = _require_int(animation.get("row"), f"animation {name}.row")
        if row >= normalized_parts[part_name]["rows"]:
            raise BankContractError(f"animation {name} row {row} exceeds part {part_name}")
        row_key = (part_name, row)
        if row_key in seen_rows:
            raise BankContractError(f"part row reused: {part_name}:{row}")
        seen_rows.add(row_key)

        authored = _require_int(
            animation.get("authored_frames"),
            f"animation {name}.authored_frames",
            minimum=1,
        )
        slots = animation.get("slots")
        if not isinstance(slots, list) or not slots:
            raise BankContractError(f"animation {name}.slots must be a non-empty array")
        if len(slots) > normalized_parts[part_name]["columns"]:
            raise BankContractError(f"animation {name} has more slots than part columns")
        normalized_slots: list[int] = []
        for slot_index, source_index in enumerate(slots):
            source_index = _require_int(
                source_index,
                f"animation {name}.slots[{slot_index}]",
            )
            if source_index >= authored:
                raise BankContractError(
                    f"animation {name} slot {slot_index} references missing authored frame {source_index}"
                )
            normalized_slots.append(source_index)

        fps = animation.get("fps")
        if isinstance(fps, bool) or not isinstance(fps, (int, float)) or fps <= 0:
            raise BankContractError(f"animation {name}.fps must be > 0")
        loop = animation.get("loop")
        if not isinstance(loop, bool):
            raise BankContractError(f"animation {name}.loop must be boolean")
        allowed_detached = _require_int(
            animation.get("allowed_detached_components", 0),
            f"animation {name}.allowed_detached_components",
        )
        source_dir = animation.get("source_dir", name)
        if not isinstance(source_dir, str) or not source_dir:
            raise BankContractError(f"animation {name}.source_dir must be a non-empty string")

        sockets = animation.get("sockets")
        normalized_sockets = None
        if sockets is not None:
            if composition != "socketed-body":
                raise BankContractError(
                    f"animation {name} declares sockets but composition is {composition}"
                )
            if not isinstance(sockets, list) or len(sockets) != authored:
                raise BankContractError(
                    f"animation {name}.sockets must contain exactly {authored} authored-frame entries"
                )
            normalized_sockets = []
            for socket_index, socket in enumerate(sockets):
                if not isinstance(socket, dict):
                    raise BankContractError(
                        f"animation {name}.sockets[{socket_index}] must be an object"
                    )
                required = ("weapon_anchor", "rear_hand", "front_hand", "muzzle")
                missing = [key for key in required if key not in socket]
                if missing:
                    raise BankContractError(
                        f"animation {name}.sockets[{socket_index}] missing {','.join(missing)}"
                    )
                normalized_socket = {}
                for point_name in required:
                    point = socket[point_name]
                    if (
                        not isinstance(point, list)
                        or len(point) != 2
                        or any(
                            isinstance(value, bool) or not isinstance(value, (int, float))
                            for value in point
                        )
                    ):
                        raise BankContractError(
                            f"animation {name}.sockets[{socket_index}].{point_name} must be [x,y]"
                        )
                    x, y = float(point[0]), float(point[1])
                    if not (0.0 <= x <= width and 0.0 <= y <= height):
                        raise BankContractError(
                            f"animation {name}.sockets[{socket_index}].{point_name} outside cell"
                        )
                    normalized_socket[point_name] = [x, y]
                angle = socket.get("angle_degrees", 0.0)
                scale = socket.get("scale", 1.0)
                if isinstance(angle, bool) or not isinstance(angle, (int, float)):
                    raise BankContractError(
                        f"animation {name}.sockets[{socket_index}].angle_degrees must be numeric"
                    )
                if (
                    isinstance(scale, bool)
                    or not isinstance(scale, (int, float))
                    or scale <= 0
                ):
                    raise BankContractError(
                        f"animation {name}.sockets[{socket_index}].scale must be > 0"
                    )
                z = socket.get("z", "front")
                if z not in {"front", "back"}:
                    raise BankContractError(
                        f"animation {name}.sockets[{socket_index}].z must be front or back"
                    )
                normalized_socket["angle_degrees"] = float(angle)
                normalized_socket["scale"] = float(scale)
                normalized_socket["z"] = z
                normalized_sockets.append(normalized_socket)

        if composition == "socketed-body" and normalized_sockets is None:
            raise BankContractError(
                f"animation {name} requires authored sockets for socketed-body composition"
            )

        if composition == "socketed-body" and normalized_sockets is not None:
            socket_result = validate_socket_sequence(
                normalized_sockets,
                socket_quality,
                loop=loop,
            )
            if not socket_result.ok:
                raise BankContractError(
                    f"animation {name} socket quality failed: "
                    + ",".join(socket_result.errors)
                )

        normalized_animations.append(
            {
                "name": name,
                "part": part_name,
                "row": row,
                "fps": float(fps),
                "loop": loop,
                "authored_frames": authored,
                "slots": normalized_slots,
                "source_dir": source_dir,
                "allowed_detached_components": allowed_detached,
                "sockets": normalized_sockets,
            }
        )

    return {
        "schema": 1,
        "quality_contract": data["quality_contract"],
        "actor": data["actor"],
        "weapon": data["weapon"],
        "composition": composition,
        "socket_quality": asdict(socket_quality),
        "cell": {"width": width, "height": height},
        "parts": normalized_parts,
        "animations": normalized_animations,
    }


def load_bank_contract(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BankContractError(f"cannot load contract {path}: {exc}") from exc
    return _validate_bank_contract(data)


def _save_png_deterministic(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=False, compress_level=9)


def build_bank(
    contract_path: Path,
    frames_root: Path,
    output_dir: Path,
) -> dict:
    contract = load_bank_contract(contract_path)
    cell_w = contract["cell"]["width"]
    cell_h = contract["cell"]["height"]
    output_dir.mkdir(parents=True, exist_ok=True)

    part_images: dict[str, Image.Image] = {}
    for part_name, part in contract["parts"].items():
        part_images[part_name] = Image.new(
            "RGBA",
            (part["columns"] * cell_w, part["rows"] * cell_h),
            (0, 0, 0, 0),
        )

    manifest_animations: list[dict] = []
    for animation in contract["animations"]:
        authored_frames: list[Image.Image] = []
        source_hashes: list[str] = []
        source_dir = frames_root / animation["source_dir"]
        lint_config = LintConfig(
            edge_guard_px=0,
            allowed_detached_components=animation["allowed_detached_components"],
        )
        for source_index in range(animation["authored_frames"]):
            path = source_dir / f"{source_index:03d}.png"
            if not path.is_file():
                raise BankContractError(f"missing authored frame: {path}")
            frame = Image.open(path).convert("RGBA")
            if frame.size != (cell_w, cell_h):
                raise BankContractError(
                    f"bad frame size for {path}: {frame.size} != {(cell_w, cell_h)}"
                )
            lint = lint_frame(frame, lint_config)
            if not lint.ok:
                raise BankContractError(
                    f"frame failed lint {path}: {','.join(lint.errors)}"
                )
            authored_frames.append(_clean_transparent_rgb(frame))
            source_hashes.append(_sha256_file(path))

        part = part_images[animation["part"]]
        regions: list[dict] = []
        for column, source_index in enumerate(animation["slots"]):
            frame = authored_frames[source_index]
            x = column * cell_w
            y = animation["row"] * cell_h
            part.alpha_composite(frame, (x, y))
            regions.append(
                {
                    "slot": column,
                    "source_index": source_index,
                    "x": x,
                    "y": y,
                    "width": cell_w,
                    "height": cell_h,
                }
            )

        manifest_animations.append(
            {
                "name": animation["name"],
                "part": animation["part"],
                "row": animation["row"],
                "fps": animation["fps"],
                "loop": animation["loop"],
                "authored_frames": animation["authored_frames"],
                "stored_frames": len(animation["slots"]),
                "slots": animation["slots"],
                "source_sha256": source_hashes,
                "regions": regions,
                "sockets": (
                    [animation["sockets"][source_index] for source_index in animation["slots"]]
                    if animation["sockets"] is not None
                    else None
                ),
            }
        )

    manifest_parts: dict[str, dict] = {}
    for part_name, image in sorted(part_images.items()):
        filename = f"{part_name}.png"
        path = output_dir / filename
        image = _clean_transparent_rgb(image)
        _save_png_deterministic(image, path)
        part = contract["parts"][part_name]
        manifest_parts[part_name] = {
            "filename": filename,
            "sha256": _sha256_file(path),
            "size": [image.width, image.height],
            "columns": part["columns"],
            "rows": part["rows"],
        }

    manifest = {
        "schema": 1,
        "kind": "pawn-slug-sprite-forge-bank",
        "quality_contract": contract["quality_contract"],
        "actor": contract["actor"],
        "weapon": contract["weapon"],
        "composition": contract["composition"],
        "socket_quality": contract["socket_quality"],
        "cell": contract["cell"],
        "contract_sha256": _sha256_file(contract_path),
        "parts": manifest_parts,
        "animations": manifest_animations,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest

def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    raw = list(sys.argv[1:] if argv is None else argv)
    if raw and raw[0] not in {"lint", "build"}:
        raw.insert(0, "lint")

    parser = argparse.ArgumentParser(
        description="Pawn Slug Sprite Forge fail-closed compiler"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    lint = sub.add_parser("lint", help="lint one raw candidate frame")
    lint.add_argument("frame", type=Path)
    lint.add_argument("--alpha-threshold", type=int, default=8)
    lint.add_argument("--edge-guard-px", type=int, default=2)
    lint.add_argument("--min-detached-area", type=int, default=4)
    lint.add_argument("--allow-detached", type=int, default=0)
    lint.add_argument("--allow-hidden-rgb", action="store_true")
    lint.add_argument("--report", type=Path)

    build = sub.add_parser("build", help="compile an accepted atomic-frame bank")
    build.add_argument("contract", type=Path)
    build.add_argument("frames_root", type=Path)
    build.add_argument("output_dir", type=Path)
    return parser.parse_args(raw)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.command == "build":
        manifest = build_bank(args.contract, args.frames_root, args.output_dir)
        print(json.dumps(
            {
                "actor": manifest["actor"],
                "weapon": manifest["weapon"],
                "parts": {
                    name: value["sha256"]
                    for name, value in manifest["parts"].items()
                },
            },
            sort_keys=True,
        ))
        return 0

    config = LintConfig(
        alpha_threshold=args.alpha_threshold,
        edge_guard_px=args.edge_guard_px,
        min_detached_area=args.min_detached_area,
        allowed_detached_components=args.allow_detached,
        reject_hidden_rgb=not args.allow_hidden_rgb,
    )
    result = lint_frame(Image.open(args.frame), config)
    payload = result.to_json()
    rendered = json.dumps(payload, indent=2, sort_keys=True)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + "\n", encoding="utf-8")

    print(rendered)
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
