#!/usr/bin/env python3
"""Exercise a real Eevee render context for the shared Blender CI runtime."""
from __future__ import annotations

import os
from pathlib import Path

import bpy


scene = bpy.context.scene
engine_property = scene.bl_rna.properties["render"].fixed_type.properties["engine"]
available = {item.identifier for item in engine_property.enum_items}
for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    if candidate in available:
        scene.render.engine = candidate
        break
else:
    raise RuntimeError(f"no supported Eevee engine available: {sorted(available)}")

output = Path(os.environ.get("BLENDER_SMOKE_OUTPUT", "/tmp/blender-setup-smoke.png"))
output.parent.mkdir(parents=True, exist_ok=True)
scene.render.resolution_x = 16
scene.render.resolution_y = 16
scene.render.resolution_percentage = 100
scene.render.filepath = str(output)
scene.render.image_settings.file_format = "PNG"

bpy.ops.render.render(write_still=True)
if not output.is_file() or output.stat().st_size < 100:
    raise RuntimeError(f"Blender smoke render did not produce a valid PNG: {output}")

print(f"Blender EGL smoke OK · engine={scene.render.engine} · bytes={output.stat().st_size}")
