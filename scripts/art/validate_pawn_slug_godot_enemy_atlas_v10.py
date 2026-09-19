#!/usr/bin/env python3
"""Fail-closed validator for strict Pawn Slug Godot enemy atlases."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

CELL=96; COLS=16; ROWS=7; SIZE=(1536,672); GUARD=2
ACTIONS=(
 ("idle",12,6.0,True),("run",16,12.0,True),("jump",10,12.0,False),
 ("crouch",8,8.0,True),("hurt",6,14.0,False),("climb",12,10.0,True),
 ("death",14,10.0,False),
)

def fail(msg): raise SystemExit(msg)

def parse_args():
 p=argparse.ArgumentParser()
 p.add_argument("--atlas",type=Path,required=True)
 p.add_argument("--manifest",type=Path,required=True)
 p.add_argument("--enemy-type",required=True)
 return p.parse_args()

def main():
 a=parse_args()
 image=Image.open(a.atlas)
 if image.format!="PNG" or image.mode!="RGBA" or image.size!=SIZE:
  fail(f"PNG contract mismatch format={image.format} mode={image.mode} size={image.size}")
 data=json.loads(a.manifest.read_text(encoding="utf-8"))
 if data.get("schema")!=1 or data.get("version")!="enemy-v10":
  fail("manifest schema/version mismatch")
 if data.get("enemy_type")!=a.enemy_type:
  fail(f"enemy type mismatch: {data.get('enemy_type')!r} != {a.enemy_type!r}")
 meta=data.get("atlas",{})
 expected_meta=(COLS,ROWS,CELL,*SIZE)
 actual_meta=(meta.get("columns"),meta.get("rows"),meta.get("cell_size"),meta.get("width"),meta.get("height"))
 if actual_meta!=expected_meta:
  fail(f"atlas metadata mismatch: {actual_meta} != {expected_meta}")
 if meta.get("cell_guard_min_px")!=GUARD:
  fail("cell guard contract drift")
 if meta.get("sha256")!=hashlib.sha256(a.atlas.read_bytes()).hexdigest():
  fail("atlas sha256 mismatch")

 actions=data.get("actions",[])
 if len(actions)!=ROWS:
  fail(f"action count mismatch: {len(actions)}")
 for row,(name,count,fps,loop) in enumerate(ACTIONS):
  action=actions[row]
  expected={"name":name,"row":row,"frames":count,"fps":fps,"loop":loop}
  for key,value in expected.items():
   if action.get(key)!=value:
    fail(f"{name}: manifest drift {key} expected={value!r} actual={action.get(key)!r}")
  hashes=set()
  for col in range(COLS):
   cell=image.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL))
   box=cell.getchannel("A").point(lambda v:255 if v>=24 else 0).getbbox()
   if col>=count:
    if box is not None:
     fail(f"unused cell contains pixels: {name}[{col}] bbox={box}")
    continue
   if box is None:
    fail(f"used cell is empty: {name}[{col}]")
   guard=min(box[0],box[1],CELL-box[2],CELL-box[3])
   if guard<GUARD:
    fail(f"cell guard violation: {name}[{col}] guard={guard} bbox={box}")
   hashes.add(hashlib.sha256(cell.tobytes()).hexdigest())
  min_unique=max(2,int(math.ceil(count*.50)))
  if len(hashes)<min_unique:
   fail(f"{name}: insufficient frame diversity unique={len(hashes)} frames={count}")
 print(f"OK strict enemy-v10 {a.enemy_type}: atlas={SIZE[0]}x{SIZE[1]} total_frames={sum(x[1] for x in ACTIONS)}")

if __name__=="__main__":
 main()
