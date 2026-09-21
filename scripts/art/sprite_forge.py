#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
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
    scaled = crop.resize(scaled_size, Image.Resampling.LANCZOS)

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

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pawn Slug Sprite Forge fail-closed raw-frame lint"
    )
    parser.add_argument("frame", type=Path)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument("--edge-guard-px", type=int, default=2)
    parser.add_argument("--min-detached-area", type=int, default=4)
    parser.add_argument("--allow-detached", type=int, default=0)
    parser.add_argument("--allow-hidden-rgb", action="store_true")
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
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
