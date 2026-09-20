#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image
from png_contract import validate_png_contract
CELL=416;COLS=8;ROWS=18;SIZE=(3328,7488);GUARD=2

def hashes(a):
    return [hashlib.sha256(a[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL].tobytes()).hexdigest() for r in range(ROWS) for c in range(COLS)]
def bbox(cell):
    ys,xs=np.where(cell[...,3]>20); return None if not len(xs) else (int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
def main():
    p=argparse.ArgumentParser();p.add_argument('--atlas',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--baseline',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
    png=validate_png_contract(a.atlas); new=np.asarray(Image.open(a.atlas).convert('RGBA'));old=np.asarray(Image.open(a.baseline).convert('RGBA'));m=json.loads(a.manifest.read_text()); errors=[]
    if (new.shape[1],new.shape[0])!=SIZE or old.shape!=new.shape: errors.append('bad atlas size')
    if m.get('version')!='v18' or m.get('weapon')!='pistol': errors.append('bad manifest identity')
    changed=int(np.any(new!=old,axis=2).sum());
    if not 100_000<=changed<=1_500_000: errors.append(f'suspicious changed pixels: {changed}')
    hs=hashes(new); distinct=[len(set(hs[r*COLS:(r+1)*COLS])) for r in range(ROWS)]
    if min(distinct)<8: errors.append(f'duplicate row frame(s): {distinct}')
    bottoms=[]; heights=[]; guard_ok=True
    for r in range(ROWS):
      for c in range(COLS):
        cell=new[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL]; bb=bbox(cell)
        if bb:
          x1,y1,x2,y2=bb; bottoms.append(y2); heights.append(y2-y1)
        edge=np.concatenate([cell[:GUARD].reshape(-1,4),cell[-GUARD:].reshape(-1,4),cell[:,:GUARD].reshape(-1,4),cell[:,-GUARD:].reshape(-1,4)])
        if np.any(edge[:,3]!=0): guard_ok=False
    if not guard_ok: errors.append('cell guard violated')
    if min(bottoms)<380 or max(bottoms)>389: errors.append(f'foot/bottom line drift: {min(bottoms)}..{max(bottoms)}')
    # Preserve non-weapon body footprint: overall height distribution must stay close.
    old_heights=[]
    for r in range(ROWS):
      for c in range(COLS):
        bb=bbox(old[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL]);
        if bb: old_heights.append(bb[3]-bb[1])
    if abs(float(np.median(heights))-float(np.median(old_heights)))>6: errors.append('median body height drifted')
    report={'ok':not errors,'errors':errors,'summary':{'frames':144,'rows':18,'all_rows_8_distinct':min(distinct)==8,'changed_pixels':changed,'guard_ok':guard_ok,'bottom_y_range':[min(bottoms),max(bottoms)],'median_height':float(np.median(heights)),'baseline_median_height':float(np.median(old_heights)),'sha256':png['sha256']}}
    a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if errors: raise SystemExit('\n'.join(errors))
    print('OK strict-v18 atlas',report['summary'])
if __name__=='__main__': main()
