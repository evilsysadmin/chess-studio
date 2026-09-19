#!/usr/bin/env python3
"""Fail-closed strict validation for Matthias v10 variable-frame atlas."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import statistics
from PIL import Image

COLS=12; ROWS=9; CELL=256; SIZE=(3072,2304); PIVOT=95.0; FOOT=232.0; TOL=4.0; GUARD=8
ACTIONS=(
 ("idle",8,6.0,True),("walk",10,12.0,True),("run",12,16.0,True),
 ("jump",6,12.0,False),("fall",4,10.0,True),("land",4,14.0,False),
 ("crouch",4,8.0,True),("crouch_walk",8,10.0,True),("move_fire",6,15.0,False),
)

def fail(msg): raise SystemExit(msg)
def args():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); return p.parse_args()

def anchor(cell):
 box=cell.getchannel("A").getbbox()
 if box is None: fail("cannot anchor empty cell")
 sprite=cell.crop(box); px=sprite.load(); w,h=sprite.size; pts=[]
 for y in range(int(h*.42),h):
  for x in range(w):
   r,g,b,a=px[x,y]
   if a>40 and max(r,g,b)<220: pts.append((x,y))
 if not pts: fail("cannot anchor empty sprite")
 my=max(y for _,y in pts); band=max(3,int(round(h*.06))); xs=sorted(x for x,y in pts if y>=my-band)
 return float(box[0]+statistics.median(xs)),float(box[1]+my)

def hot_score(cell):
 score=0
 for r,g,b,a in cell.get_flattened_data():
  if a>40 and r>190 and g>90 and b<100 and r>g*1.1 and g>b*1.15: score+=1
 return score

def main():
 a=args(); im=Image.open(a.atlas)
 if im.format!='PNG' or im.mode!='RGBA' or im.size!=SIZE: fail(f'PNG contract mismatch format={im.format} mode={im.mode} size={im.size}')
 data=json.loads(a.manifest.read_text(encoding='utf-8'))
 if data.get('schema')!=1 or data.get('version')!='v10': fail('manifest schema/version mismatch')
 at=data.get('atlas',{})
 if (at.get('columns'),at.get('rows'),at.get('cell_size'),at.get('width'),at.get('height'))!=(COLS,ROWS,CELL,*SIZE): fail('manifest atlas layout mismatch')
 if abs(float(at.get('pivot_x',-999))-PIVOT)>.001 or abs(float(at.get('foot_y',-999))-FOOT)>.001: fail('manifest pivot/foot mismatch')
 digest=hashlib.sha256(a.atlas.read_bytes()).hexdigest()
 if at.get('sha256')!=digest: fail('manifest atlas sha256 mismatch')
 acts=data.get('actions',[])
 expected=[{'name':n,'frames':c,'fps':fps,'loop':loop} for n,c,fps,loop in ACTIONS]
 if len(acts)!=ROWS: fail(f'action count mismatch: {len(acts)}')
 heights={}; hashes={}
 for row,exp in enumerate(expected):
  got=acts[row]
  for k,v in exp.items():
   if got.get(k)!=v: fail(f'action contract drift row={row} key={k} expected={v} actual={got.get(k)}')
  if got.get('row')!=row: fail(f'action row drift: {got}')
  count=exp['frames']; hs=[]; hh=set()
  for col in range(COLS):
   cell=im.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); box=cell.getchannel('A').getbbox()
   if col>=count:
    if box is not None: fail(f'unused cell contains pixels: {exp["name"]}[{col}]')
    continue
   if box is None: fail(f'empty used cell: {exp["name"]}[{col}]')
   guard=min(box[0],box[1],CELL-box[2],CELL-box[3])
   if guard<GUARD: fail(f'cell bleed risk {exp["name"]}[{col}] guard={guard}')
   ax,ay=anchor(cell)
   if abs(ax-PIVOT)>TOL or abs(ay-FOOT)>TOL: fail(f'anchor drift {exp["name"]}[{col}] x={ax:.1f} y={ay:.1f}')
   hs.append(box[3]-box[1]); hh.add(hashlib.sha256(cell.tobytes()).hexdigest())
   if exp['name']=='move_fire' and hot_score(cell)<250: fail(f'move_fire muzzle flash missing/weak frame={col}')
  heights[exp['name']]=statistics.median(hs); hashes[exp['name']]=len(hh)
  if count>1 and len(hh)<max(2,count-1): fail(f'animation lacks frame diversity {exp["name"]}: unique={len(hh)} frames={count}')
 if not 128<=heights['idle']<=142: fail(f'idle scale out of contract: {heights["idle"]}')
 if heights['crouch']>heights['idle']-15: fail(f'crouch not low enough: idle={heights["idle"]} crouch={heights["crouch"]}')
 if heights['crouch_walk']>heights['idle']-20: fail(f'crouch_walk not low enough: idle={heights["idle"]} crouch_walk={heights["crouch_walk"]}')
 print('OK strict-v10 variable Godot atlas',SIZE,'actions=',','.join(f'{n}:{c}' for n,c,_,_ in ACTIONS))

if __name__=='__main__': main()
