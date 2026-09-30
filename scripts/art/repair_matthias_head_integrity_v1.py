#!/usr/bin/env python3
"""Deterministically repair Matthias head/cap integrity on top of pose-semantics-v1.

Inputs are the pinned pose-semantics-v1 runtime atlases (sha256-verified), so the
candidate is reproducible whatever the runtime currently points at. Only pixels
already authored in the same banks are reused; nothing is generated.

Repairs (issue #4447):
- pistol: straight transparent "eraser" cuts through the face/cap front in
  crouch, shoot, directional shoot and shoot_crouch rows. Each damaged frame is
  filled from an intact frame of the same animation, aligned by alpha IoU on the
  intact side of the cut. Only transparent pixels on the cut side, inside the
  head/chin band, are filled; existing pixels are never modified.
- machinegun: torn caps in crouch/shoot_crouch are rebuilt with the
  pose-semantics geometry (rigid upper-body translation to the idle crouch top,
  no rescale) using the intact idle/shoot upper body over the frame's own
  grounded legs; ragged walk legs take the accepted shotgun walk leg cycle
  (same canonical scale and footline); run takes 8 evenly spaced phases of the
  repaired machinegun run13 overlay.
Every other frame stays pixel-identical. Fail-closed guards: pinned inputs,
unchanged-frame identity, footline stability, alignment quality and a
post-repair straight-cut metric on the pistol head rows.

usage:
  repair_matthias_head_integrity_v1.py --print-sources
  repair_matthias_head_integrity_v1.py --self-test
  repair_matthias_head_integrity_v1.py --sources-dir DIR --output-dir DIR
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

KIND = "matthias-head-integrity-v1"
CELL = 416
COLUMNS = 8
ROWS = 18
ALPHA_MIN = 8

R2 = "https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/matthias"
SOURCES = {
    "pistol": (
        f"{R2}/pose-semantics-v1/pistol/full/matthias-pistol-pose-semantics-v1-2000f78183cea6f5.png",
        "2000f78183cea6f5ffcfe71f0e416a280409efb0426aa4d1029f0a080b49279d",
    ),
    "machinegun": (
        f"{R2}/pose-semantics-v1/machinegun/full/matthias-machinegun-pose-semantics-v1-769398f427278c03.png",
        "769398f427278c03e1ee4d977dafa101827acf602e655a270c26a3411b0e1e08",
    ),
    "shotgun": (
        f"{R2}/pose-semantics-v1/shotgun/full/matthias-shotgun-pose-semantics-v1-9d2ed6f7aba558ac.png",
        "9d2ed6f7aba558aca6368f43befda8d73bd9b587a1f2a174edea16286a6c00c7",
    ),
    "panzerfaust": (
        f"{R2}/pose-semantics-v1/panzerfaust/full/matthias-panzerfaust-pose-semantics-v1-8419aad1ba321249.png",
        "8419aad1ba3212493a590e8349fe37b28d4b3a3ceca06d8e50ce51d7c62a4256",
    ),
    "machinegun-run13": (
        f"{R2}/continuity-repair/machinegun/run13/machinegun-run13-repaired-f37fd16c29eb44db.png",
        "f37fd16c29eb44dbaf98acd568e22ca7568a41cfad1f2ecb34d0d8ad9539768a",
    ),
}
REPAIRED_WEAPONS = ("pistol", "machinegun")

# --- pistol straight-cut fill -------------------------------------------------
ALIGN_BAND = 0.46   # head + cap: alignment zone
FILL_BAND = 0.62    # head + cap + chin/neck: where filling is allowed
SEARCH = 22
CUT_MARGIN = 1
CUT_X_RANGE = (200, 270)  # observed cuts sit at x=221..268; arm/gun edges lie further right
MIN_ALIGN_IOU = 0.94
MAX_POST_CUT = 30         # longest straight right edge allowed in repaired pistol head rows
# row -> (targets, donor_row, donors). Donors are intact frames of the same animation
# (shoot_down / shoot_diag_down borrow the intact straight-shoot heads).
PISTOL_PLAN = {
    6: ((1, 3, 6, 7), 6, (0, 2, 4, 5)),
    8: ((0, 1, 3, 5, 6), 8, (2, 4, 7)),
    9: ((0, 1, 3, 5, 6, 7), 9, (2, 4)),
    10: ((0, 1, 2, 3, 4, 5, 6, 7), 8, (2, 4, 7)),
    11: ((0, 1, 3, 5, 6, 7), 11, (2, 4)),
    12: ((0, 1, 3, 4, 5, 6, 7), 12, (2,)),
    13: ((0, 1, 2, 3, 4, 5, 6, 7), 8, (2, 4, 7)),
    14: ((0, 1, 3, 5, 6, 7), 14, (2, 4)),
}
POST_CUT_ROWS = (8, 9, 10, 11, 12, 13)

# --- machinegun (pose-semantics-v1 geometry) --------------------------------------
BODY_BAND = (0.30, 0.64)
UPPER_SPLIT_Y = 305
CROUCH_TARGET_HEIGHT_RATIO = 0.83
LEG_BOX = (95, 310, 285, CELL)
MG_CROUCH_REBUILD = ((6, 0), (14, 8))  # crouch <- idle, shoot_crouch <- shoot
MG_WALK_ROW = 1
MG_RUN_ROW = 2
RUN13_COLUMNS = 13
RUN13_PHASES = tuple(round(i * RUN13_COLUMNS / COLUMNS) for i in range(COLUMNS))  # 0,2,3,5,6,8,10,11
FOOT_TOLERANCE = 1

REVIEW_ROWS = {
    "pistol": ((6, "crouch"), (8, "shoot"), (9, "shoot_up"), (10, "shoot_down"), (11, "shoot_diag_up"),
               (12, "shoot_diag_up_alt"), (13, "shoot_diag_down"), (14, "shoot_crouch")),
    "machinegun": ((1, "walk"), (2, "run"), (6, "crouch"), (14, "shoot_crouch")),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)


def cell(arr: np.ndarray, row: int, col: int) -> np.ndarray:
    return arr[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]


def band(opaque: np.ndarray, frac: float) -> tuple[int, int]:
    ys = np.nonzero(opaque.any(1))[0]
    if ys.size == 0:
        raise ValueError("empty frame")
    top, bot = int(ys.min()), int(ys.max())
    return top, top + int(frac * (bot - top))


def foot(opaque: np.ndarray) -> int:
    return int(np.nonzero(opaque.any(1))[0].max())


def cut_edge(opaque: np.ndarray, y0: int, y1: int) -> tuple[int, int | None]:
    """(length, x) of the longest right-facing perfectly vertical alpha edge in CUT_X_RANGE."""
    right = opaque[:, :-1] & ~opaque[:, 1:]
    e = right[y0:y1].copy()
    e[:, :CUT_X_RANGE[0]] = False
    e[:, CUT_X_RANGE[1]:] = False
    run = np.zeros(e.shape[1], dtype=int)
    best: tuple[int, int | None] = (0, None)
    for yy in range(e.shape[0]):
        run = np.where(e[yy], run + 1, 0)
        m = int(run.max())
        if m > best[0]:
            best = (m, int(run.argmax()))
    return best


def head_cut_length(frame: np.ndarray) -> int:
    op = frame[..., 3] > ALPHA_MIN
    a0, _ = band(op, ALIGN_BAND)
    _, f1 = band(op, FILL_BAND)
    return cut_edge(op, a0, f1)[0]


def shifted(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(arr)
    ys0, ys1 = max(0, dy), min(CELL, CELL + dy)
    xs0, xs1 = max(0, dx), min(CELL, CELL + dx)
    out[ys0:ys1, xs0:xs1] = arr[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def fill_cut(target: np.ndarray, donors: list[tuple[int, np.ndarray]]) -> tuple[np.ndarray, dict]:
    top = target[..., 3] > ALPHA_MIN
    a0, a1 = band(top, ALIGN_BAND)
    f0, f1 = band(top, FILL_BAND)
    elen, ex = cut_edge(top, a0, f1)
    cutx = ex if ex is not None else CELL
    tmask = top[a0:a1, :cutx + 1]
    best = None
    for dc, don in donors:
        dop = don[..., 3] > ALPHA_MIN
        d0, _ = band(dop, ALIGN_BAND)
        base_dy = a0 - d0
        for dy in range(base_dy - SEARCH, base_dy + SEARCH + 1):
            for dx in range(-SEARCH, SEARCH + 1):
                dm = shifted(dop, dy, dx)[a0:a1, :cutx + 1]
                union = int((dm | tmask).sum())
                iou = int((dm & tmask).sum()) / max(1, union)
                if best is None or iou > best[0]:
                    best = (iou, dc, dy, dx)
    iou, dc, dy, dx = best
    don = dict(donors)[dc]
    moved = shifted(don, dy, dx)
    region = np.zeros_like(top)
    region[f0:f1, cutx + 1 - CUT_MARGIN:] = True
    fill = region & ~top & (moved[..., 3] > ALPHA_MIN)
    out = target.copy()
    out[fill] = moved[fill]
    return out, {"cutLen": int(elen), "cutX": int(cutx), "donorCol": int(dc), "iou": round(float(iou), 4),
                 "dy": int(dy), "dx": int(dx), "filled": int(fill.sum())}


def body_bbox(frame: np.ndarray) -> tuple[int, int, int, int]:
    alpha = frame[..., 3] >= 32
    x0, x1 = round(BODY_BAND[0] * CELL), round(BODY_BAND[1] * CELL)
    sub = alpha[:, x0:x1]
    ys = np.nonzero(sub.any(1))[0]
    xs = np.nonzero(sub.any(0))[0]
    if ys.size == 0:
        raise ValueError("no alpha in Matthias body measurement band")
    return (x0 + int(xs.min()), int(ys.min()), x0 + int(xs.max()) + 1, int(ys.max()) + 1)


def idle_target_top(atlas: np.ndarray) -> int:
    boxes = [body_bbox(cell(atlas, 0, c)) for c in range(COLUMNS)]
    return round(statistics.median(b[3] for b in boxes)
                 - CROUCH_TARGET_HEIGHT_RATIO * statistics.median(b[3] - b[1] for b in boxes))


def crouch_from_upper(crouch: np.ndarray, upper_src: np.ndarray, target_top: int) -> np.ndarray:
    dy = max(0, target_top - body_bbox(upper_src)[1])
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(Image.fromarray(crouch).crop(LEG_BOX), (LEG_BOX[0], LEG_BOX[1]))
    out.alpha_composite(Image.fromarray(upper_src).crop((0, 0, CELL, UPPER_SPLIT_Y)), (0, dy))
    return np.array(out)


def transplant_legs(target: np.ndarray, donor: np.ndarray) -> np.ndarray:
    out = Image.fromarray(target).copy()
    out.paste((0, 0, 0, 0), LEG_BOX)
    out.alpha_composite(Image.fromarray(donor).crop(LEG_BOX), (LEG_BOX[0], LEG_BOX[1]))
    return np.array(out)


def load(path: Path, size: tuple[int, int]) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    if img.size != size:
        raise ValueError(f"{path.name}: unexpected size {img.size}, expected {size}")
    return np.array(img)


def verify_sources(sources_dir: Path) -> dict[str, Path]:
    paths = {}
    for name, (url, digest) in SOURCES.items():
        path = sources_dir / Path(url).name
        if not path.is_file():
            raise FileNotFoundError(f"missing pinned source {name}: {path}")
        actual = sha256(path)
        if actual != digest:
            raise ValueError(f"pinned source drift {name}: {actual} != {digest}")
        paths[name] = path
    return paths


def render_review(before: dict[str, np.ndarray], after: dict[str, np.ndarray], output: Path) -> None:
    scale, label_h = 0.25, 24
    panels = []
    for weapon, rows in REVIEW_ROWS.items():
        for row, name in rows:
            pair = []
            for tag, atlas in (("BEFORE", before[weapon]), ("AFTER", after[weapon])):
                strip = Image.fromarray(atlas[row * CELL:(row + 1) * CELL])
                reduced = strip.resize((round(strip.width * scale), round(strip.height * scale)),
                                       Image.Resampling.NEAREST)
                p = Image.new("RGBA", (reduced.width, reduced.height + label_h), (20, 22, 26, 255))
                ImageDraw.Draw(p).text((6, 5), f"{weapon} {name} {tag}", fill=(240, 240, 240, 255))
                p.alpha_composite(reduced, (0, label_h))
                pair.append(p)
            panel = Image.new("RGBA", (pair[0].width, pair[0].height * 2), (16, 18, 22, 255))
            panel.alpha_composite(pair[0], (0, 0))
            panel.alpha_composite(pair[1], (0, pair[0].height))
            panels.append(panel)
    board = Image.new("RGBA", (max(p.width for p in panels), sum(p.height for p in panels)), (12, 14, 18, 255))
    y = 0
    for p in panels:
        board.alpha_composite(p, (0, y))
        y += p.height
    save_png(board, output)


def repair(sources_dir: Path, output: Path) -> dict:
    paths = verify_sources(sources_dir)
    size = (COLUMNS * CELL, ROWS * CELL)
    src = {w: load(paths[w], size) for w in ("pistol", "machinegun", "shotgun")}
    run13 = load(paths["machinegun-run13"], (RUN13_COLUMNS * CELL, CELL))
    out = {w: src[w].copy() for w in REPAIRED_WEAPONS}
    changed: set[tuple[str, int, int]] = set()
    log: list[dict] = []

    # Pistol: same-animation donor fill of straight head cuts.
    p_src, p_out = src["pistol"], out["pistol"]
    for row, (targets, donor_row, donor_cols) in PISTOL_PLAN.items():
        donors = [(dc, cell(p_src, donor_row, dc)) for dc in donor_cols]
        for c in targets:
            repaired, info = fill_cut(cell(p_src, row, c), donors)
            if info["iou"] < MIN_ALIGN_IOU:
                raise ValueError(f"pistol r{row} c{c}: donor alignment IoU {info['iou']} < {MIN_ALIGN_IOU}")
            cell(p_out, row, c)[:] = repaired
            changed.add(("pistol", row, c))
            log.append({"weapon": "pistol", "row": row, "col": c, "op": "cut-fill", "donorRow": donor_row, **info})

    # Machinegun: crouch family rebuilt from intact upper bodies (pose-semantics geometry).
    m_src, m_out = src["machinegun"], out["machinegun"]
    target_top = idle_target_top(m_src)
    for row, upper_row in MG_CROUCH_REBUILD:
        for c in range(COLUMNS):
            cell(m_out, row, c)[:] = crouch_from_upper(cell(m_src, row, c), cell(m_src, upper_row, c), target_top)
            changed.add(("machinegun", row, c))
            log.append({"weapon": "machinegun", "row": row, "col": c, "op": "crouch-rebuild",
                        "upperRow": upper_row, "targetTop": target_top})
    for c in range(COLUMNS):
        cell(m_out, MG_WALK_ROW, c)[:] = transplant_legs(cell(m_src, MG_WALK_ROW, c),
                                                         cell(src["shotgun"], MG_WALK_ROW, c))
        changed.add(("machinegun", MG_WALK_ROW, c))
        log.append({"weapon": "machinegun", "row": MG_WALK_ROW, "col": c, "op": "walk-legs", "donor": "shotgun"})
    for c, phase in enumerate(RUN13_PHASES):
        cell(m_out, MG_RUN_ROW, c)[:] = run13[:, phase * CELL:(phase + 1) * CELL]
        changed.add(("machinegun", MG_RUN_ROW, c))
        log.append({"weapon": "machinegun", "row": MG_RUN_ROW, "col": c, "op": "run13-phase", "phase": phase})

    # Guards.
    for w in REPAIRED_WEAPONS:
        for r in range(ROWS):
            for c in range(COLUMNS):
                a, b = cell(src[w], r, c), cell(out[w], r, c)
                if (w, r, c) not in changed:
                    if not np.array_equal(a, b):
                        raise ValueError(f"unaffected-frame-drift:{w}:r{r}:c{c}")
                    continue
                fa, fb = foot(a[..., 3] > ALPHA_MIN), foot(b[..., 3] > ALPHA_MIN)
                if abs(fa - fb) > FOOT_TOLERANCE:
                    raise ValueError(f"footline-drift:{w}:r{r}:c{c}:{fa}->{fb}")
    post_cut = {}
    for r in POST_CUT_ROWS:
        worst = max(head_cut_length(cell(out["pistol"], r, c)) for c in range(COLUMNS))
        post_cut[r] = worst
        if worst > MAX_POST_CUT:
            raise ValueError(f"pistol r{r}: straight head cut {worst}px survives repair (> {MAX_POST_CUT})")

    atlas_dir = output / "atlases"
    atlases = {}
    for w in REPAIRED_WEAPONS:
        path = atlas_dir / f"matthias-{w}-head-integrity-v1.png"
        save_png(Image.fromarray(out[w]), path)
        atlases[w] = {"path": str(path), "sha256": sha256(path)}
    review = output / f"{KIND}-review.png"
    render_review(src, out, review)
    (output / f"{KIND}-log.json").write_text(json.dumps(log, indent=1) + "\n", encoding="utf-8")
    payload = {
        "schema": 1,
        "kind": KIND,
        "base": "pose-semantics-v1",
        "rows": ROWS,
        "columns": COLUMNS,
        "cellSize": CELL,
        "sources": {k: {"url": u, "sha256": d} for k, (u, d) in SOURCES.items()},
        "changedFrames": len(changed),
        "unchangedFramesPixelIdentical": True,
        "pistolPostRepairMaxHeadCut": {str(k): v for k, v in post_cut.items()},
        "atlases": atlases,
        "review": {"path": str(review), "sha256": sha256(review)},
    }
    (output / f"{KIND}-manifest.json").write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n",
                                                  encoding="utf-8")
    return payload


def self_test() -> None:
    # Synthetic head with a vertical eraser cut; the donor is the intact head.
    donor = np.zeros((CELL, CELL, 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    head = (yy - 170) ** 2 + (xx - 215) ** 2 <= 60 ** 2
    body = (yy >= 220) & (yy <= 381) & (xx >= 150) & (xx <= 285)  # straight flank outside CUT_X_RANGE
    donor[head | body] = (200, 150, 120, 255)
    target = donor.copy()
    cut = head & (xx > 240)
    target[cut] = 0
    if head_cut_length(target) < 40:
        raise AssertionError("synthetic cut not detected")
    repaired, info = fill_cut(target, [(0, donor)])
    if info["iou"] < 0.99 or (info["dy"], info["dx"]) != (0, 0):
        raise AssertionError(f"donor alignment failed: {info}")
    if not np.array_equal(repaired[target[..., 3] > ALPHA_MIN], target[target[..., 3] > ALPHA_MIN]):
        raise AssertionError("existing pixels were modified")
    if head_cut_length(repaired) > MAX_POST_CUT:
        raise AssertionError("cut survived repair")
    # Crouch rebuild keeps the grounded legs and translates the upper body rigidly.
    upper = np.zeros_like(donor)
    upper[150:305, 150:260] = (10, 20, 30, 255)
    legs = np.zeros_like(donor)
    legs[310:382, 150:240] = (40, 50, 60, 255)
    rebuilt = crouch_from_upper(legs, upper, 190)
    if tuple(rebuilt[190, 150]) != (10, 20, 30, 255) or tuple(rebuilt[381, 150]) != (40, 50, 60, 255):
        raise AssertionError("crouch rebuild is not pixel-preserving")
    if RUN13_PHASES != (0, 2, 3, 5, 6, 8, 10, 11):
        raise AssertionError(f"unexpected run13 sampling {RUN13_PHASES}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources-dir", type=Path)
    ap.add_argument("--output-dir", type=Path)
    ap.add_argument("--print-sources", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.print_sources:
        for name, (url, digest) in SOURCES.items():
            print(name, url, digest)
        return 0
    if args.self_test:
        self_test()
        print("Matthias head integrity v1 self-test: OK")
        return 0
    if args.sources_dir is None or args.output_dir is None:
        raise SystemExit("--sources-dir and --output-dir are required")
    print(json.dumps(repair(args.sources_dir, args.output_dir), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
