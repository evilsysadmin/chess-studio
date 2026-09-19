#!/usr/bin/env python3
"""Render isolated Pawn Slug enemy 2D frames (Metal Slug style run-and-gun soldiers).

Frame source stage only: every frame is a transparent 128x128 RGBA PNG with the
pivot at x=64 and the boot soles on y=116. A separate packer (pack_pawn_slug_enemy_v2.py)
normalizes and assembles the atlas. Frames drawn here can later be swapped for
Image Generation output without touching the packer contract.

The renderer is a small 2D rig: pelvis -> spine -> head, two-bone IK legs with
planted feet, and two-bone IK arms that hold an invisible weapon at a per-frame
grip anchor. The weapon sprite itself stays a runtime overlay, so the same body
frames serve pistol, machinegun, shotgun and panzerfaust. The grip anchor and aim
angle of every frame are written to grips.json.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

TYPES = ("pawn", "knight", "rook", "bishop", "queen", "grenadier", "scout", "commando", "shield")
ACTIONS = (
    "idle", "run", "jump", "crouch", "hurt", "climb", "death",
    "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_down", "shoot_crouch",
)
FRAMES = 8
CELL = 128
PIVOT_X = 64
FOOT_Y = 116
SS = 4
OUTLINE_W = 1.5
GROUND = FOOT_Y - OUTLINE_W
TAU = math.tau
GLOBAL_SCALE = 1.1
DEATH_MARGIN = 48

OUT = (24, 16, 14, 255)
SKIN = (232, 176, 128, 255)
SKIN_DARK = (196, 132, 92, 255)
BOOT = (52, 38, 32, 255)
WHITE = (250, 244, 232, 255)
GOLD = (236, 184, 64, 255)
STEEL = (150, 164, 172, 255)
STEEL_DARK = (88, 100, 110, 255)


def shade(color, f):
    return (max(0, min(255, int(color[0] * f))), max(0, min(255, int(color[1] * f))), max(0, min(255, int(color[2] * f))), 255)


# Uniform hue differs per type; outline, skin, boots and contrast stay shared (one visual family).
SPEC = {
    "pawn": dict(k=0.92, kw=1.0, cloth=(96, 110, 62, 255), accent=(196, 200, 150, 255), gear=(120, 88, 52, 255)),
    "knight": dict(k=1.0, kw=1.0, cloth=(150, 112, 62, 255), accent=(196, 52, 46, 255), gear=(92, 64, 40, 255)),
    "rook": dict(k=1.06, kw=1.28, cloth=(84, 102, 96, 255), accent=STEEL, gear=(60, 70, 74, 255)),
    "bishop": dict(k=1.04, kw=1.05, cloth=(112, 60, 96, 255), accent=GOLD, gear=(70, 46, 60, 255)),
    "queen": dict(k=1.05, kw=1.0, cloth=(128, 34, 46, 255), accent=GOLD, gear=(40, 30, 34, 255)),
    "grenadier": dict(k=1.0, kw=1.2, cloth=(172, 132, 58, 255), accent=(216, 90, 40, 255), gear=(104, 76, 40, 255)),
    "scout": dict(k=0.9, kw=0.86, cloth=(56, 124, 122, 255), accent=(240, 222, 120, 255), gear=(60, 84, 88, 255)),
    "commando": dict(k=0.98, kw=1.05, cloth=(54, 60, 72, 255), accent=(210, 60, 52, 255), gear=(30, 34, 42, 255)),
    "shield": dict(k=1.05, kw=1.15, cloth=(70, 88, 118, 255), accent=(120, 200, 226, 255), gear=(46, 56, 76, 255)),
}


def smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def rot(v, a):
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def mul(a, s):
    return (a[0] * s, a[1] * s)


def ik2(origin, target, l1, l2, prefer):
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    dist = max(1e-3, math.hypot(dx, dy))
    dist = min(dist, l1 + l2 - 0.02)
    dist = max(dist, abs(l1 - l2) + 0.02)
    base = math.atan2(dy, dx)
    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)))
    ang = math.acos(cos_a)
    cands = [
        (origin[0] + l1 * math.cos(base + ang), origin[1] + l1 * math.sin(base + ang)),
        (origin[0] + l1 * math.cos(base - ang), origin[1] + l1 * math.sin(base - ang)),
    ]
    joint = max(cands, key=prefer)
    end = (origin[0] + math.cos(base) * dist, origin[1] + math.sin(base) * dist)
    return joint, end


class Canvas:
    """Supersampled painter with a rigid body transform for death rotation."""

    def __init__(self, extra_bottom: int = 0):
        self.extra = extra_bottom
        self.img = Image.new("RGBA", (CELL * SS, (CELL + extra_bottom) * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.tf_angle = 0.0
        self.tf_shift = (0.0, 0.0)

    def T(self, p):
        if self.tf_angle:
            q = rot((p[0] - PIVOT_X, p[1] - GROUND), self.tf_angle)
            p = (q[0] + PIVOT_X, q[1] + GROUND)
        return (p[0] + self.tf_shift[0], p[1] + self.tf_shift[1])

    def px(self, p):
        p = self.T(p)
        return (p[0] * SS, p[1] * SS)

    def _cap(self, a, b, w, fill):
        a, b = self.px(a), self.px(b)
        self.d.line([a, b], fill=fill, width=max(1, int(round(w * SS))))
        r = w * SS / 2.0
        for c in (a, b):
            self.d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=fill)

    def _poly(self, pts, fill, pad):
        p = [self.px(q) for q in pts]
        self.d.polygon(p, fill=fill)
        if pad > 0:
            for a, b in zip(p, p[1:] + p[:1]):
                self.d.line([a, b], fill=fill, width=int(round(pad * 2 * SS)))
            for c in p:
                r = pad * SS
                self.d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=fill)

    def _ell(self, c, rx, ry, fill, pad):
        c = self.px(c)
        rx, ry = (rx + pad) * SS, (ry + pad) * SS
        self.d.ellipse((c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry), fill=fill)

    def group(self, shapes, ow=OUTLINE_W):
        """shapes: ('cap',a,b,w,fill) | ('poly',pts,fill) | ('ell',c,rx,ry,fill). Outline pass, then fill pass."""
        for pad_pass in (True, False):
            for s in shapes:
                kind = s[0]
                if kind == "cap":
                    self._cap(s[1], s[2], s[3] + (2 * ow if pad_pass else 0), OUT if pad_pass else s[4])
                elif kind == "poly":
                    self._poly(s[1], OUT if pad_pass else s[2], ow if pad_pass else 0)
                elif kind == "ell":
                    self._ell(s[1], s[2], s[3], OUT if pad_pass else s[4], ow if pad_pass else 0)

    def flat(self, shapes):
        for s in shapes:
            if s[0] == "cap":
                self._cap(s[1], s[2], s[3], s[4])
            elif s[0] == "poly":
                self._poly(s[1], s[2], 0)
            elif s[0] == "ell":
                self._ell(s[1], s[2], s[3], s[4], 0)

    def finish(self) -> Image.Image:
        return self.img.resize((CELL, CELL + self.extra), Image.Resampling.LANCZOS)


def limb(a, b, w, fill, light=True):
    """Capsule with a cel highlight/shadow stripe along it."""
    shapes = [("cap", a, b, w, fill)]
    return shapes


def limb_details(a, b, w, fill):
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1.0
    px_, py_ = -dy / n, dx / n
    if py_ > 0:
        px_, py_ = -px_, -py_
    off = w * 0.24
    hi = (a[0] + px_ * off, a[1] + py_ * off), (b[0] + px_ * off, b[1] + py_ * off)
    lo = (a[0] - px_ * off, a[1] - py_ * off), (b[0] - px_ * off, b[1] - py_ * off)
    return [("cap", hi[0], hi[1], w * 0.24, shade(fill, 1.22)), ("cap", lo[0], lo[1], w * 0.24, shade(fill, 0.78))]


def arc_points(cx, cy, rx, ry, a0, a1, n=14):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# ---------------------------------------------------------------- pose model

def gait(u, stride, lift):
    u %= 1.0
    if u < 0.5:
        return stride - 2.0 * stride * (u / 0.5), 0.0
    w = (u - 0.5) / 0.5
    return -stride + 2.0 * stride * w, lift * math.sin(math.pi * w)


def pulse(f, first=1, period=4, amp=2.6, decay=0.55):
    g = (f - first) % period
    return amp * (decay ** g)


AIM = {
    "shoot": 0.0, "shoot_up": -math.pi / 2, "shoot_down": math.pi / 2,
    "shoot_diag_up": -math.pi / 4, "shoot_diag_down": math.pi / 4, "shoot_crouch": 0.0,
}


def make_pose(enemy_type, action, f):
    spec = SPEC[enemy_type]
    ph = f / FRAMES
    w = math.sin(ph * TAU) + 0.35 * math.sin(2 * ph * TAU + 0.8)
    p = dict(
        dx=0.0, hip=26.5, lean=0.05, head=0.0, aim=0.08, recoil=0.0, weapon=True,
        near=(5.0, 0.0), far=(-5.0, 0.0), near_pitch=0.0, far_pitch=0.0,
        arms=None, rot=0.0, shift=(0.0, 0.0), sway=0.0, knee_lift=0.0,
    )
    if action == "idle":
        p.update(hip=26.5 - 0.7 * w, lean=0.04 + 0.012 * w, aim=0.10 + 0.02 * w, head=-0.02 * w, sway=0.25 * w)
    elif action == "run":
        s = 11.5
        p["near"] = gait(ph, s, 7.5)
        p["far"] = gait(ph + 0.5, s, 7.5)
        p.update(hip=26.5 - 2.6 * (1.0 - abs(math.cos(ph * TAU))) * -1.0 - 1.0, lean=0.14,
                 aim=0.04 + 0.035 * math.sin(ph * 2 * TAU), sway=1.0 * math.sin(ph * TAU + 1.0))
        p["hip"] = 24.6 + 2.6 * (1.0 - abs(math.cos(ph * TAU)))
        p["head"] = -0.05
    elif action == "jump":
        table = [
            (-3.5, (6, 0), (-6, 0), 0.16), (1.0, (6, 0), (-7, 1), 0.10), (5.0, (8, 3), (-6, 5), 0.02),
            (7.0, (9, 7), (0, 8), -0.04), (7.5, (9, 7), (1, 8), -0.04), (5.5, (8, 4), (-3, 5), 0.02),
            (2.0, (7, 1), (-5, 2), 0.08), (-4.5, (8, 0), (-7, 0), 0.20),
        ]
        hu, n, fa, lean = table[f]
        p.update(hip=26.5 + hu, near=(n[0], n[1]), far=(fa[0], fa[1]), lean=lean, aim=-0.06 + 0.10 * (f / 7.0))
    elif action == "crouch":
        p.update(hip=17.5 - 0.6 * w, near=(11.0, 0.0), far=(-8.0, 0.0), lean=0.24 + 0.012 * w, aim=0.18, head=0.06, sway=0.2 * w)
    elif action == "hurt":
        t = f / 7.0
        e = math.sin(math.pi * min(1.0, t * 1.5)) if t < 0.67 else max(0.0, 1.0 - (t - 0.67) / 0.33) * 0.35
        p.update(hip=26.5 - 3.0 * e, lean=0.04 - 0.34 * e, head=-0.28 * e, dx=-4.0 * e, aim=0.10 - 0.85 * e,
                 near=(5.0 - 4.0 * e, 0.0), far=(-5.0 - 5.0 * e, 3.0 * e), sway=-2.0 * e)
    elif action == "climb":
        a = math.sin(ph * TAU)
        p.update(hip=24.0, lean=0.03, weapon=False, near=(7.0, 4.0 + 4.0 * a), far=(6.0, 4.0 - 4.0 * a),
                 arms=((10.0, -10.0 - 9.0 * a), (8.0, -10.0 + 9.0 * a)), head=-0.06, sway=0.3 * a)
    elif action == "death":
        t = f / 7.0
        fall = smooth((t - 0.10) / 0.72)
        hop = -7.0 * math.sin(math.pi * min(1.0, t * 2.4)) if t < 0.42 else 0.0
        near_t = (5.0 + 7.0 * fall, 10.0 * fall * (1.0 - 0.3 * fall))
        p.update(hip=26.5 - 6.0 * fall, lean=0.04 - 0.30 * fall, head=-0.5 * fall, weapon=t < 0.15,
                 near=near_t, far=(-5.0 + 8.0 * fall, 5.0 * fall), rot=-1.50 * fall,
                 shift=(46.0 * fall, hop), arms=((-6.0 - 4.0 * fall, -12.0 - 6.0 * fall), (-3.0, -15.0 * fall - 2.0)) if t > 0.05 else None)
    elif action.startswith("shoot"):
        r = pulse(f)
        aim = AIM[action]
        crouch = action == "shoot_crouch"
        p.update(hip=17.5 if crouch else 25.0, near=(11.0, 0.0) if crouch else (7.5, 0.0), far=(-8.0, 0.0) if crouch else (-8.0, 0.0),
                 lean=0.20 if crouch else 0.05, aim=aim, recoil=r)
        if action == "shoot_up":
            p.update(lean=-0.20, hip=25.5)
        elif action == "shoot_down":
            p.update(lean=0.20, hip=24.0)
        elif action == "shoot_diag_up":
            p.update(lean=-0.06)
        elif action == "shoot_diag_down":
            p.update(lean=0.12, hip=24.5)
        p["lean"] -= 0.012 * r
        p["dx"] = -0.6 * r
        p["aim"] = aim - 0.025 * r * (1 if abs(aim) < 0.01 else 0)
    if action in ("idle", "crouch", "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_down", "shoot_crouch", "hurt", "death"):
        p["head"] += 0.014 * math.sin(f * 1.9 + 0.6)
        p["sway"] += 0.18 * math.sin(f * 2.3 + 1.1)
    if action == "climb":
        p["head"] += 0.02 * math.sin(f * 1.9 + 0.6)
    # per-type locomotion flavour
    if enemy_type == "rook":
        for key in ("near", "far"):
            p[key] = (p[key][0] * 0.7, p[key][1] * 0.75)
    if enemy_type == "scout" and action in ("run", "idle"):
        p["lean"] += 0.04
    if enemy_type == "shield":
        p["lean"] *= 0.6
    return p


# ---------------------------------------------------------------- drawing

def render_frame(enemy_type: str, action: str, f: int):
    spec = SPEC[enemy_type]
    k, kw = spec["k"] * GLOBAL_SCALE, spec["kw"]
    cloth, accent, gear = spec["cloth"], spec["accent"], spec["gear"]
    cloth_dark, cloth_light = shade(cloth, 0.72), shade(cloth, 1.18)
    p = make_pose(enemy_type, action, f)
    cv = Canvas(DEATH_MARGIN if action == "death" else 0)
    cv.tf_angle = p["rot"]
    cv.tf_shift = p["shift"]

    dx = p["dx"]
    P = (PIVOT_X + dx, GROUND - p["hip"] * k)
    lean = p["lean"]
    u = (math.sin(lean), -math.cos(lean))
    n = (-u[1], u[0])
    torso_len = 21.0 * k
    S = add(P, mul(u, torso_len))
    S = add(S, mul((1, 0), p["sway"] * 0.5))
    head_ang = lean + p["head"]
    Hc = add(add(S, mul((math.sin(head_ang), -math.cos(head_ang)), 11.5 * k)), (2.0 * k, 0))

    def HP(x, y):
        q = rot((x * k, y * k), p["head"] + lean * 0.6)
        return add(Hc, q)

    # ---- legs
    thigh = shin = 14.6 * k
    hips = {"near": add(P, (2.0 * k, 0)), "far": add(P, (-2.0 * k, 0))}

    def foot_target(key):
        fx, fy = p[key]
        return (PIVOT_X + dx + fx * k, GROUND - 3.4 * k - fy)

    legs = {}
    for key in ("far", "near"):
        knee, ankle = ik2(hips[key], foot_target(key), thigh, shin, lambda c: c[0] - 0.7 * c[1])
        legs[key] = (knee, ankle)

    def draw_leg(key, dark):
        knee, ankle = legs[key]
        hip = hips[key]
        col = shade(cloth, 0.62) if dark else shade(cloth, 0.9)
        boot = shade(BOOT, 0.8) if dark else BOOT
        sole = add(ankle, (0, 3.4 * k))
        toe = add(ankle, (6.4 * k, 1.6 * k))
        heel = add(ankle, (-3.2 * k, 0.6 * k))
        shapes = [
            ("cap", hip, knee, 7.6 * k * (kw ** 0.5), col), ("cap", knee, ankle, 6.2 * k, col),
            ("poly", [add(heel, (0, -3.2 * k)), add(ankle, (2.4 * k, -3.6 * k)), add(toe, (0, -1.6 * k)),
                      add(toe, (0.6 * k, 1.8 * k)), add(sole, (-3.2 * k, 0))], boot),
        ]
        cv.group(shapes)
        cv.flat(limb_details(hip, knee, 7.6 * k, col)[:1])
        cv.flat([("cap", add(knee, (0, -0.5 * k)), add(knee, (0.8 * k, 0.5 * k)), 5.6 * k, shade(col, 1.15))])

    # ---- arms (near/far) via IK to the weapon grip
    aim = p["aim"]
    a = (math.cos(aim), math.sin(aim))
    pn = (-a[1], a[0])
    recoil_vec = mul(a, -p["recoil"])
    anchor_off = (6.0 * k + (4.0 * k if action == "shoot_up" else 0.0), 1.5 * k)
    firing = action.startswith("shoot")
    reach = 16.0 if firing else 11.0
    W = add(add(add(S, anchor_off), mul(a, reach * k)), recoil_vec)
    W = add(W, mul(pn, 1.0))
    trigger = add(add(W, mul(a, -2.5 * k)), mul(pn, 2.2 * k))
    support = add(add(W, mul(a, (11.0 if firing else 7.5) * k)), mul(pn, 1.6 * k))
    sh_near = add(S, (1.5 * k, 0.5 * k))
    sh_far = add(S, (-2.5 * k, -0.5 * k))
    if p["arms"] is not None:
        hand_near = add(S, mul(p["arms"][0], k))
        hand_far = add(S, mul(p["arms"][1], k))
    else:
        hand_near, hand_far = trigger, support
    upper = fore = 11.5 * k
    elbow_pref = lambda c: c[1] - 0.6 * c[0]
    en, hn = ik2(sh_near, hand_near, upper, fore, elbow_pref)
    ef, hf = ik2(sh_far, hand_far, upper, fore, elbow_pref)

    def draw_arm(sh, el, hd, dark):
        col = shade(cloth, 0.62) if dark else shade(cloth, 0.95)
        glove = shade(SKIN, 0.85) if dark else SKIN
        cv.group([("cap", sh, el, 6.2 * k, col), ("cap", el, hd, 5.4 * k, col), ("ell", hd, 3.1 * k, 3.1 * k, glove)])

    # ---- torso polygon
    hw_waist, hw_chest = 8.2 * k * kw ** 0.6, 9.6 * k * kw ** 0.7
    torso = [add(P, mul(n, -hw_waist)), add(P, mul(n, hw_waist)), add(add(S, mul(n, hw_chest)), mul(u, 1.0)),
             add(add(S, mul(n, -hw_chest)), mul(u, 1.0))]

    def hang(length):
        return min(length * k, max(4.0, p["hip"] * k - 2.5))

    # ---- back props (drawn first)
    swing = p["sway"]
    if enemy_type == "queen":
        cape = [add(S, mul(n, -6 * k)), add(S, mul(u, -3 * k)), add(P, (-13 * k - swing * 2, hang(12))), add(P, (-18 * k - swing * 3, hang(14))), add(S, add(mul(n, -9 * k), (-6 * k, 0)))]
        cv.group([("poly", cape, shade((160, 26, 40, 255), 0.9))])
    if enemy_type == "bishop":
        tube = (add(S, add(mul(n, -8 * k), mul(u, 4 * k))), add(S, add(mul(n, -8 * k), (-15 * k, 12 * k))))
        cv.group([("cap", tube[0], tube[1], 6.2 * k, shade(gear, 1.3)), ("ell", tube[1], 3.6 * k, 3.6 * k, (60, 60, 64, 255))])
    if enemy_type == "grenadier":
        cv.group([("poly", [add(P, add(mul(n, -12 * k), mul(u, 2 * k))), add(P, add(mul(n, -7 * k), mul(u, 15 * k))),
                             add(P, add(mul(n, -12 * k), mul(u, 15 * k))), add(P, add(mul(n, -14 * k), mul(u, 6 * k)))], gear)])
    if enemy_type == "scout":
        pack = [add(S, add(mul(n, -8 * k), mul(u, 1 * k))), add(S, add(mul(n, -14 * k), mul(u, -3 * k))),
                add(P, add(mul(n, -14 * k), mul(u, 6 * k))), add(P, add(mul(n, -8 * k), mul(u, 3 * k)))]
        cv.group([("poly", pack, gear), ("cap", add(S, add(mul(n, -11 * k), mul(u, 0))), add(S, add(mul(n, -12 * k), (-2 * k, -18 * k))), 1.2 * k, STEEL_DARK)])
    if enemy_type == "commando":
        cv.group([("poly", [add(S, add(mul(n, -8 * k), mul(u, 1 * k))), add(S, add(mul(n, -13 * k), mul(u, -2 * k))),
                             add(P, add(mul(n, -13 * k), mul(u, 5 * k))), add(P, add(mul(n, -8 * k), mul(u, 2 * k)))], gear)])
    if enemy_type == "knight":
        tail = [add(S, mul(n, -6 * k)), add(S, add(mul(n, -8 * k), mul(u, -4 * k))), add(P, (-14 * k - swing * 2, 6 * k)), add(P, (-8 * k, 0))]
        cv.group([("poly", tail, shade(accent, 0.85))])

    draw_arm(sh_far, ef, hf, True)
    draw_leg("far", True)
    draw_leg("near", False)

    # ---- coat skirt (bishop) behind torso but over legs
    if enemy_type == "bishop":
        skirt = [add(P, mul(n, -9 * k)), add(P, mul(n, 9 * k)), add(add(P, mul(n, 12 * k)), (2 * k + swing, hang(15))), add(add(P, mul(n, -12 * k)), (-3 * k + swing, hang(15)))]
        cv.group([("poly", skirt, cloth_dark)])
        cv.flat([("cap", skirt[3], skirt[2], 2.2 * k, GOLD)])

    # ---- torso
    shapes = [("poly", torso, cloth), ("ell", S, 6.6 * k * kw ** 0.5, 6.0 * k, cloth)]
    cv.group(shapes)
    vest = [add(P, add(mul(n, -hw_waist * 0.9), mul(u, 4 * k))), add(P, add(mul(n, hw_waist * 0.9), mul(u, 4 * k))),
            add(S, add(mul(n, hw_chest * 0.95), mul(u, -1 * k))), add(S, add(mul(n, -hw_chest * 0.95), mul(u, -1 * k)))]
    cv.flat([("poly", vest, cloth_light)])
    cv.flat([("cap", add(P, add(mul(n, -hw_waist), mul(u, 3.0 * k))), add(P, add(mul(n, hw_waist), mul(u, 3.0 * k))), 3.2 * k, shade(BOOT, 1.0)),
             ("cap", add(P, add(mul(n, 1.0 * k), mul(u, 3.0 * k))), add(P, add(mul(n, 1.0 * k), mul(u, 3.0 * k))), 4.0 * k, GOLD)])
    cv.flat([("cap", add(S, add(mul(n, -hw_chest * 0.9), mul(u, -2 * k))), add(P, add(mul(n, -hw_waist * 0.9), mul(u, 6 * k))), 2.0 * k, shade(cloth, 0.6))])

    # type torso details
    if enemy_type == "pawn":
        cv.flat([("cap", add(P, add(mul(n, 3 * k), mul(u, 8 * k))), add(P, add(mul(n, 3 * k), mul(u, 12 * k))), 4.4 * k, gear)])
    elif enemy_type == "knight":
        cv.flat([("cap", add(S, add(mul(n, -hw_chest), mul(u, -1 * k))), add(P, add(mul(n, hw_waist), mul(u, 3 * k))), 3.0 * k, accent)])
    elif enemy_type == "rook":
        cv.group([("ell", add(S, mul(n, 2 * k)), 8.2 * k, 7.0 * k, STEEL)])
        cv.flat([("cap", add(S, add(mul(n, 0), (-2.5 * k, -2.5 * k))), add(S, add(mul(n, 0), (2 * k, -3 * k))), 2.2 * k, shade(STEEL, 1.25))])
        cv.flat([("poly", [add(P, add(mul(n, -hw_waist), mul(u, 6 * k))), add(P, add(mul(n, hw_waist), mul(u, 6 * k))), add(P, add(mul(n, hw_waist), mul(u, 14 * k))), add(P, add(mul(n, -hw_waist), mul(u, 14 * k)))], STEEL_DARK)])
    elif enemy_type == "bishop":
        cv.flat([("cap", add(S, mul(u, -8 * k)), add(P, mul(u, 5 * k)), 2.4 * k, GOLD)])
        cv.flat([("cap", add(S, add(mul(u, -6 * k), mul(n, -3 * k))), add(S, add(mul(u, -6 * k), mul(n, 3 * k))), 2.0 * k, GOLD)])
    elif enemy_type == "queen":
        cv.group([("ell", add(S, mul(n, 3 * k)), 5.0 * k, 3.4 * k, GOLD)])
        cv.flat([("cap", add(S, add(mul(n, -8 * k), mul(u, 0))), add(S, add(mul(n, 8 * k), mul(u, 0))), 3.4 * k, (176, 30, 44, 255))])
    elif enemy_type == "grenadier":
        for i in range(4):
            t = 0.12 + 0.2 * i
            c = add(add(S, mul(n, -hw_chest * 0.8)), add(mul(add(P, mul(n, hw_waist * 0.8)), t), mul(add(S, mul(n, -hw_chest * 0.8)), -t)))
            cv.group([("ell", c, 2.6 * k, 3.0 * k, accent)], ow=0.8)
        cv.flat([("cap", add(S, add(mul(n, -hw_chest), mul(u, -1 * k))), add(P, add(mul(n, hw_waist), mul(u, 4 * k))), 2.4 * k, gear)])
    elif enemy_type == "scout":
        cv.flat([("cap", add(S, add(mul(n, -hw_chest), mul(u, -1 * k))), add(P, add(mul(n, hw_waist), mul(u, 3 * k))), 2.2 * k, accent)])
    elif enemy_type == "commando":
        for i in range(2):
            c = add(P, add(mul(n, (2 + 5 * i) * k), mul(u, 9 * k)))
            cv.group([("poly", [add(c, (-2 * k, -3 * k)), add(c, (2 * k, -3 * k)), add(c, (2 * k, 3 * k)), add(c, (-2 * k, 3 * k))], gear)], ow=0.8)
        knife = (add(hips["near"], (3 * k, 8 * k)), add(hips["near"], (3.6 * k, 15 * k)))
        cv.flat([("cap", knife[0], knife[1], 1.8 * k, STEEL)])
    elif enemy_type == "shield":
        cv.flat([("cap", add(S, add(mul(n, -hw_chest), mul(u, -1 * k))), add(P, add(mul(n, hw_waist), mul(u, 3 * k))), 2.4 * k, accent)])

    # ---- head
    face_skin = SKIN
    dark_face = enemy_type == "commando"
    head_shapes = [("ell", HP(0, 0), 11.6 * k, 12.0 * k, face_skin if not dark_face else (46, 50, 60, 255)),
                   ("ell", HP(11.2, 2.2), 2.2 * k, 2.3 * k, SKIN if not dark_face else (46, 50, 60, 255)),
                   ("ell", HP(-2, 1.2), 2.6 * k, 3.2 * k, SKIN_DARK)]
    if enemy_type == "scout":
        scarf = [add(S, (-2 * k, -2 * k)), add(S, (-9 * k - swing * 3, 1 * k)), add(S, (-17 * k - swing * 4, 4 * k + swing * 2)), add(S, (-13 * k - swing * 3, 8 * k)), add(S, (0, 3 * k))]
        cv.group([("poly", scarf, accent)])
    cv.group(head_shapes)
    if dark_face:
        cv.flat([("cap", HP(3, -1), HP(11, -1.5), 4.2 * k, SKIN)])
    # eye + brow + mouth
    cv.flat([("ell", HP(6.4, -0.5), 2.7 * k, 2.6 * k, WHITE), ("ell", HP(7.4, -0.3), 1.35 * k, 1.5 * k, OUT)])
    cv.flat([("cap", HP(3.0, -4.4), HP(9.6, -2.4), 1.7 * k, OUT)])
    cv.flat([("cap", HP(6.2, 7.2), HP(10.0, 6.6), 1.2 * k, shade(SKIN_DARK, 0.6))])

    helmet = enemy_type
    hc = cloth_dark if enemy_type not in ("rook", "shield") else STEEL_DARK
    def dome(rx, ry, cy, col, cx=-0.5):
        pts = [HP(x, y) for x, y in arc_points(cx, cy, rx, ry, math.pi, math.tau, 16)]
        return ("poly", pts, col)
    if helmet == "pawn":
        cv.group([dome(13.4, 11.4, -2.4, cloth_dark), ("cap", HP(-12.5, -2.6), HP(14.5, -2.6), 3.0 * k, cloth), ("ell", HP(0, -14.6), 3.0 * k, 3.0 * k, accent)])
        cv.flat([("cap", HP(-9, -8), HP(3, -11), 2.0 * k, shade(cloth_dark, 1.4))])
    elif helmet == "knight":
        mane = [HP(8, -11), HP(2, -17), HP(-2, -12), HP(-6, -18.5), HP(-10, -11.5), HP(-14.5, -15), HP(-17, -5), HP(-11, -7)]
        cv.group([dome(13.0, 10.6, -2.6, gear), ("poly", mane, accent), ("cap", HP(-12.5, -2.4), HP(13.5, -2.4), 3.0 * k, shade(gear, 1.2)), ("cap", HP(11.6, -2), HP(12.4, 5), 2.2 * k, STEEL)])
    elif helmet == "rook":
        teeth = [HP(-12, -3), HP(-12, -13), HP(-8.5, -13), HP(-8.5, -10), HP(-4, -10), HP(-4, -13), HP(-0.5, -13), HP(-0.5, -10), HP(3.5, -10), HP(3.5, -13), HP(7, -13), HP(7, -10), HP(11.5, -10), HP(12.5, -3)]
        cv.group([("poly", teeth, STEEL), ("poly", [HP(-13, -3), HP(-4, -3), HP(-4, 9), HP(-12, 6)], STEEL_DARK), ("cap", HP(-12, -3), HP(13, -3), 2.6 * k, STEEL_DARK)])
        cv.flat([("cap", HP(-9, -7), HP(8, -7), 1.6 * k, shade(STEEL, 1.3))])
    elif helmet == "bishop":
        mitre = [HP(-13, -2), HP(-11.5, -12), HP(-6, -22), HP(-1, -26.5), HP(4, -22), HP(10, -12), HP(13, -2)]
        cv.group([("poly", mitre, shade(cloth, 1.0)), ("cap", HP(-13, -2.4), HP(14, -2.4), 3.0 * k, GOLD)])
        cv.flat([("cap", HP(0, -22), HP(0, -10), 2.4 * k, GOLD), ("cap", HP(-4, -17), HP(4, -17), 2.2 * k, GOLD)])
    elif helmet == "queen":
        plume = [HP(-4, -14), HP(-12, -21), HP(-22, -19), HP(-24, -11), HP(-16, -9), HP(-8, -6)]
        crown = [HP(-12, -10), HP(-12, -19), HP(-8, -13), HP(-4, -21), HP(0, -13), HP(4, -21), HP(8, -13), HP(12, -19), HP(12, -10)]
        cv.group([("poly", plume, (196, 34, 48, 255)), dome(12.8, 10.0, -2.0, shade(cloth, 0.9)), ("poly", crown, GOLD), ("cap", HP(-12.5, -2.2), HP(13.5, -2.2), 2.6 * k, GOLD)])
        cv.flat([("ell", HP(0, -14.5), 1.5 * k, 1.5 * k, (196, 34, 48, 255))])
    elif helmet == "grenadier":
        cv.group([dome(13.8, 9.4, -3.0, gear), ("cap", HP(-17, -2.4), HP(17, -1.8), 3.0 * k, shade(gear, 1.1)), ("cap", HP(3, -6.4), HP(12, -5.6), 4.6 * k, STEEL_DARK)])
        cv.flat([("cap", HP(4.5, -6.4), HP(11, -5.8), 2.6 * k, (140, 220, 232, 255))])
    elif helmet == "scout":
        cv.group([dome(12.4, 8.6, -3.6, cloth_dark), ("poly", [HP(8, -5), HP(18, -2.6), HP(9, -0.8)], cloth_dark), ("cap", HP(-12, -2.6), HP(12, -3.8), 2.6 * k, accent)])
        cv.group([("cap", HP(0, -5.2), HP(9, -5.2), 4.4 * k, STEEL_DARK)])
        cv.flat([("cap", HP(1.5, -5.2), HP(8, -5.2), 2.6 * k, (150, 230, 240, 255))])
    elif helmet == "commando":
        cv.group([("ell", HP(-3, -10.4), 12.2 * k, 5.6 * k, (28, 30, 36, 255)), ("ell", HP(-9, -13), 3.4 * k, 3.0 * k, (28, 30, 36, 255))])
        cv.flat([("ell", HP(3, -11), 2.0 * k, 2.0 * k, accent)])
        cv.flat([("cap", HP(-12, -3), HP(11, -3), 2.6 * k, (28, 30, 36, 255))])
    elif helmet == "shield":
        cv.group([dome(14.0, 12.4, -0.8, STEEL_DARK), ("poly", [HP(-14, 0), HP(-8, 0), HP(-8, 12), HP(-14, 9)], STEEL_DARK), ("cap", HP(-13, -1.6), HP(15, -1.6), 3.0 * k, STEEL)])
        cv.group([("poly", [HP(5, -6.5), HP(15.5, -5.5), HP(15.5, 5), HP(5, 4)], (110, 190, 214, 255))], ow=1.0)
        cv.flat([("cap", HP(6.5, -3.5), HP(13, -3.5), 1.4 * k, (210, 240, 250, 255))])

    draw_arm(sh_near, en, hn, False)

    # ---- shield slab (in front of body; the weapon overlays above it)
    if enemy_type == "shield":
        base = add(S, add(mul(n, 15 * k), mul(u, 2 * k)))
        bottom = add(P, add(mul(n, 15 * k), mul(u, -8 * k)))
        slab = [add(base, (-3 * k, 0)), add(base, (3.5 * k, 0)), add(bottom, (3.5 * k, 0)), add(bottom, (-3 * k, 0))]
        cv.group([("poly", slab, (86, 108, 148, 255))], ow=1.4)
        cv.flat([("cap", add(base, (0.6 * k, -1 * k)), add(bottom, (0.6 * k, 1 * k)), 1.6 * k, (150, 180, 220, 255)),
                 ("cap", add(base, (-1.6 * k, -3 * k)), add(base, (2.4 * k, -3 * k)), 2.0 * k, accent)])

    img = cv.finish()
    grip = {"x": round(cv.T(W)[0], 2), "y": round(cv.T(W)[1], 2), "a": round(aim + p["rot"], 4), "v": 1 if p["weapon"] else 0}
    return img, grip


def normalize_death(img: Image.Image, action: str, f: int) -> Image.Image:
    """Death frames are drawn on a taller canvas; land the corpse on the foot line, then crop to the cell."""
    if action != "death":
        return img
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if f < 3:
        out.alpha_composite(img.crop((0, 0, CELL, CELL)))
        return out
    box = img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    out.alpha_composite(img, (0, FOOT_Y - box[3]))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-root", type=Path, required=True)
    args = parser.parse_args()
    grips: dict = {}
    for enemy_type in TYPES:
        grips[enemy_type] = {}
        for action in ACTIONS:
            folder = args.frames_root / enemy_type / action
            folder.mkdir(parents=True, exist_ok=True)
            rows = []
            for f in range(FRAMES):
                img, grip = render_frame(enemy_type, action, f)
                img = normalize_death(img, action, f)
                img.save(folder / f"{f:02d}.png", optimize=True)
                rows.append(grip)
            grips[enemy_type][action] = rows
    (args.frames_root / "grips.json").write_text(json.dumps({"cell": CELL, "pivot": [PIVOT_X, FOOT_Y], "grips": grips}, indent=1) + "\n", encoding="utf-8")
    print(f"rendered {len(TYPES) * len(ACTIONS) * FRAMES} frames -> {args.frames_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
