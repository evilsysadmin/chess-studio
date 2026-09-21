#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); FOOT=382
REGENERATED={0,1,2,6,8,14,16}; RETAINED={3,4,5,7,9,10,11,12,13,15,17}
HURT_COUNT=6

def digest(im): return hashlib.sha256(im.tobytes()).hexdigest()
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--run13',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
 atlas=Image.open(a.atlas).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); run=Image.open(a.run13).convert('RGBA'); errors=[]
 if atlas.size!=SIZE or base.size!=SIZE: errors.append(f'atlas size {atlas.size}/{base.size}')
 if run.size!=(CELL*13,CELL): errors.append(f'run13 size {run.size}')
 rows_distinct=[]; empty=[]; dirty=0; guard=[]; feet=[]
 for row in range(ROWS):
  hs=[]
  for col in range(COLS):
   box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL); im=atlas.crop(box); bb=im.getchannel('A').getbbox(); hs.append(digest(im))
   should_empty=(row==16 and col>=HURT_COUNT)
   if not bb and not should_empty: empty.append((row,col))
   if bb and should_empty: errors.append(f'hurt unused cell not empty {(row,col)}')
   if bb and row in REGENERATED:
    if bb[3]!=FOOT: feet.append((row,col,bb[3]))
   px=im.load(); dirty += sum(1 for r,g,b,aa in im.getdata() if aa==0 and (r or g or b))
   if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((row,col))
   if row in RETAINED and im.tobytes()!=base.crop(box).tobytes(): errors.append(f'retained row changed {(row,col)}')
  rows_distinct.append(len(set(hs[:HURT_COUNT] if row==16 else hs)))
 if empty: errors.append(f'empty={empty[:8]}')
 if dirty: errors.append(f'dirty transparent rgb={dirty}')
 if guard: errors.append(f'guard={guard[:8]}')
 if feet: errors.append(f'footline={feet[:8]}')
 for row in REGENERATED-{16}:
  if rows_distinct[row] < 8: errors.append(f'row {row} distinct={rows_distinct[row]}')
 if rows_distinct[16] < HURT_COUNT: errors.append(f'hurt distinct={rows_distinct[16]}')
 # run13
 rhs=[]; rfeet=[]; rempty=[]; rdirty=0; rguard=[]
 for col in range(13):
  im=run.crop((col*CELL,0,(col+1)*CELL,CELL)); bb=im.getchannel('A').getbbox(); rhs.append(digest(im))
  if not bb: rempty.append(col)
  elif bb[3]!=FOOT: rfeet.append((col,bb[3]))
  px=im.load(); rdirty += sum(1 for r,g,b,aa in im.getdata() if aa==0 and (r or g or b))
  if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): rguard.append(col)
 if len(set(rhs))!=13: errors.append(f'run13 distinct={len(set(rhs))}')
 if rempty: errors.append(f'run13 empty={rempty}')
 if rfeet: errors.append(f'run13 footline={rfeet}')
 if rdirty: errors.append(f'run13 dirty={rdirty}')
 if rguard: errors.append(f'run13 guard={rguard}')
 rep={'ok':not errors,'errors':errors,'summary':{'rows_distinct':rows_distinct,'regenerated_rows':sorted(REGENERATED),'retained_rows':sorted(RETAINED),'hurt_frames':HURT_COUNT,'run13_distinct':len(set(rhs)),'footline':FOOT}}
 a.report.parent.mkdir(parents=True,exist_ok=True); a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()