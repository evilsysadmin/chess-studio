#!/usr/bin/env python3
"""Install a capability-aware Blender 5.2 EEVEE premium profile for review renders."""
from __future__ import annotations

import os

import bpy


_TRUE_VALUES = {"1", "true", "yes", "on"}


def _enabled(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in _TRUE_VALUES


def _set_if_supported(target, name: str, value, applied: list[str]) -> None:
    if hasattr(target, name):
        setattr(target, name, value)
        applied.append(f"{name}={value}")


def apply_eevee_review_profile(scene) -> None:
    if scene.render.engine not in {"BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"}:
        return

    eevee = getattr(scene, "eevee", None)
    if eevee is None:
        print("EEVEE premium profile: scene has no EEVEE settings")
        return

    samples = max(1, int(os.environ.get("BLENDER_PREVIEW_SAMPLES", "32")))
    applied: list[str] = []
    _set_if_supported(eevee, "taa_render_samples", samples, applied)
    scene.render.use_persistent_data = True
    applied.append("persistent_data=True")

    if _enabled("BLENDER_EEVEE_PREMIUM"):
        for name, value in (
            ("use_raytracing", True),
            ("ray_tracing_method", "SCREEN"),
            ("use_fast_gi", True),
            ("fast_gi_method", "GLOBAL_ILLUMINATION"),
            ("fast_gi_resolution", "2"),
            ("fast_gi_ray_count", 4),
            ("fast_gi_step_count", 16),
            ("fast_gi_quality", 0.5),
            ("use_overscan", True),
            ("overscan_size", 5.0),
            ("shadow_ray_count", 2),
            ("shadow_step_count", 8),
        ):
            _set_if_supported(eevee, name, value, applied)

    print("EEVEE review profile:", ", ".join(applied) or "defaults")


def _render_pre(scene, *_args) -> None:
    apply_eevee_review_profile(scene)


# Apply only immediately before a render. This keeps review-quality settings
# out of editable .blend state and runtime GLB generation.
if _render_pre not in bpy.app.handlers.render_pre:
    bpy.app.handlers.render_pre.append(_render_pre)
