"""Premium integrated weapon geometry for Pawn Slug Matthias."""
import math

from pawn_slug_matthias_premium_common import box, cone, cyl, torus, xz


def add_weapon(weapon, origin, parent, m, z):
    # Screen-left points toward negative X. All meshes sit slightly camera-side
    # of the torso so hands read clearly around the weapon at sprite resolution.
    y = -0.48
    if weapon == "pistol":
        box("pistol_slide", xz(origin, -0.55, z + 0.055, y), (0.60, 0.19, 0.145), m["gunmetal"], parent=parent, bevel=0.028)
        box("pistol_frame", xz(origin, -0.39, z - 0.07, y), (0.34, 0.18, 0.13), m["polymer"], parent=parent, bevel=0.022)
        box("pistol_grip", xz(origin, -0.23, z - 0.27, y), (0.16, 0.17, 0.36), m["polymer"], rot=(0, 0.16, 0), parent=parent, bevel=0.018)
        cyl("pistol_barrel", xz(origin, -0.83, z + 0.055, y), 0.046, 0.18, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        cyl("pistol_muzzle", xz(origin, -0.93, z + 0.055, y), 0.064, 0.055, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        torus("trigger_guard", xz(origin, -0.40, z - 0.15, y - 0.005), 0.075, 0.014, m["steel"], rot=(math.pi / 2, 0, 0), parent=parent)
        box("pistol_sight", xz(origin, -0.64, z + 0.145, y), (0.055, 0.05, 0.042), m["brass"], parent=parent, bevel=0.008)
        return (-0.24, -0.54)
    if weapon == "machinegun":
        box("smg_receiver", xz(origin, -0.50, z, y), (0.66, 0.22, 0.21), m["gunmetal"], parent=parent, bevel=0.030)
        box("smg_upper", xz(origin, -0.57, z + 0.14, y), (0.40, 0.18, 0.075), m["steel"], parent=parent, bevel=0.015)
        box("smg_handguard", xz(origin, -0.88, z - 0.01, y), (0.34, 0.23, 0.20), m["polymer"], parent=parent, bevel=0.028)
        cyl("smg_barrel", xz(origin, -1.16, z + 0.025, y), 0.045, 0.44, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        cyl("smg_muzzle", xz(origin, -1.40, z + 0.025, y), 0.065, 0.08, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        box("smg_mag", xz(origin, -0.48, z - 0.31, y), (0.14, 0.16, 0.43), m["dark"], rot=(0, 0.09, 0), parent=parent, bevel=0.018)
        box("smg_stock", xz(origin, -0.05, z + 0.015, y), (0.36, 0.15, 0.14), m["polymer"], parent=parent, bevel=0.025)
        box("smg_sight", xz(origin, -0.58, z + 0.22, y), (0.09, 0.07, 0.07), m["brass"], parent=parent, bevel=0.012)
        return (-0.23, -0.85)
    if weapon == "shotgun":
        box("shotgun_receiver", xz(origin, -0.47, z, y), (0.58, 0.22, 0.20), m["gunmetal"], parent=parent, bevel=0.030)
        cyl("shotgun_barrel", xz(origin, -1.15, z + 0.052, y), 0.043, 1.08, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=26)
        cyl("shotgun_tube", xz(origin, -1.07, z - 0.065, y), 0.035, 0.88, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=26)
        cyl("shotgun_pump", xz(origin, -0.93, z - 0.005, y - 0.015), 0.090, 0.34, m["polymer"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        box("shotgun_stock", xz(origin, -0.04, z - 0.045, y), (0.42, 0.20, 0.20), m["leather"], rot=(0, -0.045, 0), parent=parent, bevel=0.028)
        box("shotgun_sight", xz(origin, -1.54, z + 0.105, y), (0.035, 0.04, 0.035), m["brass"], parent=parent, bevel=0.006)
        return (-0.22, -0.92)
    cyl("panzer_tube", xz(origin, -0.67, z + 0.04, y), 0.118, 1.42, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=30)
    cyl("panzer_rear", xz(origin, 0.07, z + 0.04, y), 0.17, 0.22, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=30)
    cone("panzer_warhead", xz(origin, -1.48, z + 0.04, y), 0.18, 0.12, 0.38, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=32)
    cone("panzer_nose", xz(origin, -1.70, z + 0.04, y), 0.12, 0.035, 0.18, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=32)
    box("panzer_grip", xz(origin, -0.56, z - 0.26, y), (0.15, 0.18, 0.36), m["dark"], rot=(0, 0.09, 0), parent=parent, bevel=0.018)
    box("panzer_sight", xz(origin, -0.70, z + 0.20, y), (0.18, 0.09, 0.09), m["steel"], parent=parent, bevel=0.018)
    box("panzer_mark", xz(origin, -1.10, z + 0.04, y - 0.12), (0.18, 0.025, 0.05), m["red"], parent=parent, bevel=0.005)
    return (-0.27, -0.98)
