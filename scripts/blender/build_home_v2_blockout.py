#!/usr/bin/env python3
"""Build the first Blender blockout for the canonical Chess Studio Home.

The goal of this pass is intentionally narrow: lock camera/composition and the
major architectural/prop masses before spending time on detailed modelling.
It never mutates runtime Home assets.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector


CONTRACT = "home-blender-canon-20260918-v1"
DEFAULT_REFERENCE = "scripts/blender/references/home_canon_20260918.webp.b64"

_CUBE_TEMPLATE_MESH = None
_SPHERE_TEMPLATE_MESHES = {}
_CYLINDER_TEMPLATE_MESHES = {}
_CONE_TEMPLATE_MESHES = {}


def argv_after_double_dash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=DEFAULT_REFERENCE)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--engine", choices=("workbench", "eevee"), default="workbench")
    return parser.parse_args(argv_after_double_dash())


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def materialize_reference(reference: Path, out_dir: Path) -> Path:
    if reference.suffix != ".b64":
        return reference
    target = out_dir / "home-canon-20260918.webp"
    target.write_bytes(base64.b64decode(reference.read_text(encoding="utf-8").strip()))
    return target


def _hash01(ix: int, iy: int, seed: int) -> float:
    value = (ix * 374761393 + iy * 668265263 + seed * 69069) & 0xFFFFFFFF
    value ^= value >> 13
    value = (value * 1274126177) & 0xFFFFFFFF
    value ^= value >> 16
    return (value & 0xFFFF) / 65535.0


def _smoothstep(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def _value_noise(u: float, v: float, seed: int, cells: int) -> float:
    x = u * cells
    y = v * cells
    x0 = math.floor(x)
    y0 = math.floor(y)
    tx = _smoothstep(x - x0)
    ty = _smoothstep(y - y0)
    x1 = x0 + 1
    y1 = y0 + 1
    a = _hash01(x0 % cells, y0 % cells, seed)
    b = _hash01(x1 % cells, y0 % cells, seed)
    c = _hash01(x0 % cells, y1 % cells, seed)
    d = _hash01(x1 % cells, y1 % cells, seed)
    ab = a + (b - a) * tx
    cd = c + (d - c) * tx
    return ab + (cd - ab) * ty


def _surface_height(profile: str, u: float, v: float, seed: int) -> float:
    coarse = _value_noise(u, v, seed, 5)
    medium = _value_noise(u, v, seed + 31, 13)
    fine = _value_noise(u, v, seed + 73, 37)
    if profile == "stone":
        # Broad mineral structure reads as quarried stone instead of generic
        # cloud noise. Strata stay subtle at Home distance; sparse pitting and
        # low-frequency tonal drift do most of the work.
        mineral = _value_noise(u, v, seed + 157, 9)
        pores = _value_noise(u, v, seed + 191, 27)
        strata = 0.5 + 0.5 * math.sin(
            (v * 2.6 + u * 0.72 + (coarse - 0.5) * 0.55) * math.tau
        )
        pitting = max(0.0, 0.26 - pores) * 1.65
        value = (
            0.30
            + coarse * 0.34
            + medium * 0.19
            + mineral * 0.10
            + strata * 0.055
            + fine * 0.025
            - pitting * 0.14
        )
        return max(0.0, min(1.0, value))
    if profile == "floor_stone":
        # Large staggered paving breaks the floor into authored stone slabs.
        # Keep the surface itself restrained: broad slab-to-slab variation and
        # narrow, slightly irregular recessed joints read more naturally than
        # high-frequency procedural speckle at the canonical Home distance.
        rows = 6
        cols = 8
        scaled_u = u * cols
        scaled_v = v * rows
        row = math.floor(scaled_v)
        stagger = 0.5 if row % 2 else 0.0
        shifted_u = scaled_u + stagger
        col = math.floor(shifted_u)
        local_u = shifted_u - col
        local_v = scaled_v - row
        edge = min(local_u, 1.0 - local_u, local_v, 1.0 - local_v)
        joint_width = 0.045 + (medium - 0.5) * 0.016
        if edge < joint_width:
            return max(0.0, min(1.0, 0.10 + fine * 0.055))
        tile_bias = (_hash01(col % cols, row % rows, seed + 401) - 0.5) * 0.12
        wear = _value_noise(u, v, seed + 509, 9)
        value = (
            0.54
            + tile_bias
            + (coarse - 0.5) * 0.20
            + (medium - 0.5) * 0.09
            + (wear - 0.5) * 0.055
            + (fine - 0.5) * 0.035
        )
        return max(0.0, min(1.0, value))
    if profile == "wood":
        # A single sine repeated 18 times reads as a zebra stripe on the small
        # panels and legs of the table. Real grain is uneven: two unrelated
        # frequencies, both bent by low-frequency noise, so no two growth rings
        # are the same width, and most of the variation comes from soft noise.
        warp = (coarse - 0.5) * 0.8 + math.sin(v * math.tau * 2.0) * 0.05
        rings = 0.5 + 0.5 * math.sin((u * 11.0 + warp) * math.tau)
        fibres = 0.5 + 0.5 * math.sin((u * 27.0 + medium * 2.4 + coarse * 1.1) * math.tau)
        return max(0.0, min(1.0, 0.5 + (rings - 0.5) * 0.13 + (fibres - 0.5) * 0.12
                            + (coarse - 0.5) * 0.22 + (fine - 0.5) * 0.12))
    if profile == "leather":
        wrinkles = _value_noise(u, v, seed + 211, 7)
        pebble_a = _value_noise(u, v, seed + 223, 23)
        pebble_b = _value_noise(u, v, seed + 239, 41)
        pebble = abs(pebble_a - pebble_b)
        value = (
            0.12
            + coarse * 0.30
            + wrinkles * 0.24
            + medium * 0.13
            + pebble * 0.15
            + fine * 0.06
        )
        return max(0.0, min(1.0, value))
    if profile == "paper":
        fiber_x = 0.5 + 0.5 * math.sin((u * 52.0 + fine * 1.7) * math.tau)
        fiber_y = 0.5 + 0.5 * math.sin((v * 47.0 + medium * 1.5) * math.tau + 0.45)
        return max(0.0, min(1.0, 0.46 + (fiber_x + fiber_y - 1.0) * 0.11 + coarse * 0.22 + fine * 0.12))
    if profile == "wax":
        bloom = _value_noise(u, v, seed + 307, 9)
        soft = _value_noise(u, v, seed + 353, 19)
        return max(0.0, min(1.0, coarse * 0.36 + bloom * 0.38 + soft * 0.18 + fine * 0.08))
    if profile == "textile":
        # Lower-frequency, slightly wandering weave avoids moire and the
        # "perfect screen-door" look on large banners and rugs.
        drift_u = (coarse - 0.5) * 0.045 + (medium - 0.5) * 0.018
        drift_v = (medium - 0.5) * 0.040 + (coarse - 0.5) * 0.014
        warp = 0.5 + 0.5 * math.sin((u + drift_u) * math.tau * 30.0)
        weft = 0.5 + 0.5 * math.sin((v + drift_v) * math.tau * 28.0 + 0.58)
        weave = (warp - 0.5) * (weft - 0.5) * 0.22
        value = 0.40 + coarse * 0.24 + medium * 0.16 + (warp + weft - 1.0) * 0.085 + weave + fine * 0.07
        return max(0.0, min(1.0, value))
    if profile == "leaf":
        # The leaves are flattened UV spheres seen face-on, so the meridians (lines of
        # constant u) fan out from the centre like veins. Narrow raised ribs on those
        # meridians, faint cross veins and slow tonal drift make a flat green blob
        # read as a leaf.
        rib = 0.5 + 0.5 * math.cos((u * 14.0 + (coarse - 0.5) * 0.30) * math.tau)
        cross = 0.5 + 0.5 * math.sin((v * 9.0 + u * 3.0) * math.tau)
        return max(0.0, min(1.0, 0.40 + rib ** 6 * 0.30 + (coarse - 0.5) * 0.32
                            + (cross - 0.5) * 0.06 + (fine - 0.5) * 0.08))
    if profile == "globe":
        # A large-scale, threshold-edged blob pattern reads as embossed continents on
        # an antique study globe (the material stays a single hue; only the relief
        # varies), rather than generic mottled noise.
        coarse_lat = _value_noise(u, v * 0.55, seed + 601, 5)
        mid = _value_noise(u, v * 0.6, seed + 613, 9)
        continents = coarse_lat * 0.62 + mid * 0.38
        land = 1.0 if continents > 0.52 else 0.0
        edge_soften = _value_noise(u, v, seed + 641, 23)
        coast = abs(continents - 0.52) < 0.035
        if coast:
            land = 0.5 + (edge_soften - 0.5) * 0.6
        value = 0.22 + land * 0.62 + (fine - 0.5) * 0.08
        return max(0.0, min(1.0, value))
    if profile == "metal":
        patina = _value_noise(u, v, seed + 119, 8)
        brushed_a = _value_noise(u * 0.55, v * 2.8, seed + 131, 19)
        brushed_b = _value_noise(u * 0.75, v * 4.1, seed + 149, 13)
        brushing = brushed_a * 0.68 + brushed_b * 0.32
        value = coarse * 0.34 + patina * 0.33 + medium * 0.15 + brushing * 0.11 + fine * 0.07
        return max(0.0, min(1.0, value))
    return max(0.0, min(1.0, coarse * 0.50 + medium * 0.31 + fine * 0.19))



def _np_hash01_exact(ix, iy, seed: int) -> "np.ndarray":
    """Vector form of _hash01 with identical uint32 overflow semantics."""
    ix = np.asarray(ix, dtype=np.uint64)
    iy = np.asarray(iy, dtype=np.uint64)
    value = (
        ix * np.uint64(374761393)
        + iy * np.uint64(668265263)
        + np.uint64(seed & 0xFFFFFFFF) * np.uint64(69069)
    ) & np.uint64(0xFFFFFFFF)
    value ^= value >> np.uint64(13)
    value = (value * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
    value ^= value >> np.uint64(16)
    return (value & np.uint64(0xFFFF)).astype(np.float64) / 65535.0


def _np_value_noise_exact(
    size: int,
    seed: int,
    cells: int,
    *,
    u_scale: float = 1.0,
    v_scale: float = 1.0,
) -> "np.ndarray":
    """Vector form of _value_noise sampled at x/size,y/size, bit-for-bit hash equivalent."""
    xs = np.arange(size, dtype=np.float64) / size * u_scale * cells
    ys = np.arange(size, dtype=np.float64) / size * v_scale * cells
    x0 = np.floor(xs).astype(np.int64)
    y0 = np.floor(ys).astype(np.int64)
    tx = xs - x0
    ty = ys - y0
    tx = tx * tx * (3.0 - 2.0 * tx)
    ty = ty * ty * (3.0 - 2.0 * ty)
    x1 = x0 + 1
    y1 = y0 + 1

    x0m = np.mod(x0, cells)[None, :]
    x1m = np.mod(x1, cells)[None, :]
    y0m = np.mod(y0, cells)[:, None]
    y1m = np.mod(y1, cells)[:, None]
    a = _np_hash01_exact(x0m, y0m, seed)
    b = _np_hash01_exact(x1m, y0m, seed)
    c = _np_hash01_exact(x0m, y1m, seed)
    d = _np_hash01_exact(x1m, y1m, seed)
    ab = a + (b - a) * tx[None, :]
    cd = c + (d - c) * tx[None, :]
    return ab + (cd - ab) * ty[:, None]


def _surface_height_grid(profile: str, size: int, seed: int) -> "np.ndarray":
    """Vectorized exact equivalent of _surface_height over the authored macro grid."""
    u = np.arange(size, dtype=np.float64)[None, :] / size
    v = np.arange(size, dtype=np.float64)[:, None] / size
    coarse = _np_value_noise_exact(size, seed, 5)
    medium = _np_value_noise_exact(size, seed + 31, 13)
    fine = _np_value_noise_exact(size, seed + 73, 37)

    if profile == "stone":
        mineral = _np_value_noise_exact(size, seed + 157, 9)
        pores = _np_value_noise_exact(size, seed + 191, 27)
        strata = 0.5 + 0.5 * np.sin(
            (v * 2.6 + u * 0.72 + (coarse - 0.5) * 0.55) * math.tau
        )
        pitting = np.clip(0.26 - pores, 0.0, None) * 1.65
        return np.clip(
            0.30 + coarse * 0.34 + medium * 0.19 + mineral * 0.10
            + strata * 0.055 + fine * 0.025 - pitting * 0.14,
            0.0,
            1.0,
        )

    if profile == "floor_stone":
        rows, cols = 6, 8
        scaled_u = u * cols
        scaled_v = v * rows
        row = np.floor(scaled_v).astype(np.int64)
        stagger = np.where((row % 2) != 0, 0.5, 0.0)
        shifted_u = scaled_u + stagger
        col = np.floor(shifted_u).astype(np.int64)
        local_u = shifted_u - col
        local_v = scaled_v - row
        edge = np.minimum(
            np.minimum(local_u, 1.0 - local_u),
            np.minimum(local_v, 1.0 - local_v),
        )
        joint_width = 0.045 + (medium - 0.5) * 0.016
        tile_bias = (
            _np_hash01_exact(np.mod(col, cols), np.mod(row, rows), seed + 401) - 0.5
        ) * 0.12
        wear = _np_value_noise_exact(size, seed + 509, 9)
        slab = (
            0.54 + tile_bias + (coarse - 0.5) * 0.20 + (medium - 0.5) * 0.09
            + (wear - 0.5) * 0.055 + (fine - 0.5) * 0.035
        )
        joint = 0.10 + fine * 0.055
        return np.clip(np.where(edge < joint_width, joint, slab), 0.0, 1.0)

    if profile == "wood":
        warp = (coarse - 0.5) * 0.8 + np.sin(v * math.tau * 2.0) * 0.05
        rings = 0.5 + 0.5 * np.sin((u * 11.0 + warp) * math.tau)
        fibres = 0.5 + 0.5 * np.sin(
            (u * 27.0 + medium * 2.4 + coarse * 1.1) * math.tau
        )
        return np.clip(
            0.5 + (rings - 0.5) * 0.13 + (fibres - 0.5) * 0.12
            + (coarse - 0.5) * 0.22 + (fine - 0.5) * 0.12,
            0.0,
            1.0,
        )

    if profile == "leather":
        wrinkles = _np_value_noise_exact(size, seed + 211, 7)
        pebble_a = _np_value_noise_exact(size, seed + 223, 23)
        pebble_b = _np_value_noise_exact(size, seed + 239, 41)
        pebble = np.abs(pebble_a - pebble_b)
        return np.clip(
            0.12 + coarse * 0.30 + wrinkles * 0.24 + medium * 0.13
            + pebble * 0.15 + fine * 0.06,
            0.0,
            1.0,
        )

    if profile == "paper":
        fiber_x = 0.5 + 0.5 * np.sin((u * 52.0 + fine * 1.7) * math.tau)
        fiber_y = 0.5 + 0.5 * np.sin(
            (v * 47.0 + medium * 1.5) * math.tau + 0.45
        )
        return np.clip(
            0.46 + (fiber_x + fiber_y - 1.0) * 0.11 + coarse * 0.22 + fine * 0.12,
            0.0,
            1.0,
        )

    if profile == "wax":
        bloom = _np_value_noise_exact(size, seed + 307, 9)
        soft = _np_value_noise_exact(size, seed + 353, 19)
        return np.clip(
            coarse * 0.36 + bloom * 0.38 + soft * 0.18 + fine * 0.08,
            0.0,
            1.0,
        )

    if profile == "textile":
        drift_u = (coarse - 0.5) * 0.045 + (medium - 0.5) * 0.018
        drift_v = (medium - 0.5) * 0.040 + (coarse - 0.5) * 0.014
        warp = 0.5 + 0.5 * np.sin((u + drift_u) * math.tau * 30.0)
        weft = 0.5 + 0.5 * np.sin((v + drift_v) * math.tau * 28.0 + 0.58)
        weave = (warp - 0.5) * (weft - 0.5) * 0.22
        return np.clip(
            0.40 + coarse * 0.24 + medium * 0.16
            + (warp + weft - 1.0) * 0.085 + weave + fine * 0.07,
            0.0,
            1.0,
        )

    if profile == "leaf":
        rib = 0.5 + 0.5 * np.cos(
            (u * 14.0 + (coarse - 0.5) * 0.30) * math.tau
        )
        cross = 0.5 + 0.5 * np.sin((v * 9.0 + u * 3.0) * math.tau)
        return np.clip(
            0.40 + rib ** 6 * 0.30 + (coarse - 0.5) * 0.32
            + (cross - 0.5) * 0.06 + (fine - 0.5) * 0.08,
            0.0,
            1.0,
        )

    if profile == "globe":
        coarse_lat = _np_value_noise_exact(size, seed + 601, 5, v_scale=0.55)
        mid = _np_value_noise_exact(size, seed + 613, 9, v_scale=0.60)
        continents = coarse_lat * 0.62 + mid * 0.38
        land = (continents > 0.52).astype(np.float64)
        edge_soften = _np_value_noise_exact(size, seed + 641, 23)
        coast = np.abs(continents - 0.52) < 0.035
        land = np.where(coast, 0.5 + (edge_soften - 0.5) * 0.6, land)
        return np.clip(0.22 + land * 0.62 + (fine - 0.5) * 0.08, 0.0, 1.0)

    if profile == "metal":
        patina = _np_value_noise_exact(size, seed + 119, 8)
        brushed_a = _np_value_noise_exact(
            size, seed + 131, 19, u_scale=0.55, v_scale=2.8
        )
        brushed_b = _np_value_noise_exact(
            size, seed + 149, 13, u_scale=0.75, v_scale=4.1
        )
        brushing = brushed_a * 0.68 + brushed_b * 0.32
        return np.clip(
            coarse * 0.34 + patina * 0.33 + medium * 0.15
            + brushing * 0.11 + fine * 0.07,
            0.0,
            1.0,
        )

    return np.clip(coarse * 0.50 + medium * 0.31 + fine * 0.19, 0.0, 1.0)


def _validate_surface_height_vectorization() -> None:
    size = 17
    seed = 2417
    profiles = (
        "stone", "floor_stone", "wood", "leather", "paper", "wax",
        "textile", "leaf", "globe", "metal", "other",
    )
    for profile in profiles:
        grid = _surface_height_grid(profile, size, seed)
        for y in range(size):
            for x in range(size):
                expected = _surface_height(profile, x / size, y / size, seed)
                actual = float(grid[y, x])
                if abs(actual - expected) > 1e-12:
                    raise RuntimeError(
                        f"Vector macro drift {profile} at {x},{y}: {actual} != {expected}"
                    )


def _np_noise(size: int, seed: int, cells_u: int, cells_v: int | None = None) -> "np.ndarray":
    """Tileable smooth value noise on a size x size grid, deterministic per seed.

    Unequal cell counts stretch the noise along one axis, which is how wood
    fibres, brushed metal and thread fuzz get their direction.
    """
    cells_v = cells_u if cells_v is None else cells_v
    lattice = np.random.RandomState(seed & 0x7FFFFFFF).random_sample((cells_v, cells_u))
    xs = np.arange(size) / size * cells_u
    ys = np.arange(size) / size * cells_v
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    tx = xs - x0
    ty = ys - y0
    tx = tx * tx * (3.0 - 2.0 * tx)
    ty = ty * ty * (3.0 - 2.0 * ty)
    x1 = (x0 + 1) % cells_u
    y1 = (y0 + 1) % cells_v
    x0 %= cells_u
    y0 %= cells_v
    a = lattice[np.ix_(y0, x0)]
    b = lattice[np.ix_(y0, x1)]
    c = lattice[np.ix_(y1, x0)]
    d = lattice[np.ix_(y1, x1)]
    top = a + (b - a) * tx[None, :]
    bottom = c + (d - c) * tx[None, :]
    return top + (bottom - top) * ty[:, None]


def _np_fbm(size: int, seed: int, cells: int, octaves: int = 3) -> "np.ndarray":
    total = np.zeros((size, size))
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        total += _np_noise(size, seed + octave * 97, cells * (2 ** octave)) * amplitude
        norm += amplitude
        amplitude *= 0.5
    return total / norm


def _resample_tileable(grid: "np.ndarray", size: int) -> "np.ndarray":
    """Bilinear, wrap-around resample so the base look survives a bigger canvas."""
    source = grid.shape[0]
    if source == size:
        return grid
    coords = np.arange(size) / size * source
    i0 = np.floor(coords).astype(int)
    t = coords - i0
    i1 = (i0 + 1) % source
    i0 %= source
    rows = grid[i0, :] * (1.0 - t)[:, None] + grid[i1, :] * t[:, None]
    return rows[:, i0] * (1.0 - t)[None, :] + rows[:, i1] * t[None, :]


def _micro_detail(profile: str, size: int, seed: int) -> "np.ndarray":
    """Zero-mean fine relief added on top of the authored macro height.

    The macro profiles top out around 37 cells, so simply enlarging them adds
    pixels but no information. Real premium surfaces need detail an order of
    magnitude finer: chisel grain and chips in stone, pores and fibre in wood,
    pebbling in leather, individual threads in cloth, scratches in metal.
    """
    if profile in ("stone", "floor_stone"):
        grain = _np_fbm(size, seed + 601, 40, 3) - 0.5
        ridge = 1.0 - np.abs(_np_fbm(size, seed + 619, 14, 3) * 2.0 - 1.0)
        chips = np.clip(0.30 - _np_noise(size, seed + 631, 70), 0.0, None) * 3.2
        amplitude = 0.16 if profile == "stone" else 0.10
        return (grain * 0.55 + (ridge - 0.55) * 0.20 - chips * 0.16) * amplitude / 0.16 * 0.62
    if profile == "wood":
        fibre = _np_noise(size, seed + 641, size // 4, 6) - 0.5
        fibre_fine = _np_noise(size, seed + 643, size // 2, 9) - 0.5
        pores = np.clip(0.24 - _np_noise(size, seed + 647, size // 3, size // 12), 0.0, None) * 4.0
        return fibre * 0.16 + fibre_fine * 0.08 - pores * 0.10
    if profile == "leather":
        a = _np_noise(size, seed + 653, 44)
        b = _np_noise(size, seed + 659, 61)
        pebble = np.abs(a - b) - 0.17
        crease = _np_fbm(size, seed + 661, 9, 3) - 0.5
        return pebble * 0.14 + crease * 0.05
    if profile == "textile":
        # The macro profile already weaves ~30 threads across the tile. A second,
        # unrelated thread frequency here beats against it and shows up as diagonal
        # moire on large cloth (benches, sofa, rug), so only add unstructured fuzz.
        return (_np_fbm(size, seed + 677, 56, 2) - 0.5) * 0.10
    if profile == "metal":
        scratches = np.clip(_np_noise(size, seed + 683, 3, size // 2) - 0.62, 0.0, None) * 1.6
        hairline = _np_noise(size, seed + 691, 5, size) - 0.5
        dents = _np_fbm(size, seed + 697, 12, 3) - 0.5
        return hairline * 0.06 - scratches * 0.24 + dents * 0.10
    return np.zeros((size, size))


def _packed_surface_arrays(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    profile: str,
    *,
    size: int = 96,
    base_size: int | None = None,
):
    """Return flat RGBA float lists (base colour, roughness, normal) for one material.

    The authored macro height is evaluated on the historical `base_size` grid so
    the overall tone of every surface stays exactly as approved, then resampled
    to `size` and enriched with `_micro_detail`. Normals are derived from the
    combined height with a strength scaled by the resolution ratio, so relief
    keeps its apparent depth while the new fine detail resolves.
    """
    base_size = base_size or size
    seed = sum((index + 1) * ord(char) for index, char in enumerate(name)) & 0xFFFF
    macro = _surface_height_grid(profile, base_size, seed)
    macro = _resample_tileable(macro, size)
    detail_gain = {
        "stone": 1.0,
        "floor_stone": 0.85,
        "wood": 0.6,
        "metal": 1.0,
        "textile": 1.0,
        "leather": 1.0,
    }.get(profile, 0.0)
    detail = _micro_detail(profile, size, seed) * detail_gain if size > base_size else 0.0
    heights = np.clip(macro + detail, 0.0, 1.0)
    low, high = {
        "stone": (0.88, 1.08),
        "floor_stone": (0.68, 1.10),
        "wood": (0.86, 1.12),
        "metal": (0.79, 1.15),
        "textile": (0.78, 1.18),
        "leather": (0.70, 1.24),
        "paper": (0.88, 1.12),
        "wax": (0.90, 1.10),
        "leaf": (0.74, 1.24),
        "globe": (0.72, 1.22),
    }.get(profile, (0.82, 1.14))
    rough_span = {
        "stone": 0.07,
        "floor_stone": 0.12,
        "wood": 0.08,
        "metal": 0.19,
        "textile": 0.07,
        "leather": 0.12,
        "paper": 0.055,
        "wax": 0.045,
        "leaf": 0.09,
        "globe": 0.05,
    }.get(profile, 0.10)
    normal_strength = {
        "stone": 2.5,
        "floor_stone": 4.0,
        "wood": 1.3,
        "metal": 2.0,
        "textile": 2.8,
        "leather": 2.4,
        "paper": 1.15,
        "wax": 0.85,
        "leaf": 1.8,
        "globe": 2.2,
    }.get(profile, 2.5) * (size / base_size)

    factor = low + (high - low) * heights
    rgb = np.clip(np.array(color[:3])[None, None, :] * factor[:, :, None], 0.0, 1.0)
    base = np.concatenate([rgb, np.ones((size, size, 1))], axis=2)

    local_roughness = np.clip(roughness + (0.5 - heights) * rough_span, 0.04, 1.0)
    rough = np.repeat(local_roughness[:, :, None], 3, axis=2)
    rough = np.concatenate([rough, np.ones((size, size, 1))], axis=2)

    dx = (np.roll(heights, -1, axis=1) - np.roll(heights, 1, axis=1)) * normal_strength
    dy = (np.roll(heights, -1, axis=0) - np.roll(heights, 1, axis=0)) * normal_strength
    length = np.sqrt(dx * dx + dy * dy + 1.0)
    normal = np.stack([-dx / length, -dy / length, 1.0 / length], axis=2) * 0.5 + 0.5
    normal = np.concatenate([normal, np.ones((size, size, 1))], axis=2)
    return base, rough, normal


def _packed_surface_images(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    profile: str,
    *,
    size: int = 96,
    base_size: int | None = None,
):
    base, rough, normal = _packed_surface_arrays(
        name, color, roughness, profile, size=size, base_size=base_size
    )
    stem = name.replace("HOME_MAT_", "HOME_TEX_")
    images = []
    for suffix, pixels, colorspace in (
        ("base", base, "sRGB"),
        ("rough", rough, "Non-Color"),
        ("normal", normal, "Non-Color"),
    ):
        image = bpy.data.images.new(f"{stem}_{suffix}", width=size, height=size, alpha=True)
        image.colorspace_settings.name = colorspace
        image.pixels.foreach_set(pixels.astype(np.float32).ravel().tolist())
        image.update()
        image.pack()
        images.append(image)
    return tuple(images)


def preview_texture_scale() -> float:
    raw = str(os.environ.get("HOME_PREVIEW_TEXTURE_SCALE", "1") or "1").strip()
    try:
        scale = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid HOME_PREVIEW_TEXTURE_SCALE: {raw!r}") from exc
    return max(0.25, min(1.0, scale))


def _apply_packed_surface_textures(mat, bsdf, *, name, color, roughness, profile) -> None:
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    base_size = {
        "floor_stone": 160,
        "stone": 144,
        "wood": 136,
        "textile": 128,
        "leather": 128,
        "metal": 128,
        "leaf": 128,
        "globe": 144,
    }.get(profile, 96)
    # Normal maps are ~3/4 of the texture bytes, so resolution is spent only on
    # the surfaces that dominate the frame. Dark decals, soot and small props keep
    # their historical size (no micro detail is added at base size).
    material_key = name.replace("HOME_MAT_", "")
    texture_size = {
        "stone": 256,
        "back_wall_stone": 256,
        "floor_stone": 256,
        "table_wood": 256,
        "back_wall_stone_accent": 192,
        "arch_stone": 192,
        "stair_stone": 192,
        "wood": 192,
        "library_wood": 192,
    }.get(material_key)
    if texture_size is None:
        texture_size = base_size
        if not material_key.startswith(("book_", "soot_", "stone_dark", "stone_grime", "ash")):
            texture_size = {"textile": 160, "leather": 160, "metal": 160, "wood": 160}.get(profile, base_size)
    texture_scale = preview_texture_scale()
    base_size = max(48, round(base_size * texture_scale))
    texture_size = max(base_size, round(texture_size * texture_scale))
    base_image, rough_image, normal_image = _packed_surface_images(
        name,
        color,
        roughness,
        profile,
        size=texture_size,
        base_size=base_size,
    )

    base_tex = nodes.new("ShaderNodeTexImage")
    base_tex.name = f"{name}_PackedBase"
    base_tex.image = base_image
    base_tex.extension = "REPEAT"
    links.new(base_tex.outputs["Color"], bsdf.inputs["Base Color"])

    rough_tex = nodes.new("ShaderNodeTexImage")
    rough_tex.name = f"{name}_PackedRoughness"
    rough_tex.image = rough_image
    rough_tex.extension = "REPEAT"
    links.new(rough_tex.outputs["Color"], bsdf.inputs["Roughness"])

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = f"{name}_PackedNormal"
    normal_tex.image = normal_image
    normal_tex.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = f"{name}_NormalMap"
    normal_map.inputs["Strength"].default_value = {
        "stone": 0.55,
        "floor_stone": 0.50,
        "wood": 0.22,
        "metal": 0.36,
        "textile": 0.40,
        "leather": 0.38,
        "paper": 0.18,
        "wax": 0.12,
        "leaf": 0.16,
    }.get(profile, 0.35)
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness=0.7,
    metallic=0.0,
    emission=None,
    emission_strength=0.0,
    bump_scale=None,
    bump_strength=0.14,
    variation=0.0,
    variation_scale=3.0,
    grain=False,
    texture_profile=None,
):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if variation > 0.0:
        color_noise = nodes.new("ShaderNodeTexNoise")
        color_noise.inputs["Scale"].default_value = variation_scale
        color_noise.inputs["Detail"].default_value = 3.5
        color_noise.inputs["Roughness"].default_value = 0.68
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.26
        ramp.color_ramp.elements[1].position = 0.76
        darker = tuple(max(0.0, c * (1.0 - variation)) for c in color[:3]) + (1.0,)
        lighter = tuple(min(1.0, c * (1.0 + variation)) for c in color[:3]) + (1.0,)
        ramp.color_ramp.elements[0].color = darker
        ramp.color_ramp.elements[1].color = lighter
        links.new(color_noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if grain:
        texcoord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.vector_type = "POINT"
        mapping.inputs["Scale"].default_value = (1.0, 7.0, 7.0)
        grain_noise = nodes.new("ShaderNodeTexNoise")
        grain_noise.inputs["Scale"].default_value = 3.8
        grain_noise.inputs["Detail"].default_value = 5.0
        grain_noise.inputs["Roughness"].default_value = 0.70
        if "Distortion" in grain_noise.inputs:
            grain_noise.inputs["Distortion"].default_value = 0.28
        grain_ramp = nodes.new("ShaderNodeValToRGB")
        grain_ramp.color_ramp.elements[0].position = 0.22
        grain_ramp.color_ramp.elements[1].position = 0.80
        grain_ramp.color_ramp.elements[0].color = tuple(max(0.0, c * 0.48) for c in color[:3]) + (1.0,)
        grain_ramp.color_ramp.elements[1].color = tuple(min(1.0, c * 1.72) for c in color[:3]) + (1.0,)
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], grain_noise.inputs["Vector"])
        links.new(grain_noise.outputs["Fac"], grain_ramp.inputs["Fac"])
        links.new(grain_ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if bump_scale is not None:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.62
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.12
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if texture_profile:
        _apply_packed_surface_textures(
            mat,
            bsdf,
            name=name,
            color=color,
            roughness=roughness,
            profile=texture_profile,
        )
    return mat


def _material_uses_image_textures(mat) -> bool:
    if not getattr(mat, "use_nodes", False) or not getattr(mat, "node_tree", None):
        return False
    return any(node.type == "TEX_IMAGE" for node in mat.node_tree.nodes)


def _vary_uvs_for_object(obj, mat) -> None:
    if obj.type != "MESH" or not _material_uses_image_textures(mat):
        return
    uv_layers = getattr(obj.data, "uv_layers", None)
    if not uv_layers or not uv_layers.active:
        return
    seed = sum((index + 1) * ord(char) for index, char in enumerate(obj.name)) & 0xFFFF
    scale = 0.92 + _hash01(seed, 1, 1301) * 0.16
    offset_u = _hash01(seed, 2, 1307) * 0.84
    offset_v = _hash01(seed, 3, 1319) * 0.84
    for loop in uv_layers.active.data:
        loop.uv.x = loop.uv.x * scale + offset_u
        loop.uv.y = loop.uv.y * scale + offset_v


# Metres of surface covered by one repeat of the packed texture. A default Blender
# cube maps every face to a quarter-by-quarter window of the texture whatever its
# size, so a table top a few metres wide showed ~64 px stretched over it (about
# 14 px/m) and thin legs got the same window squashed. Wood and stone therefore get
# world-scale UVs: the same texel density on every face, grain along the long side.
WORLD_UV_TILE_M = {
    "HOME_MAT_table_wood": 1.6,
    "HOME_MAT_wood": 1.6,
    "HOME_MAT_library_wood": 1.6,
    "HOME_MAT_wood_wear": 1.6,
    "HOME_MAT_stone": 1.6,
    "HOME_MAT_back_wall_stone": 1.6,
    "HOME_MAT_back_wall_stone_accent": 1.6,
    "HOME_MAT_arch_stone": 1.6,
    "HOME_MAT_stair_stone": 1.6,
    "HOME_MAT_stone_dark": 1.6,
}


def _world_scale_cube_uvs(obj, tile: float) -> None:
    mesh = obj.data
    layer = mesh.uv_layers.active if getattr(mesh, "uv_layers", None) else None
    if layer is None:
        return
    data = layer.data
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        if len(loops) != 4:
            continue
        us = [data[i].uv.x for i in loops]
        vs = [data[i].uv.y for i in loops]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        if u1 - u0 < 1e-6 or v1 - v0 < 1e-6:
            continue

        def corner(cu, cv):
            return min(
                loops,
                key=lambda i: (data[i].uv.x - cu) ** 2 + (data[i].uv.y - cv) ** 2,
            )

        def position(loop_index):
            return mesh.vertices[mesh.loops[loop_index].vertex_index].co

        origin = position(corner(u0, v0))
        along_u = (position(corner(u1, v0)) - origin).length
        along_v = (position(corner(u0, v1)) - origin).length
        for i in loops:
            fu = (data[i].uv.x - u0) / (u1 - u0)
            fv = (data[i].uv.y - v0) / (v1 - v0)
            if along_u > along_v:
                # Rings vary along u, so put the long side on v: grain runs the length.
                data[i].uv.x = fv * along_v / tile
                data[i].uv.y = fu * along_u / tile
            else:
                data[i].uv.x = fu * along_u / tile
                data[i].uv.y = fv * along_v / tile


def apply_material(obj, mat) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
        _vary_uvs_for_object(obj, mat)


PREMIUM_BEVEL_PREFIXES = (
    "HOME_PROP_table_",
    "HOME_PROP_board_",
    "HOME_PROP_armor_",
    "HOME_PROP_bookshelf_",
    "HOME_PROP_library_",
    "HOME_PROP_left_sofa_",
    "HOME_PROP_bench_",
    "HOME_PROP_chair_",
    "HOME_PROP_globe_",
    "HOME_PROP_sideboard_",
    "HOME_PROP_pedestal_",
)


def configure_soft_edge_modifier(modifier, name: str) -> None:
    modifier.segments = 3 if name.startswith(PREMIUM_BEVEL_PREFIXES) else 2
    if hasattr(modifier, "harden_normals"):
        modifier.harden_normals = True


def smooth_curved_mesh(obj, *, keep_axial_caps_flat=False) -> None:
    """Export clean normals without rounding intentionally planar caps."""
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        if keep_axial_caps_flat and abs(poly.normal.z) > 0.95:
            poly.use_smooth = False
        else:
            poly.use_smooth = True


def _bake_mesh_scale(obj, scale) -> None:
    """Apply positive primitive scale to mesh data without a context-heavy bpy operator."""
    sx, sy, sz = (float(value) for value in scale)
    obj.data.transform(Matrix.Diagonal(Vector((sx, sy, sz, 1.0))))
    obj.data.update()


def _new_unit_cube(name: str, location):
    global _CUBE_TEMPLATE_MESH
    if _CUBE_TEMPLATE_MESH is None:
        bpy.ops.mesh.primitive_cube_add(location=location)
        obj = bpy.context.object
        _CUBE_TEMPLATE_MESH = obj.data.copy()
        _CUBE_TEMPLATE_MESH.name = "HOME_TEMPLATE_unit_cube"
    else:
        mesh = _CUBE_TEMPLATE_MESH.copy()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = location
    obj.name = name
    return obj


def cube(name: str, location, scale, mat, *, bevel=0.0):
    obj = _new_unit_cube(name, location)
    _bake_mesh_scale(obj, scale)

    # Perfect razor edges are one of the strongest CGI tells in the Home.
    # Give genuinely solid blocks a tiny physically plausible edge catch while
    # leaving thin panels, board squares, seams and decals intentionally crisp.
    min_half_extent = min(abs(float(value)) for value in scale)
    implicit_bevel = 0.0
    if bevel <= 0.0 and min_half_extent >= 0.035:
        implicit_bevel = min(0.018, min_half_extent * 0.18)
    edge_width = bevel if bevel > 0.0 else implicit_bevel

    if edge_width:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = edge_width
        configure_soft_edge_modifier(modifier, name)
    world_tile = WORLD_UV_TILE_M.get(getattr(mat, "name", ""))
    if world_tile:
        _world_scale_cube_uvs(obj, world_tile)
    apply_material(obj, mat)
    return obj


_ANIMATED_DETAIL = re.compile(r"(flame|tongue|front_base|ember|_hot|steam|moon)", re.I)


def _adaptive_sphere_detail(name: str, extent: float, thin: float = 1.0):
    """Segments/rings scaled to the on-screen size: tiny studs must not cost 760 tris."""
    if _ANIMATED_DETAIL.search(name):
        return 40, 20
    if extent >= 0.12 and thin < 0.03:
        return 24, 8  # flattened decals (grime, mare): outline matters, poles do not
    if extent < 0.06:
        return 12, 6
    if extent < 0.12:
        return 16, 8
    if extent < 0.30:
        return 28, 14
    return 40, 20


def _new_unit_cylinder(name: str, location, vertices: int):
    key = int(vertices)
    template = _CYLINDER_TEMPLATE_MESHES.get(key)
    if template is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=1.0, depth=2.0, location=location)
        obj = bpy.context.object
        template = obj.data.copy()
        template.name = f"HOME_TEMPLATE_cylinder_{vertices}"
        _CYLINDER_TEMPLATE_MESHES[key] = template
    else:
        mesh = template.copy()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = location
    obj.name = name
    return obj


def cylinder(name: str, location, radius: float, depth: float, mat, *, vertices=None):
    if vertices is None:
        vertices = 12 if radius < 0.04 else 20 if radius < 0.09 else 48
    obj = _new_unit_cylinder(name, location, vertices)
    _bake_mesh_scale(obj, (radius, radius, depth / 2.0))
    smooth_curved_mesh(obj, keep_axial_caps_flat=True)
    apply_material(obj, mat)
    return obj


def rotate_group_about_z(prefix: str, origin_xy, angle_degrees: float) -> None:
    """Rotate an authored prop group together without changing its internal layout."""
    angle = math.radians(angle_degrees)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    ox, oy = origin_xy
    for obj in bpy.data.objects:
        if not obj.name.startswith(prefix):
            continue
        dx = obj.location.x - ox
        dy = obj.location.y - oy
        obj.location.x = ox + dx * cos_a - dy * sin_a
        obj.location.y = oy + dx * sin_a + dy * cos_a
        obj.rotation_euler[2] += angle


def _new_unit_sphere(name: str, location, segments: int, rings: int):
    key = (int(segments), int(rings))
    template = _SPHERE_TEMPLATE_MESHES.get(key)
    if template is None:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
        obj = bpy.context.object
        template = obj.data.copy()
        template.name = f"HOME_TEMPLATE_uv_sphere_{segments}_{rings}"
        _SPHERE_TEMPLATE_MESHES[key] = template
    else:
        mesh = template.copy()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = location
    obj.name = name
    return obj


def sphere(name: str, location, scale, mat, *, detail=None):
    segments, rings = detail or _adaptive_sphere_detail(name, max(abs(float(v)) for v in scale), min(abs(float(v)) for v in scale))
    obj = _new_unit_sphere(name, location, segments, rings)
    _bake_mesh_scale(obj, scale)
    smooth_curved_mesh(obj)
    apply_material(obj, mat)
    return obj


def _new_unit_cone(name: str, location, vertices: int, radius_ratio: float):
    key = (int(vertices), round(float(radius_ratio), 12))
    template = _CONE_TEMPLATE_MESHES.get(key)
    if template is None:
        bpy.ops.mesh.primitive_cone_add(
            vertices=vertices,
            radius1=1.0,
            radius2=radius_ratio,
            depth=2.0,
            location=location,
        )
        obj = bpy.context.object
        template = obj.data.copy()
        template.name = f"HOME_TEMPLATE_cone_{vertices}_{key[1]:.12g}"
        _CONE_TEMPLATE_MESHES[key] = template
    else:
        mesh = template.copy()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = location
    obj.name = name
    return obj


def cone(name: str, location, radius1: float, radius2: float, depth: float, mat, *, vertices=32):
    radius1 = float(radius1)
    radius2 = float(radius2)
    depth = float(depth)
    if abs(radius1) < 1e-12:
        bpy.ops.mesh.primitive_cone_add(
            vertices=vertices,
            radius1=radius1,
            radius2=radius2,
            depth=depth,
            location=location,
        )
        obj = bpy.context.object
        obj.name = name
    else:
        obj = _new_unit_cone(name, location, vertices, radius2 / radius1)
        _bake_mesh_scale(obj, (radius1, radius1, depth / 2.0))
    smooth_curved_mesh(obj, keep_axial_caps_flat=True)
    apply_material(obj, mat)
    return obj


def lathe(name, profile, center, mat, *, segments=40):
    """Turn a (radius, height) profile, listed bottom to top, into a smooth solid of revolution.
    A profile that starts or ends at radius 0 is closed with a triangle fan. Hard steps in the
    profile stay crisp (edge split), curved runs stay smooth."""
    cx, cy, cz = center
    rings = [(r, h) for r, h in profile if r > 1e-6]
    closed_bottom = profile[0][0] <= 1e-6
    closed_top = profile[-1][0] <= 1e-6
    vertices = [(cx + r * math.cos(i * math.tau / segments), cy + r * math.sin(i * math.tau / segments), cz + h)
                for r, h in rings for i in range(segments)]
    faces, uvs = [], []
    ring_count = len(rings)
    top_h = max(h for _, h in profile) or 1.0
    for j in range(ring_count - 1):
        v0, v1 = rings[j][1] / top_h, rings[j + 1][1] / top_h
        for i in range(segments):
            a_, b_ = j * segments + i, j * segments + (i + 1) % segments
            c_, d_ = (j + 1) * segments + (i + 1) % segments, (j + 1) * segments + i
            faces.append((a_, b_, c_, d_))
            uvs.append([(i / segments, v0), ((i + 1) / segments, v0), ((i + 1) / segments, v1), (i / segments, v1)])
    if closed_bottom:
        vertices.append((cx, cy, cz + profile[0][1]))
        centre = len(vertices) - 1
        for i in range(segments):
            faces.append((centre, (i + 1) % segments, i))
            uvs.append([(0.5, 0.5), (0.5, 0.5), (0.5, 0.5)])
    if closed_top:
        vertices.append((cx, cy, cz + profile[-1][1]))
        centre = len(vertices) - 1
        base = (ring_count - 1) * segments
        for i in range(segments):
            faces.append((centre, base + i, base + (i + 1) % segments))
            uvs.append([(0.5, 0.5), (0.5, 0.5), (0.5, 0.5)])
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    loop = 0
    for face_uvs in uvs:
        for uv in face_uvs:
            layer.data[loop].uv = uv
            loop += 1
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    split = obj.modifiers.new("Hard steps", "EDGE_SPLIT")
    split.use_edge_angle = True
    split.split_angle = math.radians(38.0)
    split.use_edge_sharp = False
    apply_material(obj, mat)
    return obj


PIECE_SCALE = 0.92


def add_simple_piece(name: str, x: float, y: float, z: float, mat, kind: str, *, trim=None):
    """Turned, Teutonic-flavoured tournament piece, readable at Home-camera distance: a stepped
    plinth, a lathed body per kind and gold trim. `trim` is the gold material; `mat` is the
    body (ivory or ebony). Sizes are metres before PIECE_SCALE; the board square is 0.32."""
    trim = trim or mat
    k = PIECE_SCALE
    base_radius = {"pawn": 0.088, "rook": 0.100, "knight": 0.100, "bishop": 0.096, "queen": 0.104, "king": 0.108}[kind]

    def scaled(points):
        return [(r * k, h * k) for r, h in points]

    def gold_ring(tag, height, radius, thick=0.008):
        cylinder(f"{name}_{tag}", (x, y, z + height * k), radius * k, thick, trim, vertices=36)

    rb = base_radius
    plinth = [
        (0.0, 0.0), (rb, 0.0), (rb, 0.012), (rb * 0.955, 0.019), (rb * 0.955, 0.030),
        (rb * 0.78, 0.040), (rb * 0.66, 0.052),
    ]
    facing_mult = 1.0 if x >= 0.0 else -1.0

    if kind == "pawn":
        body = plinth[:-1] + [
            (0.050, 0.052), (0.040, 0.078), (0.034, 0.108), (0.034, 0.124), (0.052, 0.130), (0.052, 0.138),
            (0.036, 0.146), (0.030, 0.152), (0.040, 0.158), (0.048, 0.166), (0.050, 0.176), (0.048, 0.186),
            (0.040, 0.195), (0.028, 0.201), (0.012, 0.204), (0.0, 0.205),
        ]
        lathe(f"{name}_body", scaled(body), (x, y, z), mat)
        gold_ring("collar", 0.134, 0.054)
        gold_ring("plinth", 0.024, rb * 0.965, 0.007)
        return

    if kind == "rook":
        body = plinth[:-1] + [
            (0.058, 0.056), (0.050, 0.090), (0.046, 0.130), (0.046, 0.170), (0.056, 0.185), (0.056, 0.193),
            (0.072, 0.198), (0.072, 0.232), (0.060, 0.232), (0.060, 0.222), (0.0, 0.222),
        ]
        lathe(f"{name}_body", scaled(body), (x, y, z), mat)
        gold_ring("waist", 0.195, 0.058)
        gold_ring("plinth", 0.024, rb * 0.965, 0.007)
        for idx in range(6):
            angle = idx * math.tau / 6.0
            merlon = cube(
                f"{name}_merlon_{idx}",
                (x + math.cos(angle) * 0.066 * k, y + math.sin(angle) * 0.066 * k, z + 0.246 * k),
                (0.017 * k, 0.017 * k, 0.014 * k),
                mat,
                bevel=0.004,
            )
            merlon.rotation_euler[2] = angle
        return

    if kind == "knight":
        body = plinth[:-1] + [(0.050, 0.058), (0.043, 0.084), (0.043, 0.098), (0.056, 0.100), (0.0, 0.100)]
        lathe(f"{name}_body", scaled(body), (x, y, z), mat)
        gold_ring("collar", 0.100, 0.054)
        gold_ring("plinth", 0.024, rb * 0.965, 0.007)
        # The head is the same silhouette as the JUGAR knight, thickened, facing the board centre
        # and square-on to the Home camera so it reads at a glance.
        su = 0.30 * k
        sv = 0.26 * k / 0.76
        smooth = _smooth_closed(list(KNIGHT_SILHOUETTE))
        flat_panel(
            f"{name}_head",
            [(x + facing_mult * (u + 0.067) * su, z + 0.098 * k + (v - 0.12) * sv) for u, v in smooth],
            y,
            0.072 * k,
            mat,
            bevel=0.010,
        )
        return

    if kind == "bishop":
        body = plinth[:-1] + [
            (0.050, 0.060), (0.040, 0.100), (0.031, 0.140), (0.030, 0.180), (0.046, 0.190), (0.046, 0.198),
            (0.030, 0.206), (0.036, 0.222), (0.042, 0.240), (0.042, 0.258), (0.034, 0.276), (0.022, 0.292),
            (0.010, 0.304), (0.0, 0.308),
        ]
        lathe(f"{name}_body", scaled(body), (x, y, z), mat)
        gold_ring("collar", 0.194, 0.048)
        gold_ring("plinth", 0.024, rb * 0.965, 0.007)
        sphere(f"{name}_finial", (x, y, z + 0.318 * k), (0.013 * k, 0.013 * k, 0.013 * k), trim)
        slit = cube(f"{name}_slit", (x, y - 0.040 * k, z + 0.252 * k), (0.030 * k, 0.004 * k, 0.006 * k), trim, bevel=0.002)
        slit.rotation_euler[1] = math.radians(-38.0)
        return

    if kind == "queen":
        body = plinth[:-1] + [
            (0.056, 0.060), (0.044, 0.100), (0.035, 0.150), (0.032, 0.200), (0.036, 0.235), (0.056, 0.245),
            (0.056, 0.255), (0.038, 0.262), (0.040, 0.275), (0.052, 0.292), (0.060, 0.312), (0.062, 0.324),
            (0.052, 0.328), (0.030, 0.322), (0.0, 0.320),
        ]
        lathe(f"{name}_body", scaled(body), (x, y, z), mat)
        gold_ring("collar", 0.250, 0.058)
        gold_ring("waist", 0.292, 0.054)
        gold_ring("plinth", 0.024, rb * 0.965, 0.007)
        for idx in range(8):
            angle = idx * math.tau / 8.0 + math.radians(22.5)
            px, py = x + math.cos(angle) * 0.055 * k, y + math.sin(angle) * 0.055 * k
            cone(f"{name}_point_{idx}", (px, py, z + 0.344 * k), 0.011 * k, 0.002, 0.038 * k, mat, vertices=10)
            sphere(f"{name}_bead_{idx}", (px, py, z + 0.366 * k), (0.008 * k, 0.008 * k, 0.008 * k), trim)
        sphere(f"{name}_orb", (x, y, z + 0.336 * k), (0.019 * k, 0.019 * k, 0.019 * k), trim)
        return

    # king: taller than the queen, crowned by a Teutonic cross pattée in gold
    body = plinth[:-1] + [
        (0.058, 0.060), (0.046, 0.100), (0.036, 0.150), (0.033, 0.210), (0.037, 0.250), (0.058, 0.262),
        (0.058, 0.272), (0.040, 0.280), (0.044, 0.300), (0.054, 0.320), (0.056, 0.340), (0.046, 0.356),
        (0.030, 0.366), (0.010, 0.370), (0.0, 0.371),
    ]
    lathe(f"{name}_body", scaled(body), (x, y, z), mat)
    gold_ring("collar", 0.266, 0.060)
    gold_ring("crown", 0.338, 0.058)
    gold_ring("plinth", 0.024, rb * 0.965, 0.007)
    cube(f"{name}_cross_v", (x, y, z + 0.418 * k), (0.011 * k, 0.011 * k, 0.040 * k), trim, bevel=0.003)
    cube(f"{name}_cross_h", (x, y, z + 0.404 * k), (0.036 * k, 0.011 * k, 0.011 * k), trim, bevel=0.003)
    for tag, (cx_e, cz_e, hx, hz) in {
        "top": (0.0, 0.462, 0.020, 0.008), "left": (-0.036, 0.404, 0.008, 0.019), "right": (0.036, 0.404, 0.008, 0.019),
    }.items():
        cube(f"{name}_cross_end_{tag}", (x + cx_e * k, y, z + cz_e * k), (hx * k, 0.011 * k, hz * k), trim, bevel=0.002)


def curve_tube(name: str, points, bevel_depth: float, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, mat)
    return obj


def flat_panel(name: str, points_xz, y: float, depth: float, mat, *, bevel=0.03, origin_xz=None):
    """Extrude a silhouette along Y.

    By default the object origin stays at the world origin with world-space
    vertices. Pass ``origin_xz`` to seat the origin on the piece instead (for
    example the base of a flame), so the runtime can scale or lean it in place
    rather than about the world origin.
    """
    half = depth / 2.0
    ox, oz = origin_xz if origin_xz is not None else (0.0, 0.0)
    oy = y if origin_xz is not None else 0.0
    front = [(x - ox, y - half - oy, z - oz) for x, z in points_xz]
    back = [(x - ox, y + half - oy, z - oz) for x, z in points_xz]
    vertices = front + back
    count = len(points_xz)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    # flat_panel builds its mesh from raw vertex/face lists, which ships with no UV
    # layer at all. An image texture with no UV data (not even a poor one) samples a
    # single texel for the whole surface, so every flat_panel object with a packed
    # texture_profile material (banners, armor overlay plates, the table drape) rendered
    # as one flat colour no matter how good the texture looked in isolation. A simple
    # planar UV from the panel's own X/Z plane (world-scale metres per repeat, matching
    # WORLD_UV_TILE_M) is enough since these are near-planar silhouettes.
    _planar_uv_from_xz(mesh, tile=1.6)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (ox, oy, oz)
    bpy.context.collection.objects.link(obj)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        configure_soft_edge_modifier(modifier, name)
    apply_material(obj, mat)
    return obj


def _planar_uv_from_xz(mesh, *, tile: float) -> None:
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            layer.data[loop_index].uv = (vertex.co.x / tile, vertex.co.z / tile)


def draped_banner_panel(
    name: str,
    center_x: float,
    y: float,
    half_width: float,
    top_z: float,
    side_bottom_z: float,
    center_bottom_z: float,
    mat,
    *,
    fold_depth=0.045,
    horizontal_segments=18,
    vertical_segments=10,
):
    """Build a lightly folded hanging textile instead of a rigid flat polygon."""
    vertices = []
    faces = []
    cols = horizontal_segments + 1
    seed = sum((index + 1) * ord(char) for index, char in enumerate(name)) & 0xFFFF
    fold_phase = _hash01(seed, 0, 1709) * math.tau
    fold_scale = 0.86 + _hash01(seed, 1, 1721) * 0.26
    side_bias = (_hash01(seed, 2, 1733) - 0.5) * 0.018

    for row in range(vertical_segments + 1):
        t = row / vertical_segments
        for col in range(horizontal_segments + 1):
            u = col / horizontal_segments
            signed = u * 2.0 - 1.0
            x = center_x + signed * half_width
            edge_mix = abs(signed) ** 0.88
            bottom_z = center_bottom_z + (side_bottom_z - center_bottom_z) * edge_mix
            z = top_z + (bottom_z - top_z) * t

            edge_fade = max(0.0, math.sin(math.pi * u)) ** 0.55
            lower_weight = 0.38 + 0.62 * t
            primary = math.sin(u * math.tau * 3.2 + 0.35 + fold_phase)
            secondary = math.sin(u * math.tau * 6.4 - 0.8 + fold_phase * 0.43) * 0.22
            fold = (primary + secondary) * fold_depth * fold_scale * edge_fade * lower_weight
            # Tiny asymmetric drop keeps the lower edge from reading as CAD-perfect.
            z -= (0.008 + 0.018 * t) * math.sin(math.pi * u) ** 2
            z += side_bias * signed * t
            vertices.append((x, y + fold, z))

    for row in range(vertical_segments):
        for col in range(horizontal_segments):
            a = row * cols + col
            b = a + 1
            c = a + cols
            d = c + 1
            # Winding faces the canonical camera on -Y.
            faces.append((a, c, d, b))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    # Same missing-UV gap as flat_panel: without it the cloth texture collapses to one
    # flat colour. The banner already has a natural (row, col) grid, so map it directly
    # instead of a generic planar projection.
    uv_layer = mesh.uv_layers.new(name="UVMap")
    tile = 1.3
    for row in range(vertical_segments):
        for col in range(horizontal_segments):
            a = row * cols + col
            b = a + 1
            c = a + cols
            d = c + 1
            face_index = row * horizontal_segments + col
            loop_start = mesh.polygons[face_index].loop_start
            for offset, vertex_index in enumerate((a, c, d, b)):
                vx, vy, vz = vertices[vertex_index]
                uv_layer.data[loop_start + offset].uv = (vx / tile, vz / tile)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, mat)
    smooth_curved_mesh(obj)

    solidify = obj.modifiers.new("Cloth thickness", "SOLIDIFY")
    solidify.thickness = 0.018
    solidify.offset = 0.0
    bevel = obj.modifiers.new("Soft cloth edge", "BEVEL")
    bevel.width = 0.010
    bevel.segments = 2
    return obj


def arch(name: str, x: float, y: float, width: float, spring_z: float, top_z: float, bottom_z: float, mat):
    radius = width / 2.0
    center_z = top_z - radius
    points = [(x - radius, y, bottom_z), (x - radius, y, center_z)]
    for i in range(17):
        theta = math.pi - (math.pi * i / 16.0)
        points.append((x + radius * math.cos(theta), y, center_z + radius * math.sin(theta)))
    points.extend([(x + radius, y, center_z), (x + radius, y, bottom_z)])
    return curve_tube(name, points, 0.19, mat)


def gothic_arch(name: str, x: float, y: float, width: float, shoulder_z: float, top_z: float, bottom_z: float, mat, *, bevel=0.13):
    half = width / 2.0
    points = [(x - half, y, bottom_z), (x - half, y, shoulder_z)]
    for i in range(1, 10):
        t = i / 9.0
        # Convex rise into a pointed apex; intentionally architectural rather
        # than mathematically perfect so the silhouette matches the painted master.
        points.append((x - half * (1.0 - t), y, shoulder_z + (top_z - shoulder_z) * (t ** 0.72)))
    for i in range(1, 10):
        t = i / 9.0
        points.append((x + half * t, y, top_z - (top_z - shoulder_z) * (t ** 1.38)))
    points.extend([(x + half, y, shoulder_z), (x + half, y, bottom_z)])
    return curve_tube(name, points, bevel, mat)


def add_floor_joint_network(
    name: str,
    center_x: float,
    center_y: float,
    half_x: float,
    half_y: float,
    z: float,
    mat,
    *,
    tile_x=1.55,
    tile_y=1.05,
) -> None:
    """Lay restrained, slightly irregular paving joints over a floor slab."""
    rows = max(2, int((half_y * 2.0) / tile_y))
    cols = max(2, int((half_x * 2.0) / tile_x))
    row_h = (half_y * 2.0) / rows
    col_w = (half_x * 2.0) / cols

    # Long horizontal bed joints stay almost straight, with tiny authored drift.
    for row in range(1, rows):
        jitter = (_hash01(row, rows, 811) - 0.5) * 0.055
        y = center_y - half_y + row * row_h + jitter
        thickness = 0.010 + _hash01(row, 3, 823) * 0.008
        cube(
            f"{name}_bed_{row}",
            (center_x, y, z),
            (half_x - 0.02, thickness, 0.006),
            mat,
            bevel=0.004,
        )

    # Short head joints alternate by row; their tiny x/y offsets stop the paving
    # from reading like a mathematically perfect game grid.
    for row in range(rows):
        y0 = center_y - half_y + row * row_h
        y_mid = y0 + row_h * 0.5
        stagger = 0.5 if row % 2 else 0.0
        for col in range(cols + 1):
            x = center_x - half_x + (col + stagger) * col_w
            if x <= center_x - half_x + 0.06 or x >= center_x + half_x - 0.06:
                continue
            x += (_hash01(col, row, 839) - 0.5) * 0.065
            y = y_mid + (_hash01(row, col, 853) - 0.5) * 0.040
            thickness = 0.009 + _hash01(col, row, 857) * 0.007
            cube(
                f"{name}_head_{row}_{col}",
                (x, y, z + 0.001),
                (thickness, row_h * 0.46, 0.006),
                mat,
                bevel=0.004,
            )


def add_gothic_voussoirs(
    name: str,
    x: float,
    y: float,
    width: float,
    shoulder_z: float,
    top_z: float,
    mat,
    *,
    count_per_side=7,
):
    """Add restrained low-relief wedge blocks over a pointed stone arch."""
    half = width / 2.0
    points = []
    for idx in range(count_per_side + 1):
        t = idx / count_per_side
        points.append((
            x - half * (1.0 - t),
            shoulder_z + (top_z - shoulder_z) * (t ** 0.72),
        ))
    for idx in range(1, count_per_side + 1):
        t = idx / count_per_side
        points.append((
            x + half * t,
            top_z - (top_z - shoulder_z) * (t ** 1.38),
        ))

    for idx, (px, pz) in enumerate(points):
        prev_x, prev_z = points[max(0, idx - 1)]
        next_x, next_z = points[min(len(points) - 1, idx + 1)]
        dx = next_x - prev_x
        dz = next_z - prev_z
        block = cube(
            f"{name}_{idx}",
            (
                px,
                y - 0.070 - _hash01(idx, 0, 1201) * 0.018,
                pz,
            ),
            (
                0.105 + _hash01(idx, 1, 1213) * 0.018,
                0.070,
                0.155 + _hash01(idx, 2, 1223) * 0.022,
            ),
            mat,
            bevel=0.022,
        )
        block.rotation_euler[1] = math.atan2(dx, dz)


def add_round_arch_voussoirs(
    name: str,
    x: float,
    y: float,
    width: float,
    top_z: float,
    mat,
    *,
    count=11,
):
    """Add shallow wedge blocks across the curved crown of a round arch."""
    radius = width / 2.0
    center_z = top_z - radius
    for idx in range(count):
        t = idx / (count - 1)
        theta = math.pi * (1.0 - t)
        px = x + radius * math.cos(theta)
        pz = center_z + radius * math.sin(theta)
        dx = -radius * math.sin(theta)
        dz = radius * math.cos(theta)
        block = cube(
            f"{name}_{idx}",
            (
                px,
                y - 0.072 - _hash01(idx, 0, 1249) * 0.016,
                pz,
            ),
            (
                0.108 + _hash01(idx, 1, 1259) * 0.016,
                0.070,
                0.150 + _hash01(idx, 2, 1277) * 0.018,
            ),
            mat,
            bevel=0.020,
        )
        block.rotation_euler[1] = math.atan2(dx, dz)


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location, energy: float, color, size: float, target=(0, 2.0, 2.0)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_point_light(name: str, location, energy: float, color, radius=0.22):
    data = bpy.data.lights.new(name, type="POINT")
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def configure_cinematic_compositor(scene) -> None:
    """Add restrained practical-light halo using Blender 5.x compositor API."""
    if bpy.app.version < (5, 0, 0):
        raise RuntimeError("Canonical Home preview requires Blender 5.x compositor API")

    tree = bpy.data.node_groups.new("HOME_COMPOSITOR_CINEMATIC", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket(
        name="Image",
        in_out="OUTPUT",
        socket_type="NodeSocketColor",
    )

    nodes = tree.nodes
    links = tree.links
    layers = nodes.new("CompositorNodeRLayers")
    glare = nodes.new("CompositorNodeGlare")
    output = nodes.new("NodeGroupOutput")

    glare.inputs["Type"].default_value = "Fog Glow"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 1.15
    glare.inputs["Size"].default_value = 0.68
    glare.inputs["Strength"].default_value = 0.40

    links.new(layers.outputs["Image"], glare.inputs["Image"])
    links.new(glare.outputs["Image"], output.inputs["Image"])

    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = True


KNIGHT_SILHOUETTE = (
    (-0.12, 0.88), (-0.06, 0.79), (0.03, 0.77), (0.12, 0.68), (0.19, 0.56), (0.24, 0.42), (0.25, 0.26), (0.24, 0.12),
    (-0.24, 0.12), (-0.24, 0.22), (-0.19, 0.32), (-0.10, 0.38), (-0.20, 0.45), (-0.31, 0.51), (-0.39, 0.56),
    (-0.415, 0.61), (-0.385, 0.67), (-0.31, 0.69), (-0.22, 0.74), (-0.17, 0.81),
)


def add_knight_statuette(prefix, cx, cy, base_z, height, materials):
    """Small gilt chess-knight statuette on a brass plinth, facing left (towards -X)."""
    scale = height / 0.88
    smooth = _smooth_closed(list(KNIGHT_SILHOUETTE))
    flat_panel(
        f"{prefix}_knight",
        [(cx + u * scale, base_z + 0.07 + v * scale) for u, v in smooth],
        cy,
        0.085,
        materials["gold"],
        bevel=0.008,
    )
    cube(f"{prefix}_plinth", (cx, cy, base_z + 0.035), (0.30 * scale, 0.075, 0.035), materials["brass_dark"], bevel=0.012)
    cube(f"{prefix}_plinth_top", (cx, cy, base_z + 0.078), (0.25 * scale, 0.062, 0.012), materials["brass"], bevel=0.006)


def add_library_sconces(materials):
    """Two brass candle sconces on the bookcase posts, projecting into the room: the
    library's visible reading light. They stand in front of the post column, so they
    never cover a book (the first pass hid them behind the post's front face)."""
    brass = materials["brass"]
    dark_brass = materials["brass_dark"]
    for idx, post_x in enumerate((-3.99, -1.31)):
        z = 3.62
        cube(f"HOME_PROP_library_sconce_plate_{idx}", (post_x, 5.755, z), (0.05, 0.02, 0.16), dark_brass, bevel=0.010)
        curve_tube(
            f"HOME_PROP_library_sconce_arm_{idx}",
            [(post_x, 5.74, z - 0.02), (post_x, 5.62, z - 0.07), (post_x, 5.50, z - 0.04)],
            0.016,
            brass,
        )
        cylinder(f"HOME_PROP_library_sconce_cup_{idx}", (post_x, 5.50, z - 0.02), 0.052, 0.03, brass, vertices=18)
        cylinder(f"HOME_PROP_library_sconce_candle_{idx}", (post_x, 5.50, z + 0.105), 0.028, 0.20, materials["wax"], vertices=14)
        cone(f"HOME_PROP_library_sconce_candle_flame_{idx}", (post_x, 5.50, z + 0.245), 0.028, 0.005, 0.10, materials["fire_hot"], vertices=12)
        add_point_light(f"HOME_LIGHT_library_sconce_{idx}", (post_x, 5.36, z + 0.30), 70, (1.0, 0.48, 0.20), radius=0.26)


def add_stair_lantern(idx, px, py, pz, materials):
    """Enclosed brass lantern: an open flame beside a wooden handrail was a fire hazard."""
    brass = materials["brass"]
    dark_brass = materials["brass_dark"]
    cylinder(f"HOME_PROP_dungeon_lantern_base_{idx}", (px, py, pz - 0.105), 0.095, 0.03, brass, vertices=20)
    for corner, (dx, dy) in enumerate(((-0.065, -0.065), (0.065, -0.065), (-0.065, 0.065), (0.065, 0.065))):
        cube(f"HOME_PROP_dungeon_lantern_post_{idx}_{corner}", (px + dx, py + dy, pz + 0.10), (0.011, 0.011, 0.21), dark_brass, bevel=0.004)
    for ring_z, tag in ((pz - 0.07, "low"), (pz + 0.27, "high")):
        cube(f"HOME_PROP_dungeon_lantern_ring_{idx}_{tag}", (px, py, ring_z), (0.08, 0.08, 0.010), dark_brass, bevel=0.004)
    roof = cone(f"HOME_PROP_dungeon_lantern_roof_{idx}", (px, py, pz + 0.345), 0.115, 0.012, 0.14, brass, vertices=8)
    sphere(f"HOME_PROP_dungeon_lantern_finial_{idx}", (px, py, pz + 0.43), (0.022, 0.022, 0.022), brass)
    cylinder(f"HOME_PROP_dungeon_candle_{idx}", (px, py, pz), 0.038, 0.18, materials["wax"], vertices=12)
    cone(f"HOME_PROP_dungeon_candle_flame_{idx}", (px, py, pz + 0.18), 0.040, 0.008, 0.12, materials["fire_hot"], vertices=10)
    add_point_light(f"HOME_LIGHT_dungeon_candle_{idx}", (px, py - 0.04, pz + 0.22), 22, (1.0, 0.40, 0.12), radius=0.20)




def floor_panel(name, points_xy, z, thickness, mat):
    """Extrude a flat silhouette (XY) into a thin slab lying on the floor, top face up."""
    area = 0.0
    for i, (x0, y0) in enumerate(points_xy):
        x1, y1 = points_xy[(i + 1) % len(points_xy)]
        area += x0 * y1 - x1 * y0
    pts = list(points_xy) if area > 0 else list(reversed(points_xy))
    count = len(pts)
    half = thickness / 2.0
    vertices = [(x, y, z - half) for x, y in pts] + [(x, y, z + half) for x, y in pts]
    faces = [tuple(range(count, 2 * count)), tuple(reversed(range(count)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            layer.data[loop_index].uv = (vertex.co.x / 1.6, vertex.co.y / 1.6)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, mat)
    return obj


# A more realistic heraldic horse bust for the banners and shield (facing left): long arched
# neck, refined head with a concave nasal bridge, pricked ear, forelock and a mane of flowing
# locks. Engraved cuts (dark) and a bright bridge highlight are layered over the gilt.
KNIGHT_REAL = (
    (-0.30, 0.10), (-0.27, 0.18), (-0.22, 0.27), (-0.15, 0.35), (-0.24, 0.26), (-0.33, 0.21), (-0.40, 0.20),
    (-0.46, 0.24), (-0.49, 0.32), (-0.47, 0.40), (-0.42, 0.47), (-0.34, 0.57), (-0.26, 0.66), (-0.19, 0.75),
    (-0.14, 0.82), (-0.10, 0.86), (-0.07, 0.99), (0.00, 0.88), (0.06, 0.91), (0.16, 0.95), (0.27, 0.99),
    (0.20, 0.87), (0.33, 0.87), (0.25, 0.78), (0.39, 0.75), (0.30, 0.68), (0.42, 0.62), (0.33, 0.55),
    (0.42, 0.47), (0.33, 0.40), (0.40, 0.32), (0.32, 0.25), (0.37, 0.16), (0.34, 0.10),
)


def _polyline_strip(points, width):
    """Thin polygon around a polyline (for engraved lines)."""
    left, right = [], []
    for i, (x, z) in enumerate(points):
        px, pz = points[max(0, i - 1)]
        nx, nz = points[min(len(points) - 1, i + 1)]
        dx, dz = nx - px, nz - pz
        length = math.hypot(dx, dz) or 1.0
        ox, oz = -dz / length * width / 2.0, dx / length * width / 2.0
        left.append((x + ox, z + oz))
        right.append((x - ox, z - oz))
    return left + right[::-1]


KNIGHT_REAL_CUTS = (
    ((-0.215, 0.665), (-0.155, 0.700), (-0.105, 0.676), (-0.160, 0.652)),
    ((-0.470, 0.345), (-0.440, 0.372), (-0.425, 0.340), (-0.452, 0.322)),
    _polyline_strip([(-0.485, 0.262), (-0.430, 0.272), (-0.370, 0.262)], 0.012),
    ((-0.075, 0.90), (-0.065, 0.965), (-0.020, 0.90)),
    _polyline_strip([(-0.150, 0.600), (-0.190, 0.470), (-0.230, 0.350), (-0.180, 0.320)], 0.014),
    _polyline_strip([(-0.050, 0.62), (0.000, 0.46), (-0.030, 0.30), (-0.060, 0.18)], 0.012),
    _polyline_strip([(0.10, 0.86), (0.20, 0.72), (0.27, 0.58)], 0.012),
    _polyline_strip([(0.12, 0.74), (0.24, 0.58), (0.30, 0.42)], 0.012),
    _polyline_strip([(0.10, 0.62), (0.22, 0.44), (0.27, 0.28)], 0.012),
)
KNIGHT_REAL_HIGHLIGHTS = (
    _polyline_strip([(-0.205, 0.735), (-0.300, 0.630), (-0.400, 0.505)], 0.020),
    _polyline_strip([(0.10, 0.93), (0.28, 0.80), (0.36, 0.62)], 0.014),
)


# Angular heraldic knight for the rug: a sharp, unsmoothed polygon (spiked mane, pricked ear,
# strong muzzle) facing left like KNIGHT_SILHOUETTE. Smoothing it made a plush toy.
KNIGHT_HERALDIC = (
    (0.27, 0.12), (0.28, 0.30), (0.23, 0.40), (0.36, 0.44), (0.24, 0.51), (0.35, 0.58), (0.22, 0.61),
    (0.31, 0.71), (0.16, 0.69), (0.19, 0.82), (0.07, 0.75), (0.02, 0.90), (-0.05, 0.77),
    (-0.15, 0.78), (-0.25, 0.71), (-0.35, 0.60), (-0.445, 0.56), (-0.45, 0.51), (-0.40, 0.46),
    (-0.31, 0.44), (-0.22, 0.47), (-0.16, 0.39), (-0.23, 0.29), (-0.31, 0.19), (-0.30, 0.12),
)
KNIGHT_HERALDIC_CUTS = (
    ((-0.185, 0.685), (-0.095, 0.715), (-0.115, 0.665)),
    ((-0.425, 0.545), (-0.385, 0.565), (-0.395, 0.525)),
    ((-0.33, 0.475), (-0.14, 0.535), (-0.13, 0.515), (-0.32, 0.455)),
    ((0.14, 0.67), (0.02, 0.56), (0.0, 0.45), (0.03, 0.45), (0.05, 0.55), (0.16, 0.65)),
)


def add_royal_cat(materials):
    """A white cat asleep on a crimson velvet cushion beside the rug. A smooth shaded undercoat
    (body, haunch, chest, head, paws) is dressed with directional fur tufts that follow the coat,
    so it reads as fur and not as a marshmallow; pricked ears with pink inners and fluff, closed
    sleepy eyes with lashes, nose, mouth, whiskers, toes, a curled tail and a gilt collar with a
    sapphire. Head toward the camera."""
    fur = materials["cat_fur"]
    shade = materials["cat_shade"]
    point = materials["cat_point"]  # colourpoint markings: mask, ears, paws, tail tip
    pink = materials["cat_pink"]
    dark = materials["cat_dark"]
    gold = materials["gold"]
    cx, cy = 4.32, -1.50
    top = 0.094
    fine = (48, 24)

    # Royal cushion: rounded velvet slab, gilt piping and four tassels.
    # Plush crimson pillow (a slab read as a wooden tray): domed velvet, gilt piping round the
    # seam, four tassels on the outline and a button tuft.
    sphere("HOME_PROP_cat_cushion", (cx, cy, 0.050), (0.43, 0.35, 0.052), materials["plume_red"], detail=(48, 20))
    curve_tube(
        "HOME_PROP_cat_cushion_piping",
        [(cx + 0.428 * math.cos(i * math.tau / 48), cy + 0.348 * math.sin(i * math.tau / 48), 0.050) for i in range(49)],
        0.011,
        gold,
    )
    for n, ang in enumerate((45, 135, 225, 315)):
        a = math.radians(ang)
        tx, ty = cx + 0.44 * math.cos(a), cy + 0.355 * math.sin(a)
        sphere(f"HOME_PROP_cat_tassel_knob_{n}", (tx, ty, 0.050), (0.024, 0.024, 0.024), gold, detail=(16, 8))
        cone(f"HOME_PROP_cat_tassel_{n}", (tx + 0.02 * math.cos(a), ty + 0.02 * math.sin(a), 0.020), 0.022, 0.008, 0.06, gold, vertices=10)

    def blob(name, loc, scale, rot=(0.0, 0.0, 0.0), mat=fur, detail=fine):
        obj = sphere(name, loc, scale, mat, detail=detail)
        obj.rotation_euler = tuple(math.radians(v) for v in rot)
        return obj

    def tuft(name, pos, axis, length, radius, mat=fur):
        """A flattened, overlapping fur clump lying along the coat (long axis = `axis`)."""
        axis = Vector(axis).normalized()
        obj = sphere(name, tuple(Vector(pos) + axis * (length * 0.30)), (length * 0.5, radius * 1.15, radius * 0.55), mat, detail=(12, 6))
        obj.rotation_euler = axis.to_track_quat("X", "Z").to_euler()
        return obj

    def coat(prefix, centre, radii, count, seed, *, along=(1.0, 0.0, 0.0), length=0.13, radius=0.030, lift=0.12, phi_range=(0.12, 1.30), theta_range=(-3.14159, 3.14159)):
        """Fur tufts over the visible half of an ellipsoid, combed along `along`."""
        c = Vector(centre)
        comb = Vector(along).normalized()
        for n in range(count):
            phi = phi_range[0] + _hash01(n, 0, seed) * (phi_range[1] - phi_range[0])
            theta = theta_range[0] + _hash01(n, 1, seed) * (theta_range[1] - theta_range[0])
            p = Vector((radii[0] * math.cos(theta) * math.sin(phi), radii[1] * math.sin(theta) * math.sin(phi), radii[2] * math.cos(phi)))
            normal = Vector((p.x / radii[0] ** 2, p.y / radii[1] ** 2, p.z / radii[2] ** 2)).normalized()
            tangent = comb - normal * comb.dot(normal)
            if tangent.length < 1e-4:
                tangent = Vector((0.0, 0.0, 1.0)) - normal * normal.z
            axis = tangent.normalized() + normal * lift
            jitter = Vector(((_hash01(n, 2, seed) - 0.5) * 0.5, (_hash01(n, 3, seed) - 0.5) * 0.5, (_hash01(n, 4, seed) - 0.5) * 0.3))
            tuft(f"{prefix}_{n}", tuple(c + p * 0.985), tuple(axis + jitter), length * (0.8 + _hash01(n, 5, seed) * 0.5), radius * (0.8 + _hash01(n, 6, seed) * 0.4), fur if n % 3 else materials["cat_fur"])

    # Undercoat: slightly shaded, smooth and high-resolution so the tufts sit on a real form.
    # One organic mesh: a metaball union of ellipsoids (body, haunch, chest, neck, head, legs,
    # tail) that Blender converts to a single seamless surface, so the outline flows like a real
    # curled cat instead of overlapping eggs. Elements are queued here and built at the end.
    meta_elems = []

    def meta(co, radii, rot_z=0.0, rot_x=0.0, stiff=2.0):
        meta_elems.append((co, radii, rot_z, rot_x, stiff))

    meta((cx + 0.02, cy + 0.02, top + 0.115), (0.29, 0.23, 0.125), 8)                    # body
    meta((cx + 0.19, cy + 0.10, top + 0.108), (0.17, 0.16, 0.125), -10)                  # haunch
    meta((cx + 0.23, cy + 0.12, top + 0.150), (0.10, 0.09, 0.090), -20)                  # hip
    meta((cx - 0.10, cy + 0.02, top + 0.150), (0.13, 0.13, 0.100), 20)                   # shoulder
    meta((cx - 0.16, cy - 0.06, top + 0.095), (0.15, 0.13, 0.10), 12)                    # chest
    meta((cx - 0.20, cy - 0.10, top + 0.140), (0.10, 0.095, 0.090), 10)                  # neck

    # Definition: the haunch is a distinct thigh (a crease along its front edge) with the hind
    # foot peeking out under it, so the body stops reading as a marshmallow loaf.
    blob("HOME_PROP_cat_hind_foot", (cx + 0.17, cy - 0.085, top + 0.040), (0.078, 0.040, 0.034), (0, 0, -6), point, (32, 16))
    for k in (-1, 0, 1):
        curve_tube(f"HOME_PROP_cat_hind_toe_{k}", [(cx + 0.17 + k * 0.022, cy - 0.118, top + 0.048), (cx + 0.17 + k * 0.024, cy - 0.125, top + 0.030)], 0.0017, shade)
    # a short back-of-shoulder crease and a subtle spine line
    # A defined neck and rib lines. (Raised shoulder/hip bumps and a spine tube were tried and read as
    # mouse ears on the back; surface creases do the job without breaking the outline.)

    # Head resting on the front paws, turned to the camera.
    hx, hy, hz = cx - 0.22, cy - 0.22, top + 0.085
    meta((hx, hy, hz), (0.115, 0.105, 0.092), -10, 8, 2.2)  # head
    meta((hx - 0.055, hy - 0.040, hz - 0.028), (0.046, 0.040, 0.036))
    meta((hx + 0.055, hy - 0.040, hz - 0.028), (0.046, 0.040, 0.036))
    blob("HOME_PROP_cat_muzzle", (hx, hy - 0.088, hz - 0.030), (0.042, 0.030, 0.028), (0, 0, 0), point, fine)
    blob("HOME_PROP_cat_mask", (hx, hy - 0.080, hz + 0.002), (0.062, 0.022, 0.050), (8, 0, -10), point, (40, 20))
    blob("HOME_PROP_cat_chin", (hx, hy - 0.070, hz - 0.066), (0.030, 0.024, 0.020), (0, 0, 0), fur, (24, 12))
    for side, tag in ((-1, "l"), (1, "r")):
        # Ears: small rounded wedge-shaped lumps fused into the head (flat paper triangles read as
        # cutouts), with a small pink inner panel and a darker outer tip.
        ex = hx + side * 0.072
        ez = hz + 0.078
        meta((ex, hy + 0.010, ez), (0.040, 0.022, 0.058), side * 12, -8, 2.2)
        meta((ex + side * 0.012, hy + 0.008, ez + 0.045), (0.024, 0.016, 0.040), side * 16, -8, 2.2)
        inner_pts = [(ex - 0.022, ez - 0.008), (ex + 0.022, ez - 0.008), (ex + side * 0.010, ez + 0.058)]
        flat_panel(f"HOME_PROP_cat_ear_inner_{tag}", inner_pts, hy - 0.020, 0.010, pink, bevel=0.003)
        # Matthias's cat: asleep, but scowling. The eye is a narrow slit slanting down toward the
        # nose (inner end lowest), under a heavy brow furrowed into a V, like the pawn's glare.
        curve_tube(
            f"HOME_PROP_cat_eye_{tag}",
            [(hx + side * 0.020, hy - 0.100, hz + 0.004), (hx + side * 0.048, hy - 0.104, hz + 0.014), (hx + side * 0.076, hy - 0.099, hz + 0.024)],
            0.0034,
            dark,
        )
        curve_tube(
            f"HOME_PROP_cat_brow_{tag}",
            [(hx + side * 0.014, hy - 0.100, hz + 0.022), (hx + side * 0.050, hy - 0.105, hz + 0.036), (hx + side * 0.088, hy - 0.098, hz + 0.050)],
            0.0048,
            shade,
        )
        for k in (-1, 0, 1):
            curve_tube(
                f"HOME_PROP_cat_whisker_{tag}_{k}",
                [(hx + side * 0.048, hy - 0.098, hz - 0.030 + k * 0.011), (hx + side * 0.140, hy - 0.118, hz - 0.026 + k * 0.030), (hx + side * 0.240, hy - 0.104, hz - 0.030 + k * 0.048)],
                0.0016,
                materials["cat_fur"],
            )
        # front paw with toe grooves
        blob(f"HOME_PROP_cat_paw_{tag}", (hx + side * 0.070, hy - 0.082, top + 0.032), (0.044, 0.064, 0.026), (0, 0, 0), point, (32, 16))
        # foreleg from the chest to the paw, so the paw is attached to a leg
        meta((hx + side * 0.075, hy + 0.045, top + 0.050), (0.044, 0.105, 0.042), side * 6)
        for k in (-1, 1):
            cube(f"HOME_PROP_cat_toe_{tag}_{k}", (hx + side * 0.070 + k * 0.016, hy - 0.146, top + 0.038), (0.0012, 0.012, 0.0010), shade)
    # nose (small pink heart-ish triangle) and mouth
    blob("HOME_PROP_cat_nose", (hx, hy - 0.112, hz - 0.010), (0.016, 0.010, 0.011), (0, 0, 0), pink, (16, 8))
    # grumpy frown: the mouth is an inverted arc, corners pulled down
    curve_tube("HOME_PROP_cat_mouth", [(hx - 0.030, hy - 0.108, hz - 0.048), (hx - 0.014, hy - 0.113, hz - 0.036), (hx, hy - 0.114, hz - 0.030), (hx + 0.014, hy - 0.113, hz - 0.036), (hx + 0.030, hy - 0.108, hz - 0.048)], 0.0024, dark)
    # one small fang peeks out under the scowl
    cone("HOME_PROP_cat_fang", (hx + 0.027, hy - 0.108, hz - 0.052), 0.0012, 0.0062, 0.016, materials["cat_fur"], vertices=8)
    curve_tube("HOME_PROP_cat_philtrum", [(hx, hy - 0.113, hz - 0.018), (hx, hy - 0.114, hz - 0.030)], 0.0016, dark)

    # Gilt collar with a sapphire pendant.
    curve_tube(
        "HOME_PROP_cat_collar",
        [(hx - 0.090, hy - 0.052, hz - 0.070), (hx - 0.042, hy - 0.094, hz - 0.088), (hx + 0.042, hy - 0.094, hz - 0.088), (hx + 0.094, hy - 0.052, hz - 0.070)],
        0.012,
        gold,
    )
    sphere("HOME_PROP_cat_pendant", (hx, hy - 0.103, hz - 0.101), (0.024, 0.015, 0.024), materials["sapphire"], detail=(24, 12))
    sphere("HOME_PROP_cat_pendant_mount", (hx, hy - 0.099, hz - 0.098), (0.031, 0.011, 0.031), gold, detail=(24, 12))

    # Tail curled around the front of the body with a combed brush of fur, tip by the paws.
    tail = []
    for i in range(56):
        t = i / 55.0
        ang = math.radians(20 + t * 250)
        tail.append((cx + 0.02 + 0.29 * math.cos(ang), cy + 0.02 - 0.235 * math.sin(ang) - 0.01, top + 0.034 + 0.014 * math.sin(t * math.pi)))
    # Tapered tail as overlapping spheres (thick at the rump, slim at the tip) with a darker tip;
    # a constant tube read as a balloon-animal sausage.
    for n, t in enumerate(tail):
        frac = n / max(1, len(tail) - 1)
        rad = 0.046 - 0.020 * frac
        if frac > 0.62:
            sphere(f"HOME_PROP_cat_tail_seg_{n}", t, (rad * 1.1, rad, rad * 0.92), point, detail=(20, 10))
        else:
            meta(t, (rad * 0.95, rad * 0.90, rad * 0.85), 0.0, 0.0, 2.6)


    # Build the metaball union and convert it to a single smooth mesh.
    mb = bpy.data.metaballs.new("HOME_PROP_cat_body_meta")
    mb.resolution = 0.012
    mb.render_resolution = 0.012
    mb.threshold = 0.6
    scale_up = 1.55  # ellipsoid size so the polygonised surface lands near the target radii
    for co, radii, rot_z, rot_x, stiff in meta_elems:
        el = mb.elements.new(type="ELLIPSOID")
        el.co = co
        el.radius = 1.0
        el.stiffness = stiff
        el.size_x, el.size_y, el.size_z = (radii[0] * scale_up, radii[1] * scale_up, radii[2] * scale_up)
        el.rotation = Euler((math.radians(rot_x), 0.0, math.radians(rot_z))).to_quaternion()
    body = bpy.data.objects.new("HOME_PROP_cat_body", mb)
    bpy.context.collection.objects.link(body)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.convert(target="MESH")
    body = bpy.context.view_layer.objects.active
    body.name = "HOME_PROP_cat_body"
    for poly in body.data.polygons:
        poly.use_smooth = True
    apply_material(body, fur)


def add_rug_knight_tapestry(materials):
    """Heraldic pair of chess knights woven into the visible strip of the rug, stretched
    across it like a tapestry (the rug is seen at a low angle, so the drawing is wider than tall
    on purpose). Gold thread over a dark outline; the pair faces the centre."""
    thread = materials["rug_thread"]
    outline = materials["stone_dark"]
    depth_start, depth_span = -2.16, 1.30  # y of the base line and depth of the drawing (the strip is about 1.4 deep)
    # Mild stretch only: the room camera sees the rug from a low angle (depth is squashed to about
    # half), and at 2.5x wide the pair read as two reclining seals, not knights.
    sx, sy = 1.15, depth_span / 0.78
    for tag, cx, facing in (("left", -1.30, -1.0), ("right", 1.30, 1.0)):
        def world(u, v, grow=1.0):
            return (cx + facing * u * sx * grow, depth_start + (v - 0.12) * sy * grow - (grow - 1.0) * 0.30)
        floor_panel(f"HOME_PROP_rug_knight_{tag}_outline", [world(u, v, 1.07) for u, v in KNIGHT_HERALDIC], 0.060, 0.010, outline)
        floor_panel(f"HOME_PROP_rug_knight_{tag}", [world(u, v) for u, v in KNIGHT_HERALDIC], 0.068, 0.012, thread)
        for cut, pts in enumerate(KNIGHT_HERALDIC_CUTS):
            floor_panel(f"HOME_PROP_rug_knight_{tag}_cut_{cut}", [world(u, v) for u, v in pts], 0.0765, 0.004, outline)
        # plinth bar the knight stands on, like the medallion knight
        cube(
            f"HOME_PROP_rug_knight_{tag}_base",
            (cx, depth_start - 0.055, 0.066),
            (0.36 * sx * 0.95, 0.045, 0.007),
            thread,
            bevel=0.004,
        )
    # centre: a stretched diamond chain between the pair, echoing the medallion above it
    for idx, (x, size) in enumerate(((-0.55, 0.06), (0.0, 0.10), (0.55, 0.06))):
        motif = cube(f"HOME_PROP_rug_tapestry_diamond_{idx}", (x, -1.55, 0.066), (size * 1.9, size, 0.008), thread)
        motif.rotation_euler[2] = math.radians(45)
        motif.scale.x *= 1.0


def add_chronicle_lectern(prefix, cx, cy, table_z, materials):
    """Open book of chronicles on a slanted wooden lectern, with an inkwell and a quill.
    It is the HISTORIA object: a book of the castle's legacy, readable at a glance (the black
    helmet that stood here read as a cooking pot and hid the statuette behind it)."""
    wood = materials["wood"]
    tilt = math.radians(46.0)
    rot = Matrix.Rotation(tilt, 3, "X")
    board_c = Vector((cx, cy, table_z + 0.21))

    def on_board(lx, ly, lz):
        return board_c + rot @ Vector((lx, ly, lz))

    def tilted(name, local, half, mat, *, roll=0.0, bevel=0.0):
        obj = cube(name, tuple(on_board(*local)), half, mat, bevel=bevel)
        obj.rotation_euler = (tilt, math.radians(roll), 0.0)
        return obj

    # stand: slanted reading board, front lip, rear legs
    tilted(f"{prefix}_board", (0, 0, 0), (0.33, 0.22, 0.018), wood, bevel=0.010)
    tilted(f"{prefix}_lip", (0, -0.205, 0.035), (0.33, 0.014, 0.030), wood, bevel=0.008)
    for side in (-1, 1):
        cube(f"{prefix}_leg_rear_{side}", (cx + side * 0.27, cy + 0.17, table_z + 0.11), (0.022, 0.022, 0.11), wood, bevel=0.008)
        cube(f"{prefix}_leg_front_{side}", (cx + side * 0.27, cy - 0.10, table_z + 0.045), (0.022, 0.022, 0.045), wood, bevel=0.008)
    # the open book: leather covers, two page blocks, gilt edges, corner caps, ribbon
    tilted(f"{prefix}_cover", (0, 0, 0.030), (0.29, 0.19, 0.012), materials["book_oxblood"], bevel=0.006)
    for side, tag in ((-1, "l"), (1, "r")):
        tilted(f"{prefix}_pages_{tag}", (side * 0.135, 0, 0.052), (0.128, 0.165, 0.022), materials["paper"], roll=-side * 4.0, bevel=0.004)
        tilted(f"{prefix}_gilt_{tag}", (side * 0.135, 0, 0.076), (0.128, 0.166, 0.003), materials["gold"], roll=-side * 4.0)
        for line, ly in enumerate((0.11, 0.075, 0.04, 0.005, -0.03, -0.065, -0.10)):
            tilted(f"{prefix}_text_{tag}_{line}", (side * 0.135 + side * 0.008 * (line % 2), ly, 0.081), (0.085 - 0.012 * (line % 3), 0.004, 0.0015), materials["dark"], roll=-side * 4.0)
    tilted(f"{prefix}_spine", (0, 0, 0.060), (0.012, 0.18, 0.020), materials["brass_dark"], bevel=0.004)
    for cx_l, cy_l in ((-0.29, 0.19), (0.29, 0.19), (-0.29, -0.19), (0.29, -0.19)):
        tilted(f"{prefix}_corner_{cx_l}_{cy_l}", (cx_l, cy_l, 0.032), (0.028, 0.028, 0.014), materials["brass"], bevel=0.006)
    tilted(f"{prefix}_ribbon", (0.05, -0.215, 0.050), (0.012, 0.045, 0.004), materials["plume_red"])
    # inkwell and quill on the table, to the right of the lectern
    ink = (cx + 0.43, cy - 0.12)
    cylinder(f"{prefix}_inkwell", (ink[0], ink[1], table_z + 0.035), 0.045, 0.07, materials["dark"], vertices=20)
    cylinder(f"{prefix}_inkwell_rim", (ink[0], ink[1], table_z + 0.074), 0.050, 0.010, materials["brass"], vertices=20)
    curve_tube(f"{prefix}_quill", [(ink[0], ink[1], table_z + 0.06), (ink[0] + 0.05, ink[1] - 0.03, table_z + 0.22), (ink[0] + 0.085, ink[1] - 0.05, table_z + 0.34)], 0.006, materials["brass_dark"])
    feather = cone(f"{prefix}_quill_feather", (ink[0] + 0.07, ink[1] - 0.04, table_z + 0.29), 0.022, 0.004, 0.17, materials["paper"], vertices=10)
    feather.rotation_euler = (math.radians(-12.0), math.radians(24.0), 0.0)
    feather.scale.y = 0.35


def add_castle_chair(name, cx, cy, side, materials):
    """Carved high-back chair of a Teutonic hall, back towards the wall side (+side*x)."""
    wood = materials["table_wood"]
    dark_wood = materials["library_wood"]
    brass = materials["brass"]
    dark = materials["dark"]
    velvet = materials["bench_velvet"]

    def px(du):
        return cx + side * du

    # Seat frame + tufted crimson cushion with a nailhead edge.
    cube(f"{name}_seat_frame", (cx, cy, 0.72), (0.35, 0.36, 0.05), wood, bevel=0.030)
    cube(f"{name}_seat_cushion", (px(-0.01), cy, 0.80), (0.31, 0.32, 0.055), velvet, bevel=0.045)
    for nail in range(6):
        sphere(f"{name}_nail_{nail}", (px(-0.318), cy - 0.27 + nail * 0.108, 0.775), (0.014, 0.014, 0.014), materials["gold"])
    # Turned front legs, square carved back posts that rise into the backrest.
    for ly in (-0.31, 0.31):
        cylinder(f"{name}_leg_front_{ly}", (px(-0.30), cy + ly, 0.335), 0.036, 0.67, wood, vertices=14)
        sphere(f"{name}_leg_bulb_{ly}", (px(-0.30), cy + ly, 0.44), (0.055, 0.055, 0.060), wood)
        cylinder(f"{name}_leg_foot_{ly}", (px(-0.30), cy + ly, 0.03), 0.052, 0.06, brass, vertices=14)
        cube(f"{name}_post_back_{ly}", (px(0.30), cy + ly, 1.04), (0.040, 0.040, 1.04), wood, bevel=0.016)
        cone(f"{name}_finial_{ly}", (px(0.30), cy + ly, 2.15), 0.055, 0.004, 0.16, brass, vertices=12)
        sphere(f"{name}_finial_ball_{ly}", (px(0.30), cy + ly, 2.06), (0.050, 0.050, 0.050), brass)
        cube(f"{name}_rail_side_{ly}", (cx, cy + ly, 0.26), (0.30, 0.020, 0.022), wood, bevel=0.008)
    cube(f"{name}_rail_front", (px(-0.30), cy, 0.26), (0.020, 0.31, 0.022), wood, bevel=0.008)
    cube(f"{name}_rail_back", (px(0.30), cy, 0.26), (0.020, 0.31, 0.022), wood, bevel=0.008)
    # Backrest: padded panel in a carved frame, gothic crest with a central spire.
    cube(f"{name}_back_panel", (px(0.285), cy, 1.42), (0.022, 0.255, 0.44), velvet, bevel=0.020)
    cube(f"{name}_back_rail_low", (px(0.30), cy, 0.94), (0.040, 0.31, 0.035), wood, bevel=0.014)
    cube(f"{name}_back_rail_high", (px(0.30), cy, 1.92), (0.045, 0.32, 0.045), wood, bevel=0.016)
    for spar in (-0.15, 0.0, 0.15):
        cube(f"{name}_back_spar_{spar}", (px(0.31), cy + spar, 1.42), (0.018, 0.012, 0.44), dark_wood, bevel=0.005)
    cone(f"{name}_crest_spire", (px(0.30), cy, 2.08), 0.11, 0.012, 0.26, wood, vertices=4).rotation_euler[2] = math.radians(45)
    sphere(f"{name}_crest_boss", (px(0.245), cy, 1.42), (0.030, 0.030, 0.030), materials["gold"])
    for nail in range(5):
        sphere(f"{name}_back_nail_{nail}", (px(0.262), cy - 0.23 + nail * 0.115, 1.88 - 0.0), (0.012, 0.012, 0.012), materials["gold"])
    # Arms with carved supports.
    for ay in (-0.36, 0.36):
        cube(f"{name}_arm_{ay}", (cx + side * 0.0, cy + ay, 1.16), (0.30, 0.028, 0.026), wood, bevel=0.012)
        cube(f"{name}_arm_support_{ay}", (px(-0.27), cy + ay, 0.95), (0.026, 0.026, 0.20), wood, bevel=0.010)
        sphere(f"{name}_arm_knob_{ay}", (px(-0.32), cy + ay, 1.18), (0.045, 0.040, 0.040), brass)


def _smooth_closed(points, per_segment=7):
    """Closed Catmull-Rom resample so a hand-placed silhouette reads as a curve."""
    count = len(points)
    out = []
    for i in range(count):
        p0, p1, p2, p3 = points[(i - 1) % count], points[i], points[(i + 1) % count], points[(i + 2) % count]
        for step in range(per_segment):
            t = step / per_segment
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in range(2)
            ))
    return out


def add_table_knight_emblem(materials, gold):
    """Gilt chess knight in a ringed medallion on the JUGAR table drape.

    Everything is authored in the drape's XZ plane, facing -Y (the camera). Depth
    is stacked in three layers -- velvet disc, dark-brass shadow outline, gold
    silhouette -- so the relief catches light instead of reading as a flat cut-out.
    """
    dark = materials["dark"]
    shadow = materials["brass_dark"]
    cx, cz, ring_r = 0.0, 0.665, 0.445
    y_disc, y_ring, y_shadow, y_knight = -0.804, -0.820, -0.824, -0.834

    disc = cylinder("HOME_PROP_table_knight_disc", (cx, y_disc, cz), ring_r, 0.030, materials["banner"], vertices=48)
    disc.rotation_euler[0] = math.radians(90.0)
    for name, radius, tube, mat in (
        ("outer", ring_r, 0.020, gold),
        ("inner", ring_r - 0.045, 0.008, shadow),
    ):
        curve_tube(
            f"HOME_PROP_table_knight_ring_{name}",
            [(cx + radius * math.cos(i * math.tau / 48), y_ring, cz + radius * math.sin(i * math.tau / 48)) for i in range(49)],
            tube,
            mat,
        )
    for idx in range(12):
        angle = idx * math.tau / 12 + math.radians(15.0)
        sphere(
            f"HOME_PROP_table_knight_ring_stud_{idx}",
            (cx + (ring_r + 0.006) * math.cos(angle), y_ring - 0.004, cz + (ring_r + 0.006) * math.sin(angle)),
            (0.016, 0.010, 0.016),
            gold,
        )

    # Knight in profile facing left (clockwise, local u right / v up).
    outline = [
        (-0.12, 0.88), (-0.06, 0.79), (0.03, 0.77), (0.12, 0.68), (0.19, 0.56), (0.24, 0.42), (0.25, 0.26), (0.24, 0.12),
        (-0.24, 0.12), (-0.24, 0.22), (-0.19, 0.32), (-0.10, 0.38), (-0.20, 0.45), (-0.31, 0.51), (-0.39, 0.56),
        (-0.415, 0.61), (-0.385, 0.67), (-0.31, 0.69), (-0.22, 0.74), (-0.17, 0.81),
    ]
    scale, base_z = 0.86, cz - 0.395
    kx = cx + 0.045  # the head leans left, so nudge the mass right to sit on the medallion axis

    def to_world(u, v, grow=1.0):
        return (kx + u * scale * grow, base_z + v * scale * grow)

    smooth = _smooth_closed(outline)
    flat_panel(
        "HOME_PROP_table_knight_shadow",
        [(kx + (x - 0.0) * 1.08 * scale, base_z + (y - 0.10) * 1.07 * scale + 0.10 * scale) for x, y in smooth],
        y_shadow, 0.030, shadow, bevel=0.008,
    )
    flat_panel("HOME_PROP_table_knight", [to_world(x, y) for x, y in smooth], y_knight, 0.046, gold, bevel=0.008)
    # Plinth like the real piece: collar and a wide foot.
    for idx, (v, half_w, half_h) in enumerate(((0.085, 0.19, 0.026), (0.026, 0.245, 0.030))):
        cube(
            f"HOME_PROP_table_knight_plinth_{idx}",
            (kx, y_knight, base_z + v * scale),
            (half_w * scale, 0.021, half_h * scale),
            gold,
            bevel=0.008,
        )
    # Face and mane detail cut into the gold in dark relief.
    for idx, curve in enumerate((
        [(0.02, 0.73), (0.13, 0.62), (0.20, 0.49), (0.235, 0.36)],
        [(-0.03, 0.66), (0.07, 0.56), (0.14, 0.44), (0.18, 0.31)],
        [(-0.16, 0.66), (-0.08, 0.60), (-0.02, 0.52), (0.02, 0.42)],
    )):
        curve_tube(
            f"HOME_PROP_table_knight_mane_{idx}",
            [(*to_world(u, v)[:1], y_knight - 0.019, to_world(u, v)[1]) for u, v in curve],
            0.007,
            dark,
        )
    # Fringe of gold tassels along the pointed hem.
    for idx in range(17):
        tx = -1.52 + idx * 0.19
        hem_z = 0.08 + abs(tx) / 1.6 * 0.22
        sphere(f"HOME_PROP_table_banner_tassel_cap_{idx}", (tx, -0.822, hem_z + 0.005), (0.020, 0.013, 0.020), gold)
        cone(f"HOME_PROP_table_banner_tassel_{idx}", (tx, -0.822, hem_z - 0.060), 0.024, 0.008, 0.115, gold, vertices=10)


def add_table_candelabra(materials, x, y, z0):
    """Five-branch brass candelabra. Each flame is named `..._candle_flame_N`, which the
    runtime already drives as an animated candle (flicker, lean, emission)."""
    brass = materials["brass"]
    dark_brass = materials["brass_dark"]
    wax = materials["wax"]
    cylinder("HOME_PROP_table_candelabra_foot", (x, y, z0 + 0.025), 0.23, 0.05, dark_brass, vertices=28)
    cylinder("HOME_PROP_table_candelabra_base", (x, y, z0 + 0.075), 0.17, 0.05, brass, vertices=28)
    cylinder("HOME_PROP_table_candelabra_stem", (x, y, z0 + 0.36), 0.032, 0.62, brass, vertices=16)
    for idx, (kz, kr) in enumerate(((0.16, 0.070), (0.34, 0.052), (0.52, 0.062))):
        sphere(f"HOME_PROP_table_candelabra_knob_{idx}", (x, y, z0 + kz), (kr, kr, kr * 0.85), brass)
    arms = (-0.34, -0.17, 0.0, 0.17, 0.34)
    for idx, dx in enumerate(arms):
        height = 0.62 if dx == 0.0 else 0.50 + 0.03 * (1 - abs(dx) / 0.34)
        cup_x = x + dx
        if dx != 0.0:
            curve_tube(
                f"HOME_PROP_table_candelabra_arm_{idx}",
                [
                    (x, y, z0 + 0.46),
                    (x + dx * 0.35, y, z0 + 0.39),
                    (x + dx * 0.85, y, z0 + 0.41),
                    (cup_x, y, z0 + height - 0.04),
                ],
                0.014,
                brass,
            )
        cylinder(f"HOME_PROP_table_candelabra_cup_{idx}", (cup_x, y, z0 + height), 0.044, 0.030, brass, vertices=18)
        candle_h = 0.27 if dx == 0.0 else 0.20 + 0.03 * ((idx * 7) % 3)
        cylinder(f"HOME_PROP_table_candelabra_candle_{idx}", (cup_x, y, z0 + height + 0.015 + candle_h / 2), 0.026, candle_h, wax, vertices=16)
        top = z0 + height + 0.015 + candle_h
        cylinder(f"HOME_PROP_table_candelabra_wick_{idx}", (cup_x, y, top + 0.012), 0.005, 0.024, materials["dark"], vertices=8)
        cone(f"HOME_PROP_table_candelabra_candle_flame_{idx}", (cup_x, y, top + 0.070), 0.026, 0.005, 0.105, materials["fire_hot"], vertices=12)
    add_point_light("HOME_LIGHT_table_candle", (x, y - 0.10, z0 + 1.02), 160, (1.0, 0.52, 0.24), radius=0.42)


def add_gentleman_desk_set(materials, table_z):
    """The right end of the table, for a classical gentleman: Matthias's leather notepad open on
    a page of handwriting with a gilt fountain pen, his VADEMECUM (burgundy leather, gilt border
    and knight), and a folding leather campaign chess set mid-game."""
    top = table_z + 0.18
    gold = materials["gold"]
    dark = materials["dark"]
    paper = materials["paper"]

    # -- Notepad, open, with handwriting ----------------------------------------------------
    nx, ny = 2.46, 0.50
    pre = "HOME_PROP_table_notepad"
    cube(f"{pre}_cover", (nx, ny, top + 0.010), (0.31, 0.215, 0.010), materials["book_black"], bevel=0.006)
    cube(f"{pre}_cover_trim", (nx, ny, top + 0.0195), (0.312, 0.217, 0.0015), gold, bevel=0.001)
    for side, tag in ((-1, "l"), (1, "r")):
        px = nx + side * 0.142
        cube(f"{pre}_page_{tag}", (px, ny, top + 0.027), (0.136, 0.188, 0.008), paper, bevel=0.004)
        # ruled handwriting: uneven ink lines, a heavier heading on the left page
        for line in range(10):
            ly = ny + 0.150 - line * 0.030
            reach = 0.088 * (0.50 + 0.50 * _hash01(line, 1 if side < 0 else 2, 5301))
            if side < 0 and line == 0:
                reach, thick = 0.070, 0.0042
            else:
                thick = 0.0024
            cube(f"{pre}_ink_{tag}_{line}", (px - 0.106 + reach, ly, top + 0.0353), (reach, thick, 0.0007), dark)
    cube(f"{pre}_gutter", (nx, ny, top + 0.030), (0.006, 0.192, 0.010), materials["book_oxblood"])
    curve_tube(f"{pre}_ribbon", [(nx + 0.02, ny + 0.19, top + 0.034), (nx + 0.03, ny - 0.20, top + 0.030), (nx + 0.035, ny - 0.27, top + 0.022)], 0.006, materials["plume_red"])
    rotate_group_about_z(pre, (nx, ny), -7.0)

    # -- Gilt fountain pen lying across the right page ----------------------------------------
    ang = math.radians(28.0)
    d = (math.cos(ang), math.sin(ang))
    pen_c = (nx + 0.19, ny + 0.04)
    pz = top + 0.036 + 0.010

    def along(t):
        return (pen_c[0] + d[0] * t, pen_c[1] + d[1] * t, pz)

    def barrel(name, t, length, radius, mat):
        obj = cylinder(name, along(t), radius, length, mat, vertices=16)
        obj.rotation_euler = (0.0, math.radians(90.0), ang)
        return obj

    barrel("HOME_PROP_table_pen_barrel", -0.020, 0.150, 0.0105, materials["book_black"])
    barrel("HOME_PROP_table_pen_band", 0.060, 0.012, 0.0112, gold)
    barrel("HOME_PROP_table_pen_grip", 0.086, 0.040, 0.0088, materials["book_black"])
    barrel("HOME_PROP_table_pen_cap_band", -0.092, 0.010, 0.0112, gold)
    barrel("HOME_PROP_table_pen_end", -0.104, 0.014, 0.0095, gold)
    nib = cone("HOME_PROP_table_pen_nib", along(0.128), 0.0068, 0.0008, 0.034, gold, vertices=8)
    nib.rotation_euler = (0.0, math.radians(90.0), ang)
    clip = cube("HOME_PROP_table_pen_clip", (pen_c[0] + d[0] * -0.055, pen_c[1] + d[1] * -0.055 - 0.010, pz + 0.007), (0.052, 0.0026, 0.0026), gold, bevel=0.001)
    clip.rotation_euler[2] = ang

    # -- VADEMECUM: burgundy leather, gilt border, title plate and the gilt knight -------------
    vx, vy = 3.30, 0.62
    vpre = "HOME_PROP_table_vademecum"
    cube(f"{vpre}_block", (vx, vy, top + 0.036), (0.205, 0.148, 0.036), paper, bevel=0.008)
    cube(f"{vpre}_cover_bottom", (vx, vy, top + 0.006), (0.212, 0.154, 0.006), materials["book_oxblood"], bevel=0.005)
    cube(f"{vpre}_cover_top", (vx, vy, top + 0.073), (0.212, 0.154, 0.006), materials["book_oxblood"], bevel=0.005)
    cube(f"{vpre}_spine", (vx - 0.208, vy, top + 0.040), (0.010, 0.154, 0.040), materials["book_oxblood"], bevel=0.006)
    for k in range(3):
        cube(f"{vpre}_spine_band_{k}", (vx - 0.2185, vy, top + 0.014 + k * 0.028), (0.002, 0.155, 0.004), gold)
    for sy in (-1, 1):
        cube(f"{vpre}_border_{sy}", (vx, vy + sy * 0.135, top + 0.0795), (0.192, 0.0022, 0.0010), gold)
    for sx in (-1, 1):
        cube(f"{vpre}_border_x_{sx}", (vx + sx * 0.194, vy, top + 0.0795), (0.0022, 0.136, 0.0010), gold)
    cube(f"{vpre}_title", (vx, vy + 0.085, top + 0.0800), (0.110, 0.019, 0.0010), gold)
    for k in range(4):
        cube(f"{vpre}_title_ink_{k}", (vx - 0.070 + k * 0.047, vy + 0.085, top + 0.0812), (0.018, 0.0060, 0.0006), materials["book_black"])
    knight = _smooth_closed(list(KNIGHT_SILHOUETTE))
    floor_panel(f"{vpre}_knight", [(vx + (u + 0.08) * 0.13, vy - 0.030 + (v - 0.50) * 0.13) for u, v in knight], top + 0.0810, 0.0012, gold)
    curve_tube(f"{vpre}_ribbon", [(vx + 0.10, vy - 0.14, top + 0.072), (vx + 0.11, vy - 0.20, top + 0.060), (vx + 0.13, vy - 0.24, top + 0.040)], 0.006, materials["plume_red"])
    rotate_group_about_z(vpre, (vx, vy), 14.0)

    # -- Folding campaign chess set, mid-game ------------------------------------------------
    cx, cy = 2.60, 1.28
    cpre = "HOME_PROP_table_campaign"
    cube(f"{cpre}_case", (cx, cy, top + 0.010), (0.300, 0.300, 0.010), materials["book_tobacco"], bevel=0.008)
    cube(f"{cpre}_light", (cx, cy, top + 0.0215), (0.250, 0.250, 0.0018), materials["board_light"])
    sq = 0.0625
    for row in range(8):
        for col in range(8):
            if (row + col) % 2 == 0:
                continue
            cube(f"{cpre}_sq_{row}_{col}", (cx - 0.21875 + col * sq, cy - 0.21875 + row * sq, top + 0.0238), (sq / 2.0, sq / 2.0, 0.0012), materials["board_dark"])
    cube(f"{cpre}_hinge", (cx, cy, top + 0.0225), (0.253, 0.004, 0.0014), materials["stone_dark"])
    for sx in (-1, 1):
        for sy in (-1, 1):
            cube(f"{cpre}_corner_{sx}_{sy}", (cx + sx * 0.290, cy + sy * 0.290, top + 0.012), (0.024, 0.024, 0.012), gold, bevel=0.004)
    board_top = top + 0.0252

    def mini(name, col, row, kind, mat):
        x = cx - 0.21875 + col * sq
        y = cy - 0.21875 + row * sq
        if kind == "pawn":
            cone(f"{name}_body", (x, y, board_top + 0.020), 0.020, 0.010, 0.040, mat, vertices=12)
            sphere(f"{name}_head", (x, y, board_top + 0.050), (0.013, 0.013, 0.013), mat)
        elif kind == "rook":
            cylinder(f"{name}_body", (x, y, board_top + 0.032), 0.020, 0.064, mat, vertices=12)
            cylinder(f"{name}_top", (x, y, board_top + 0.068), 0.026, 0.012, mat, vertices=12)
        elif kind == "knight":
            cone(f"{name}_body", (x, y, board_top + 0.028), 0.022, 0.014, 0.056, mat, vertices=12)
            head = cube(f"{name}_head", (x - 0.008, y, board_top + 0.064), (0.022, 0.011, 0.016), mat, bevel=0.005)
            head.rotation_euler[1] = math.radians(-24.0)
        else:
            cone(f"{name}_body", (x, y, board_top + 0.036), 0.024, 0.012, 0.072, mat, vertices=12)
            if kind == "king":
                cube(f"{name}_cross_v", (x, y, board_top + 0.088), (0.004, 0.004, 0.014), gold)
                cube(f"{name}_cross_h", (x, y, board_top + 0.090), (0.011, 0.004, 0.004), gold)
            else:
                sphere(f"{name}_crown", (x, y, board_top + 0.080), (0.014, 0.014, 0.014), gold)

    light, dark_piece = materials["piece_light"], materials["piece_dark"]
    for idx, (col, row, kind) in enumerate(((0, 0, "rook"), (4, 0, "king"), (3, 0, "queen"), (2, 2, "knight"), (3, 3, "pawn"), (4, 3, "pawn"), (0, 1, "pawn"), (5, 1, "pawn"))):
        mini(f"{cpre}_w{idx}", col, row, kind, light)
    for idx, (col, row, kind) in enumerate(((6, 7, "king"), (5, 7, "rook"), (3, 6, "queen"), (5, 5, "knight"), (3, 4, "pawn"), (4, 5, "pawn"), (1, 6, "pawn"))):
        mini(f"{cpre}_b{idx}", col, row, kind, dark_piece)
    rotate_group_about_z(cpre, (cx, cy), -8.0)


def add_table_and_board(materials):
    wood = materials["table_wood"]
    dark = materials["board_dark"]
    light = materials["board_light"]
    metal = materials["brass"]
    heraldry = materials["heraldry_gold"]
    banner = materials["banner"]

    table_y = 1.05
    table_z = 1.12
    cube("HOME_PROP_table_top", (0.0, table_y, table_z + 0.04), (3.72, 1.72, 0.14), wood, bevel=0.085)
    for wear_index, (wx, wy, sx, sy, rot) in enumerate((
        (-2.88, -0.52, 0.46, 0.10, -6.0),
        (2.82, -0.48, 0.42, 0.11, 5.0),
        (0.62, 2.49, 0.58, 0.085, -2.0),
    )):
        wear = sphere(
            f"HOME_PROP_table_wear_{wear_index}",
            (wx, wy, table_z + 0.188),
            (sx, sy, 0.006),
            materials["wood_wear"],
        )
        wear.rotation_euler[2] = math.radians(rot)
    cube("HOME_PROP_table_apron_front", (0.0, -0.56, 0.90), (3.40, 0.10, 0.22), wood, bevel=0.045)
    cube("HOME_PROP_table_apron_back", (0.0, 2.66, 0.90), (3.40, 0.10, 0.22), wood, bevel=0.045)
    for x in (-3.20, 3.20):
        for y in (-0.30, 2.40):
            cube(f"HOME_PROP_table_leg_{x}_{y}", (x, y, 0.55), (0.15, 0.15, 0.55), wood, bevel=0.035)
            cylinder(f"HOME_PROP_table_leg_collar_{x}_{y}", (x, y, 0.93), 0.20, 0.10, metal, vertices=18)
            cylinder(f"HOME_PROP_table_leg_foot_{x}_{y}", (x, y, 0.14), 0.22, 0.12, wood, vertices=20)
    for side in (-1, 1):
        leg_x = side * 3.12
        cube(f"HOME_PROP_table_front_leg_plinth_{side}", (leg_x, -0.40, 0.24), (0.26, 0.28, 0.18), wood, bevel=0.045)
        cube(f"HOME_PROP_table_front_leg_shaft_{side}", (leg_x, -0.40, 0.58), (0.18, 0.20, 0.28), wood, bevel=0.05)
        cube(f"HOME_PROP_table_front_leg_capital_{side}", (leg_x, -0.40, 0.91), (0.28, 0.28, 0.11), wood, bevel=0.045)
        cylinder(f"HOME_PROP_table_front_leg_band_{side}", (leg_x, -0.40, 0.69), 0.22, 0.055, materials["gold"], vertices=18)

    # Earlier passes kept escalating this (0.31 -> 0.47 -> 0.50 -> 0.54) to
    # avoid a "travel set" read, but that overshot: board+pieces ended up
    # dominating the table with no room for lived-in props. 0.42 was still
    # judged too large in-app; pull back further.
    square = 0.32
    board_half = square * 4 + 0.12
    start_x = -4 * square + square / 2
    start_y = table_y - 4 * square + square / 2
    for row in range(8):
        for col in range(8):
            mat = light if (row + col) % 2 == 0 else dark
            cube(
                f"HOME_PROP_board_{row}_{col}",
                (start_x + col * square, start_y + row * square, table_z + 0.17),
                (square / 2, square / 2, 0.018),
                mat,
            )
    cube("HOME_PROP_board_frame", (0, table_y, table_z + 0.135), (board_half, board_half, 0.035), metal, bevel=0.025)
    for idx, (bx, by) in enumerate((
        (-board_half + 0.055, table_y - board_half + 0.055),
        (board_half - 0.055, table_y - board_half + 0.055),
        (-board_half + 0.055, table_y + board_half - 0.055),
        (board_half - 0.055, table_y + board_half - 0.055),
    )):
        sphere(
            f"HOME_PROP_board_corner_boss_{idx}",
            (bx, by, table_z + 0.190),
            (0.055, 0.055, 0.026),
            materials["brass_dark"],
        )

    # The frontal cloth is one of the master image's strongest silhouettes.
    # Pull it forward so it cannot disappear inside the table and give it the
    # canonical pointed lower edge plus a narrow brass backing/trim.
    drape_points = [
        (-1.72, 1.26),
        (1.72, 1.26),
        (1.72, 0.28),
        (0.0, 0.04),
        (-1.72, 0.28),
    ]
    flat_panel("HOME_PROP_table_banner_trim", drape_points, -0.68, 0.08, metal, bevel=0.045)
    draped_banner_panel(
        "HOME_PROP_table_banner",
        0.0,
        -0.738,
        1.675,
        1.235,
        0.295,
        0.055,
        banner,
        fold_depth=0.075,
        horizontal_segments=20,
        vertical_segments=12,
    )
    curve_tube(
        "HOME_PROP_table_banner_gold_border",
        [
            (-1.60, -0.815, 1.17),
            (-1.60, -0.815, 0.30),
            (0.0, -0.815, 0.08),
            (1.60, -0.815, 0.30),
            (1.60, -0.815, 1.17),
        ],
        0.028,
        heraldry,
    )
    for idx, x in enumerate((-1.35, -0.90, -0.45, 0.0, 0.45, 0.90, 1.35)):
        sphere(
            f"HOME_PROP_table_banner_stud_{idx}",
            (x, -0.827, 1.16),
            (0.028, 0.014, 0.028),
            heraldry,
        )

    emblem_y = -0.820
    add_table_knight_emblem(materials, materials["armor_gold"])
    cube("HOME_PROP_table_mark_v", (0.0, emblem_y, 0.17), (0.032, 0.024, 0.095), heraldry, bevel=0.01)
    cube("HOME_PROP_table_mark_h", (0.0, emblem_y, 0.20), (0.085, 0.024, 0.030), heraldry, bevel=0.01)

    # Canonical lived-in table props, kept outside the board interaction footprint.
    for idx, (px, py, pz) in enumerate(((-2.55, 0.20, 1.36), (-2.48, 0.18, 1.45), (-2.58, 0.18, 1.54))):
        book_half_w = 0.42 - idx * 0.04
        table_book = cube(
            f"HOME_PROP_table_book_{idx}",
            (px, py, pz),
            (book_half_w, 0.26, 0.040),
            materials["book_brown"] if idx != 1 else materials["book_green"],
            bevel=0.025,
        )
        table_book.rotation_euler[2] = math.radians((-4.0, 2.5, -1.5)[idx])
        cube(
            f"HOME_PROP_table_book_pages_{idx}",
            (px, py - 0.267, pz),
            (book_half_w * 0.84, 0.010, 0.026),
            materials["paper"],
            bevel=0.008,
        )
    add_table_candelabra(materials, -2.72, 1.60, 1.36)

    add_gentleman_desk_set(materials, table_z)
    cylinder("HOME_PROP_table_hourglass_top", (-2.10, 2.05, 1.56), 0.12, 0.045, metal, vertices=18)
    cylinder("HOME_PROP_table_hourglass_bottom", (-2.10, 2.05, 1.34), 0.12, 0.045, metal, vertices=18)
    sphere(
        "HOME_PROP_table_hourglass_glass_top",
        (-2.10, 2.05, 1.49),
        (0.075, 0.050, 0.075),
        materials["window"],
    )
    sphere(
        "HOME_PROP_table_hourglass_glass_bottom",
        (-2.10, 2.05, 1.41),
        (0.075, 0.050, 0.075),
        materials["window"],
    )
    cone(
        "HOME_PROP_table_hourglass_sand",
        (-2.10, 2.02, 1.405),
        0.055,
        0.016,
        0.060,
        materials["gold"],
        vertices=16,
    )
    curve_tube(
        "HOME_PROP_table_hourglass_frame_l",
        [(-2.18, 2.05, 1.36), (-2.18, 2.05, 1.55)],
        0.022,
        metal,
    )
    curve_tube(
        "HOME_PROP_table_hourglass_frame_r",
        [(-2.02, 2.05, 1.36), (-2.02, 2.05, 1.55)],
        0.022,
        metal,
    )

    # Coffee pot + steaming mug: the right side of the table opened up once
    # the board shrank (`square` above). Mirrors the candle/books cluster on
    # the left without duplicating it.
    ceramic = materials["ceramic"]
    steam = materials["steam"]
    top = table_z + 0.18
    pot_x, pot_y = 2.55, 1.85
    cylinder("HOME_PROP_table_pot_foot", (pot_x, pot_y, top + 0.035), 0.115, 0.035, materials["brass_dark"], vertices=22)
    pot_body = cone(
        "HOME_PROP_table_pot_body",
        (pot_x, pot_y, top + 0.18),
        0.105,
        0.078,
        0.22,
        materials["brass_dark"],
        vertices=22,
    )
    cylinder("HOME_PROP_table_pot_neck", (pot_x, pot_y, top + 0.315), 0.052, 0.025, metal, vertices=20)
    cylinder("HOME_PROP_table_pot_lid", (pot_x, pot_y, top + 0.349), 0.060, 0.009, materials["brass_dark"], vertices=20)
    sphere("HOME_PROP_table_pot_knob", (pot_x, pot_y, top + 0.378), (0.020, 0.020, 0.020), materials["gold"])
    pot_spout = cone(
        "HOME_PROP_table_pot_spout",
        (pot_x - 0.14, pot_y, top + 0.24),
        0.026,
        0.009,
        0.16,
        materials["brass_dark"],
        vertices=14,
    )
    pot_spout.rotation_euler[1] = math.radians(58.0)
    curve_tube(
        "HOME_PROP_table_pot_handle",
        [(pot_x + 0.11, pot_y, top + 0.30), (pot_x + 0.20, pot_y, top + 0.22), (pot_x + 0.12, pot_y, top + 0.14)],
        0.018,
        metal,
    )

    mug_x, mug_y = 3.10, -0.30  # front edge, right end (clear of the bevelled edge and of the fire)
    # Saucer: a foot ring, a shallow dish and a raised lip, so it reads as porcelain and not as
    # a white smear on the dark table; the mug has a foot ring and a slightly tapered body.
    cylinder("HOME_PROP_table_mug_saucer_foot", (mug_x, mug_y, top + 0.004), 0.085, 0.008, ceramic, vertices=32)
    cylinder("HOME_PROP_table_mug_saucer", (mug_x, mug_y, top + 0.013), 0.172, 0.012, ceramic, vertices=40)
    cylinder("HOME_PROP_table_mug_saucer_well", (mug_x, mug_y, top + 0.0205), 0.118, 0.003, materials["ceramic"], vertices=40)
    curve_tube(
        "HOME_PROP_table_mug_saucer_lip",
        [(mug_x + 0.166 * math.cos(i * math.tau / 40), mug_y + 0.166 * math.sin(i * math.tau / 40), top + 0.021) for i in range(41)],
        0.0065,
        ceramic,
    )
    cylinder("HOME_PROP_table_mug_foot", (mug_x, mug_y, top + 0.026), 0.078, 0.014, ceramic, vertices=32)
    cone("HOME_PROP_table_mug_body", (mug_x, mug_y, top + 0.103), 0.092, 0.108, 0.150, ceramic, vertices=32)
    cylinder("HOME_PROP_table_mug_rim", (mug_x, mug_y, top + 0.180), 0.116, 0.010, ceramic, vertices=32)
    cylinder("HOME_PROP_table_mug_coffee", (mug_x, mug_y, top + 0.170), 0.098, 0.004, materials["dark"], vertices=32)
    # Matthias's brand, discreet: a tiny fierce knight inked on the front of the cup (same bust as
    # the banners), with its eye and nostril left as bare porcelain.
    brand_scale = 0.140

    def brand(pts):
        return [(mug_x + (u + 0.035) * brand_scale, top + 0.100 + (v - 0.545) * brand_scale) for u, v in pts]

    flat_panel("HOME_PROP_table_mug_brand", brand(KNIGHT_REAL), mug_y - 0.0985, 0.003, materials["gilt_plain"], bevel=0.0004)
    for cut in (0, 1):
        flat_panel(f"HOME_PROP_table_mug_brand_cut_{cut}", brand(KNIGHT_REAL_CUTS[cut]), mug_y - 0.1005, 0.0015, materials["velvet_dark"], bevel=0.0002)
    curve_tube(
        "HOME_PROP_table_mug_handle",
        [(mug_x + 0.104, mug_y, top + 0.145), (mug_x + 0.200, mug_y, top + 0.120), (mug_x + 0.190, mug_y, top + 0.060), (mug_x + 0.104, mug_y, top + 0.035)],
        0.020,
        ceramic,
    )
    # Steam wisps. The runtime rebases each wisp's pivot to its base and loops it
    # (rise, swell, sway, fade) out of phase with the others.
    for idx, (dx, dy, height, sway) in enumerate((
        (-0.045, 0.00, 0.46, 0.020), (0.030, 0.02, 0.40, -0.022), (0.000, -0.03, 0.52, 0.018),
        (0.060, -0.01, 0.36, -0.018), (-0.020, 0.03, 0.44, 0.022),
    )):
        base_z = top + 0.170
        curve_tube(
            f"HOME_PROP_table_mug_steam_{idx}",
            [
                (mug_x + dx, mug_y + dy, base_z),
                (mug_x + dx + sway * 0.6, mug_y + dy, base_z + height * 0.25),
                (mug_x + dx + sway, mug_y + dy, base_z + height * 0.50),
                (mug_x + dx + sway * 0.3, mug_y + dy, base_z + height * 0.75),
                (mug_x + dx - sway * 0.4, mug_y + dy, base_z + height),
            ],
            0.011,
            steam,
        )

    for side in (-1, 1):
        for chair_idx, chair_y in enumerate((1.05,)):
            add_castle_chair(f"HOME_PROP_chair_{side}_{chair_idx}", side * 4.14, chair_y, side, materials)

    piece_light = materials["piece_light"]
    piece_dark = materials["piece_dark"]
    piece_light_alt = materials["piece_light_alt"]
    piece_dark_alt = materials["piece_dark_alt"]
    order = ("rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook")
    board_z = table_z + 0.215
    for col, kind in enumerate(order):
        px = start_x + col * square
        white_back_mat = piece_light_alt if col in (1, 5, 7) else piece_light
        black_back_mat = piece_dark_alt if col in (0, 3, 6) else piece_dark
        white_pawn_mat = piece_light_alt if col in (0, 4, 6) else piece_light
        black_pawn_mat = piece_dark_alt if col in (2, 5, 7) else piece_dark
        add_simple_piece(f"HOME_PROP_white_back_{col}", px, start_y + 0.5 * square, board_z, white_back_mat, kind, trim=materials["gold"])
        add_simple_piece(f"HOME_PROP_black_back_{col}", px, start_y + 6.5 * square, board_z, black_back_mat, kind, trim=materials["gold"])
        add_simple_piece(f"HOME_PROP_white_pawn_{col}", px, start_y + 1.5 * square, board_z, white_pawn_mat, "pawn", trim=materials["gold"])
        add_simple_piece(f"HOME_PROP_black_pawn_{col}", px, start_y + 5.5 * square, board_z, black_pawn_mat, "pawn", trim=materials["gold"])



def add_hearth_tool_set(prefix: str, x: float, y: float, materials, *, mirror=1.0):
    """Restrained forged-iron poker/tongs/shovel stand beside a working hearth.

    The silhouette is deliberately sparse: three real tools and one ring stand,
    large enough to read at Home distance without turning the fireplace into a
    prop display. The iron stays dark except where practical firelight catches it.
    """
    iron = materials["forged_iron"]
    base_z = 0.29

    cylinder(f"{prefix}_stand_base", (x, y, base_z), 0.115, 0.050, iron, vertices=20)
    curve_tube(
        f"{prefix}_stand_post",
        [(x, y, base_z + 0.02), (x, y, 1.12)],
        0.018,
        iron,
    )
    ring = [
        (x + math.cos(step * math.tau / 20) * 0.105, y, 1.12 + math.sin(step * math.tau / 20) * 0.105)
        for step in range(21)
    ]
    curve_tube(f"{prefix}_stand_ring", ring, 0.013, iron)

    # Poker: long, slightly hooked tip. It leans away from the post rather than
    # forming a perfectly vertical museum display.
    curve_tube(
        f"{prefix}_poker",
        [
            (x - mirror * 0.095, y - 0.020, 0.31),
            (x - mirror * 0.155, y - 0.016, 0.92),
            (x - mirror * 0.130, y - 0.014, 1.08),
            (x - mirror * 0.074, y - 0.014, 1.03),
        ],
        0.010,
        iron,
    )

    # Tongs: two independent arms with a small bowed grip at the top.
    for arm, offset in enumerate((-0.018, 0.018)):
        curve_tube(
            f"{prefix}_tongs_arm_{arm}",
            [
                (x + mirror * (0.030 + offset), y + 0.018, 0.31),
                (x + mirror * (0.070 + offset), y + 0.016, 0.76),
                (x + mirror * (0.050 + offset), y + 0.014, 1.00),
            ],
            0.008,
            iron,
        )
    curve_tube(
        f"{prefix}_tongs_grip",
        [
            (x + mirror * 0.032, y + 0.014, 0.995),
            (x + mirror * 0.050, y + 0.014, 1.055),
            (x + mirror * 0.068, y + 0.014, 0.995),
        ],
        0.008,
        iron,
    )

    # Shovel: small ash blade plus a worn handle, kept low and close to the stand.
    curve_tube(
        f"{prefix}_shovel_handle",
        [
            (x + mirror * 0.105, y - 0.010, 0.36),
            (x + mirror * 0.155, y - 0.008, 0.86),
            (x + mirror * 0.125, y - 0.006, 1.02),
        ],
        0.009,
        iron,
    )
    blade = cube(
        f"{prefix}_shovel_blade",
        (x + mirror * 0.102, y - 0.012, 0.30),
        (0.050, 0.018, 0.075),
        iron,
        bevel=0.012,
    )
    blade.rotation_euler[1] = math.radians(-mirror * 8.0)


def add_fireplace(name: str, x: float, materials):
    stone = materials["stone"]
    dark = materials["stone_dark"]
    fire = materials["fire"]
    # Tall dark recess is essential to the canonical silhouette.
    cube(f"HOME_PROP_{name}_recess", (x, 6.70, 2.42), (1.10, 0.08, 1.76), dark, bevel=0.08)
    cube(f"HOME_PROP_{name}_firebox_back", (x, 6.585, 1.22), (0.92, 0.025, 0.74), materials["soot_stone"], bevel=0.045)
    for course, z in enumerate((0.66, 0.94, 1.22, 1.50, 1.78)):
        cube(
            f"HOME_PROP_{name}_firebox_course_{course}",
            (x, 6.548, z),
            (0.86, 0.020, 0.014),
            materials["stone_dark"],
        )
        offset = 0.24 if course % 2 else -0.24
        for joint, jx in enumerate((-0.52, 0.0, 0.52)):
            cube(
                f"HOME_PROP_{name}_firebox_joint_{course}_{joint}",
                (x + jx + offset, 6.545, z + 0.13),
                (0.014, 0.020, 0.11),
                materials["stone_dark"],
            )
    # Years of smoke darken the top of the firebox first; a soft-edged band under
    # the mantel reads as staining without adding a decal-looking shape.
    cube(f"HOME_PROP_{name}_firebox_soot", (x, 6.535, 1.80), (0.90, 0.016, 0.15), materials["charcoal"], bevel=0.05)
    cube(f"HOME_PROP_{name}_hearth", (x, 6.52, 0.88), (1.15, 0.10, 0.88), dark, bevel=0.05)
    cube(f"HOME_PROP_{name}_hearth_slab", (x, 5.62, 0.28), (1.42, 0.46, 0.12), stone, bevel=0.05)
    # Ash and charcoal sit in front of the fire instead of leaving a perfectly
    # clean slab. Small overlapping flattened forms read as accumulated residue
    # at Home distance without turning the hearth into noisy rubble.
    for idx, (dx, dz, sx, sz) in enumerate((
        (-0.62, 0.00, 0.24, 0.050),
        (-0.31, 0.02, 0.30, 0.060),
        (0.02, 0.00, 0.34, 0.055),
        (0.34, 0.03, 0.27, 0.050),
        (0.63, 0.00, 0.20, 0.042),
    )):
        sphere(
            f"HOME_PROP_{name}_ash_{idx}",
            (x + dx, 5.48, 0.47 + dz),
            (sx, 0.026, sz),
            materials["ash"],
        )
    for idx, (dx, dz, sx, sz) in enumerate((
        (-0.46, 0.04, 0.11, 0.045),
        (-0.12, 0.08, 0.13, 0.052),
        (0.22, 0.05, 0.10, 0.042),
        (0.49, 0.07, 0.12, 0.048),
    )):
        charcoal = sphere(
            f"HOME_PROP_{name}_charcoal_{idx}",
            (x + dx, 5.45, 0.51 + dz),
            (sx, 0.024, sz),
            materials["charcoal"],
        )
        charcoal.rotation_euler[1] = math.radians((-11.0, 7.0, -5.0, 13.0)[idx])
    for side in (-1, 1):
        cube(f"HOME_PROP_{name}_jamb_{side}", (x + side * 1.18, 6.02, 1.20), (0.18, 0.34, 1.15), stone, bevel=0.05)
        cube(f"HOME_PROP_{name}_corbel_{side}", (x + side * 1.22, 5.82, 1.95), (0.24, 0.28, 0.18), stone, bevel=0.05)
    cube(f"HOME_PROP_{name}_mantel", (x, 5.83, 1.88), (1.55, 0.24, 0.16), stone, bevel=0.04)
    gothic_arch(f"HOME_ARCH_{name}_alcove", x, 6.18, 2.9, 2.62, 4.72, 0.12, materials["arch_stone"])
    for bar in (-0.54, -0.18, 0.18, 0.54):
        cube(f"HOME_PROP_{name}_grate_{bar}", (x + bar, 5.56, 0.76), (0.028, 0.035, 0.48), materials["forged_iron"], bevel=0.01)
    cube(f"HOME_PROP_{name}_grate_cross", (x, 5.55, 0.62), (0.72, 0.035, 0.025), materials["forged_iron"], bevel=0.01)
    hot = materials["fire_hot"]
    cube(f"HOME_PROP_{name}_embers", (x, 5.65, 0.58), (0.88, 0.07, 0.08), fire, bevel=0.06)
    flame_offsets = (-0.54, -0.28, 0.00, 0.27, 0.52)
    flame_heights = (0.38, 0.56, 0.70, 0.48, 0.34)
    flame_leans = (-0.05, 0.06, -0.02, 0.07, -0.05)
    for idx, (offset, height, lean) in enumerate(zip(flame_offsets, flame_heights, flame_leans)):
        cx = x + offset
        base = 0.58
        width = 0.16 + 0.018 * (idx % 2)
        outer_points = [
            (cx - width, base),
            (cx - width * 0.78, base + height * 0.24),
            (cx - width * 0.44, base + height * 0.45),
            (cx - width * 0.24, base + height * 0.70),
            (cx + lean, base + height),
            (cx + width * 0.34, base + height * 0.62),
            (cx + width * 0.72, base + height * 0.30),
            (cx + width, base),
        ]
        flat_panel(
            f"HOME_PROP_{name}_flame_{idx}",
            outer_points,
            5.585,
            0.035,
            fire,
            bevel=0.022,
            origin_xz=(cx, base),
        )
        inner_h = height * (0.48 if idx != 2 else 0.60)
        inner_w = width * 0.48
        inner_points = [
            (cx - inner_w, base),
            (cx - inner_w * 0.55, base + inner_h * 0.34),
            (cx + lean * 0.45, base + inner_h),
            (cx + inner_w * 0.58, base + inner_h * 0.32),
            (cx + inner_w, base),
        ]
        flat_panel(
            f"HOME_PROP_{name}_flame_hot_{idx}",
            inner_points,
            5.545,
            0.030,
            hot,
            bevel=0.016,
            origin_xz=(cx, base),
        )
    # The fire lights the room from flame height: falloff up the firebox wall keeps
    # the brick courses readable instead of flooding them with flat orange.
    add_point_light(f"HOME_LIGHT_{name}", (x, 5.40, 0.90), 340, (1.0, 0.24, 0.045), radius=0.90)


def shelf_z_of(row: int, shelf_tops) -> float:
    return shelf_tops[row]


def _tilt_about_y(objs, pivot, angle: float) -> None:
    """Lean a finished multi-part prop about its base pivot (rotation about Y)."""
    if abs(angle) < 1e-5:
        return
    px, py, pz = pivot
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    for obj in objs:
        dx = obj.location.x - px
        dz = obj.location.z - pz
        obj.location.x = px + dx * cos_a + dz * sin_a
        obj.location.z = pz - dx * sin_a + dz * cos_a
        obj.rotation_euler[1] += angle


def add_antique_tome(name, base, half, cover, materials, lean, *, thick, slim, seed):
    """Upright bound volume, spine towards -Y. base=(x, y, shelf_top), half=(w, d, h)."""
    bx, by, bz0 = base
    w, d, h = half
    bz = bz0 + h
    brass_dark = materials["brass_dark"]
    gilt = materials["gold"]
    parts = [cube(name, (bx, by, bz), (w, d, h), cover, bevel=min(0.014, w * 0.45))]
    front = by - d - 0.002
    if thick:
        # Fat folio: the paper block shows at the back edge and top like a real tome.
        parts.append(cube(f"{name}_pages", (bx, by + d * 0.94, bz), (w * 0.86, d * 0.10, h * 0.94), materials["paper"], bevel=0.004))
    fracs = (0.86,) if slim else ((0.08, 0.36, 0.64, 0.92) if thick else (0.10, 0.50, 0.90))
    for i, frac in enumerate(fracs):
        parts.append(cube(
            f"{name}_band_{i}",
            (bx, front - 0.005, bz0 + 2 * h * frac),
            (w * 1.04, 0.012, 0.010 if not thick else 0.014),
            brass_dark if (seed + i) % 3 else gilt,
            bevel=0.003,
        ))
    if not slim:
        # Title panel between the two upper bands; gilt inlay on the folios.
        panel_z = bz0 + 2 * h * (fracs[-1] + fracs[-2]) * 0.5
        panel_h = max(0.020, 2 * h * (fracs[-1] - fracs[-2]) * 0.32)
        parts.append(cube(f"{name}_title", (bx, front - 0.007, panel_z), (w * 0.74, 0.007, panel_h), materials["dark"], bevel=0.002))
        if thick:
            parts.append(cube(f"{name}_title_gilt", (bx, front - 0.012, panel_z), (w * 0.50, 0.004, panel_h * 0.32), gilt, bevel=0.001))
    _tilt_about_y(parts, (bx, by, bz0), lean)


def add_lying_tome(name, center, half, cover, materials, yaw):
    """Folio lying flat, spine towards -Y. half=(w, d, t)."""
    cx, cy, cz = center
    w, d, t = half
    parts = []
    parts.append(cube(f"{name}_pages", (cx, cy + d * 0.04, cz), (w * 0.94, d * 0.94, t * 0.80), materials["paper"], bevel=0.004))
    for side, tag in ((-1, "b"), (1, "t")):
        parts.append(cube(f"{name}_board_{tag}", (cx, cy, cz + side * (t - 0.011)), (w, d, 0.011), cover, bevel=0.004))
    parts.append(cube(f"{name}_spine", (cx, cy - d + 0.014, cz), (w, 0.014, t), cover, bevel=0.012))
    for i, fx in enumerate((-0.55, -0.18, 0.18, 0.55)):
        parts.append(cube(f"{name}_band_{i}", (cx + fx * w, cy - d - 0.004, cz), (0.010, 0.008, t * 1.01), materials["brass_dark"], bevel=0.003))
    for obj in parts:
        dx, dy = obj.location.x - cx, obj.location.y - cy
        obj.location.x = cx + dx * math.cos(yaw) - dy * math.sin(yaw)
        obj.location.y = cy + dx * math.sin(yaw) + dy * math.cos(yaw)
        obj.rotation_euler[2] += yaw


def add_bookshelf(materials):
    wood = materials["library_wood"]
    brass = materials["brass"]
    x, y = -2.65, 6.20
    cube("HOME_PROP_library_back", (x, y, 2.55), (1.70, 0.34, 2.48), materials["dark"], bevel=0.05)
    cube("HOME_PROP_library_frame", (x, y - 0.22, 2.55), (1.58, 0.22, 2.38), wood, bevel=0.06)
    for idx, z in enumerate((0.55, 1.25, 1.95, 2.65, 3.35, 4.05, 4.75)):
        cube(f"HOME_PROP_library_shelf_{idx}", (x, y - 0.42, z), (1.55, 0.12, 0.075), wood, bevel=0.025)
        cube(
            f"HOME_PROP_library_shelf_lip_{idx}",
            (x, y - 0.555, z - 0.040),
            (1.49, 0.018, 0.028),
            materials["dark"],
            bevel=0.010,
        )
    for side in (-1, 1):
        cube(f"HOME_PROP_library_post_{side}", (x + side * 1.34, y - 0.31, 2.35), (0.11, 0.13, 2.25), wood, bevel=0.025)
        cylinder(f"HOME_PROP_library_post_band_{side}", (x + side * 1.34, y - 0.46, 2.42), 0.14, 0.055, brass, vertices=16)
    cube("HOME_PROP_library_cabinet", (x, y - 0.38, 0.46), (1.48, 0.24, 0.40), wood, bevel=0.05)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_door_{side}", (x + side * 0.72, y - 0.64, 0.46), (0.62, 0.035, 0.32), wood, bevel=0.035)
        sphere(f"HOME_PROP_library_handle_{side}", (x + side * 0.16, y - 0.69, 0.46), (0.035, 0.018, 0.035), brass)
    # Antique war treatises and chess compendia: every volume is a real tome
    # (two thick boards, a paper block that shows on the top edge, a rounded
    # spine with raised bands and a gilt title panel) packed shoulder to
    # shoulder along the shelf. A single tinted box per book read as a sticker.
    shelf_tops = (0.55, 1.25, 1.95, 2.65, 3.35, 4.05)
    tome_tones = (
        materials["book_red"], materials["book_brown"], materials["book_green"],
        materials["book_black"], materials["book_oxblood"], materials["book_olive"],
        materials["book_tobacco"], materials["book_vellum"],
    )
    # Lying stacks sit directly on a shelf board; standing books keep clear of them.
    lying_stacks = {}
    for row, shelf_z in enumerate(shelf_tops):
        base_z = shelf_z + 0.086
        cursor = x - 1.22 + _hash01(row, 5, 997) * 0.40
        idx = 0
        group_left = 3 + int(_hash01(row, 3, 991) * 3)
        while cursor < x + 1.18:
            roll = _hash01(idx, row, 941)
            if roll < 0.20:
                hw = 0.024 + _hash01(row, idx, 911) * 0.010
                hh = 0.190 + _hash01(row, idx, 907) * 0.050
            elif roll > 0.72:
                hw = 0.060 + _hash01(row, idx, 911) * 0.024
                hh = 0.215 + _hash01(row, idx, 907) * 0.045
            else:
                hw = 0.034 + _hash01(row, idx, 911) * 0.020
                hh = 0.200 + _hash01(row, idx, 907) * 0.050
            bx = cursor + hw
            idx += 1
            if bx + hw > x + 1.22:
                break
            cursor = bx + hw + 0.004
            stack = lying_stacks.get(row)
            if stack and abs(bx - stack[0]) < stack[1] + hw:
                continue
            gap = _hash01(row, idx, 953)
            leaning = False
            if gap < 0.05:
                cursor += 0.04 + _hash01(idx, row, 957) * 0.08
            depth = 0.092 + _hash01(row, idx, 947) * 0.032
            by = y - 0.548 + depth + max(0.0, _hash01(row, idx, 919) - 0.55) * 0.05
            lean = math.radians(
                (7.0 + _hash01(idx, row, 929) * 4.0) * (1 if _hash01(idx, row, 931) > 0.5 else -1)
                if leaning else 0.0
            )
            add_antique_tome(
                f"HOME_PROP_book_{row}_{idx}",
                (bx, by, base_z),
                (hw, depth, hh),
                tome_tones[int(_hash01(idx, row, 971) * len(tome_tones)) % len(tome_tones)],
                materials,
                lean,
                thick=roll > 0.72,
                slim=roll < 0.20,
                seed=row * 31 + idx,
            )
            group_left -= 1
            if group_left <= 0:
                cursor += 0.50 + _hash01(idx, row, 993) * 0.50
                group_left = 3 + int(_hash01(idx, row, 995) * 4)

    for row, (sx, half_w) in lying_stacks.items():
        for layer in range(3):
            lw = half_w * (1.0 - 0.10 * layer) - (0.02 if layer == 2 else 0.0)
            add_lying_tome(
                f"HOME_PROP_library_horizontal_book_{row}_{layer}",
                (sx + (_hash01(layer, row, 977) - 0.5) * 0.06, y - 0.46, shelf_z_of(row, shelf_tops) + 0.086 + 0.056 + layer * 0.108),
                (lw, 0.115, 0.050),
                tome_tones[(row + layer * 3) % len(tome_tones)],
                materials,
                math.radians((_hash01(layer, row, 983) - 0.5) * 7.0),
            )
    for idx, (bx, bz) in enumerate(((x - 1.28, 2.18), (x + 1.26, 3.54))):
        cube(
            f"HOME_PROP_library_bookend_{idx}",
            (bx, y - 0.57, bz),
            (0.035, 0.070, 0.18),
            materials["brass_dark"],
            bevel=0.012,
        )
        cube(
            f"HOME_PROP_library_bookend_foot_{idx}",
            (bx, y - 0.56, bz - 0.17),
            (0.11, 0.085, 0.025),
            brass,
            bevel=0.010,
        )

    cube("HOME_PROP_library_crown", (x, y - 0.32, 4.92), (1.62, 0.18, 0.12), wood, bevel=0.04)
    for side in (-1, 1):
        sphere(f"HOME_PROP_library_finial_{side}", (x + side * 1.28, y - 0.46, 5.08), (0.10, 0.07, 0.10), brass)


def pleated_banner(name: str, cx: float, top_z: float, shoulder_z: float, tip_z: float,
                   half_w: float, y: float, mat, *, columns=18, rows=16, thickness=0.03):
    """Hang a banner as gathered cloth instead of a rigid flat plate.

    Vertical pleats are strongest where the cloth is gathered on the bar and relax
    towards the V hem, and they fade under the heraldic emblem so the gold relief
    keeps sitting on the surface rather than floating in a fold trough.
    """
    vertices = []
    for row in range(rows + 1):
        v = row / rows
        for col in range(columns + 1):
            u = col / columns * 2.0 - 1.0
            hem_z = shoulder_z - (shoulder_z - tip_z) * (1.0 - abs(u))
            z = top_z + (hem_z - top_z) * v
            emblem = math.exp(-((u / 0.55) ** 4)) * math.exp(-(((z - 4.35) / 0.80) ** 4))
            amplitude = 0.055 * (1.0 - 0.50 * v) * (1.0 - 0.85 * emblem)
            fold = amplitude * math.sin(u * math.pi * 3.5 + 0.35)
            sway = 0.010 * math.sin(v * math.pi * 1.3 + u * 1.7)
            vertices.append((cx + u * half_w, y + fold + sway, z))
    stride = columns + 1
    faces = [
        (r * stride + c, (r + 1) * stride + c, (r + 1) * stride + c + 1, r * stride + c + 1)
        for r in range(rows)
        for c in range(columns)
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("Cloth thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    apply_material(obj, mat)
    return obj


def add_banner(name: str, x: float, materials):
    banner = materials["wall_banner"]
    brass = materials["brass"]
    gold = materials["brass_dark"]
    pleated_banner(f"HOME_PROP_banner_{name}", x, 5.62, 3.84, 3.44, 0.48, 5.79, banner)
    # Gold hem along the V edge, so the cloth reads as finished and hung.
    curve_tube(
        f"HOME_PROP_banner_hem_{name}",
        [(x - 0.48, 5.755, 3.84), (x, 5.755, 3.44), (x + 0.48, 5.755, 3.84)],
        0.013,
        materials["gold"],
    )
    cube(f"HOME_PROP_banner_bar_{name}", (x, 5.72, 5.70), (0.60, 0.07, 0.045), brass, bevel=0.015)
    for side in (-1, 1):
        sphere(
            f"HOME_PROP_banner_bar_finial_{name}_{side}",
            (x + side * 0.64, 5.72, 5.70),
            (0.065, 0.050, 0.065),
            materials["brass_dark"],
        )

    # The same clean gilt knight as the JUGAR medallion and the rug, facing the room's centre,
    # over a dark under-layer so it stands off the cloth. (The earlier sphere-and-cone "horse"
    # did not read as a horse.)
    relief_y = 5.73
    facing = 1.0 if x >= 0.0 else -1.0
    scale = 0.80  # fits the medallion ring (radius 0.43) centred at z 4.36
    plain = materials["gilt_plain"]
    gilt = materials["gold"]

    def place(pts, grow=1.0):
        return [(x + facing * (u + 0.035) * scale * grow, 4.36 + (v - 0.545) * scale * grow) for u, v in pts]

    flat_panel(f"HOME_PROP_banner_knight_shadow_{name}", place(KNIGHT_REAL, 1.07), relief_y + 0.006, 0.030, materials["velvet_dark"], bevel=0.008)
    flat_panel(f"HOME_PROP_banner_knight_gold_{name}", place(KNIGHT_REAL), relief_y, 0.036, plain, bevel=0.008)
    for cut, pts in enumerate(KNIGHT_REAL_CUTS):
        flat_panel(f"HOME_PROP_banner_knight_cut_{cut}_{name}", place(pts), relief_y - 0.020, 0.012, materials["velvet_dark"], bevel=0.002)
    for hl, pts in enumerate(KNIGHT_REAL_HIGHLIGHTS):
        flat_panel(f"HOME_PROP_banner_knight_light_{hl}_{name}", place(pts), relief_y - 0.026, 0.010, materials["gilt_light"], bevel=0.002)
    cube(f"HOME_PROP_banner_knight_base_{name}", (x, relief_y - 0.004, 3.945), (0.26, 0.020, 0.018), gilt, bevel=0.006)
    # Finished heraldic cloth: gilt side trim, a chief band with studs, a medallion ring round
    # the knight and a cord with a tassel at the point, so the dark ink cloth reads as a
    # ceremonial banner instead of a rough dark rectangle.
    for side in (-1, 1):
        cube(f"HOME_PROP_banner_trim_{name}_{side}", (x + side * 0.468, 5.752, (5.62 + 3.84) / 2.0), (0.012, 0.010, (5.62 - 3.84) / 2.0), gilt, bevel=0.004)
    cube(f"HOME_PROP_banner_chief_{name}", (x, 5.752, 5.36), (0.46, 0.010, 0.030), gilt, bevel=0.005)
    for idx, sx in enumerate((-0.34, -0.17, 0.0, 0.17, 0.34)):
        sphere(f"HOME_PROP_banner_chief_stud_{name}_{idx}", (x + sx, 5.744, 5.36), (0.014, 0.008, 0.014), materials["brass_dark"])
    ring_r = 0.43
    curve_tube(
        f"HOME_PROP_banner_medallion_{name}",
        [(x + ring_r * math.cos(i * math.tau / 40), 5.750, 4.36 + ring_r * math.sin(i * math.tau / 40)) for i in range(41)],
        0.012,
        gilt,
    )
    curve_tube(
        f"HOME_PROP_banner_medallion_inner_{name}",
        [(x + (ring_r - 0.05) * math.cos(i * math.tau / 40), 5.752, 4.36 + (ring_r - 0.05) * math.sin(i * math.tau / 40)) for i in range(41)],
        0.005,
        materials["brass_dark"],
    )
    curve_tube(f"HOME_PROP_banner_cord_{name}", [(x, 5.750, 3.44), (x, 5.748, 3.36)], 0.010, gilt)
    sphere(f"HOME_PROP_banner_tassel_knot_{name}", (x, 5.748, 3.335), (0.030, 0.026, 0.030), gilt)
    cone(f"HOME_PROP_banner_tassel_{name}", (x, 5.748, 3.235), 0.036, 0.014, 0.16, gilt, vertices=12)


def add_armor(materials):
    steel = materials["armor_steel"]
    brass = materials["brass"]
    stone = materials["stone"]
    dark = materials["dark"]
    x, y = 1.55, 5.28

    cube("HOME_PROP_armor_pedestal", (x, y, 0.24), (0.72, 0.54, 0.24), stone, bevel=0.05)

    # Humanoid stance: two distinct greaves instead of the old single pawn-like
    # cylinder, plus pelvis, tapered cuirass and articulated limbs.
    for side in (-1, 1):
        lx = x + side * 0.27
        cube(f"HOME_PROP_armor_boot_{side}", (lx, y - 0.05, 0.58), (0.23, 0.29, 0.13), steel, bevel=0.06)
        cone(f"HOME_PROP_armor_greave_{side}", (lx, y, 0.98), 0.25, 0.18, 0.70, steel, vertices=28)
        sphere(f"HOME_PROP_armor_calf_{side}", (lx, y + 0.02, 1.08), (0.235, 0.205, 0.245), steel)
        sphere(f"HOME_PROP_armor_knee_{side}", (lx, y - 0.01, 1.30), (0.235, 0.17, 0.135), steel)
        cone(f"HOME_PROP_armor_thigh_{side}", (lx, y, 1.55), 0.31, 0.37, 0.48, steel, vertices=28)
        # Gold bands separate the plates; without them the whole leg read as one tube.
        for tag, band_z, band_r, band_ry in (
            ("cuisse_top", 1.765, 0.375, 0.375), ("cuisse_bottom", 1.36, 0.315, 0.315),
            ("poleyn", 1.30, 0.245, 0.175), ("greave_top", 1.25, 0.19, 0.19),
            ("greave_mid", 0.98, 0.22, 0.22), ("greave_bottom", 0.70, 0.24, 0.24),
        ):
            ring = cylinder(f"HOME_PROP_armor_leg_band_{tag}_{side}", (lx, y - (0.01 if tag == "poleyn" else 0.0), band_z), band_r, 0.026, materials["armor_gold"], vertices=28)
            ring.scale.y = band_ry / band_r

    cube("HOME_PROP_armor_pelvis", (x, y, 1.78), (0.46, 0.28, 0.18), steel, bevel=0.08)
    # Wide at the chest, narrow at the waist: the previous 0.50 -> 0.37 taper made a pear.
    cone("HOME_PROP_armor_cuirass", (x, y, 1.98), 0.26, 0.40, 0.42, steel, vertices=28)
    chest = sphere("HOME_PROP_armor_chest_barrel", (x, y - 0.01, 2.32), (0.52, 0.30, 0.37), steel)
    for idx, lame_z in enumerate((2.02, 2.10)):
        cylinder(f"HOME_PROP_armor_waist_lame_{idx}", (x, y - 0.01, lame_z), 0.31 + idx * 0.03, 0.030, materials["brass_dark"], vertices=28)
    cube("HOME_PROP_armor_belt", (x, y - 0.03, 1.84), (0.36, 0.25, 0.07), brass, bevel=0.03)

    # Flattened plate pauldrons instead of round balls: a sphere silhouette is
    # the single biggest "toy soldier" tell a shoulder can have.
    sphere("HOME_PROP_armor_shoulder_l", (x - 0.58, y - 0.010, 2.36), (0.250, 0.190, 0.160), steel)
    sphere("HOME_PROP_armor_shoulder_r", (x + 0.58, y - 0.022, 2.36), (0.250, 0.190, 0.160), steel)
    # Articulated pauldrons: overlapping lames under the dome with a gold band between.
    for side in (-1, 1):
        sx = x + side * 0.58
        sphere(f"HOME_PROP_armor_pauldron_lame_a_{side}", (sx, y - 0.015, 2.20), (0.262, 0.200, 0.055), steel)
        sphere(f"HOME_PROP_armor_pauldron_lame_b_{side}", (sx, y - 0.015, 2.11), (0.238, 0.182, 0.050), steel)
        band = cylinder(f"HOME_PROP_armor_pauldron_band_{side}", (sx, y - 0.015, 2.252), 0.235, 0.022, materials["armor_gold"], vertices=28)
        band.scale.x = 0.262 / 0.235
        band.scale.y = 0.200 / 0.235
    # Heraldic stance: shield up in the left hand, sword held low and
    # point-down in the right -- the reference silhouette this armour is
    # meant to read as -- instead of both hands clasped on one hilt at the
    # belt. All coordinates below are in the same pre-transform space as the
    # rest of add_armor: the caller's global rescale (0.78/0.92/1.14 about the
    # pedestal) applies to these objects automatically because they share the
    # HOME_PROP_armor_ prefix.
    # The armour is viewed from -Y (camera side), and the chest/fauld/tasset flat
    # panels sit at y in [5.47, 5.60] AFTER the global rescale, i.e. close to the front
    # face. Hands/props must land in front of (smaller post-transform y than) those
    # panels or they render fully hidden behind them, which is what happened first try.
    shoulders = {-1: (x - 0.58, y - 0.010, 2.32), 1: (x + 0.58, y - 0.022, 2.32)}
    elbows = {-1: (x - 0.48, y - 0.38, 1.98), 1: (x + 0.42, y - 0.34, 2.08)}
    # Left wrist holds the shield up near chest height; right wrist holds the
    # sword hilt around waist height, matching a relaxed heraldic guard
    # stance. Kept higher than hip height on purpose: the table in front of
    # this background figure already occludes everything below roughly
    # waist height from the camera, so a lower hilt just hid the blade
    # entirely behind the table instead of showing it "resting near the
    # ground".
    wrists = {-1: (x - 0.46, y - 0.60, 2.00), 1: (x + 0.24, y - 0.50, 1.95)}
    for side in (-1, 1):
        shoulder = shoulders[side]
        elbow = elbows[side]
        wrist = wrists[side]
        curve_tube(f"HOME_PROP_armor_upperarm_{side}", [shoulder, elbow], 0.160, steel)
        sphere(f"HOME_PROP_armor_bicep_{side}", ((shoulder[0] + elbow[0]) / 2, (shoulder[1] + elbow[1]) / 2 - 0.02, (shoulder[2] + elbow[2]) / 2 + 0.03), (0.195, 0.185, 0.225), steel)
        # Flattened elbow cops and boxy gauntlets read as plate; the previous
        # spheres read as ball-and-socket action-figure joints.
        sphere(f"HOME_PROP_armor_couter_{side}", elbow, (0.190, 0.170, 0.165), steel)
        curve_tube(f"HOME_PROP_armor_forearm_{side}", [elbow, wrist], 0.135, steel)
        sphere(f"HOME_PROP_armor_forearm_bulge_{side}", (elbow[0] * 0.66 + wrist[0] * 0.34, elbow[1] * 0.66 + wrist[1] * 0.34, elbow[2] * 0.66 + wrist[2] * 0.34), (0.160, 0.155, 0.195), steel)
        curve_tube(f"HOME_PROP_armor_cuff_{side}", [
            (wrist[0], wrist[1] - 0.012 * side, wrist[2] - 0.010),
            (wrist[0], wrist[1] - 0.012 * side, wrist[2] + 0.015),
        ], 0.062, materials["brass_dark"])
        cube(f"HOME_PROP_armor_gauntlet_{side}", wrist, (0.112, 0.098, 0.090), materials["leather"] if side == 1 else steel, bevel=0.028)
        if side == 1:
            cylinder("HOME_PROP_armor_gauntlet_cuff", (wrist[0], wrist[1], wrist[2] + 0.118), 0.085, 0.045, materials["armor_gold"], vertices=20)
        if side == 1:
            # Fingers wrapped round the grip in front, thumb across: the hand visibly holds the sword.
            for k in range(4):
                cube(f"HOME_PROP_armor_finger_{k}", (wrist[0], wrist[1] - 0.085, wrist[2] + 0.062 - k * 0.042), (0.075, 0.030, 0.017), materials["leather"], bevel=0.008)
            cube("HOME_PROP_armor_thumb", (wrist[0] + 0.070, wrist[1] - 0.070, wrist[2] + 0.030), (0.020, 0.030, 0.060), materials["leather"], bevel=0.008)

    # Heater shield in the left hand: brass backing plate behind a slightly
    # smaller steel face, a gold rim, corner rivets and a plain cross boss --
    # the same layered-plate-plus-trim technique as the table banner border,
    # reused here for the shield the armour was missing entirely.
    heraldry = materials["armor_gold"]
    shield_scale = 1.95
    S = shield_scale
    shield_x, shield_y, shield_z = wrists[-1][0] - 0.10, wrists[-1][1] - 0.10, wrists[-1][2] - 0.30
    # Big heater shield: rectangular upper field plus a pyramid point, heavy gold
    # rim, broad gold cross, central boss and rivets.
    cube("HOME_PROP_armor_shield_back", (shield_x, shield_y + 0.030, shield_z + 0.16 * S), (0.250 * S, 0.028, 0.155 * S), materials["brass_dark"], bevel=0.035)
    cube("HOME_PROP_armor_shield_face", (shield_x, shield_y, shield_z + 0.16 * S), (0.232 * S, 0.030, 0.150 * S), steel, bevel=0.030)
    point_back = cone("HOME_PROP_armor_shield_point_back", (shield_x, shield_y + 0.030, shield_z - 0.135 * S), 0.001, 0.250 * S, 0.320 * S, materials["brass_dark"], vertices=4)
    point_back.scale.y = 0.028 / (0.250 * S)
    point = cone("HOME_PROP_armor_shield_point", (shield_x, shield_y, shield_z - 0.135 * S), 0.001, 0.232 * S, 0.310 * S, steel, vertices=4)
    point.scale.y = 0.030 / (0.232 * S)
    outline = [
        (-0.238, 0.312), (0.238, 0.312), (0.238, 0.012), (0.0, -0.300), (-0.238, 0.012), (-0.238, 0.312),
    ]
    curve_tube(
        "HOME_PROP_armor_shield_rim",
        [(shield_x + ox * S, shield_y - 0.036, shield_z + oz * S) for ox, oz in outline],
        0.024,
        heraldry,
    )
    cube("HOME_PROP_armor_shield_cross_v", (shield_x, shield_y - 0.038, shield_z + 0.03 * S), (0.048, 0.012, 0.275 * S), heraldry, bevel=0.010)
    cube("HOME_PROP_armor_shield_cross_h", (shield_x, shield_y - 0.038, shield_z + 0.18 * S), (0.225 * S, 0.012, 0.048), heraldry, bevel=0.010)
    sphere("HOME_PROP_armor_shield_boss", (shield_x, shield_y - 0.052, shield_z + 0.18 * S), (0.085, 0.034, 0.085), heraldry)
    for rivet_idx, (rx, rz) in enumerate(((-0.180, 0.260), (0.180, 0.260), (-0.180, 0.070), (0.180, 0.070), (0.0, -0.120))):
        sphere(f"HOME_PROP_armor_shield_rivet_{rivet_idx}", (shield_x + rx * S, shield_y - 0.044, shield_z + rz * S), (0.026, 0.016, 0.026), brass)
    # Guige strap: a leather baldric from the left shoulder to the shield's upper rivet,
    # so the big shield hangs from the figure instead of floating beside it.
    strap_end = (shield_x - 0.180 * S, shield_y - 0.056, shield_z + 0.260 * S)
    strap_mid = ((shoulders[-1][0] + strap_end[0]) / 2.0 - 0.02, shoulders[-1][1] - 0.30, (shoulders[-1][2] + strap_end[2]) / 2.0 + 0.02)
    curve_tube("HOME_PROP_armor_shield_strap", [(shoulders[-1][0], shoulders[-1][1] - 0.10, shoulders[-1][2] + 0.02), strap_mid, strap_end], 0.026, materials["leather"])
    sphere("HOME_PROP_armor_shield_buckle", strap_end, (0.040, 0.020, 0.040), brass)

    # Sword held low in the right hand, point down toward the pedestal --
    # a resting guard stance instead of a two-handed ceremonial clasp.
    hilt_x, hilt_y = wrists[1][0], wrists[1][1]
    grip_z = wrists[1][2]  # the gloved fist closes round the middle of the grip
    # Point-down sword, hilt at the TOP: pommel, wrapped grip in the fist, cross-guard below the
    # hand, then the blade down to the pedestal. (It was inverted before: pommel underneath and
    # the blade running through the grip, so there was nothing for the hand to hold.)
    cylinder("HOME_PROP_armor_sword_grip", (hilt_x, hilt_y, grip_z + 0.02), 0.040, 0.26, materials["leather"], vertices=16)
    for ring_z in (grip_z - 0.07, grip_z + 0.02, grip_z + 0.11):
        cylinder("HOME_PROP_armor_sword_grip_ring", (hilt_x, hilt_y, ring_z), 0.046, 0.012, brass, vertices=16)
    sphere("HOME_PROP_armor_sword_pommel", (hilt_x, hilt_y, grip_z + 0.19), (0.072, 0.072, 0.072), brass)
    guard_z = grip_z - 0.155
    cube("HOME_PROP_armor_sword_guard", (hilt_x, hilt_y, guard_z), (0.300, 0.034, 0.030), brass, bevel=0.012)
    for side in (-1, 1):
        sphere(f"HOME_PROP_armor_sword_terminal_{side}", (hilt_x + side * 0.315, hilt_y, guard_z), (0.050, 0.050, 0.050), brass)
    # Planted sword: point resting on the pedestal top (z 0.48).
    blade_base_z, blade_tip_z = guard_z - 0.03, 0.66
    # Bare polished steel (brighter/more metallic than the matte armor_steel
    # body) so the blade actually reads against the body and the archway
    # shadow behind it, instead of disappearing into both.
    blade_steel = materials["armor_steel"]
    cube("HOME_PROP_armor_sword_blade", (hilt_x, hilt_y, (blade_base_z + blade_tip_z) / 2),
         (0.090, 0.022, (blade_base_z - blade_tip_z) / 2), blade_steel, bevel=0.008)
    cube("HOME_PROP_armor_sword_fuller", (hilt_x, hilt_y - 0.020, (blade_base_z + blade_tip_z) / 2 - 0.04), (0.020, 0.008, (blade_base_z - blade_tip_z) / 2 * 0.86), dark, bevel=0.004)
    # cone() puts radius1 at the bottom (-Z) and radius2 at the top (+Z); the point
    # must be the bottom (lowest z) so the blade tapers down to a tip, not up.
    tip = cone("HOME_PROP_armor_sword_tip", (hilt_x, hilt_y, blade_tip_z - 0.09), 0.001, 0.090, 0.18, blade_steel, vertices=4)
    tip.scale.y = 0.022 / 0.090

    # Helmet with neck gap and a face slit, much closer to the canonical suit
    # of armour silhouette than a round pawn head. A great-helm reads as
    # plate because it has flat faces and edges; a sphere never will no
    # matter how much trim is glued onto it, so the head is a bevelled box.
    cylinder("HOME_PROP_armor_neck", (x, y, 2.60), 0.17, 0.22, dark, vertices=20)
    heraldry_helm = materials["armor_gold"]
    # Round humanoid armet: a skull dome, a muzzle-and-chin face guard, a dark eye
    # slit and a gold comb. Radii are pre-rescale; the caller's 0.78 / 0.92 / 1.14
    # squeeze is compensated here so the head still reads round, not oval.
    sphere("HOME_PROP_armor_helmet", (x, y, 2.90), (0.290, 0.250, 0.275), steel)
    sphere("HOME_PROP_armor_visor", (x, y - 0.075, 2.655), (0.215, 0.140, 0.100), steel)
    cube("HOME_PROP_armor_brow", (x, y - 0.238, 2.925), (0.185, 0.030, 0.020), dark, bevel=0.008)
    # Crimson plume arching over the crown, like a knight's crest.
    curve_tube(
        "HOME_PROP_armor_plume",
        [(x, y - 0.12, 3.15), (x, y + 0.02, 3.42), (x, y + 0.22, 3.40), (x, y + 0.38, 3.16), (x, y + 0.42, 2.90)],
        0.085,
        materials["plume_red"],
    )
    cube("HOME_PROP_armor_helmet_crest", (x, y + 0.00, 3.15), (0.020, 0.190, 0.028), heraldry_helm, bevel=0.010)
    cube("HOME_PROP_armor_visor_edge", (x, y - 0.238, 2.775), (0.016, 0.014, 0.085), heraldry_helm, bevel=0.005)
    for slot, (sx, sz) in enumerate(((-0.13, 2.665), (-0.065, 2.665), (0.065, 2.665), (0.13, 2.665))):
        cube(f"HOME_PROP_armor_visor_slot_{slot}", (x + sx, y - 0.208, sz), (0.008, 0.012, 0.032), dark, bevel=0.002)
    cylinder("HOME_PROP_armor_helmet_rim", (x, y, 2.63), 0.235, 0.030, heraldry_helm, vertices=28)
    # Layered Gothic plate details stop the focal suit reading as a silver robot.
    cylinder("HOME_PROP_armor_gorget", (x, y - 0.015, 2.58), 0.29, 0.105, steel, vertices=28)

    helmet_angle = math.radians(-1.4)
    helmet_parts = [
        obj for obj in bpy.data.objects
        if obj.name in {
            "HOME_PROP_armor_helmet",
            "HOME_PROP_armor_visor",
            "HOME_PROP_armor_brow",
            "HOME_PROP_armor_helmet_crest",
            "HOME_PROP_armor_visor_edge",
        }
        or obj.name.startswith("HOME_PROP_armor_visor_slot_")
    ]
    for part in helmet_parts:
        dx = part.location.x - x
        dy = part.location.y - y
        part.location.x = x + dx * math.cos(helmet_angle) - dy * math.sin(helmet_angle)
        part.location.y = y + dx * math.sin(helmet_angle) + dy * math.cos(helmet_angle)
        part.rotation_euler[2] += helmet_angle
    for side in (-1, 1):
        cube(
            f"HOME_PROP_armor_pauldron_ridge_{side}",
            (x + side * 0.58, y - 0.060, 2.44),
            (0.250, 0.050, 0.045),
            brass,
            bevel=0.020,
        )
        cube(
            f"HOME_PROP_armor_tasset_{side}",
            (x + side * 0.245, y - 0.075, 1.73),
            (0.18, 0.11, 0.26),
            steel,
            bevel=0.055,
        )
        sphere(
            f"HOME_PROP_armor_tasset_rivet_{side}",
            (x + side * 0.245, y - 0.205, 1.78),
            (0.034, 0.016, 0.034),
            brass,
        )
    curve_tube(
        "HOME_PROP_armor_breastplate_ridge",
        [(x, y - 0.255, 1.93), (x, y - 0.315, 2.20), (x, y - 0.245, 2.47)],
        0.026,
        brass,
    )
    for side in (-1, 1):
        curve_tube(
            f"HOME_PROP_armor_breastplate_flute_{side}",
            [
                (x + side * 0.24, y - 0.245, 1.98),
                (x + side * 0.17, y - 0.300, 2.20),
                (x + side * 0.21, y - 0.235, 2.42),
            ],
            0.014,
            materials["brass_dark"],
        )
    sphere(
        "HOME_PROP_armor_breastplate_boss",
        (x, y - 0.340, 2.20),
        (0.070, 0.020, 0.070),
        brass,
    )

    # Weapon rack frames the armour without becoming part of its body.
    for idx, wx in enumerate((x - 0.88, x - 0.68, x + 0.68, x + 0.88)):
        lean = (-0.045, 0.028, -0.020, 0.052)[idx]
        tip_z = (3.60, 3.66, 3.62, 3.69)[idx]
        shaft_top_x = wx + lean
        curve_tube(
            f"HOME_PROP_armor_weapon_{idx}",
            [(wx, y + 0.10, 0.45), (shaft_top_x, y + 0.08, tip_z - 0.15)],
            0.030,
            dark,
        )
        cone(
            f"HOME_PROP_armor_weapon_tip_{idx}",
            (shaft_top_x, y + 0.08, tip_z),
            0.075 if idx % 2 == 0 else 0.060,
            0.008,
            0.30 if idx % 2 == 0 else 0.24,
            steel if idx % 2 == 0 else brass,
            vertices=14,
        )
        cube(
            f"HOME_PROP_armor_weapon_guard_{idx}",
            (wx + lean * 0.86, y + 0.075, tip_z - 0.24),
            (0.12 if idx % 2 == 0 else 0.09, 0.020, 0.020),
            brass if idx % 2 == 0 else steel,
            bevel=0.008,
        )


def add_trophy(materials):
    brass = materials["brass"]
    stone = materials["stone"]
    # The canon fireplace pass removes the original mantel, so the cup gets its own
    # stone ledge on two corbels, bolted to the chimney-breast wall above the hearth.
    x, y = -6.15, 5.83
    cube("HOME_PROP_trophy_ledge", (x, y, 2.05), (0.62, 0.22, 0.055), stone, bevel=0.030)
    for side in (-1, 1):
        cube(f"HOME_PROP_trophy_corbel_{side}", (x + side * 0.42, y + 0.05, 1.83), (0.11, 0.17, 0.15), stone, bevel=0.030)
    cube("HOME_PROP_trophy_ledge_plate", (x, y - 0.225, 2.05), (0.16, 0.008, 0.032), materials["gold"], bevel=0.004)
    cube("HOME_PROP_trophy_plinth", (x, y, 2.145), (0.27, 0.24, 0.040), stone, bevel=0.020)
    z0 = 2.185
    cylinder("HOME_PROP_trophy_foot", (x, y, z0 + 0.04), 0.20, 0.08, materials["brass_dark"], vertices=24)
    cylinder("HOME_PROP_trophy_stem", (x, y, z0 + 0.25), 0.06, 0.34, brass)
    cone("HOME_PROP_trophy_cup", (x, y, z0 + 0.62), 0.16, 0.30, 0.42, brass, vertices=28)
    cylinder("HOME_PROP_trophy_rim", (x, y, z0 + 0.84), 0.30, 0.045, materials["gold"], vertices=28)
    sphere("HOME_PROP_trophy_finial", (x, y, z0 + 0.90), (0.055, 0.055, 0.055), materials["gold"])
    curve_tube("HOME_PROP_trophy_handle_l", [(x - 0.17, y, z0 + 0.74), (x - 0.34, y, z0 + 0.66), (x - 0.22, y, z0 + 0.46)], 0.032, brass)
    curve_tube("HOME_PROP_trophy_handle_r", [(x + 0.17, y, z0 + 0.74), (x + 0.34, y, z0 + 0.66), (x + 0.22, y, z0 + 0.46)], 0.032, brass)


def add_side_furnishings(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    leather = materials["leather"]
    paper = materials["paper"]
    globe = materials["globe"]
    plant = materials["plant"]
    ceramic = materials["ceramic"]
    steel = materials["steel"]

    # Left lived-in corner: sofa, side table, helmet/candle and book stack.
    cube("HOME_PROP_left_sofa_base", (-6.72, -0.05, 0.42), (1.55, 1.05, 0.40), leather, bevel=0.14)
    cube("HOME_PROP_left_sofa_back", (-7.39, 0.58, 1.32), (0.22, 1.02, 0.92), leather, bevel=0.12)
    cube("HOME_PROP_left_sofa_arm", (-5.45, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    cube("HOME_PROP_left_sofa_arm_outer", (-7.39, -0.02, 0.80), (0.22, 0.95, 0.48), leather, bevel=0.11)
    for idx, sx in enumerate((-7.78, -5.70)):
        sphere(
            f"HOME_PROP_left_sofa_front_foot_{idx}",
            (sx, -1.115, 0.20),
            (0.105, 0.075, 0.155),
            wood,
        )
        sphere(
            f"HOME_PROP_left_sofa_front_foot_cap_{idx}",
            (sx, -1.125, 0.33),
            (0.075, 0.060, 0.050),
            materials["brass_dark"],
        )
    for idx, sx in enumerate((-7.82, -7.48, -7.14, -6.80, -6.46, -6.12, -5.78)):
        sphere(
            f"HOME_PROP_left_sofa_front_stud_{idx}",
            (sx, -1.085, 0.56),
            (0.032, 0.018, 0.032),
            materials["brass_dark"],
        )
    for idx, cy in enumerate((-0.52, 0.52)):
        cushion = cube(
            f"HOME_PROP_left_sofa_seat_cushion_{idx}",
            (
                -6.46 + (-0.018, 0.012)[idx],
                cy + (-0.012, 0.016)[idx],
                0.865 + (0.0, 0.014)[idx],
            ),
            (
                0.785 + (-0.012, 0.010)[idx],
                0.445 + (0.010, -0.008)[idx],
                0.100 + (0.0, 0.008)[idx],
            ),
            leather,
            bevel=0.095,
        )
        cushion.rotation_euler[2] = math.radians((-0.8, 0.6)[idx])
        cube(
            f"HOME_PROP_left_sofa_piping_{idx}",
            (-5.66 + (-0.010, 0.006)[idx], cy, 0.89 + (0.0, 0.012)[idx]),
            (0.018, 0.40, 0.022),
            materials["dark"],
            bevel=0.010,
        )
    cube(
        "HOME_PROP_left_sofa_center_seam",
        (-6.54, 0.0, 0.90),
        (0.70, 0.018, 0.018),
        materials["dark"],
        bevel=0.008,
    )
    for row, z in enumerate((0.95, 1.28, 1.58)):
        for col, y in enumerate((0.02, 0.44, 0.86)):
            sphere(
                f"HOME_PROP_left_sofa_tuft_{row}_{col}",
                (-7.175, y, z),
                (0.028, 0.014, 0.028),
                materials["gold"] if (row + col) % 2 == 0 else materials["dark"],
            )
    flat_panel(
        "HOME_PROP_left_sofa_throw",
        [(-7.30, 1.38), (-6.15, 1.38), (-6.08, 0.35), (-6.72, 0.20), (-7.20, 0.42)],
        0.18,
        0.05,
        materials["dark"],
        bevel=0.06,
    )
    cube("HOME_PROP_left_sideboard", (-7.55, 2.62, 0.62), (1.30, 0.48, 0.62), wood, bevel=0.06)
    cube("HOME_PROP_left_sideboard_top", (-7.55, 2.60, 1.27), (1.38, 0.50, 0.075), wood, bevel=0.035)
    for idx, drawer_z in enumerate((0.34, 0.65, 0.96)):
        cube(
            f"HOME_PROP_left_sideboard_drawer_{idx}",
            (-7.55, 2.125, drawer_z),
            (1.06, 0.018, 0.12),
            materials["dark"],
            bevel=0.025,
        )
        sphere(
            f"HOME_PROP_left_sideboard_handle_{idx}",
            (-7.55, 2.095, drawer_z),
            (0.050, 0.020, 0.050),
            brass,
        )
    cylinder("HOME_PROP_left_side_table_top", (-6.35, 2.35, 1.10), 0.56, 0.12, wood, vertices=28)
    cylinder("HOME_PROP_left_side_table_apron", (-6.35, 2.35, 1.01), 0.48, 0.10, materials["dark"], vertices=28)
    cylinder("HOME_PROP_left_side_table_pedestal", (-6.35, 2.35, 0.56), 0.16, 0.80, wood, vertices=24)
    cylinder("HOME_PROP_left_side_table_base", (-6.35, 2.35, 0.16), 0.42, 0.16, wood, vertices=28)
    cylinder("HOME_PROP_left_side_table_foot", (-6.35, 2.35, 0.06), 0.48, 0.08, materials["dark"], vertices=28)
    add_chronicle_lectern("HOME_PROP_left_chronicle", -6.16, 2.42, 1.16, materials)
    add_knight_statuette("HOME_PROP_left_statuette", -6.74, 2.12, 1.16, 0.46, materials)
    for idx, cx in enumerate((-6.90, -6.62, -6.34)):
        cylinder(f"HOME_PROP_left_candelabra_stem_{idx}", (cx, 2.70, 1.26), 0.035, 0.24, materials["brass_dark"], vertices=12)
        cube(f"HOME_PROP_left_candelabra_candle_{idx}", (cx, 2.70, 1.49), (0.035, 0.035, 0.15), materials["wax"], bevel=0.012)
        cone(f"HOME_PROP_left_candelabra_flame_{idx}", (cx, 2.70, 1.68), 0.035, 0.006, 0.10, materials["fire_hot"], vertices=10)
        add_point_light(f"HOME_LIGHT_left_candelabra_{idx}", (cx, 2.58, 1.72), 18, (1.0, 0.36, 0.08), radius=0.18)
    for idx in range(4):
        cube(
            f"HOME_PROP_left_book_stack_{idx}",
            (-8.15 + idx * 0.04, -0.65, 0.16 + idx * 0.09),
            (0.52 - idx * 0.03, 0.35, 0.055),
            materials["book_brown"] if idx % 2 else materials["book_green"],
            bevel=0.02,
        )

    # Library work area behind the main board.
    cube("HOME_PROP_library_desk", (-3.45, 4.05, 0.82), (1.35, 0.58, 0.10), wood, bevel=0.05)
    cube(
        "HOME_PROP_library_desk_apron",
        (-3.45, 3.48, 0.68),
        (1.08, 0.035, 0.12),
        wood,
        bevel=0.025,
    )
    cube(
        "HOME_PROP_library_desk_drawer",
        (-3.45, 3.435, 0.71),
        (0.54, 0.018, 0.11),
        materials["dark"],
        bevel=0.020,
    )
    sphere(
        "HOME_PROP_library_desk_drawer_pull",
        (-3.45, 3.405, 0.71),
        (0.042, 0.020, 0.042),
        brass,
    )
    cube("HOME_PROP_library_desk_leg_l", (-4.55, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    cube("HOME_PROP_library_desk_leg_r", (-2.35, 4.05, 0.42), (0.10, 0.10, 0.42), wood, bevel=0.025)
    # The library's leather reading chair used to show its backrest behind the left table chair
    # like a stray piece of sofa, so it is gone (the desk keeps its lamp).
    cylinder("HOME_PROP_library_lamp_base", (-3.10, 3.92, 0.99), 0.13, 0.12, brass, vertices=20)
    cylinder("HOME_PROP_library_lamp_stem", (-3.10, 3.92, 1.13), 0.030, 0.20, materials["brass_dark"], vertices=16)
    cone(
        "HOME_PROP_library_lamp_shade",
        (-3.10, 3.92, 1.31),
        0.24,
        0.13,
        0.22,
        paper,
        vertices=24,
    )
    cylinder("HOME_PROP_library_lamp_cap", (-3.10, 3.92, 1.44), 0.055, 0.04, brass, vertices=16)

    # Turn the library desk from set dressing into a visibly used work surface.
    # These props sit behind the main board and do not alter Home hotspots.
    add_point_light("HOME_LIGHT_library_desk", (-3.10, 3.76, 1.42), 48, (1.0, 0.46, 0.18), radius=0.34)

    page_left = cube(
        "HOME_PROP_library_open_book_left",
        (-3.72, 3.72, 0.99),
        (0.30, 0.22, 0.018),
        materials["paper"],
        bevel=0.018,
    )
    page_left.rotation_euler[2] = math.radians(-7.0)
    page_right = cube(
        "HOME_PROP_library_open_book_right",
        (-3.16, 3.74, 1.00),
        (0.30, 0.22, 0.018),
        materials["paper"],
        bevel=0.018,
    )
    page_right.rotation_euler[2] = math.radians(6.0)
    cube(
        "HOME_PROP_library_open_book_spine",
        (-3.44, 3.76, 0.985),
        (0.035, 0.24, 0.028),
        materials["book_brown"],
        bevel=0.012,
    )

    cylinder(
        "HOME_PROP_library_inkwell",
        (-2.55, 3.70, 1.03),
        0.075,
        0.10,
        materials["dark"],
        vertices=18,
    )
    curve_tube(
        "HOME_PROP_library_quill",
        [(-2.57, 3.66, 1.10), (-2.43, 3.62, 1.30), (-2.27, 3.58, 1.48)],
        0.012,
        materials["brass_dark"],
    )
    for idx, (px, py, angle) in enumerate((
        (-4.05, 4.15, -8.0),
        (-3.66, 4.19, 5.0),
        (-2.70, 4.20, -4.0),
    )):
        note = cube(
            f"HOME_PROP_library_note_{idx}",
            (px, py, 0.985 + idx * 0.003),
            (0.20, 0.15, 0.010),
            materials["paper"],
            bevel=0.010,
        )
        note.rotation_euler[2] = math.radians(angle)

    # Right cabinet + globe, pulled slightly forward so the globe actually reads
    # beside the right fireplace at canonical camera distance.
    gx, gy = 5.58, 4.08
    cube("HOME_PROP_right_cabinet", (7.55, 5.02, 1.05), (1.15, 0.46, 1.05), wood, bevel=0.04)
    cube("HOME_PROP_right_cabinet_top", (7.55, 4.99, 2.14), (1.24, 0.49, 0.08), wood, bevel=0.035)
    for side in (-1, 1):
        door_x = 7.55 + side * 0.54
        cube(
            f"HOME_PROP_right_cabinet_door_{side}",
            (door_x, 4.545, 1.05),
            (0.47, 0.020, 0.76),
            materials["dark"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_right_cabinet_door_trim_{side}",
            (door_x, 4.520, 1.05),
            (0.39, 0.010, 0.66),
            wood,
            bevel=0.032,
        )
        sphere(
            f"HOME_PROP_right_cabinet_handle_{side}",
            (7.55 + side * 0.13, 4.485, 1.08),
            (0.045, 0.022, 0.045),
            brass,
        )
    # (The study globe that stood here was removed: it added little to the Home.)

    # The potted cactus used to stand behind the right chair and the stair newel, where the
    # camera never saw it. It now sits on the moonlit window sill, against the night glass.
    k = 0.62
    px0, py0, pz0 = 7.50, 6.20, 1.95  # sill top

    def at(x, y, z):
        return (px0 + (x - 5.10) * k, py0 + (y - 1.70) * k, pz0 + (z - 0.2475) * k)

    cylinder("HOME_PROP_plant_pot", at(5.10, 1.70, 0.52), 0.34 * k, 0.48 * k, ceramic, vertices=28)
    cylinder("HOME_PROP_plant_pot_rim", at(5.10, 1.70, 0.775), 0.38 * k, 0.085 * k, ceramic, vertices=28)
    cylinder("HOME_PROP_plant_pot_soil", at(5.10, 1.70, 0.818), 0.295 * k, 0.018 * k, materials["dark"], vertices=28)
    cylinder("HOME_PROP_plant_pot_foot", at(5.10, 1.70, 0.275), 0.29 * k, 0.055 * k, materials["ceramic"], vertices=28)
    for idx, (dx, dy) in enumerate(((-0.25, 0.05), (0.22, 0.02), (-0.12, 0.18), (0.10, -0.10), (0.30, 0.15))):
        curve_tube(
            f"HOME_PROP_plant_leaf_{idx}",
            [at(5.10, 1.70, 0.76), at(5.10 + dx * 0.55, 1.70 + dy, 1.13), at(5.10 + dx, 1.70 + dy * 1.7, 1.46)],
            0.040 * k,
            plant,
        )
        blade = sphere(
            f"HOME_PROP_plant_leaf_blade_{idx}",
            at(5.10 + dx * 0.78, 1.70 + dy * 1.30, 1.31),
            (0.105 * k, 0.038 * k, 0.265 * k),
            plant,
        )
        blade.rotation_euler[0] = math.radians(dy * 55.0)
        blade.rotation_euler[1] = math.radians(-dx * 85.0)
    center_leaf = sphere(
        "HOME_PROP_plant_leaf_blade_center",
        at(5.10, 1.70, 1.28),
        (0.095 * k, 0.035 * k, 0.30 * k),
        plant,
    )
    center_leaf.rotation_euler[1] = math.radians(4.0)


def add_stairs(materials):
    stone = materials["stair_stone"]
    brass = materials["brass"]
    dark = materials["dark"]
    fire = materials["fire"]

    # Keep the Dungeon a strong lower-right destination without letting it
    # consume a third of the room. The canonical opening is mostly an arch,
    # balustrade and descending stair tucked against the right edge.
    bridge_x = 6.25
    arch_x = 6.52
    cube("HOME_ARCH_dungeon_bridge", (bridge_x, 2.48, 1.36), (1.70, 0.66, 0.12), stone, bevel=0.05)
    cube("HOME_ARCH_dungeon_bridge_lip", (bridge_x, 1.92, 1.54), (1.62, 0.11, 0.16), stone, bevel=0.04)

    cube("HOME_ARCH_dungeon_void", (arch_x, 1.78, -0.12), (1.42, 0.09, 1.42), dark, bevel=0.12)
    arch("HOME_ARCH_dungeon_arch", arch_x, 1.60, 2.95, 0.58, 1.42, -1.56, stone)
    add_round_arch_voussoirs(
        "HOME_ARCH_dungeon_voussoir",
        arch_x,
        1.60,
        2.95,
        1.42,
        materials["arch_stone"],
        count=11,
    )
    arch("HOME_ARCH_dungeon_arch_inner", arch_x + 0.08, 1.48, 2.42, 0.44, 1.12, -1.46, materials["stone_dark"])

    for idx, x in enumerate((5.62, 5.93, 6.24, 6.55, 6.86, 7.17)):
        cube(f"HOME_PROP_dungeon_gate_{idx}", (x, 1.51, -0.30), (0.040, 0.040, 0.88), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_gate_cross", (6.40, 1.49, -0.25), (0.94, 0.045, 0.050), materials["steel"], bevel=0.01)
    cube("HOME_PROP_dungeon_fire_left", (5.88, 1.36, -0.66), (0.15, 0.05, 0.30), fire, bevel=0.08)
    cube("HOME_PROP_dungeon_fire_right", (6.96, 1.36, -0.70), (0.15, 0.05, 0.34), fire, bevel=0.08)

    for idx, x in enumerate((4.98, 5.38, 5.78, 6.18, 6.58, 6.98, 7.38)):
        cylinder(f"HOME_ARCH_dungeon_baluster_{idx}", (x, 1.80, 1.86), 0.060, 0.52, stone, vertices=20)
    cube("HOME_ARCH_dungeon_balustrade_top", (6.18, 1.80, 2.14), (1.52, 0.085, 0.075), stone, bevel=0.022)

    cylinder("HOME_ARCH_dungeon_post", (4.72, 1.90, 1.33), 0.19, 1.78, stone, vertices=32)
    sphere("HOME_PROP_dungeon_finial", (4.72, 1.90, 2.30), (0.16, 0.16, 0.16), materials["stone_dark"])

    # Profile stair: the flight runs left -> right across the frame and descends, so the
    # camera reads every tread as a step in silhouette (the old diagonal flight ran into
    # the depth of the room and looked like a stone ramp). Each step is a solid masonry
    # block down to the lower floor; the front rail follows the slope.
    steps = 11
    x_start, dx = 5.05, 0.27
    z_start, dz = 0.66, -0.158
    stair_y, half_depth = 0.80, 0.50
    floor_top = -1.37

    def tread_top(index):
        return z_start + dz * index

    for i in range(steps):
        x = x_start + dx * i
        top = tread_top(i)
        block_h = (top - floor_top) / 2.0
        depth_jitter = (_hash01(i, 0, 1031) - 0.5) * 0.030
        cube(
            f"HOME_ARCH_dungeon_step_{i}",
            (x, stair_y + depth_jitter, floor_top + block_h),
            (dx / 2.0 + 0.012, half_depth, block_h),
            stone,
            bevel=0.022 + _hash01(i, 3, 1051) * 0.006,
        )
        cube(
            f"HOME_PROP_dungeon_step_nosing_{i}",
            (x, stair_y - half_depth + 0.020, top + 0.012),
            (dx / 2.0 + 0.004, 0.026, 0.020),
            materials["stone_dark"],
            bevel=0.008,
        )
        # Oxblood runner down the middle of every tread with a brass rod at its lip.
        cube(
            f"HOME_PROP_dungeon_step_runner_{i}",
            (x, stair_y - 0.02, top + 0.010),
            (dx / 2.0 - 0.015, half_depth * 0.74, 0.008),
            materials["leather"],
            bevel=0.004,
        )
        cube(
            f"HOME_PROP_dungeon_step_rod_{i}",
            (x, stair_y - half_depth + 0.075, top + 0.022),
            (dx / 2.0 - 0.012, 0.010, 0.010),
            brass,
            bevel=0.004,
        )
        if i in (1, 4, 7, 9):
            cube(
                f"HOME_PROP_dungeon_step_wear_{i}",
                (x + (_hash01(i, 5, 1069) - 0.5) * 0.06, stair_y - 0.10, top + 0.012),
                (dx * 0.36, 0.16, 0.004),
                materials["stone_grime"],
                bevel=0.010,
            )

    rail_y = stair_y - half_depth + 0.06

    def rail_z(xx, lift):
        return z_start + dz * (xx - x_start) / dx + lift

    x_end = x_start + dx * (steps - 1)
    top_rail = [(xx, rail_y, rail_z(xx, 1.02)) for xx in (x_start - 0.15, (x_start + x_end) / 2.0, x_end + 0.15)]
    curve_tube("HOME_ARCH_dungeon_stone_rail", top_rail, 0.060, stone)
    curve_tube("HOME_PROP_dungeon_gold_rail", [(a, b - 0.02, c + 0.11) for a, b, c in top_rail], 0.024, materials["brass_dark"])
    curve_tube(
        "HOME_ARCH_dungeon_lower_stone_rail",
        [(xx, rail_y, rail_z(xx, 0.56)) for xx in (x_start - 0.15, (x_start + x_end) / 2.0, x_end + 0.15)],
        0.038,
        stone,
    )
    for idx in range(7):
        px = x_start + 0.12 + (x_end - x_start - 0.10) * idx / 6.0
        pz = rail_z(px, 0.52)
        cylinder(f"HOME_PROP_dungeon_stair_baluster_{idx}", (px, rail_y, pz), 0.040, 0.52, stone, vertices=16)
        sphere(f"HOME_PROP_dungeon_stair_baluster_cap_{idx}", (px, rail_y, pz + 0.29), (0.065, 0.065, 0.065), materials["stone_dark"])
    for name, px in {"top": x_start - 0.15, "bottom": x_end + 0.15}.items():
        pz = rail_z(px, 0.55)
        cube(f"HOME_ARCH_dungeon_newel_{name}", (px, rail_y, pz), (0.105, 0.105, 0.55), stone, bevel=0.036)
        sphere(f"HOME_PROP_dungeon_newel_finial_{name}", (px, rail_y, pz + 0.68), (0.115, 0.115, 0.115), materials["stone_dark"])
        sphere(f"HOME_PROP_dungeon_newel_gold_{name}", (px, rail_y - 0.02, pz + 0.69), (0.050, 0.050, 0.050), materials["brass_dark"])
    for idx, px in enumerate((x_start + dx * 2.0, x_start + dx * 5.0, x_start + dx * 8.0)):
        add_stair_lantern(idx, px, rail_y - 0.02, rail_z(px, 0.52) + 0.04, materials)
    cube("HOME_ARCH_dungeon_lower_floor", (6.55, -0.52, -1.46), (1.64, 1.55, 0.09), dark, bevel=0.02)


def build_scene(reference: Path, samples: int, max_width: int, engine: str):
    reset_scene()
    scene = bpy.context.scene
    if engine == "workbench":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
    else:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except TypeError:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100

    ref_image = bpy.data.images.load(str(reference), check_existing=False)
    width, height = int(ref_image.size[0]), int(ref_image.size[1])
    if width <= 0 or height <= 0:
        width, height = 320, 180
    # `width`/`height` are common local names further down build_scene (a loop once
    # reused `height` and silently corrupted the exported reference_size), so the
    # reference size is captured under names nothing else uses.
    reference_width, reference_height = width, height
    canon_width, canon_height = 1672, 941
    render_width = min(canon_width, max(640, max_width))
    render_height = round(canon_height * render_width / canon_width)
    scene.render.resolution_x = render_width
    scene.render.resolution_y = render_height

    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False

    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = max(8, samples)

    world = bpy.data.worlds.new("HOME_WORLD")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.007, 0.004, 1.0)
    bg.inputs["Strength"].default_value = 0.024

    materials = {
        # Teutonic-castle pass: the whole stone family used to sit in the same
        # narrow warm-brown band as the wood/leather props, which read as one
        # flat tone. Push each slot toward the masonry it actually represents
        # (pale ashlar / warm brick accent / sandstone arch / damp dungeon
        # grey) so walls, arches and stairs read as distinct materials again.
        # First pass here (0.05-0.09 -> 0.06-0.13) was real but invisible: AgX
        # "Medium High Contrast" (see build_scene's view_settings.look) plus
        # the -0.20 exposure and this room's low ambient (0.024) crush small
        # linear albedo deltas in shadow almost completely. Went noticeably
        # bolder so the difference actually survives that pipeline.
        "stone": material("HOME_MAT_stone", (0.160, 0.160, 0.170, 1), roughness=0.91, bump_scale=5.8, bump_strength=0.31, variation=0.26, variation_scale=3.8, texture_profile="stone"),
        "back_wall_stone": material("HOME_MAT_back_wall_stone", (0.130, 0.110, 0.095, 1), roughness=0.93, bump_scale=5.8, bump_strength=0.30, variation=0.22, variation_scale=3.8, texture_profile="stone"),
        "back_wall_stone_accent": material("HOME_MAT_back_wall_stone_accent", (0.190, 0.090, 0.060, 1), roughness=0.89, bump_scale=5.6, bump_strength=0.30, variation=0.22, variation_scale=3.9, texture_profile="stone"),
        "arch_stone": material("HOME_MAT_arch_stone", (0.220, 0.190, 0.140, 1), roughness=0.87, bump_scale=5.4, bump_strength=0.29, variation=0.24, variation_scale=4.0, texture_profile="stone"),
        "stair_stone": material("HOME_MAT_stair_stone", (0.075, 0.085, 0.075, 1), roughness=0.92, bump_scale=5.2, bump_strength=0.26, variation=0.20, variation_scale=4.2, texture_profile="stone"),
        "stone_dark": material("HOME_MAT_stone_dark", (0.026, 0.025, 0.025, 1), roughness=0.95, bump_scale=7.2, bump_strength=0.19, variation=0.14, variation_scale=4.8, texture_profile="stone"),
        "floor_stone": material("HOME_MAT_floor_stone", (0.085, 0.098, 0.145, 1), roughness=0.93, bump_scale=8.2, bump_strength=0.18, variation=0.18, variation_scale=5.6, texture_profile="floor_stone"),
        "wood": material("HOME_MAT_wood", (0.060, 0.018, 0.007, 1), roughness=0.64, bump_scale=5.0, bump_strength=0.13, variation=0.29, variation_scale=2.2, grain=True, texture_profile="wood"),
        # A waxed, well-kept oak read (lower roughness, richer grain contrast)
        # instead of the flatter dark plank the table used to share with wall wood.
        "table_wood": material("HOME_MAT_table_wood", (0.052, 0.027, 0.019, 1), roughness=0.50, bump_scale=5.4, bump_strength=0.17, variation=0.34, variation_scale=2.0, grain=True, texture_profile="wood"),
        "library_wood": material("HOME_MAT_library_wood", (0.052, 0.020, 0.010, 1), roughness=0.72, bump_scale=5.0, bump_strength=0.12, variation=0.24, variation_scale=2.4, grain=True, texture_profile="wood"),
        "wood_wear": material("HOME_MAT_wood_wear", (0.105, 0.042, 0.016, 1), roughness=0.76, bump_scale=4.2, bump_strength=0.055, variation=0.10, variation_scale=3.4, grain=True, texture_profile="wood"),
        "brass": material("HOME_MAT_brass", (0.24, 0.115, 0.032, 1), roughness=0.46, metallic=0.70, texture_profile="metal"),
        "gold": material(
            "HOME_MAT_gold",
            (0.48, 0.27, 0.065, 1),
            roughness=0.44,
            metallic=0.76,
            emission=(0.045, 0.014, 0.002, 1),
            emission_strength=0.055,
            texture_profile="metal",
        ),
        "heraldry_gold": material(
            "HOME_MAT_heraldry_gold",
            (0.52, 0.27, 0.075, 1),
            roughness=0.40,
            metallic=0.52,
            emission=(0.075, 0.028, 0.004, 1),
            emission_strength=0.16,
            texture_profile="metal",
        ),
        "cat_fur": material("HOME_MAT_cat_fur", (0.90, 0.87, 0.82, 1), roughness=0.94, emission=(0.05, 0.046, 0.042, 1), emission_strength=0.04, bump_scale=90.0, bump_strength=0.035, variation=0.06, variation_scale=14.0, texture_profile="textile"),
        "cat_shade": material("HOME_MAT_cat_shade", (0.66, 0.64, 0.63, 1), roughness=0.96, emission=(0.035, 0.033, 0.032, 1), emission_strength=0.08),
        "gilt_plain": material("HOME_MAT_gilt_plain", (0.42, 0.20, 0.018, 1), roughness=0.42, emission=(0.34, 0.13, 0.008, 1), emission_strength=0.045),
        "gilt_light": material("HOME_MAT_gilt_light", (0.68, 0.40, 0.06, 1), roughness=0.34, emission=(0.50, 0.23, 0.025, 1), emission_strength=0.07),
        "cat_point": material("HOME_MAT_cat_point", (0.60, 0.54, 0.49, 1), roughness=0.95, emission=(0.03, 0.028, 0.026, 1), emission_strength=0.04),
        "cat_pink": material("HOME_MAT_cat_pink", (0.72, 0.36, 0.40, 1), roughness=0.7),
        "cat_dark": material("HOME_MAT_cat_dark", (0.03, 0.02, 0.02, 1), roughness=0.5),
        "sapphire": material("HOME_MAT_sapphire", (0.03, 0.12, 0.55, 1), roughness=0.18, emission=(0.03, 0.10, 0.50, 1), emission_strength=0.35),
        "plume_red": material("HOME_MAT_plume_red", (0.62, 0.035, 0.045, 1), roughness=0.72, bump_scale=14.0, bump_strength=0.05, variation=0.10, variation_scale=6.0, texture_profile="textile"),
        "armor_gold": material(
            "HOME_MAT_armor_gold",
            (0.74, 0.53, 0.14, 1),
            roughness=0.36,
            metallic=0.55,
            emission=(0.10, 0.065, 0.012, 1),
            emission_strength=0.10,
            texture_profile="metal",
        ),
        "brass_dark": material("HOME_MAT_brass_dark", (0.105, 0.052, 0.018, 1), roughness=0.50, metallic=0.60, texture_profile="metal"),
        # Hand-forged hearth iron should read nearly black in shadow, with enough
        # metallic response to catch firelight on worn edges instead of looking
        # like painted plastic.
        "forged_iron": material("HOME_MAT_forged_iron", (0.030, 0.026, 0.022, 1), roughness=0.72, metallic=0.58, bump_scale=8.0, bump_strength=0.08, texture_profile="metal"),
        "steel": material("HOME_MAT_steel", (0.14, 0.15, 0.16, 1), roughness=0.43, metallic=0.78, texture_profile="metal"),
        "armor_steel": material(
            "HOME_MAT_armor_steel",
            (0.440, 0.460, 0.500, 1),
            roughness=0.42,
            metallic=0.52,
            variation=0.10,
            variation_scale=5.4,
        texture_profile="metal"),
        "board_light": material("HOME_MAT_board_light", (0.36, 0.22, 0.12, 1), roughness=0.60, texture_profile="wood"),
        "board_dark": material("HOME_MAT_board_dark", (0.045, 0.019, 0.009, 1), roughness=0.64, texture_profile="wood"),
        "rug": material("HOME_MAT_rug", (0.235, 0.040, 0.026, 1), roughness=1.0, bump_scale=36.0, bump_strength=0.16, variation=0.17, variation_scale=9.0, texture_profile="textile"),
        "rug_worn": material("HOME_MAT_rug_worn", (0.182, 0.034, 0.024, 1), roughness=1.0, bump_scale=30.0, bump_strength=0.10, variation=0.07, variation_scale=6.2, texture_profile="textile"),
        "rug_fringe": material("HOME_MAT_rug_fringe", (0.30, 0.20, 0.12, 1), roughness=1.0),
        "rug_thread": material("HOME_MAT_rug_thread", (0.44, 0.255, 0.075, 1), roughness=0.82, metallic=0.03, bump_scale=24.0, bump_strength=0.035, variation=0.06, variation_scale=7.0, texture_profile="textile"),
        # Richer weave contrast so the drape reads as a heraldic banner rather
        # than a flat dark blob under the CONTINUAR label.
        "banner": material("HOME_MAT_banner", (0.165, 0.018, 0.024, 1), roughness=0.80, bump_scale=20.0, bump_strength=0.075, variation=0.16, variation_scale=7.4, texture_profile="textile"),
        "steam": material("HOME_MAT_steam", (0.62, 0.58, 0.52, 1), roughness=0.85, emission=(0.085, 0.078, 0.066, 1), emission_strength=0.05),
        "wall_banner": material(
            "HOME_MAT_wall_banner",
            (0.012, 0.012, 0.018, 1),
            roughness=0.95,
            bump_scale=22.0,
            bump_strength=0.055,
            variation=0.075,
            variation_scale=8.8,
        texture_profile="textile"),
        "bench_velvet": material(
            "HOME_MAT_bench_velvet",
            (0.190, 0.012, 0.024, 1),
            roughness=0.91,
            bump_scale=21.0,
            bump_strength=0.045,
            variation=0.080,
            variation_scale=8.5,
        texture_profile="textile"),
        "velvet_dark": material("HOME_MAT_velvet_dark", (0.048, 0.003, 0.005, 1), roughness=0.95, bump_scale=22.0, bump_strength=0.032, variation=0.055, variation_scale=9.0, texture_profile="textile"),
        "soot_stone": material("HOME_MAT_soot_stone", (0.040, 0.020, 0.012, 1), roughness=0.98, bump_scale=9.0, bump_strength=0.16, variation=0.14, variation_scale=5.5, texture_profile="stone"),
        "soot_haze": material("HOME_MAT_soot_haze", (0.030, 0.024, 0.020, 1), roughness=0.995, bump_scale=5.0, bump_strength=0.028, variation=0.055, variation_scale=4.6, texture_profile="stone"),
        "ash": material("HOME_MAT_ash", (0.082, 0.072, 0.062, 1), roughness=1.0, bump_scale=10.0, bump_strength=0.20, variation=0.22, variation_scale=7.0, texture_profile="stone"),
        "charcoal": material("HOME_MAT_charcoal", (0.012, 0.010, 0.009, 1), roughness=0.98, bump_scale=8.0, bump_strength=0.12, variation=0.10, variation_scale=6.5),
        "stone_grime": material("HOME_MAT_stone_grime", (0.034, 0.028, 0.024, 1), roughness=0.985, bump_scale=6.0, bump_strength=0.06, variation=0.06, variation_scale=3.5, texture_profile="stone"),
        # Plain flat colour with no bump/variation read as printed stickers on
        # the shelf, not bound leather -- these four never had either param set.
        # First pass (bump_scale=16, variation=0.16) barely moved the needle
        # in-render for the same reason the first stone-material pass didn't:
        # this room's AgX look + low ambient crush subtle variation almost
        # completely, and books also bake at a small 96-128px texture, so a
        # fine bump_scale just isn't visible at all. Bigger, blunter blotches.
        "book_green": material("HOME_MAT_book_green", (0.045, 0.165, 0.072, 1), roughness=0.80, bump_scale=5.0, bump_strength=0.16, variation=0.32, variation_scale=3.0, texture_profile="leather"),
        "book_brown": material("HOME_MAT_book_brown", (0.235, 0.098, 0.038, 1), roughness=0.80, bump_scale=5.0, bump_strength=0.16, variation=0.32, variation_scale=3.0, texture_profile="leather"),
        "book_red": material("HOME_MAT_book_red", (0.290, 0.030, 0.028, 1), roughness=0.80, bump_scale=5.0, bump_strength=0.16, variation=0.32, variation_scale=3.0, texture_profile="leather"),
        "book_olive": material("HOME_MAT_book_olive", (0.190, 0.160, 0.048, 1), roughness=0.80, bump_scale=5.0, bump_strength=0.16, variation=0.32, variation_scale=3.0, texture_profile="leather"),
        "book_black": material("HOME_MAT_book_black", (0.030, 0.024, 0.022, 1), roughness=0.82, bump_scale=5.0, bump_strength=0.16, variation=0.30, variation_scale=3.0, texture_profile="leather"),
        "book_oxblood": material("HOME_MAT_book_oxblood", (0.135, 0.014, 0.020, 1), roughness=0.82, bump_scale=5.0, bump_strength=0.16, variation=0.30, variation_scale=3.0, texture_profile="leather"),
        "book_tobacco": material("HOME_MAT_book_tobacco", (0.115, 0.058, 0.026, 1), roughness=0.82, bump_scale=5.0, bump_strength=0.16, variation=0.30, variation_scale=3.0, texture_profile="leather"),
        "book_vellum": material("HOME_MAT_book_vellum", (0.40, 0.31, 0.19, 1), roughness=0.82, bump_scale=5.0, bump_strength=0.16, variation=0.30, variation_scale=3.0, texture_profile="leather"),
        "piece_light": material(
            "HOME_MAT_piece_light",
            (0.38, 0.30, 0.22, 1),
            roughness=0.64,
            metallic=0.0,
            variation=0.040,
            variation_scale=7.0,
            texture_profile="wood",
        ),
        "piece_dark": material(
            "HOME_MAT_piece_dark",
            (0.013, 0.013, 0.016, 1),
            roughness=0.42,
            metallic=0.0,
            variation=0.045,
            variation_scale=6.4,
            texture_profile="wood",
        ),
        "piece_light_alt": material(
            "HOME_MAT_piece_light_alt",
            (0.345, 0.270, 0.198, 1),
            roughness=0.67,
            metallic=0.0,
            variation=0.038,
            variation_scale=7.2,
            texture_profile="wood",
        ),
        "piece_dark_alt": material(
            "HOME_MAT_piece_dark_alt",
            (0.011, 0.011, 0.014, 1),
            roughness=0.46,
            metallic=0.0,
            variation=0.042,
            variation_scale=6.6,
            texture_profile="wood",
        ),
        "leather": material("HOME_MAT_leather", (0.205, 0.042, 0.026, 1), roughness=0.70, bump_scale=18.0, bump_strength=0.055, variation=0.12, variation_scale=6.0, texture_profile="leather"),
        "paper": material("HOME_MAT_paper", (0.31, 0.22, 0.14, 1), roughness=0.97, variation=0.035, variation_scale=5.8, texture_profile="paper"),
        "wax": material("HOME_MAT_wax", (0.24, 0.15, 0.085, 1), roughness=0.96, texture_profile="wax"),
        "globe": material(
            "HOME_MAT_globe",
            (0.115, 0.185, 0.155, 1),
            roughness=0.78,
            texture_profile="globe",
        ),
        "plant": material("HOME_MAT_plant", (0.085, 0.200, 0.055, 1), roughness=0.82, texture_profile="leaf"),
        "ceramic": material("HOME_MAT_ceramic", (0.42, 0.37, 0.30, 1), roughness=0.68, bump_scale=7.0, bump_strength=0.035, variation=0.08, variation_scale=4.4),
        "dark": material("HOME_MAT_dark", (0.018, 0.012, 0.01, 1), roughness=0.9),
        "window": material(
            "HOME_MAT_window",
            (0.006, 0.020, 0.038, 1),
            roughness=0.56,
            emission=(0.010, 0.030, 0.060, 1),
            emission_strength=0.075,
            variation=0.07,
            variation_scale=4.6,
        ),
        "window_dim": material(
            "HOME_MAT_window_dim",
            (0.0045, 0.015, 0.030, 1),
            roughness=0.64,
            emission=(0.006, 0.020, 0.040, 1),
            emission_strength=0.045,
            variation=0.08,
            variation_scale=5.2,
        ),
        "garden_far": material("HOME_MAT_garden_far", (0.008, 0.016, 0.030, 1), roughness=0.9, emission=(0.008, 0.016, 0.034, 1), emission_strength=0.05),
        "garden_mid": material("HOME_MAT_garden_mid", (0.004, 0.018, 0.012, 1), roughness=0.9, emission=(0.004, 0.016, 0.010, 1), emission_strength=0.03),
        "garden_near": material("HOME_MAT_garden_near", (0.05, 0.13, 0.06, 1), roughness=0.9, emission=(0.05, 0.14, 0.07, 1), emission_strength=0.20),
        "garden_path": material("HOME_MAT_garden_path", (0.30, 0.31, 0.30, 1), roughness=0.8, emission=(0.22, 0.24, 0.30, 1), emission_strength=0.16),
        "moon": material(
            "HOME_MAT_moon",
            (0.42, 0.43, 0.40, 1),
            roughness=0.72,
            emission=(0.18, 0.19, 0.17, 1),
            emission_strength=0.065,
        ),
        "moon_mare": material(
            "HOME_MAT_moon_mare",
            (0.27, 0.285, 0.285, 1),
            roughness=0.86,
            emission=(0.10, 0.11, 0.11, 1),
            emission_strength=0.045,
        ),
        "fire": material(
            "HOME_MAT_fire",
            (0.34, 0.065, 0.004, 1),
            roughness=0.38,
            emission=(1.0, 0.12, 0.006, 1),
            emission_strength=0.045,
        ),
        "fire_hot": material(
            "HOME_MAT_fire_hot",
            (0.52, 0.18, 0.018, 1),
            roughness=0.36,
            emission=(0.72, 0.11, 0.004, 1),
            emission_strength=0.026,
        ),
    }

    # Canonical Great Hall blockout v2: reproduce the asymmetric visual masses
    # from great-hall-dungeon.webp before adding any decorative detail.
    # Split the floor so the Dungeon can actually descend below the Great Hall
    # rather than sitting on top of a solid slab.
    cube("HOME_ARCH_floor_back", (0, 5.80, -0.18), (9.35, 3.60, 0.18), materials["floor_stone"], bevel=0.032)
    cube("HOME_ARCH_floor_front_left", (-2.10, -1.10, -0.18), (7.25, 3.30, 0.18), materials["floor_stone"], bevel=0.032)
    add_floor_joint_network(
        "HOME_ARCH_floor_back_joint",
        0.0,
        5.80,
        9.35,
        3.60,
        0.004,
        materials["stone_dark"],
        tile_x=1.70,
        tile_y=1.10,
    )
    add_floor_joint_network(
        "HOME_ARCH_floor_front_joint",
        -2.10,
        -1.10,
        7.25,
        3.30,
        0.004,
        materials["stone_dark"],
        tile_x=1.62,
        tile_y=1.05,
    )
    cube("HOME_ARCH_back_wall", (0, 7.0, 3.2), (9.35, 0.25, 3.4), materials["back_wall_stone"], bevel=0.040)
    # The low-relief ashlar faces below already create natural recessed joints
    # through real depth and grazing shadow. Avoid a second perfectly straight
    # mortar grid over the same wall.

    # Shallow individual ashlar faces add parallax and catch grazing light.
    # They remain low-relief so the approved focal architecture stays dominant.
    for row, z in enumerate((0.42, 1.20, 1.98, 2.76, 3.54, 4.32, 5.10, 5.88)):
        offset = 0.76 if row % 2 else 0.0
        for col in range(-6, 7):
            jitter_x = (_hash01(col, row, 701) - 0.5) * 0.085
            bx = col * 1.48 + offset + jitter_x
            if abs(bx) > 8.65:
                continue
            block_width = 0.64 + _hash01(col, row, 709) * 0.085
            block_height = 0.295 + _hash01(col, row, 719) * 0.045
            block_y = 6.706 - _hash01(col, row, 727) * 0.014
            block = cube(
                f"HOME_ARCH_back_ashlar_{row}_{col}",
                (bx, block_y, z + (_hash01(col, row, 733) - 0.5) * 0.026),
                (block_width, 0.016, block_height),
                materials["back_wall_stone_accent"] if (row + col) % 5 == 0 else materials["back_wall_stone"],
                bevel=0.018,
            )
            block.rotation_euler[1] = math.radians((_hash01(col, row, 739) - 0.5) * 0.9)
    # (The dark soot-haze ellipses above both chimneys are gone: the wall there is plain stone.)

    cube("HOME_ARCH_left_wall", (-9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"], bevel=0.036)
    cube("HOME_ARCH_right_wall", (9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"], bevel=0.036)

    # A few hairline fractures break the pristine-CAD read without turning the
    # hall into a ruined castle. Keep them sparse, shallow and structurally plausible.
    for crack_index, points in enumerate((
        [(-8.55, 6.676, 4.92), (-8.42, 6.674, 4.74), (-8.50, 6.672, 4.56), (-8.36, 6.670, 4.39)],
        [(-5.48, 6.674, 1.82), (-5.35, 6.672, 1.66), (-5.43, 6.670, 1.49)],
        [(-0.18, 6.674, 5.34), (-0.08, 6.672, 5.18), (-0.16, 6.670, 5.04), (-0.04, 6.668, 4.91)],
        [(3.55, 6.674, 4.54), (3.69, 6.672, 4.37), (3.62, 6.670, 4.20)],
        [(8.54, 6.674, 2.58), (8.41, 6.672, 2.42), (8.48, 6.670, 2.24)],
    )):
        curve_tube(
            f"HOME_ARCH_back_crack_{crack_index}",
            points,
            0.008,
            materials["stone_dark"],
        )

    # The side walls need the same masonry scale as the rear wall. Low-relief
    # courses stop these large side masses reading as two perfect extruded boxes.
    for side in (-1, 1):
        wall_x = side * 9.02
        for row, z in enumerate((0.55, 1.32, 2.09, 2.86, 3.63, 4.40, 5.17)):
            y_offset = 0.48 if row % 2 else 0.0
            for col, y in enumerate((-0.1, 1.5, 3.1, 4.7, 6.3)):
                jy = (_hash01(col, row, 811 + side) - 0.5) * 0.11
                face = cube(
                    f"HOME_ARCH_side_ashlar_{side}_{row}_{col}",
                    (wall_x - side * 0.012, y + y_offset + jy, z),
                    (0.016, 0.68 + _hash01(col, row, 823 + side) * 0.08, 0.29 + _hash01(col, row, 829 + side) * 0.045),
                    materials["back_wall_stone_accent"] if (row + col) % 6 == 0 else materials["stone"],
                    bevel=0.014,
                )
                face.rotation_euler[0] = math.radians((_hash01(col, row, 839 + side) - 0.5) * 0.8)

    # The paving is one regular joint grid (add_floor_joint_network above) on the floor stone
    # material. Randomly sized, rotated and raised "slab" faces used to sit on top of it: they
    # matched neither the grid nor each other, so the floor read as badly laid.

    cube("HOME_ARCH_rug", (0, 1.95, 0.030), (3.55, 4.45, 0.030), materials["rug"], bevel=0.030)  # a thick pile, rounded edges
    for idx, (wx, wy, sx, sy, rot) in enumerate((
        (-0.42, -0.95, 1.10, 0.22, -6.0),
        (0.36, 0.02, 0.94, 0.19, 4.0),
        (-0.18, 4.26, 0.82, 0.17, -3.0),
    )):
        wear = sphere(
            f"HOME_PROP_rug_wear_{idx}",
            (wx, wy, 0.062),
            (sx, sy, 0.008),
            materials["rug_worn"],
        )
        wear.rotation_euler[2] = math.radians(rot)

    # Floor joints are authored in the packed floor-stone normal/roughness maps.
    # Keep geometry free of a second seam grid so the material scale remains
    # the single source of truth and does not produce a doubled CAD pattern.

    # Very restrained contact grime grounds the room where feet, walls and
    # traffic meet the stone. These are broad, low-contrast shapes, not decals.
    for idx, (gx, gy, sx, sy) in enumerate((
        (-8.72, 3.90, 0.20, 1.65),
        (8.72, 3.55, 0.20, 1.80),
        (-4.18, 0.92, 0.60, 0.20),
        (4.18, 0.96, 0.58, 0.20),
        (-3.25, 3.95, 0.54, 0.16),
        (7.48, 4.96, 0.52, 0.18),
        (-3.12, -0.42, 0.30, 0.17),
        (3.12, -0.42, 0.30, 0.17),
        (-4.66, 3.22, 0.34, 0.20),
    )):
        sphere(
            f"HOME_PROP_floor_contact_grime_{idx}",
            (gx, gy, 0.034),
            (sx, sy, 0.010),
            materials["stone_grime"],
        )

    # Woven ochre/gold thread reads as textile at grazing angles instead of
    # reflecting like a strip of polished brass laid on top of the rug.
    # No straight border/inner lines: they read as ruled CAD strokes on the rug. The pile is thick
    # and rough (textile bump) and aged with irregular worn patches.
    # (No fringe: the strands read as stray hairs at the rug's short ends.)
    for idx in range(9):
        px = -2.9 + _hash01(idx, 2, 6131) * 5.8
        py = -1.6 + _hash01(idx, 3, 6143) * 7.2
        patch = sphere(f"HOME_PROP_rug_patina_{idx}", (px, py, 0.061), (0.30 + _hash01(idx, 4, 6151) * 0.45, 0.20 + _hash01(idx, 5, 6161) * 0.35, 0.004), materials["rug_worn"])
        patch.rotation_euler[2] = math.radians(_hash01(idx, 6, 6173) * 180.0)
    add_rug_knight_tapestry(materials)
    add_royal_cat(materials)
    for row, y in enumerate((-0.42, 0.34)):
        for col, x in enumerate((-2.55, -1.70, -0.85, 0.0, 0.85, 1.70, 2.55)):
            motif = cube(
                f"HOME_PROP_rug_medallion_{row}_{col}",
                (x, y, 0.060),
                (0.055 + 0.010 * ((row + col) % 2), 0.055 + 0.010 * ((row + col) % 2), 0.010),
                materials["rug_thread"] if (row + col) % 3 == 0 else materials["stone_dark"],
            )
            motif.rotation_euler[2] = math.radians(45)
    rug_medallion_outer = cube(
        "HOME_PROP_rug_medallion_outer",
        (0.0, -0.72, 0.067),
        (0.46, 0.46, 0.009),
        materials["stone_dark"],
    )
    rug_medallion_outer.rotation_euler[2] = math.radians(45.0)
    rug_medallion_mid = cube(
        "HOME_PROP_rug_medallion_mid",
        (0.0, -0.72, 0.070),
        (0.28, 0.28, 0.008),
        materials["brass_dark"],
    )
    rug_medallion_mid.rotation_euler[2] = math.radians(45.0)
    rug_medallion_core = cube(
        "HOME_PROP_rug_medallion_core",
        (0.0, -0.72, 0.073),
        (0.11, 0.11, 0.007),
        materials["rug_thread"],
    )
    rug_medallion_core.rotation_euler[2] = math.radians(45.0)

    # Large canonical masses, left-to-right: fireplace, library, armor portal,
    # second fireplace, window and dungeon stair.
    for column_index, x in enumerate((-7.6, -4.8, -0.65, 2.85, 5.95, 8.25)):
        cube(f"HOME_ARCH_pilaster_back_{x}", (x, 6.78, 2.65), (0.42, 0.15, 2.55), materials["arch_stone"], bevel=0.045)
        cube(f"HOME_ARCH_pilaster_cap_{x}", (x, 6.62, 5.18), (0.56, 0.22, 0.16), materials["arch_stone"], bevel=0.045)
        column_radius = 0.248 + (_hash01(column_index, 0, 1901) - 0.5) * 0.010
        cylinder(f"HOME_ARCH_column_{x}", (x, 6.55, 2.6), column_radius, 5.2, materials["stone"], vertices=40)
        cylinder(f"HOME_ARCH_column_base_{x}", (x, 6.55, 0.25), 0.4, 0.5, materials["stone_dark"], vertices=36)
        cylinder(f"HOME_ARCH_column_ring_low_{x}", (x, 6.55, 0.70), 0.31, 0.12, materials["stone_dark"], vertices=28)
        cylinder(f"HOME_ARCH_column_ring_high_{x}", (x, 6.55, 4.70), 0.31, 0.12, materials["stone_dark"], vertices=28)
        for joint_index, joint_z in enumerate((1.46, 2.57, 3.68)):
            cylinder(
                f"HOME_ARCH_column_joint_{column_index}_{joint_index}",
                (
                    x,
                    6.548,
                    joint_z + (_hash01(column_index, joint_index, 1913) - 0.5) * 0.035,
                ),
                column_radius + 0.004,
                0.018,
                materials["back_wall_stone"],
                vertices=36,
            )
    cube("HOME_ARCH_upper_cornice", (0, 6.72, 5.62), (8.95, 0.20, 0.12), materials["wood"], bevel=0.045)

    add_fireplace("fireplace_left", -6.15, materials)
    fireplace_left_origin = Vector((-6.15, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_left" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_left_origin + (obj.location - fireplace_left_origin) * 0.90
            obj.scale *= 0.90
            if "_flame_" in obj.name or "_flame_hot_" in obj.name:
                # Match the right hearth contract: legacy tongues are depth glow
                # only. The foreground organic lobe cluster owns the silhouette.
                obj.scale.x *= 0.14
                obj.scale.z *= 0.07
                obj.location.y += 0.40
    # The generic helper still contributes a domestic horizontal mantel that
    # cuts through the pointed canonical opening. Remove only those legacy
    # cross-pieces; the custom Gothic surround below owns the visible facade.
    for legacy_name in (
        "HOME_PROP_fireplace_left_mantel",
        "HOME_PROP_fireplace_left_corbel_-1",
        "HOME_PROP_fireplace_left_corbel_1",
    ):
        legacy = bpy.data.objects.get(legacy_name)
        if legacy is not None:
            bpy.data.objects.remove(legacy, do_unlink=True)

    left_log_a = cube("HOME_PROP_fireplace_left_log_a", (-6.38, 5.72, 0.55), (0.40, 0.09, 0.065), materials["wood"], bevel=0.032)
    left_log_a.rotation_euler[2] = math.radians(9)
    left_log_b = cube("HOME_PROP_fireplace_left_log_b", (-5.94, 5.73, 0.58), (0.38, 0.09, 0.065), materials["wood"], bevel=0.032)
    left_log_b.rotation_euler[2] = math.radians(-11)
    cube("HOME_PROP_fireplace_left_ember_bed", (-6.15, 5.72, 0.47), (0.66, 0.10, 0.050), materials["fire"], bevel=0.04)

    # Canonical left hearth: the approved reference reads as a deep Gothic
    # fireplace, not a black void with a flame strip. Build a nested stone
    # opening and keep the fire/grate close to camera for a readable silhouette.
    cube(
        "HOME_PROP_fireplace_left_canon_firebox",
        (-6.15, 6.03, 1.25),
        (0.86, 0.065, 0.96),
        materials["soot_stone"],
        bevel=0.045,
    )
    for row, z in enumerate((0.72, 1.02, 1.32, 1.62)):
        cube(
            f"HOME_PROP_fireplace_left_firebox_course_{row}",
            (-6.15, 5.955, z),
            (0.76, 0.018, 0.014),
            materials["dark"],
            bevel=0.006,
        )
    for col, x in enumerate((-6.48, -6.15, -5.82)):
        cube(
            f"HOME_PROP_fireplace_left_firebox_joint_{col}",
            (x, 5.950, 1.18 + 0.10 * (col % 2)),
            (0.012, 0.016, 0.42),
            materials["dark"],
            bevel=0.004,
        )
    flat_panel(
        "HOME_PROP_fireplace_left_lancet_shadow",
        [
            (-6.99, 0.42), (-6.99, 2.22),
            (-6.15, 3.73),
            (-5.31, 2.22), (-5.31, 0.42),
        ],
        6.12,
        0.030,
        materials["soot_stone"],
        bevel=0.025,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_left_lancet_trim",
        -6.15,
        5.47,
        1.86,
        2.10,
        3.78,
        0.40,
        materials["stone_dark"],
        bevel=0.055,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_left_inner",
        -6.15,
        5.56,
        2.28,
        2.34,
        4.18,
        0.30,
        materials["soot_stone"],
        bevel=0.105,
    )
    # Centuries of use leave a soft plume above the throat, not a clean stone
    # halo. Keep it broad and low-contrast so it reads as smoke staining rather
    # than a decal pasted onto the Gothic surround.
    for idx, (sx, sz, px, pz, rot) in enumerate((
        (0.52, 0.18, -6.21, 3.52, -8.0),
        (0.34, 0.24, -6.04, 3.82, 11.0),
    )):
        haze = sphere(
            f"HOME_PROP_fireplace_left_soot_haze_{idx}",
            (px, 5.405, pz),
            (sx, 0.010, sz),
            materials["soot_haze"],
        )
        haze.rotation_euler[1] = math.radians(rot)
    for side in (-1, 1):
        px = -6.15 + side * 1.02
        cube(
            f"HOME_PROP_fireplace_left_jamb_{side}",
            (px, 5.60, 1.33),
            (0.15, 0.18, 1.08),
            materials["arch_stone"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_fireplace_left_jamb_cap_{side}",
            (px, 5.52, 2.40),
            (0.23, 0.22, 0.11),
            materials["stone_dark"],
            bevel=0.035,
        )
    for idx, dx in enumerate((-0.38, -0.13, 0.14, 0.39)):
        sphere(
            f"HOME_PROP_fireplace_left_ember_{idx}",
            (-6.15 + dx, 5.39, 0.585 + 0.010 * (idx % 2)),
            (0.115, 0.020, 0.036),
            materials["fire_hot"] if idx % 2 else materials["fire"],
        )
    add_point_light(
        "HOME_LIGHT_fireplace_left_inner",
        (-6.15, 5.12, 0.94),
        68,
        (1.0, 0.31, 0.075),
        radius=0.58,
    )
    # One continuous irregular flame silhouette reads as a hearth fire at
    # Home distance; separate lobes collapse into a row of candle-like spikes.
    sphere(
        "HOME_PROP_fireplace_left_front_ember_glow",
        (-6.15, 5.400, 0.700),
        (0.62, 0.026, 0.070),
        materials["fire"],
    )
    # Rounded overlapping lobes keep the fire organic at Home distance.
    # The old single polygon mass read as a row of pink triangular teeth.
    for idx, (dx, flame_w, flame_h, tilt) in enumerate((
        (-0.36, 0.11, 0.18, -8.0),
        (-0.17, 0.12, 0.27, 7.0),
        (0.03, 0.13, 0.36, -4.0),
        (0.22, 0.11, 0.25, 8.0),
        (0.38, 0.10, 0.17, -6.0),
    )):
        lobe = sphere(
            f"HOME_PROP_fireplace_left_front_flame_{idx}",
            (-6.15 + dx, 5.378, 0.76 + flame_h * 0.56),
            (flame_w, 0.028, flame_h),
            materials["fire"],
        )
        lobe.rotation_euler[1] = math.radians(tilt)
        inner = sphere(
            f"HOME_PROP_fireplace_left_front_hot_{idx}",
            (-6.15 + dx * 0.94, 5.342, 0.74 + flame_h * 0.34),
            (flame_w * 0.44, 0.019, flame_h * 0.46),
            materials["fire_hot"],
        )
        inner.rotation_euler[1] = math.radians(tilt * 0.45)

    for idx, (dx, radius, tongue_h, tilt) in enumerate((
        (-0.22, 0.070, 0.52, -6.0),
        (0.02, 0.085, 0.70, 3.0),
        (0.25, 0.065, 0.48, 8.0),
    )):
        tongue = sphere(
            f"HOME_PROP_fireplace_left_front_tongue_{idx}",
            (-6.15 + dx, 5.390, 0.72 + tongue_h * 0.50),
            (radius * 0.82, 0.030, tongue_h * 0.50),
            materials["fire"],
        )
        tongue.rotation_euler[1] = math.radians(tilt)

    for idx, gx in enumerate((-6.66, -6.40, -6.15, -5.90, -5.64)):
        curve_tube(
            f"HOME_PROP_fireplace_left_grate_bar_{idx}",
            [(gx, 5.30, 0.47), (gx, 5.30, 1.04)],
            0.018,
            materials["forged_iron"],
        )
    curve_tube(
        "HOME_PROP_fireplace_left_grate_top",
        [(-6.73, 5.30, 0.96), (-6.15, 5.28, 1.07), (-5.57, 5.30, 0.96)],
        0.024,
        materials["forged_iron"],
    )
    # A single lived-in hearth tool set gives the Great Hall a practical medieval
    # cue without mirroring decorative clutter around both fireplaces.
    add_hearth_tool_set("HOME_PROP_fireplace_left_tools", -7.36, 5.20, materials, mirror=-1.0)

    add_bookshelf(materials)
    add_library_sconces(materials)
    # The canon's library is a deep architectural bay, not a flat shelf wall.
    # Add a restrained carved surround without moving the shelf contents.
    for side in (-1, 1):
        cube(
            f"HOME_PROP_library_pilaster_{side}",
            (-2.65 + side * 1.63, 5.72, 2.58),
            (0.105, 0.18, 2.24),
            materials["wood"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_library_pilaster_cap_{side}",
            (-2.65 + side * 1.63, 5.64, 4.78),
            (0.18, 0.22, 0.12),
            materials["brass_dark"],
            bevel=0.035,
        )
    cube(
        "HOME_PROP_library_crown",
        (-2.65, 5.68, 4.92),
        (1.78, 0.20, 0.12),
        materials["wood"],
        bevel=0.045,
    )
    cube("HOME_PROP_armor_recess", (1.35, 6.72, 2.46), (0.95, 0.08, 1.78), materials["dark"], bevel=0.08)
    gothic_arch("HOME_ARCH_armor_portal", 1.35, 6.18, 2.55, 2.55, 4.72, 0.15, materials["arch_stone"])
    add_gothic_voussoirs(
        "HOME_ARCH_armor_voussoir",
        1.35,
        6.18,
        2.55,
        2.55,
        4.72,
        materials["arch_stone"],
        count_per_side=7,
    )
    gothic_arch(
        "HOME_ARCH_armor_inner_trim",
        1.35,
        6.03,
        2.04,
        2.62,
        4.43,
        0.36,
        materials["brass_dark"],
        bevel=0.045,
    )
    for side in (-1, 1):
        cube(
            f"HOME_PROP_armor_niche_jamb_{side}",
            (1.35 + side * 0.93, 6.08, 1.56),
            (0.075, 0.075, 1.18),
            materials["stone_dark"],
            bevel=0.025,
        )
    add_fireplace("fireplace_right", 4.45, materials)
    fireplace_origin = Vector((4.45, 6.10, 0.35))
    for obj in list(bpy.data.objects):
        if ("fireplace_right" in obj.name) and obj.type != "LIGHT":
            obj.location = fireplace_origin + (obj.location - fireplace_origin) * 1.20
            obj.scale *= 1.20
            if "_flame_" in obj.name or "_flame_hot_" in obj.name:
                # Keep legacy tongues buried as warm depth only; the canonical
                # foreground overlay owns the visible hearth silhouette.
                obj.scale.x *= 0.14
                obj.scale.z *= 0.07
                obj.location.y += 0.40
            if "_grate_" in obj.name:
                if obj.data and hasattr(obj.data, "materials"):
                    obj.data.materials.clear()
                    obj.data.materials.append(materials["forged_iron"])
                if "grate_cross" not in obj.name:
                    obj.scale.z *= 0.52
                    obj.location.z -= 0.15
    add_point_light("HOME_LIGHT_fireplace_right_boost", (4.55, 4.96, 1.18), 132, (1.0, 0.29, 0.060), radius=0.90)

    # The shared fireplace helper leaves a wide domestic mantel/corbel set.
    # Remove those foreground pieces so the authored Gothic surround owns the
    # silhouette while the helper still supplies the deep alcove and fire.
    for legacy_name in (
        "HOME_PROP_fireplace_right_mantel",
        "HOME_PROP_fireplace_right_corbel_-1",
        "HOME_PROP_fireplace_right_corbel_1",
        "HOME_PROP_fireplace_right_jamb_-1",
        "HOME_PROP_fireplace_right_jamb_1",
    ):
        legacy = bpy.data.objects.get(legacy_name)
        if legacy is not None:
            bpy.data.objects.remove(legacy, do_unlink=True)

    # Deep nested firebox: outer soot shadow, inner recess and stepped stone
    # surround. Narrower proportions match the canonical right-hand hearth.
    cube(
        "HOME_PROP_fireplace_right_canon_firebox",
        (4.45, 6.08, 1.22),
        (0.76, 0.075, 0.88),
        materials["soot_stone"],
        bevel=0.045,
    )
    cube(
        "HOME_PROP_fireplace_right_inner_firebox",
        (4.45, 5.91, 1.18),
        (0.61, 0.055, 0.68),
        materials["soot_stone"],
        bevel=0.035,
    )
    # Back wall of solid brick, like the left hearth: ten mortar courses and running-bond joints
    # (the smooth dark box used to wash out to a flat orange behind the fire).
    brick_h = 0.135
    course_z = [0.56 + i * brick_h for i in range(10)]
    for i, z in enumerate(course_z):
        cube(f"HOME_PROP_fireplace_right_brick_course_{i}", (4.45, 5.846, z), (0.585, 0.010, 0.0055), materials["dark"])
    for i in range(len(course_z) - 1):
        start = -0.585 + (0.15 if i % 2 else 0.0)
        joint = start + 0.30
        j = 0
        while joint < 0.585:
            cube(f"HOME_PROP_fireplace_right_brick_joint_{i}_{j}", (4.45 + joint, 5.846, course_z[i] + brick_h / 2.0), (0.0055, 0.010, brick_h / 2.0), materials["dark"])
            joint += 0.30
            j += 1
    gothic_arch(
        "HOME_ARCH_fireplace_right_canon_hood",
        4.45,
        5.42,
        2.45,
        2.52,
        3.78,
        0.28,
        materials["arch_stone"],
        bevel=0.080,
    )
    add_gothic_voussoirs(
        "HOME_ARCH_fireplace_right_voussoir",
        4.45,
        5.42,
        2.45,
        2.52,
        3.78,
        materials["arch_stone"],
        count_per_side=6,
    )
    gothic_arch(
        "HOME_ARCH_fireplace_right_inner_hood",
        4.45,
        5.31,
        1.86,
        2.23,
        3.28,
        0.42,
        materials["soot_stone"],
        bevel=0.040,
    )
    for idx, (sx, sz, px, pz, rot) in enumerate((
        (0.46, 0.16, 4.42, 3.45, 7.0),
        (0.30, 0.20, 4.58, 3.70, -10.0),
    )):
        haze = sphere(
            f"HOME_PROP_fireplace_right_soot_haze_{idx}",
            (px, 5.285, pz),
            (sx, 0.010, sz),
            materials["soot_haze"],
        )
        haze.rotation_euler[1] = math.radians(rot)
    cube(
        "HOME_PROP_fireplace_right_canon_mantel",
        (4.45, 5.18, 2.38),
        (1.17, 0.22, 0.13),
        materials["stone"],
        bevel=0.050,
    )
    for side in (-1, 1):
        px = 4.45 + side * 0.91
        cube(
            f"HOME_PROP_fireplace_right_canon_pilaster_{side}",
            (px, 5.37, 1.39),
            (0.15, 0.18, 1.14),
            materials["arch_stone"],
            bevel=0.045,
        )
        cube(
            f"HOME_PROP_fireplace_right_inner_jamb_{side}",
            (4.45 + side * 0.69, 5.24, 1.28),
            (0.075, 0.105, 0.86),
            materials["soot_stone"],
            bevel=0.028,
        )
        cube(
            f"HOME_PROP_fireplace_right_canon_cap_{side}",
            (px, 5.22, 2.39),
            (0.23, 0.22, 0.12),
            materials["stone"],
            bevel=0.040,
        )
        cube(
            f"HOME_PROP_fireplace_right_corbel_{side}",
            (4.45 + side * 1.01, 5.17, 2.18),
            (0.20, 0.20, 0.18),
            materials["stone_dark"],
            bevel=0.045,
        )
        for flute in (-0.055, 0.055):
            cube(
                f"HOME_PROP_fireplace_right_flute_{side}_{flute}",
                (px + flute, 5.175, 1.40),
                (0.020, 0.025, 0.78),
                materials["stone_dark"],
                bevel=0.008,
            )
    cube(
        "HOME_PROP_fireplace_right_canon_crest",
        (4.45, 5.09, 3.07),
        (0.30, 0.07, 0.20),
        materials["stone_dark"],
        bevel=0.055,
    )
    # "Reto del día": a parchment pinned to the crest plaque, rolled at both ends, sealed
    # with red wax and tied with a gold ribbon.
    scroll = cube("HOME_PROP_fireplace_right_daily_scroll", (4.45, 5.005, 3.07), (0.20, 0.010, 0.145), materials["paper"], bevel=0.004)
    scroll.rotation_euler[1] = math.radians(1.5)
    for tag, sz in (("top", 3.07 + 0.150), ("bottom", 3.07 - 0.150)):
        roll = cylinder(f"HOME_PROP_fireplace_right_daily_roll_{tag}", (4.45, 5.000, sz), 0.028, 0.46, materials["paper"], vertices=16)
        roll.rotation_euler[1] = math.radians(90.0)
    for line, lz in enumerate((3.14, 3.09, 3.04, 3.00)):
        cube(f"HOME_PROP_fireplace_right_daily_line_{line}", (4.45 - 0.02 * (line % 2), 4.992, lz), (0.13 - 0.03 * (line % 3), 0.003, 0.004), materials["dark"], bevel=0.001)
    seal = cylinder("HOME_PROP_fireplace_right_daily_seal", (4.45, 4.985, 2.945), 0.048, 0.014, materials["plume_red"], vertices=20)
    seal.rotation_euler[0] = math.radians(90.0)
    seal_ring = cylinder("HOME_PROP_fireplace_right_daily_seal_ring", (4.45, 4.980, 2.945), 0.036, 0.008, materials["gold"], vertices=20)
    seal_ring.rotation_euler[0] = math.radians(90.0)
    for side in (-1, 1):
        curve_tube(
            f"HOME_PROP_fireplace_right_daily_ribbon_{side}",
            [(4.45, 4.98, 2.92), (4.45 + side * 0.04, 4.98, 2.85), (4.45 + side * 0.08, 4.98, 2.78)],
            0.010,
            materials["gold"],
        )
    log_a = cube("HOME_PROP_fireplace_right_log_a", (4.24, 5.72, 0.57), (0.46, 0.10, 0.07), materials["wood"], bevel=0.035)
    log_a.rotation_euler[2] = math.radians(10)
    log_b = cube("HOME_PROP_fireplace_right_log_b", (4.66, 5.74, 0.60), (0.42, 0.10, 0.07), materials["wood"], bevel=0.035)
    log_b.rotation_euler[2] = math.radians(-12)
    cube("HOME_PROP_fireplace_right_ember_bed", (4.45, 5.72, 0.48), (0.72, 0.12, 0.055), materials["fire"], bevel=0.04)
    mantel_candle_heights = (0.28, 0.36, 0.30)
    mantel_candle_base_z = 2.55
    for idx, (cx, candle_height) in enumerate(zip((3.72, 4.45, 5.18), mantel_candle_heights)):
        cylinder(
            f"HOME_PROP_fireplace_right_mantel_candle_{idx}",
            (cx, 4.98, mantel_candle_base_z + candle_height / 2.0),
            0.042,
            candle_height,
            materials["wax"],
            vertices=18,
        )
        candle_top = mantel_candle_base_z + candle_height
        cylinder(
            f"HOME_PROP_fireplace_right_mantel_candle_rim_{idx}",
            (cx, 4.98, candle_top + 0.006),
            0.047,
            0.012,
            materials["wax"],
            vertices=18,
        )
        cylinder(
            f"HOME_PROP_fireplace_right_mantel_wick_{idx}",
            (cx, 4.98, candle_top + 0.026),
            0.006,
            0.032,
            materials["dark"],
            vertices=10,
        )
        sphere(
            f"HOME_PROP_fireplace_right_mantel_wax_drip_{idx}",
            (cx + (-0.030, 0.028, -0.026)[idx], 4.973, candle_top - 0.055),
            (0.012, 0.010, 0.050),
            materials["wax"],
        )
        cone(
            f"HOME_PROP_fireplace_right_mantel_flame_{idx}",
            (cx, 4.98, mantel_candle_base_z + candle_height + 0.055),
            0.030,
            0.006,
            0.090,
            materials["fire_hot"],
            vertices=12,
        )

    # The generic fireplace gets scaled for the canonical right-hand mass.
    # Reintroduce a camera-facing flame layer after that transform so the
    # hearth remains visibly alive instead of disappearing behind the grate.
    for idx, dx in enumerate((-0.44, -0.15, 0.15, 0.44)):
        sphere(
            f"HOME_PROP_fireplace_right_front_ember_{idx}",
            (4.45 + dx, 5.405, 0.690 + 0.010 * (idx % 2)),
            (0.125, 0.020, 0.038),
            materials["fire_hot"] if idx % 2 else materials["fire"],
        )
    for idx, (dx, flame_w, flame_h, tilt) in enumerate((
        (-0.32, 0.105, 0.13, -8.0),
        (-0.10, 0.115, 0.18, 6.0),
        (0.11, 0.110, 0.16, -4.0),
        (0.32, 0.100, 0.12, 8.0),
    )):
        base = sphere(
            f"HOME_PROP_fireplace_right_front_base_{idx}",
            (4.45 + dx, 5.390, 0.735),
            (flame_w * 1.10, 0.026, 0.060),
            materials["fire"],
        )
        base.rotation_euler[1] = math.radians(tilt * 0.18)
        lobe = sphere(
            f"HOME_PROP_fireplace_right_front_flame_{idx}",
            (4.45 + dx, 5.375, 0.72 + flame_h * 0.56),
            (flame_w, 0.026, flame_h),
            materials["fire"],
        )
        lobe.rotation_euler[1] = math.radians(tilt)
        inner = sphere(
            f"HOME_PROP_fireplace_right_front_hot_{idx}",
            (4.45 + dx * 0.96, 5.340, 0.70 + flame_h * 0.34),
            (flame_w * 0.43, 0.019, flame_h * 0.45),
            materials["fire_hot"],
        )
        inner.rotation_euler[1] = math.radians(tilt * 0.45)

    for idx, (dx, radius, tongue_h, tilt) in enumerate((
        (-0.17, 0.060, 0.43, -5.0),
        (0.06, 0.072, 0.56, 4.0),
        (0.27, 0.055, 0.38, 8.0),
    )):
        tongue = sphere(
            f"HOME_PROP_fireplace_right_front_tongue_{idx}",
            (4.45 + dx, 5.390, 0.72 + tongue_h * 0.50),
            (radius * 0.82, 0.030, tongue_h * 0.50),
            materials["fire"],
        )
        tongue.rotation_euler[1] = math.radians(tilt)

    # Front grate, mirroring the left hearth: the shared helper's grate sits behind the
    # flames (y 5.56) and vanishes, so the right fire looked unguarded.
    for idx, gx in enumerate((4.45 - 0.51, 4.45 - 0.255, 4.45, 4.45 + 0.255, 4.45 + 0.51)):
        curve_tube(
            f"HOME_PROP_fireplace_right_grate_front_bar_{idx}",
            [(gx, 5.30, 0.47), (gx, 5.30, 1.04)],
            0.018,
            materials["forged_iron"],
        )
    curve_tube(
        "HOME_PROP_fireplace_right_grate_front_top",
        [(4.45 - 0.58, 5.30, 0.96), (4.45, 5.28, 1.07), (4.45 + 0.58, 5.30, 0.96)],
        0.024,
        materials["forged_iron"],
    )

    for pane_index, (offset, half_width, z_shift, mat_name) in enumerate((
        (-0.64, 0.25, -0.015, "window_dim"),
        (-0.19, 0.145, 0.010, "window"),
        (0.19, 0.145, -0.006, "window_dim"),
        (0.64, 0.25, 0.018, "window"),
    )):
        pane = cube(
            f"HOME_ARCH_window_right_pane_{pane_index}",
            (7.82 + offset, 6.62, 3.72 + z_shift),
            (half_width, 0.065, 1.76),
            materials[mat_name],
            bevel=0.045,
        )
        pane.rotation_euler[2] = math.radians(
            (_hash01(pane_index, 0, 2003) - 0.5) * 0.45
        )
    # Canonical right window: tall Gothic lancets with clean mullions and
    # restrained tracery. Avoid the old criss-cross lattice that read as
    # branches/wires at Home scale.
    gothic_arch("HOME_ARCH_window_right_frame", 7.82, 6.48, 2.12, 3.15, 5.20, 1.80, materials["arch_stone"], bevel=0.105)
    gothic_arch("HOME_ARCH_window_right_inner_frame", 7.82, 6.43, 1.82, 3.18, 5.03, 1.92, materials["stone_dark"], bevel=0.035)
    for idx, offset in enumerate((-0.34, 0.0, 0.34)):
        cube(
            f"HOME_PROP_window_mullion_v_{idx}",
            (7.82 + offset, 6.40, 3.47),
            (0.024 if offset else 0.030, 0.040, 1.42),
            materials["brass_dark"],
            bevel=0.009,
        )
    for idx, z in enumerate((2.78, 3.46, 4.10)):
        cube(
            f"HOME_PROP_window_transom_{idx}",
            (7.82, 6.40, z),
            (0.76, 0.040, 0.022),
            materials["brass_dark"],
            bevel=0.009,
        )
    # Twin upper lancets and a small rose keep the silhouette architectural
    # instead of turning the glass into a diagonal cage.
    for side in (-1, 1):
        gothic_arch(
            f"HOME_PROP_window_lancet_{side}",
            7.82 + side * 0.36,
            6.39,
            0.54,
            4.22,
            4.92,
            3.96,
            materials["brass_dark"],
            bevel=0.024,
        )
    rose_points = [
        (
            7.82 + 0.23 * math.cos(i * math.tau / 24),
            6.385,
            4.72 + 0.23 * math.sin(i * math.tau / 24),
        )
        for i in range(25)
    ]
    curve_tube("HOME_PROP_window_rose", rose_points, 0.020, materials["brass_dark"])
    for idx, angle in enumerate((0.0, math.pi / 2, math.pi, math.pi * 1.5)):
        curve_tube(
            f"HOME_PROP_window_rose_spoke_{idx}",
            [
                (7.82, 6.382, 4.72),
                (7.82 + 0.19 * math.cos(angle), 6.382, 4.72 + 0.19 * math.sin(angle)),
            ],
            0.010,
            materials["brass_dark"],
        )
    cube("HOME_PROP_window_sill", (7.82, 6.20, 1.84), (1.10, 0.26, 0.11), materials["stone"], bevel=0.04)
    # The exterior seen through the glass, built as thin layers just behind the mullions:
    # night sky (the panes), stars and the moon, far hills, a tree line, then a lawn with
    # hedge, path and flowers. The moon used to sit on the wall beside the window.
    moon_x, moon_y, moon_z = 7.46, 6.530, 4.52
    sphere("HOME_PROP_window_moon", (moon_x, moon_y, moon_z), (0.20, 0.022, 0.20), materials["moon"])
    for idx, (dx, dz, rx, rz) in enumerate((
        (-0.065, 0.055, 0.065, 0.046),
        (0.045, 0.088, 0.042, 0.034),
        (0.015, -0.030, 0.058, 0.068),
        (0.088, -0.052, 0.034, 0.030),
        (-0.085, -0.072, 0.030, 0.042),
    )):
        rho = math.hypot(dx, dz)
        surface_y = moon_y - 0.022 * math.sqrt(max(0.0, 1.0 - (rho / 0.20) ** 2))
        sphere(f"HOME_PROP_window_moon_mare_{idx}", (moon_x + dx, surface_y + 0.001, moon_z + dz), (rx, 0.005, rz), materials["moon_mare"])
    for idx in range(16):
        sx = 7.02 + _hash01(idx, 0, 2101) * 1.10
        sz = 4.55 + _hash01(idx, 1, 2111) * 0.85
        if math.hypot(sx - moon_x, sz - moon_z) < 0.36:
            continue
        sphere(f"HOME_PROP_window_moon_star_{idx}", (sx, 6.535, sz), (0.011, 0.006, 0.011), materials["moon"])

    hill_pts = [(6.95 + 0.29 * k, 2.42 + 0.30 * math.sin(k * 0.9 + 0.6) + 0.10 * math.sin(k * 2.3)) for k in range(7)]
    hill_pts = [(6.95, 1.98)] + hill_pts + [(8.69, hill_pts[-1][1]), (8.69, 1.98)]
    flat_panel("HOME_PROP_window_garden_hills", hill_pts, 6.525, 0.02, materials["garden_far"], bevel=0.004)
    def lumpy(cx, cz, w, h, seed, n=22, rough=0.18):
        """Irregular foliage outline: a lobed, noisy ellipse (a plain ellipse read as a sphere)."""
        pts = []
        for k in range(n):
            a = k * math.tau / n
            r = 1.0 + rough * math.sin(3.0 * a + seed) * 0.8 + (_hash01(k, 7, seed + 2203) - 0.5) * rough * 1.4
            pts.append((cx + w / 2.0 * r * math.cos(a), cz + h / 2.0 * r * math.sin(a) * (0.86 if math.sin(a) < 0 else 1.0)))
        return pts

    # Distant tower with battlements on the far hill.
    tower = [(7.22, 2.35), (7.22, 3.28), (7.20, 3.28), (7.20, 3.36), (7.26, 3.36), (7.26, 3.31), (7.32, 3.31), (7.32, 3.36), (7.38, 3.36),
             (7.38, 3.28), (7.36, 3.28), (7.36, 2.35)]
    flat_panel("HOME_PROP_window_garden_tower", tower, 6.535, 0.02, materials["garden_far"], bevel=0.002)
    flat_panel("HOME_PROP_window_garden_tower_roof", [(7.17, 3.36), (7.29, 3.62), (7.41, 3.36)], 6.535, 0.02, materials["garden_far"], bevel=0.002)
    # Broadleaf trees: trunk, a few branches, a lobed crown built from three overlapping lumps,
    # and a moonlit rim on the upper left of each crown.
    for idx, (tx, crown_z, cw, ch) in enumerate(((7.05, 2.98, 0.50, 0.44), (7.56, 3.14, 0.62, 0.52), (8.34, 2.98, 0.52, 0.46))):
        cube(f"HOME_PROP_window_garden_trunk_{idx}", (tx, 6.50, crown_z - 0.34), (0.030, 0.020, 0.34), materials["garden_far"], bevel=0.006)
        for b, (bx, bz) in enumerate(((-0.16, 0.14), (0.15, 0.20), (0.0, 0.26))):
            curve_tube(f"HOME_PROP_window_garden_branch_{idx}_{b}", [(tx, 6.50, crown_z - 0.10), (tx + bx * 0.6, 6.50, crown_z + bz * 0.5), (tx + bx, 6.50, crown_z + bz)], 0.010, materials["garden_far"])
        for lump, (ox, oz, sw, sh) in enumerate(((0.0, 0.0, 1.0, 1.0), (-0.20, -0.05, 0.62, 0.66), (0.20, 0.05, 0.60, 0.70))):
            flat_panel(f"HOME_PROP_window_garden_crown_{idx}_{lump}", lumpy(tx + ox * cw, crown_z + oz * ch, cw * sw, ch * sh, 3100 + idx * 17 + lump), 6.505 - lump * 0.004, 0.030, materials["garden_mid"], bevel=0.004)
        rim = [(tx - cw * 0.34 + 0.16 * cw * math.cos(t), crown_z + ch * 0.14 + 0.32 * ch * math.sin(t)) for t in (1.9, 2.3, 2.7, 3.1, 3.5)]
        flat_panel(f"HOME_PROP_window_garden_crown_rim_{idx}", _polyline_strip(rim, 0.05), 6.485, 0.012, materials["garden_near"], bevel=0.002)
    # Conifers: sawtooth tiers.
    for idx, (cx, top_z, wdt) in enumerate(((7.82, 3.42, 0.15), (8.14, 3.05, 0.13))):
        half = []
        for tier in range(4):
            zt = top_z - tier * 0.20
            half += [(wdt * (0.35 + tier * 0.30), zt - 0.17), (wdt * (0.18 + tier * 0.30), zt - 0.15)]
        outline = [(cx, top_z)] + [(cx + hx, hz) for hx, hz in half] + [(cx + wdt * 1.5, top_z - 0.86)] + [(cx - wdt * 1.5, top_z - 0.86)] + [(cx - hx, hz) for hx, hz in reversed(half)]
        flat_panel(f"HOME_PROP_window_garden_conifer_{idx}", outline, 6.50 - idx * 0.003, 0.024, materials["garden_mid"], bevel=0.003)
        cube(f"HOME_PROP_window_garden_conifer_trunk_{idx}", (cx, 6.50, top_z - 0.94), (0.020, 0.018, 0.10), materials["garden_far"])
    lawn_pts = [(6.95, 1.98)] + [(6.95 + 0.29 * k, 2.30 + 0.05 * math.sin(k * 1.7)) for k in range(7)] + [(8.69, 2.28), (8.69, 1.98)]
    flat_panel("HOME_PROP_window_garden_lawn", lawn_pts, 6.48, 0.03, materials["garden_near"], bevel=0.004)
    flat_panel("HOME_PROP_window_garden_path", [(7.72, 1.98), (7.96, 2.30), (8.16, 2.30), (8.46, 1.98)], 6.47, 0.02, materials["garden_path"], bevel=0.003)
    for k in range(3):
        sx = 7.86 + k * 0.10 + (k % 2) * 0.03
        flat_panel(f"HOME_PROP_window_garden_stepstone_{k}", [(sx - 0.050, 2.05 + k * 0.07), (sx + 0.055, 2.05 + k * 0.07), (sx + 0.040, 2.10 + k * 0.07), (sx - 0.040, 2.10 + k * 0.07)], 6.462, 0.008, materials["garden_path"], bevel=0.001)
    # Clipped hedges with battlemented tops and round topiary, either side of the path.
    for idx, (x0, x1) in enumerate(((6.95, 7.62), (8.24, 8.69))):
        top = [(x0, 2.02)]
        x = x0
        step = 0.075
        while x < x1 - 1e-6:
            top += [(x, 2.32), (x + step * 0.55, 2.32), (x + step * 0.55, 2.28), (min(x + step, x1), 2.28)]
            x += step
        top += [(x1, 2.02)]
        flat_panel(f"HOME_PROP_window_garden_hedge_{idx}", top, 6.466, 0.030, materials["garden_mid"], bevel=0.003)
        sphere(f"HOME_PROP_window_garden_topiary_{idx}", ((x0 + x1) / 2.0, 6.462, 2.42), (0.075, 0.05, 0.075), materials["garden_near"], detail=(20, 10))
    # A garden lamp with a warm lantern.
    cube("HOME_PROP_window_garden_lamp_post", (8.10, 6.468, 2.62), (0.010, 0.010, 0.34), materials["dark"])
    sphere("HOME_PROP_window_garden_lamp", (8.10, 6.466, 3.02), (0.034, 0.030, 0.042), materials["fire"], detail=(16, 8))
    for idx in range(9):
        fx = 7.00 + _hash01(idx, 2, 2131) * 1.65
        if 7.7 < fx < 8.5:
            continue
        sphere(f"HOME_PROP_window_garden_flower_{idx}", (fx, 6.455, 2.08 + _hash01(idx, 3, 2141) * 0.14), (0.020, 0.010, 0.020), materials["plume_red"] if idx % 2 else materials["gold"])

    # Two banners only (five were too many): numbering the original five from the left, keep 2
    # (x -4.65, left of the shelf) and 4 (x 4.35, over the right hearth).
    # The left banner sits 0.45 further left than before: the bookshelf's edge hid its right half.
    for name, x in (("left", -5.10), ("right", 4.35)):
        add_banner(name, x, materials)

    add_table_and_board(materials)
    add_armor(materials)
    # Match the canonical suit: tall, narrow and ceremonial rather than a
    # broad toy-robot silhouette. Scale about the pedestal so its footprint
    # stays fixed while the upper body gains Gothic verticality.
    armor_origin = Vector((1.55, 5.28, 0.24))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HOME_PROP_armor_"):
            delta = obj.location - armor_origin
            obj.location = Vector((
                armor_origin.x + delta.x * 0.78,
                armor_origin.y + delta.y * 0.92 + 0.55,
                armor_origin.z + delta.z * 1.14,
            ))
            obj.scale.x *= 0.78
            obj.scale.y *= 0.92
            obj.scale.z *= 1.14
    # Armour overlays are viewed from camera-side (-Y). flat_panel's default
    # polygon winding points the front-face normals toward +Y, which made the
    # focal metal render nearly black despite dedicated key/rim lights.
    def armor_panel(name, points_xz, y, depth, mat, *, bevel=0.03):
        narrowed = [
            (1.55 + (px - 1.55) * 0.90, pz)
            for px, pz in reversed(points_xz)
        ]
        return flat_panel(name, narrowed, y, depth, mat, bevel=bevel)

    # Keep the dark drapery as a recess accent rather than a rectangular cape
    # behind the helmet. The canonical suit must read as articulated metal first.
    armor_panel(
        "HOME_PROP_armor_cape",
        [(1.17, 2.62), (1.93, 2.62), (1.86, 0.92), (1.55, 0.66), (1.24, 0.92)],
        5.82,
        0.040,
        materials["velvet_dark"],
        bevel=0.025,
    )
    chest_outline = [(1.24, 2.78), (1.86, 2.78), (1.82, 2.43), (1.70, 2.12), (1.55, 1.96), (1.40, 2.12), (1.28, 2.43), (1.24, 2.78)]
    # Gold cross on the breastplate, laid over the barrel chest so it follows the
    # curve (post-transform space: the chest is an ellipsoid centred at
    # (1.55, 5.83, 2.61) with semi-axes 0.343 x 0.248 x 0.388).
    def chest_surface_y(dx, dz):
        inside = max(0.0, 1.0 - (dz / 0.422) ** 2 - (dx / 0.406) ** 2)
        return 5.83 - 0.276 * math.sqrt(inside) - 0.014

    curve_tube(
        "HOME_PROP_armor_chest_cross_v",
        [(1.55, chest_surface_y(0.0, dz), 2.611 + dz) for dz in (-0.34, -0.17, 0.0, 0.17, 0.34)],
        0.013,
        materials["armor_gold"],
    )
    curve_tube(
        "HOME_PROP_armor_chest_cross_h",
        [(1.55 + dx, chest_surface_y(dx, 0.10), 2.711) for dx in (-0.34, -0.17, 0.0, 0.17, 0.34)],
        0.013,
        materials["armor_gold"],
    )
    # Belt lames: three overlapping plates, each with a gold hem, over a dark backing so
    # the gaps read as separate pieces instead of one solid skirt. Below the belt the
    # legs are dressed by two separate tassets with a dark gap between them.
    cube("HOME_PROP_armor_fauld_backing", (1.55, 5.53, 1.74), (0.40, 0.020, 0.30), materials["velvet_dark"], bevel=0.012)
    for idx, (z, half_w) in enumerate(((1.92, 0.36), (1.82, 0.385), (1.72, 0.37))):
        cube(
            f"HOME_PROP_armor_fauld_{idx}",
            (1.55, 5.47, z),
            (half_w, 0.030, 0.046),
            materials["armor_steel"],
            bevel=0.018,
        )
        cube(
            f"HOME_PROP_armor_fauld_hem_{idx}",
            (1.55, 5.44, z - 0.048),
            (half_w * 0.98, 0.012, 0.007),
            materials["armor_gold"],
            bevel=0.004,
        )

    for side in (-1, 1):
        # Sharp pauldron overlay masks the spherical construction underneath.
        px = 1.55 + side * 0.42
        if side < 0:
            pauldron_points = [
                (1.35, 2.46), (1.15, 2.45), (1.02, 2.35),
                (1.10, 2.25), (1.30, 2.27),
            ]
        else:
            pauldron_points = [
                (1.75, 2.46), (1.95, 2.45), (2.08, 2.35),
                (2.00, 2.25), (1.80, 2.27),
            ]

        # Separate upper-arm and forearm plates preserve the elbow break.
        if side < 0:
            upper_arm = [
                (1.18, 2.31), (1.07, 2.27), (0.99, 2.04),
                (1.03, 1.94), (1.12, 1.98), (1.25, 2.24),
            ]
            forearm = [
                (1.04, 1.91), (0.98, 1.84), (1.00, 1.64),
                (1.08, 1.57), (1.16, 1.67), (1.14, 1.86),
            ]
        else:
            upper_arm = [
                (1.92, 2.31), (2.03, 2.27), (2.11, 2.04),
                (2.07, 1.94), (1.98, 1.98), (1.85, 2.24),
            ]
            forearm = [
                (2.06, 1.91), (2.12, 1.84), (2.10, 1.64),
                (2.02, 1.57), (1.94, 1.67), (1.96, 1.86),
            ]
        armor_panel(
            f"HOME_PROP_armor_arm_plate_{side}",
            upper_arm,
            5.590,
            0.032,
            materials["armor_steel"],
            bevel=0.022,
        )
        armor_panel(
            f"HOME_PROP_armor_forearm_plate_{side}",
            forearm,
            5.600,
            0.030,
            materials["armor_steel"],
            bevel=0.020,
        )

        cx = 1.55 + side * 0.156

        tx = 1.55 + side * 0.205
        armor_panel(
            f"HOME_PROP_armor_tasset_front_{side}",
            [
                (tx - 0.125, 1.82), (tx + 0.125, 1.82),
                (tx + 0.105, 1.52), (tx, 1.42), (tx - 0.105, 1.52),
            ],
            5.585,
            0.032,
            materials["armor_steel"],
            bevel=0.025,
        )
        tasset_outline = [
            (tx - 0.125, 1.82), (tx + 0.125, 1.82), (tx + 0.105, 1.52), (tx, 1.42), (tx - 0.105, 1.52), (tx - 0.125, 1.82),
        ]
        curve_tube(
            f"HOME_PROP_armor_tasset_trim_{side}",
            [(1.55 + (px_ - 1.55) * 0.90, 5.552, pz_) for px_, pz_ in tasset_outline],
            0.010,
            materials["armor_gold"],
        )

        curve_tube(
            f"HOME_PROP_armor_greave_ridge_{side}",
            [(cx, 5.635, 0.63), (cx, 5.625, 1.18), (cx, 5.620, 1.30)],
            0.016,
            materials["armor_gold"],
        )

    add_trophy(materials)
    add_side_furnishings(materials)
    add_stairs(materials)

    # Chandelier: keep the same authored identity but lift and tighten it so it
    # frames the focal wall instead of masking the armour and central banner.
    cylinder("HOME_PROP_chandelier_drop", (0, 2.20, 5.68), 0.034, 0.64, materials["brass_dark"])
    ring_points = []
    for i in range(25):
        angle = i * math.tau / 24
        radial = 1.12 + (_hash01(i, 0, 1601) - 0.5) * 0.035
        depth = 0.64 + (_hash01(i, 1, 1607) - 0.5) * 0.024
        ring_points.append((
            radial * math.cos(angle),
            2.20 + depth * math.sin(angle),
            4.92 + 0.13 * math.sin(angle) + (_hash01(i, 2, 1613) - 0.5) * 0.014,
        ))
    curve_tube("HOME_PROP_chandelier_ring", ring_points, 0.032, materials["brass_dark"])
    inner_ring = []
    for i in range(25):
        angle = i * math.tau / 24
        radial = 0.75 + (_hash01(i, 3, 1621) - 0.5) * 0.024
        depth = 0.43 + (_hash01(i, 4, 1627) - 0.5) * 0.018
        inner_ring.append((
            radial * math.cos(angle),
            2.20 + depth * math.sin(angle),
            4.89 + 0.10 * math.sin(angle) + (_hash01(i, 5, 1637) - 0.5) * 0.010,
        ))
    curve_tube("HOME_PROP_chandelier_inner_ring", inner_ring, 0.021, materials["brass"])
    lower_outer_ring = [
        (x, y, z - 0.10 + (_hash01(i, 6, 1643) - 0.5) * 0.008)
        for i, (x, y, z) in enumerate(ring_points)
    ]
    curve_tube("HOME_PROP_chandelier_lower_ring", lower_outer_ring, 0.021, materials["brass_dark"])
    for idx in range(8):
        angle = idx * math.tau / 8.0
        x = 1.12 * math.cos(angle)
        y = 2.20 + 0.64 * math.sin(angle)
        z_mid = 4.87 + 0.13 * math.sin(angle)
        curve_tube(
            f"HOME_PROP_chandelier_dropbar_{idx}",
            [(x, y, z_mid - 0.07), (x, y, z_mid + 0.07)],
            0.012,
            materials["brass_dark"],
        )
    for idx, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        curve_tube(
            f"HOME_PROP_chandelier_spoke_{idx}",
            [
                (0.0, 2.20, 4.88),
                (1.00 * math.cos(angle), 2.20 + 0.57 * math.sin(angle), 4.88),
            ],
            0.017,
            materials["brass_dark"],
        )
    for idx, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        rx = 0.88 * math.cos(angle)
        ry = 2.28 + 0.54 * math.sin(angle)
        curve_tube(
            f"HOME_PROP_chandelier_chain_{idx}",
            [(0.0, 2.20, 5.98), (rx, ry, 5.08)],
            0.020,
            materials["brass_dark"],
        )
    sphere("HOME_PROP_chandelier_hub", (0, 2.20, 4.89), (0.080, 0.080, 0.074), materials["brass_dark"])
    for idx in range(8):
        angle = idx * math.tau / 8.0
        radial_jitter = (_hash01(idx, 0, 1501) - 0.5) * 0.045
        tangential_jitter = (_hash01(idx, 1, 1511) - 0.5) * 0.030
        cx = (1.04 + radial_jitter) * math.cos(angle) - tangential_jitter * math.sin(angle)
        cy = 2.20 + (0.60 + radial_jitter * 0.45) * math.sin(angle) + tangential_jitter * math.cos(angle)
        cz = 4.96 + 0.12 * math.sin(angle) + (_hash01(idx, 2, 1523) - 0.5) * 0.035
        candle_height = 0.215 + _hash01(idx, 3, 1531) * 0.055
        cylinder(
            f"HOME_PROP_chandelier_candle_{idx}",
            (cx, cy, cz + candle_height * 0.5 + 0.025),
            0.033 + _hash01(idx, 4, 1543) * 0.004,
            candle_height,
            materials["wax"],
            vertices=16,
        )
        candle_top = cz + candle_height + 0.025
        cylinder(
            f"HOME_PROP_chandelier_candle_rim_{idx}",
            (cx, cy, candle_top + 0.006),
            0.038 + _hash01(idx, 5, 1553) * 0.004,
            0.012,
            materials["wax"],
            vertices=16,
        )
        cylinder(
            f"HOME_PROP_chandelier_wick_{idx}",
            (cx, cy, candle_top + 0.023),
            0.006,
            0.030,
            materials["dark"],
            vertices=10,
        )
        if idx % 2 == 0:
            sphere(
                f"HOME_PROP_chandelier_wax_drip_{idx}",
                (cx + 0.027 * math.cos(angle), cy + 0.027 * math.sin(angle), candle_top - candle_height * 0.28),
                (0.011, 0.010, 0.042),
                materials["wax"],
            )
        cone(
            f"HOME_PROP_chandelier_flame_{idx}",
            (cx, cy, candle_top + 0.050),
            0.024,
            0.005,
            0.075,
            materials["fire_hot"],
            vertices=12,
        )
        cylinder(f"HOME_PROP_chandelier_cup_{idx}", (cx, cy, cz + 0.025), 0.060, 0.050, materials["brass_dark"], vertices=16)
        add_point_light(f"HOME_LIGHT_chandelier_{idx}", (cx, cy - 0.05, candle_top + 0.070), 12, (1.0, 0.32, 0.08), radius=0.22)

    # Side chandeliers are intentionally partial in frame, matching the master.
    for side in (-1, 1):
        cx = side * 7.65
        curve_tube(
            f"HOME_PROP_side_chandelier_{side}",
            [
                (cx + 0.82 * math.cos(i * math.tau / 18), 1.65 + 0.42 * math.sin(i * math.tau / 18), 5.02)
                for i in range(19)
            ],
            0.045,
            materials["brass"],
        )

    for idx, x in enumerate((-8.0, -4.15, 2.45, 7.95)):
        mount_z = 2.43 + (_hash01(idx, 0, 1801) - 0.5) * 0.10
        candle_half = 0.155 + _hash01(idx, 1, 1811) * 0.040
        candle_center_z = mount_z + 0.32 + candle_half
        flame_h = 0.12 + _hash01(idx, 2, 1823) * 0.055
        flame_center_z = candle_center_z + candle_half + flame_h * 0.55

        cube(
            f"HOME_PROP_torch_{idx}",
            (x, 6.02, mount_z),
            (0.06, 0.08, 0.34),
            materials["brass_dark"],
            bevel=0.025,
        )
        cube(
            f"HOME_PROP_torch_candle_{idx}",
            (x, 5.96, candle_center_z),
            (0.043 + _hash01(idx, 3, 1831) * 0.004, 0.043, candle_half),
            materials["paper"],
            bevel=0.012,
        )
        flame = cone(
            f"HOME_PROP_torch_flame_{idx}",
            (x, 5.94, flame_center_z),
            0.040 + _hash01(idx, 4, 1847) * 0.008,
            0.008,
            flame_h,
            materials["fire_hot"],
            vertices=12,
        )
        flame.rotation_euler[1] = math.radians((_hash01(idx, 5, 1861) - 0.5) * 8.0)
        add_point_light(
            f"HOME_LIGHT_torch_{idx}",
            (x, 5.62, flame_center_z + 0.02),
            50 + _hash01(idx, 6, 1871) * 8,
            (1.0, 0.34, 0.085),
            radius=0.38,
        )

    # Global lights establish readable stone/wood while practicals keep the
    # warmth local. Cool right-side fill hints at the window/exterior.
    add_area_light("HOME_LIGHT_key", (-3.8, -2.0, 6.5), 36, (0.56, 0.50, 0.44), 4.2, target=(0, 2.4, 1.6))
    add_area_light("HOME_LIGHT_fill", (5.4, 0.6, 5.0), 9, (0.11, 0.24, 0.44), 3.8, target=(1.8, 3.0, 1.8))
    add_area_light(
        "HOME_LIGHT_window_moon",
        (7.70, 5.92, 4.45),
        28,
        (0.16, 0.28, 0.46),
        2.15,
        target=(4.35, 1.85, 1.25),
    )
    add_area_light("HOME_LIGHT_back", (0, 7.0, 5.8), 62, (0.62, 0.34, 0.22), 3.2, target=(0, 2.5, 2.2))
    add_area_light("HOME_LIGHT_floor_bounce", (0, -3.2, 2.6), 31, (0.30, 0.18, 0.12), 6.2, target=(0, 1.4, 0.15))
    add_area_light("HOME_LIGHT_hearth_bounce_left", (-5.45, 3.35, 3.15), 72, (1.0, 0.34, 0.12), 3.4, target=(-2.5, 2.0, 1.35))
    add_area_light("HOME_LIGHT_hearth_bounce_right", (4.35, 3.45, 3.10), 64, (1.0, 0.31, 0.10), 3.0, target=(1.45, 2.0, 1.30))
    # The stair lanterns light the treads in the runtime; without this the beauty
    # render buried the new runner and brass nosings in black.
    add_area_light("HOME_LIGHT_stair_lanterns", (6.0, 0.9, 1.9), 14, (1.0, 0.46, 0.18), 2.4, target=(6.5, -0.2, 0.3))
    add_area_light("HOME_LIGHT_moon", (8.4, 4.2, 5.6), 225, (0.14, 0.34, 0.68), 3.9, target=(3.2, 2.2, 1.8))
    add_area_light("HOME_LIGHT_table_read", (0.0, -3.0, 5.8), 194, (1.0, 0.68, 0.42), 2.75, target=(0, 1.0, 1.25))
    add_area_light("HOME_LIGHT_drape_read", (0.0, -5.0, 2.8), 142, (0.90, 0.49, 0.23), 2.0, target=(0, -0.72, 0.30))
    add_area_light("HOME_LIGHT_library_read", (-4.6, 2.8, 5.4), 90, (0.74, 0.40, 0.22), 2.2, target=(-2.65, 5.9, 2.6))
    add_area_light("HOME_LIGHT_fireplace_left_pool", (-6.15, 3.65, 3.4), 190, (1.0, 0.37, 0.11), 2.2, target=(-6.15, 5.65, 1.35))
    add_area_light("HOME_LIGHT_fireplace_right_pool", (4.45, 3.65, 3.5), 255, (1.0, 0.37, 0.11), 2.25, target=(4.45, 5.65, 1.45))
    add_area_light("HOME_LIGHT_armor_rim", (4.8, 3.4, 5.2), 150, (0.42, 0.52, 0.66), 2.3, target=(1.55, 5.28, 2.4))
    add_area_light("HOME_LIGHT_armor_warm", (-0.8, 2.6, 4.2), 96, (0.82, 0.52, 0.28), 2.1, target=(1.55, 5.28, 2.35))
    add_area_light("HOME_LIGHT_armor_front", (1.1, 1.2, 4.9), 68, (0.66, 0.72, 0.78), 1.65, target=(1.55, 5.28, 2.40))

    if engine == "eevee":
        configure_cinematic_compositor(scene)

    camera_data = bpy.data.cameras.new("HOME_CAMERA_CANONICAL")
    camera_data.lens = 50.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("HOME_CAMERA_CANONICAL", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -16.0, 4.85)
    target = (0.0, 2.30, 1.55)
    look_at(camera, target)
    scene.camera = camera

    try:
        scene.view_settings.exposure = -0.20
    except Exception:
        pass
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.look = "Medium High Contrast"
        except Exception:
            pass
    return scene, camera, target, reference_width, reference_height, render_width, render_height


def render(scene, path: Path) -> None:
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    if os.environ.get("HOME_VALIDATE_VECTOR_TEXTURES") == "1":
        _validate_surface_height_vectorization()
    root = Path.cwd()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    reference_source = (root / args.reference).resolve()
    if not reference_source.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference_source}")
    reference = materialize_reference(reference_source, out_dir)

    scene, camera, target, width, height, render_width, render_height = build_scene(reference, args.samples, args.max_width, args.engine)

    blend_path = out_dir / "home-v2-blockout.blend"
    beauty_path = out_dir / "home-v2-preview.png"
    clay_path = out_dir / "home-v2-clay.png"
    metadata_path = out_dir / "home-v2-camera.json"

    render(scene, beauty_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    clay = material("HOME_MAT_clay_override", (0.34, 0.30, 0.26, 1), roughness=0.88)
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data.materials:
            obj.data.materials.clear()
            obj.data.materials.append(clay)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    render(scene, clay_path)

    metadata = {
        "contract": CONTRACT,
        "reference": args.reference,
        "reference_contract": "user-approved-home-canon-2026-09-18",
        "texture_scale": preview_texture_scale(),
        "reference_size": [width, height],
        "render_size": [render_width, render_height],
        "canon_full_size": [1672, 941],
        "engine": args.engine,
        "camera": {
            "name": camera.name,
            "lens_mm": camera.data.lens,
            "sensor_width_mm": camera.data.sensor_width,
            "position": [round(v, 6) for v in camera.location],
            "rotation_euler": [round(v, 6) for v in camera.rotation_euler],
            "target": list(target),
        },
        "object_count": len(bpy.data.objects),
        "named_groups": {
            "architecture": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_ARCH_")),
            "props": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_PROP_")),
            "lights": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_LIGHT_")),
        },
        "notes": [
            "The 2026-09-18 user-approved mock is the visual source of truth.",
            "The current runtime Home is intentionally untouched and remains the rollback baseline.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contract": CONTRACT, "output": str(out_dir), "objects": metadata["object_count"]}))


if __name__ == "__main__":
    main()