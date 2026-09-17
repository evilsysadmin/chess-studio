"""Premium integrated weapon geometry for Pawn Slug Matthias.

Weapons stay readable but are deliberately compact enough that Matthias remains
the visual subject.  Grip coordinates are returned in screen-plane space so the
hands can visibly wrap the weapon instead of disappearing behind it.
"""
import math

from pawn_slug_matthias_premium_common import box, cone, cyl, torus, xz


def add_weapon(weapon, origin, parent, m, z):
    # Camera is on -Y. Weapon body sits in front of the torso; hands are placed
    # still closer to camera by the character builder.
    y = -0.47
    if weapon == "pistol":
        # Compact P99-style silhouette. Keep the slide short and the two-hand
        # grip clustered around the handle so it cannot read as a tiny SMG at
        # gameplay scale.
        box("pistol_slide", xz(origin, -0.43, z + 0.055, y), (0.42, 0.14, 0.100), m["gunmetal"], parent=parent, bevel=0.020)
        box("pistol_frame", xz(origin, -0.31, z - 0.035, y), (0.24, 0.13, 0.080), m["polymer"], parent=parent, bevel=0.016)
        box("pistol_grip", xz(origin, -0.18, z - 0.170, y), (0.115, 0.13, 0.245), m["polymer"], rot=(0, 0.20, 0), parent=parent, bevel=0.014)
        box("pistol_grip_panel", xz(origin, -0.18, z - 0.170, y - 0.072), (0.075, 0.016, 0.155), m["dark"], rot=(0, 0.20, 0), parent=parent, bevel=0.006)
        cyl("pistol_barrel", xz(origin, -0.67, z + 0.055, y), 0.030, 0.105, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        cyl("pistol_muzzle", xz(origin, -0.73, z + 0.055, y), 0.040, 0.035, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        torus("trigger_guard", xz(origin, -0.30, z - 0.095, y - 0.010), 0.050, 0.010, m["steel"], rot=(math.pi / 2, 0, 0), parent=parent)
        box("pistol_ejection_port", xz(origin, -0.40, z + 0.070, y - 0.076), (0.070, 0.014, 0.032), m["dark"], parent=parent, bevel=0.004)
        box("pistol_front_sight", xz(origin, -0.57, z + 0.116, y), (0.030, 0.032, 0.026), m["brass"], parent=parent, bevel=0.005)
        box("pistol_rear_sight", xz(origin, -0.27, z + 0.116, y), (0.034, 0.032, 0.026), m["dark"], parent=parent, bevel=0.005)
        return (-0.16, -0.25)

    if weapon == "machinegun":
        box("smg_receiver", xz(origin, -0.43, z, y), (0.54, 0.19, 0.18), m["gunmetal"], parent=parent, bevel=0.028)
        box("smg_upper", xz(origin, -0.49, z + 0.115, y), (0.33, 0.16, 0.064), m["steel"], parent=parent, bevel=0.013)
        box("smg_handguard", xz(origin, -0.73, z - 0.005, y), (0.28, 0.20, 0.17), m["polymer"], parent=parent, bevel=0.024)
        cyl("smg_barrel", xz(origin, -0.96, z + 0.022, y), 0.038, 0.34, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        cyl("smg_muzzle", xz(origin, -1.145, z + 0.022, y), 0.055, 0.070, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        box("smg_mag", xz(origin, -0.41, z - 0.255, y), (0.12, 0.14, 0.35), m["dark"], rot=(0, 0.09, 0), parent=parent, bevel=0.016)
        box("smg_stock", xz(origin, -0.05, z + 0.012, y), (0.30, 0.13, 0.12), m["polymer"], parent=parent, bevel=0.022)
        box("smg_sight", xz(origin, -0.49, z + 0.185, y), (0.075, 0.06, 0.06), m["brass"], parent=parent, bevel=0.010)
        return (-0.20, -0.70)

    if weapon == "shotgun":
        box("shotgun_receiver", xz(origin, -0.40, z, y), (0.48, 0.19, 0.17), m["gunmetal"], parent=parent, bevel=0.026)
        cyl("shotgun_barrel", xz(origin, -0.98, z + 0.046, y), 0.037, 0.88, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=26)
        cyl("shotgun_tube", xz(origin, -0.91, z - 0.055, y), 0.030, 0.72, m["steel"], rot=(0, math.pi / 2, 0), parent=parent, verts=26)
        cyl("shotgun_pump", xz(origin, -0.79, z - 0.004, y - 0.015), 0.076, 0.29, m["polymer"], rot=(0, math.pi / 2, 0), parent=parent, verts=24)
        box("shotgun_stock", xz(origin, -0.04, z - 0.038, y), (0.35, 0.17, 0.17), m["leather"], rot=(0, -0.045, 0), parent=parent, bevel=0.024)
        box("shotgun_sight", xz(origin, -1.30, z + 0.091, y), (0.030, 0.035, 0.030), m["brass"], parent=parent, bevel=0.005)
        return (-0.19, -0.77)

    # Keep enough horizontal launcher span to satisfy the 108px armed-silhouette
    # contract even in the narrowest run/jump poses at the 192px authoring scale.
    cyl("panzer_tube", xz(origin, -0.61, z + 0.035, y), 0.098, 1.23, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=30)
    cyl("panzer_rear", xz(origin, 0.03, z + 0.035, y), 0.14, 0.18, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, verts=30)
    cone("panzer_warhead", xz(origin, -1.29, z + 0.035, y), 0.15, 0.10, 0.31, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=32)
    cone("panzer_nose", xz(origin, -1.49, z + 0.035, y), 0.10, 0.030, 0.15, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, verts=32)
    box("panzer_grip", xz(origin, -0.49, z - 0.215, y), (0.13, 0.16, 0.30), m["dark"], rot=(0, 0.09, 0), parent=parent, bevel=0.016)
    box("panzer_sight", xz(origin, -0.61, z + 0.17, y), (0.15, 0.075, 0.075), m["steel"], parent=parent, bevel=0.015)
    box("panzer_mark", xz(origin, -0.93, z + 0.035, y - 0.105), (0.15, 0.020, 0.044), m["red"], parent=parent, bevel=0.004)
    return (-0.23, -0.82)
