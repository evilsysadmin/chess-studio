#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); REGEN={0,1,2,6,8,14,16}
ALPHA_THRESHOLD=24; FOOTER_Y_MIN=320; FOOTER_BOTTOM_MIN=352
FOOTER_MAX_AREA=2200; FOOTER_MAX_WIDTH=80; FOOTER_MAX_HEIGHT=80
FOOTER_MIN_LUMA=145.0; FOOTER_MAX_CHROMA=60.0
def dig(im): return hashlib.sha256(im.tobytes()).hexdigest()

def alpha_components(im):
 arr=np.array(im.convert('RGBA'))
 points={tuple(point) for point in np.argwhere(arr[:,:,3]>ALPHA_THRESHOLD)}
 components=[]
 while points:
  seed=points.pop(); stack=[seed]; coords=[seed]
  while stack:
   y,x=stack.pop()
   for dy in (-1,0,1):
    for dx in (-1,0,1):
     if dx==0 and dy==0: continue
     neighbor=(y+dy,x+dx)
     if neighbor in points:
      points.remove(neighbor); stack.append(neighbor); coords.append(neighbor)
  ys=np.fromiter((p[0] for p in coords),dtype=np.int16)
  xs=np.fromiter((p[1] for p in coords),dtype=np.int16)
  rgb=arr[ys,xs,:3].astype(np.float32); mean=rgb.mean(axis=0)
  components.append({'bbox':[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1],
   'area':len(coords),'luma':float(mean.mean()),'chroma':float(mean.max()-mean.min())})
 return components

def footer_annotations(im):
 hits=[]
 for component in alpha_components(im):
  x0,y0,x1,y1=component['bbox']; width=x1-x0; height=y1-y0
  if y0<FOOTER_Y_MIN or y1<FOOTER_BOTTOM_MIN: continue
  if component['area']>FOOTER_MAX_AREA or width>FOOTER_MAX_WIDTH or height>FOOTER_MAX_HEIGHT: continue
  if component['luma']<FOOTER_MIN_LUMA or component['chroma']>FOOTER_MAX_CHROMA: continue
  hits.append({'bbox':component['bbox'],'area':component['area'],
   'luma':round(component['luma'],2),'chroma':round(component['chroma'],2)})
 return hits
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--run13',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args(); errors=[]
 atlas=Image.open(a.atlas).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); run=Image.open(a.run13).convert('RGBA'); man=json.loads(a.manifest.read_text())
 if atlas.size!=SIZE or base.size!=SIZE: errors.append('atlas size')
 if run.size!=(CELL*13,CELL): errors.append(f'run13 size={run.size}')
 distinct=[]; dirty=0; guard=[]; retained=[]; feet={}; footer=[]
 for row in range(ROWS):
  hs=[]; feet[row]=[]
  for col in range(COLS):
   box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL); im=atlas.crop(box); b=base.crop(box); bb=im.getchannel('A').getbbox(); hs.append(dig(im))
   if not bb: errors.append(f'empty {(row,col)}')
   else: feet[row].append(bb[3])
   px=im.load(); dirty+=sum(1 for r,g,bv,aa in im.getdata() if aa==0 and (r or g or bv))
   if any(px[q,y][3] for q in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((row,col))
   if row not in REGEN and im.tobytes()!=b.tobytes(): retained.append((row,col))
   if row in REGEN:
    hits=footer_annotations(im)
    if hits: footer.append({'row':row,'frame':col,'components':hits})
  distinct.append(len(set(hs)))
 if dirty: errors.append(f'dirty={dirty}')
 if guard: errors.append(f'guard={guard[:8]}')
 if retained: errors.append(f'retained changed={retained[:8]}')
 if footer: errors.append(f'footer annotations={footer[:4]}')
 for row in REGEN:
  if set(feet[row])!={382}: errors.append(f'row {row} foot={sorted(set(feet[row]))}')
 for row in REGEN-{16}:
  if distinct[row]!=8: errors.append(f'row {row} distinct={distinct[row]}')
 if distinct[16] < 6: errors.append(f'hurt distinct={distinct[16]}')
 rhs=[]; rfeet=[]; run_footer=[]
 for col in range(13):
  im=run.crop((col*CELL,0,(col+1)*CELL,CELL)); bb=im.getchannel('A').getbbox(); rhs.append(dig(im)); rfeet.append(bb[3] if bb else None)
  hits=footer_annotations(im)
  if hits: run_footer.append({'frame':col,'components':hits})
 if len(set(rhs))!=13: errors.append(f'run13 distinct={len(set(rhs))}')
 if set(rfeet)!={382}: errors.append(f'run13 feet={sorted(set(rfeet))}')
 if run_footer: errors.append(f'run13 footer annotations={run_footer[:4]}')
 if man.get('actions')!=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']: errors.append('manifest actions')
 counts=man.get('frame_counts',{})
 if int(counts.get('hurt',0))!=6: errors.append('manifest hurt count')
 for action in man.get('actions',[]):
  if action!='hurt' and int(counts.get(action,0))!=8: errors.append(f'manifest count {action}')
 if man.get('run13',{}).get('frames')!=13: errors.append('manifest run13 frames')
 if man.get('atlas_sha256')!=hashlib.sha256(a.atlas.read_bytes()).hexdigest(): errors.append('atlas hash')
 if man.get('run13_sha256')!=hashlib.sha256(a.run13.read_bytes()).hexdigest(): errors.append('run13 hash')
 rep={'ok':not errors,'errors':errors,'summary':{'rows_distinct':distinct,'run13_distinct':len(set(rhs)),'regen_footline':{str(r):sorted(set(feet[r])) for r in REGEN},'retained_unchanged':not retained,'dirty':dirty,'guard':len(guard),'footer_annotations':len(footer),'run13_footer_annotations':len(run_footer)}}; a.report.parent.mkdir(parents=True,exist_ok=True); a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()