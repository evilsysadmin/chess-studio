#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
CELL=416; COLS=12; SIZE=(4992,416)
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--weapon',required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args(); im=Image.open(a.atlas).convert('RGBA'); errors=[]
 if im.size!=SIZE: errors.append(f'size={im.size}')
 hashes=[]; feet=[]; dirty=0; guard=[]; empty=[]
 for c in range(COLS):
  x=im.crop((c*CELL,0,(c+1)*CELL,CELL)); bb=x.getchannel('A').getbbox(); hashes.append(hashlib.sha256(x.tobytes()).hexdigest())
  if not bb: empty.append(c)
  else: feet.append(bb[3])
  px=x.load(); dirty+=sum(1 for rr,gg,bbv,aa in x.getdata() if aa==0 and (rr or gg or bbv))
  if any(px[q,y][3] for q in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x0,q][3] for q in range(CELL) for x0 in (0,1,CELL-2,CELL-1)): guard.append(c)
 if len(set(hashes))!=12: errors.append('run frames are not 12 distinct images')
 if feet and set(feet)!={382}: errors.append(f'footline={sorted(set(feet))}')
 if empty: errors.append(f'empty={empty}')
 if dirty: errors.append(f'dirty={dirty}')
 if guard: errors.append(f'guard={guard}')
 rep={'ok':not errors,'errors':errors,'summary':{'weapon':a.weapon,'distinct':len(set(hashes)),'footline':sorted(set(feet)),'empty':empty,'dirty':dirty,'guard':guard}}
 a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()