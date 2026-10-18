"""Pure grouping contracts for Home Blender's static material batches.

Keep this module independent of bpy so signature equivalence has fast tests.
Actual mesh joining and per-material polygon checks stay in the exporter.
"""


def static_material_batch_key(slots):
    """Group identical opaque material *sets* even if Blender slot order differs.

    Each slot is (material_name, is_opaque). Anything ambiguous keeps the
    exporter's historic ordered signature to protect transparent draw order
    and duplicate/unnamed slots.
    """
    slots = tuple(slots)
    names = tuple(name for name, _ in slots)
    if (
        len(names) > 1
        and all(name and opaque for name, opaque in slots)
        and len(set(names)) == len(names)
    ):
        return ("opaque-set", tuple(sorted(names)))
    return ("ordered", names)


def avoided_ordered_meshes(ordered_signatures):
    """Exact reduction in static batch nodes versus the ordered-key baseline."""
    return max(0, len(set(tuple(names) for names in ordered_signatures)) - 1)
