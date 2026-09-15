"""Premium Matthias combat body and per-frame pose construction."""
from pawn_slug_matthias_premium_common import box, cone, cyl, cyl_segment, pose, root, sphere, xz
from pawn_slug_matthias_premium_weapons import add_weapon


def build_frame(origin, action, frame, count, weapon, m):
    p = pose(action, frame, count)
    base = root(f"matthias_premium_{weapon}_{action}_{frame:02d}", origin)
    crouch = p["crouch"]
    body_z = p["bob"] - crouch

    # Articulated legs: round limbs + boots, not rectangular stilts.
    hip_z = 0.86 + body_z
    leg_data = (
        ("rear", 0.15, p["step"], p["lift_a"], 0.07),
        ("front", -0.13, -p["step"], p["lift_b"], -0.08),
    )
    for side, hip_x, swing, lift, depth in leg_data:
        knee_x = hip_x + swing * 0.24
        knee_z = 0.52 + lift * 0.54 + body_z * 0.16
        foot_x = hip_x + swing * 0.46
        foot_z = 0.10 + lift + p["jump"] * 0.06
        cyl_segment(f"{side}_thigh", origin, (hip_x, hip_z), (knee_x, knee_z), 0.095, m["navy"], base, y=depth)
        sphere(f"{side}_knee", xz(origin, knee_x, knee_z, depth - 0.01), (0.20, 0.18, 0.18), m["armor"], base, seg=20)
        cyl_segment(f"{side}_shin", origin, (knee_x, knee_z), (foot_x, foot_z + 0.11), 0.082, m["cloth"], base, y=depth - 0.015)
        box(f"{side}_boot", xz(origin, foot_x - 0.07, foot_z, depth - 0.04), (0.34, 0.25, 0.17), m["leather"], parent=base, bevel=0.040)
        box(f"{side}_sole", xz(origin, foot_x - 0.08, foot_z - 0.075, depth - 0.045), (0.36, 0.255, 0.045), m["dark"], parent=base, bevel=0.012)

    # Organic upper body with unmistakable Matthias officer detailing.
    sphere("pelvis", xz(origin, 0.18, 0.90 + body_z, 0.015), (0.50, 0.37, 0.32), m["navy"], base, seg=28)
    sphere("uniform_chest", xz(origin, 0.20, 1.34 + body_z, 0.01), (0.68, 0.46, 0.76), m["navy"], base, seg=32)
    sphere("shoulder_rear", xz(origin, 0.37, 1.53 + body_z, 0.05), (0.27, 0.25, 0.24), m["navy"], base, seg=24)
    sphere("shoulder_front", xz(origin, 0.03, 1.49 + body_z, -0.05), (0.28, 0.25, 0.24), m["navy"], base, seg=24)
    box("vest_front", xz(origin, 0.04, 1.31 + body_z, -0.255), (0.42, 0.085, 0.48), m["armor"], parent=base, bevel=0.045)
    box("shirt_bib", xz(origin, 0.19, 1.45 + body_z, -0.305), (0.11, 0.025, 0.20), m["cream"], parent=base, bevel=0.014)
    box("lapel", xz(origin, 0.10, 1.47 + body_z, -0.325), (0.17, 0.022, 0.25), m["cloth"], rot=(0, 0, -0.38), parent=base, bevel=0.014)
    box("belt", xz(origin, 0.18, 1.06 + body_z, -0.285), (0.50, 0.055, 0.075), m["leather"], parent=base, bevel=0.012)
    box("belt_buckle", xz(origin, 0.08, 1.06 + body_z, -0.323), (0.10, 0.025, 0.095), m["brass"], parent=base, bevel=0.010)
    box("campaign_ribbon", xz(origin, 0.02, 1.34 + body_z, -0.315), (0.13, 0.018, 0.045), m["red"], parent=base, bevel=0.006)
    box("service_ribbon", xz(origin, 0.17, 1.34 + body_z, -0.315), (0.10, 0.018, 0.045), m["brass"], parent=base, bevel=0.006)
    box("epaulette", xz(origin, 0.02, 1.58 + body_z, -0.11), (0.25, 0.20, 0.045), m["brass"], rot=(0, 0, -0.08), parent=base, bevel=0.014)
    for z in (1.18, 1.27):
        sphere(f"coat_button_{z}", xz(origin, 0.15, z + body_z, -0.335), (0.05, 0.025, 0.05), m["brass"], base, seg=16)

    # Grizzled Matthias face: cheeks, eyes, brows, moustache, beard and battered cap.
    head_x = 0.18
    head_z = 1.94 + body_z
    sphere("head", xz(origin, head_x, head_z, -0.10), (0.54, 0.43, 0.58), m["skin"], base, seg=36)
    sphere("cheek", xz(origin, -0.02, head_z - 0.03, -0.33), (0.16, 0.07, 0.13), m["cheek"], base, seg=22)
    sphere("nose", xz(origin, -0.11, head_z + 0.01, -0.385), (0.11, 0.11, 0.14), m["skin_hi"], base, seg=22)
    sphere("eye_front", xz(origin, 0.00, head_z + 0.12, -0.355), (0.075, 0.035, 0.055), m["white"], base, seg=20)
    sphere("iris_front", xz(origin, -0.015, head_z + 0.12, -0.380), (0.034, 0.014, 0.034), m["iris"], base, seg=16)
    sphere("pupil_front", xz(origin, -0.025, head_z + 0.12, -0.390), (0.015, 0.007, 0.016), m["black"], base, seg=12)
    sphere("eye_rear", xz(origin, 0.16, head_z + 0.125, -0.335), (0.060, 0.030, 0.045), m["white"], base, seg=18)
    sphere("pupil_rear", xz(origin, 0.145, head_z + 0.125, -0.360), (0.014, 0.007, 0.015), m["black"], base, seg=12)
    box("brow_front", xz(origin, -0.015, head_z + 0.205, -0.385), (0.14, 0.035, 0.035), m["hair"], rot=(0, 0, -0.18), parent=base, bevel=0.008)
    box("brow_rear", xz(origin, 0.16, head_z + 0.205, -0.365), (0.11, 0.030, 0.030), m["hair"], rot=(0, 0, 0.12), parent=base, bevel=0.007)
    sphere("moustache_front", xz(origin, -0.08, head_z - 0.04, -0.420), (0.23, 0.055, 0.075), m["hair"], base, seg=22)
    sphere("moustache_rear", xz(origin, 0.08, head_z - 0.035, -0.405), (0.20, 0.050, 0.068), m["hair"], base, seg=22)
    sphere("beard_mass", xz(origin, 0.07, head_z - 0.20, -0.300), (0.34, 0.16, 0.27), m["hair"], base, seg=26)
    cone("beard_point", xz(origin, 0.04, head_z - 0.36, -0.285), 0.13, 0.035, 0.25, m["hair"], parent=base, verts=28, bevel=0.010)
    sphere("cap_crown", xz(origin, 0.18, head_z + 0.33, -0.08), (0.48, 0.38, 0.18), m["navy"], base, seg=30)
    cyl("cap_band", xz(origin, 0.17, head_z + 0.275, -0.08), 0.235, 0.070, m["cloth"], parent=base, verts=36, bevel=0.012)
    box("cap_visor", xz(origin, -0.04, head_z + 0.24, -0.32), (0.31, 0.16, 0.045), m["leather"], rot=(0.10, 0, 0), parent=base, bevel=0.018)
    sphere("pawn_insignia_head", xz(origin, 0.10, head_z + 0.31, -0.285), (0.07, 0.035, 0.07), m["brass"], base, seg=16)
    box("pawn_insignia_base", xz(origin, 0.10, head_z + 0.255, -0.285), (0.12, 0.030, 0.035), m["brass"], parent=base, bevel=0.006)

    weapon_z = 1.43 + body_z - crouch * 0.025
    rear_grip_x, support_x = add_weapon(weapon, origin, base, m, weapon_z)

    shoulder_rear = (0.36, 1.55 + body_z)
    elbow_rear = (0.12, 1.43 + body_z)
    shoulder_front = (0.02, 1.50 + body_z)
    elbow_front = (-0.24, 1.34 + body_z)
    cyl_segment("rear_upper_arm", origin, shoulder_rear, elbow_rear, 0.105, m["navy"], base, y=-0.16)
    cyl_segment("rear_forearm", origin, elbow_rear, (rear_grip_x, weapon_z - 0.04), 0.090, m["cloth"], base, y=-0.31)
    cyl_segment("front_upper_arm", origin, shoulder_front, elbow_front, 0.105, m["navy"], base, y=-0.20)
    cyl_segment("front_forearm", origin, elbow_front, (support_x, weapon_z - 0.035), 0.090, m["cloth"], base, y=-0.35)
    sphere("rear_cuff", xz(origin, rear_grip_x + 0.05, weapon_z - 0.035, -0.41), (0.16, 0.12, 0.15), m["brass"], base, seg=18)
    sphere("front_cuff", xz(origin, support_x + 0.04, weapon_z - 0.035, -0.43), (0.16, 0.12, 0.15), m["brass"], base, seg=18)
    sphere("rear_hand", xz(origin, rear_grip_x, weapon_z - 0.035, -0.50), (0.15, 0.11, 0.15), m["skin"], base, seg=20)
    sphere("front_hand", xz(origin, support_x, weapon_z - 0.035, -0.51), (0.15, 0.11, 0.15), m["skin"], base, seg=20)

    return base
