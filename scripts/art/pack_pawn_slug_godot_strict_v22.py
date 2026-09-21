#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

VERSION="v22"; WEAPON="pistol"
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
FOOT_Y=382; PIVOT_X=200.0; GUARD=2
SQUASH_Y=0.84
CHANGED_ROWS={6:"crouch",7:"crouch_walk",14:"shoot_crouch"}
ACTIONS=["idle","walk","run","jump","fall","land","crouch","crouch_walk","shoot","shoot_up","shoot_down","shoot_diag_up","shoot_diag_up_alt","shoot_diag_down","shoot_crouch","reload","hurt","die"]

def sha(path: Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def clean(cell: Image.Image)->Image.Image:
    px=cell.load()
    for y in range(CELL):
        for x in range(CELL):
            r,g,b,a=px[x,y]
            if a==0 or x<GUARD or y<GUARD or x>=CELL-GUARD or y>=CELL-GUARD:
                px[x,y]=(0,0,0,0)
    return cell

def crouchify(cell: Image.Image)->Image.Image:
    bb=cell.getchannel("A").getbbox()
    if not bb: return cell.copy()
    sprite=cell.crop(bb)
    sprite=sprite.resize((sprite.width,round(sprite.height*SQUASH_Y)),Image.Resampling.NEAREST)
    out=Image.new("RGBA",(CELL,CELL),(0,0,0,0))
    x=(bb[0]+bb[2])//2-sprite.width//2
    y=FOOT_Y-sprite.height
    out.alpha_composite(sprite,(x,y))
    return clean(out)

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--baseline",type=Path)
    p.add_argument("--output",type=Path)
    p.add_argument("--manifest",type=Path)
    p.add_argument("--self-test",action="store_true")
    a=p.parse_args()
    if a.self_test:
        assert SIZE==(3328,7488) and len(ACTIONS)==18 and sorted(CHANGED_ROWS)==[6,7,14]
        print("OK strict-v22 crouch pack self-test"); return 0
    if not all((a.baseline,a.output,a.manifest)):
        raise SystemExit("baseline/output/manifest required")
    base=Image.open(a.baseline).convert("RGBA")
    if base.size!=SIZE: raise SystemExit(f"expected {SIZE}, got {base.size}")
    out=base.copy()
    for row in CHANGED_ROWS:
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)
            out.paste(crouchify(base.crop(box)),(col*CELL,row*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    out.save(a.output,"PNG",compress_level=9)
    manifest={
      "schema":1,"kind":"pawn-slug-godot-strict-atlas","version":VERSION,"weapon":WEAPON,
      "baseline":{"filename":a.baseline.name,"sha256":sha(a.baseline),"generation":"v21"},
      "atlas":{"filename":a.output.name,"sha256":sha(a.output),"columns":COLS,"rows":ROWS,"cell_size":CELL,"width":SIZE[0],"height":SIZE[1],"pivot_x":PIVOT_X,"foot_y":FOOT_Y,"frames_per_pose":COLS,"cell_guard_px":GUARD},
      "actions":{name:{"row":row,"frames":COLS} for row,name in enumerate(ACTIONS)},
      "processing":{"blender":False,"kind":"2d-crouch-height-correction","changed_rows":sorted(CHANGED_ROWS),"preserved_rows":[r for r in range(ROWS) if r not in CHANGED_ROWS],"vertical_scale":SQUASH_Y,"footline_preserved":FOOT_Y,"weapon_contract":"strict-v21 P99 silhouette preserved","layout_contract":"fixed 8x18 grid"}
    }
    a.manifest.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    print(a.output); return 0
if __name__=="__main__": raise SystemExit(main())
