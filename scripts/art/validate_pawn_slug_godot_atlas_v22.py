#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); EXPECTED='778e2fb3da5649b484c36af633723de3218ca83a09a071d75c239c1130fd4c87'
FORBIDDEN={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}
def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def chunks(path):
 d=Path(path).read_bytes(); pos=8; out=[]
 if d[:8]!=b'\x89PNG\r\n\x1a\n': return out
 while pos+12<=len(d):
  n=struct.unpack('>I',d[pos:pos+4])[0]; t=d[pos+4:pos+8]; out.append(t); pos+=12+n
  if t==b'IEND': break
 return out

def main()->int:
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
 im=Image.open(a.atlas).convert('RGBA'); m=json.loads(a.manifest.read_text()); errors=[]
 if im.size!=SIZE: errors.append(f'bad size {im.size}')
 if sha(a.atlas)!=EXPECTED: errors.append('unexpected atlas sha')
 if m.get('version')!='v22' or m.get('weapon')!='pistol': errors.append('manifest version/weapon mismatch')
 am=m.get('atlas',{})
 if am.get('sha256')!=sha(a.atlas): errors.append('manifest sha mismatch')
 if float(am.get('pivot_x',-1))!=200.0 or float(am.get('foot_y',-1))!=382.0: errors.append('pivot/foot mismatch')
 bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
 if bad: errors.append('forbidden PNG chunks: '+','.join(bad))
 distinct=[]; feet=[]; guard=[]; dirty=0; bboxes={}
 for r in range(ROWS):
  hs=[]
  for c in range(COLS):
   cel=im.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)); hs.append(hashlib.sha256(cel.tobytes()).hexdigest())
   bb=cel.getchannel('A').getbbox(); bboxes[f'{r}:{c}']=bb
   if not bb: errors.append(f'empty frame {r}:{c}')
   else: feet.append(bb[3])
   px=cel.load()
   if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((r,c))
   dirty += sum(1 for rr,gg,bb_,aa in cel.getdata() if aa==0 and (rr or gg or bb_))
  distinct.append(len(set(hs)))
 if min(distinct)<8: errors.append(f'duplicate row frames: {distinct}')
 if set(feet)!={382}: errors.append(f'footline mismatch: {sorted(set(feet))}')
 if guard: errors.append(f'guard violated: {guard[:8]}')
 if dirty: errors.append(f'transparent RGB contamination: {dirty}')
 # crouch must be materially shorter than idle/run while remaining readable
 crouch_h=[]; idle_h=[]
 for c in range(COLS):
  b0=bboxes[f'0:{c}']; b6=bboxes[f'6:{c}']; b7=bboxes[f'7:{c}']
  if b0 and b6 and b7:
   idle_h.append(b0[3]-b0[1]); crouch_h += [b6[3]-b6[1],b7[3]-b7[1]]
 if idle_h and crouch_h and max(crouch_h)>=max(idle_h): errors.append('crouch bank is not visibly shorter than standing bank')
 report={'ok':not errors,'errors':errors,'summary':{'frames':144,'all_rows_8_distinct':min(distinct)==8,'footline':sorted(set(feet)),'guard_ok':not guard,'clean_transparent_rgb':dirty==0,'idle_height_range':[min(idle_h),max(idle_h)] if idle_h else None,'crouch_height_range':[min(crouch_h),max(crouch_h)] if crouch_h else None}}
 a.report.write_text(json.dumps(report,indent=2)+'\n')
 if errors: raise SystemExit('\n'.join(errors))
 print('OK strict-v22 reviewed hybrid',report['summary']); return 0
if __name__=='__main__': raise SystemExit(main())