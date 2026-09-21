#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
def h(x): return hashlib.sha256(x).hexdigest()
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
 im=Image.open(a.atlas).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); errors=[]
 if im.size!=SIZE or base.size!=SIZE: errors.append('size')
 distinct=[]; empty=[]; dirty=0; guard=[]; lower_changed=[]
 for r in range(ROWS):
  hs=[]
  for c in range(COLS):
   box=(c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL); x=im.crop(box); b=base.crop(box); bb=x.getchannel('A').getbbox(); hs.append(h(x.tobytes()))
   if not bb: empty.append((r,c))
   px=x.load(); dirty+=sum(1 for rr,gg,bbv,aa in x.getdata() if aa==0 and (rr or gg or bbv))
   if any(px[q,y][3] for q in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x0,q][3] for q in range(CELL) for x0 in (0,1,CELL-2,CELL-1)): guard.append((r,c))
   # Weapon cleanup must not touch legs/foot geometry.
   if x.crop((0,300,240,CELL)).tobytes()!=b.crop((0,300,240,CELL)).tobytes(): lower_changed.append((r,c))
  distinct.append(len(set(hs)))
 if empty: errors.append(f'empty={empty[:4]}')
 if min(distinct)<8: errors.append(f'duplicate rows={distinct}')
 if dirty: errors.append(f'dirty transparent rgb={dirty}')
 if guard: errors.append(f'guard={guard[:4]}')
 if lower_changed: errors.append(f'lower body changed={lower_changed[:8]}')
 rep={'ok':not errors,'errors':errors,'summary':{'rows_distinct':distinct,'empty':len(empty),'dirty':dirty,'guard':len(guard),'lower_body_unchanged':not lower_changed}}
 a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()