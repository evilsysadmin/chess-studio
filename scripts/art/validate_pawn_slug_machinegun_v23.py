#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); REGEN={0,1,2,6,8,14,16}
def dig(im): return hashlib.sha256(im.tobytes()).hexdigest()
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--run13',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args(); errors=[]
 atlas=Image.open(a.atlas).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); run=Image.open(a.run13).convert('RGBA'); man=json.loads(a.manifest.read_text())
 if atlas.size!=SIZE or base.size!=SIZE: errors.append('atlas size')
 if run.size!=(CELL*13,CELL): errors.append(f'run13 size={run.size}')
 distinct=[]; dirty=0; guard=[]; retained=[]; feet={}
 for row in range(ROWS):
  hs=[]; feet[row]=[]
  for col in range(COLS):
   box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL); im=atlas.crop(box); b=base.crop(box); bb=im.getchannel('A').getbbox(); hs.append(dig(im))
   if not bb: errors.append(f'empty {(row,col)}')
   else: feet[row].append(bb[3])
   px=im.load(); dirty+=sum(1 for r,g,bv,aa in im.getdata() if aa==0 and (r or g or bv))
   if any(px[q,y][3] for q in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((row,col))
   if row not in REGEN and im.tobytes()!=b.tobytes(): retained.append((row,col))
  distinct.append(len(set(hs)))
 if dirty: errors.append(f'dirty={dirty}')
 if guard: errors.append(f'guard={guard[:8]}')
 if retained: errors.append(f'retained changed={retained[:8]}')
 for row in REGEN:
  if set(feet[row])!={382}: errors.append(f'row {row} foot={sorted(set(feet[row]))}')
 for row in REGEN-{16}:
  if distinct[row]!=8: errors.append(f'row {row} distinct={distinct[row]}')
 if distinct[16] < 6: errors.append(f'hurt distinct={distinct[16]}')
 rhs=[]; rfeet=[]
 for col in range(13):
  im=run.crop((col*CELL,0,(col+1)*CELL,CELL)); bb=im.getchannel('A').getbbox(); rhs.append(dig(im)); rfeet.append(bb[3] if bb else None)
 if len(set(rhs))!=13: errors.append(f'run13 distinct={len(set(rhs))}')
 if set(rfeet)!={382}: errors.append(f'run13 feet={sorted(set(rfeet))}')
 if man.get('atlas_sha256')!=hashlib.sha256(a.atlas.read_bytes()).hexdigest(): errors.append('atlas hash')
 if man.get('run13_sha256')!=hashlib.sha256(a.run13.read_bytes()).hexdigest(): errors.append('run13 hash')
 rep={'ok':not errors,'errors':errors,'summary':{'rows_distinct':distinct,'run13_distinct':len(set(rhs)),'regen_footline':{str(r):sorted(set(feet[r])) for r in REGEN},'retained_unchanged':not retained,'dirty':dirty,'guard':len(guard)}}; a.report.parent.mkdir(parents=True,exist_ok=True); a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()