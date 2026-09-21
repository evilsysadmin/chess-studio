#!/usr/bin/env python3
from __future__ import annotations

import argparse
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
