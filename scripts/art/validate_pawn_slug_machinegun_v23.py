#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, statistics
from pathlib import Path
import numpy as np
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); REGEN={0,1,2,6,8,14,16}
ALPHA_THRESHOLD=24
FOOTER_Y_MIN=330; FOOTER_BOTTOM_MIN=350
FOOTER_MAX_AREA=2600; FOOTER_MAX_WIDTH=96; FOOTER_MAX_HEIGHT=82
MAIN_FOOT_MIN=378; MAIN_FOOT_MAX=382
SCALE_RATIO_MIN=0.96; SCALE_RATIO_MAX=1.04
def dig(im): return hashlib.sha256(im.tobytes()).hexdigest()
def alpha_components(im):
 arr=np.array(im.convert('RGBA')); points={tuple(int(v) for v in point) for point in np.argwhere(arr[:,:,3]>ALPHA_THRESHOLD)}; components=[]
 while points:
  seed=points.pop(); stack=[seed]; coords=[seed]
  while stack:
   y,x=stack.pop()
   for dy in (-1,0,1):
    for dx in (-1,0,1):
     if dx==0 and dy==0: continue
     neighbor=(y+dy,x+dx)
     if neighbor in points: points.remove(neighbor); stack.append(neighbor); coords.append(neighbor)
  ys=np.fromiter((p[0] for p in coords),dtype=np.int16); xs=np.fromiter((p[1] for p in coords),dtype=np.int16)
  components.append({'bbox':[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1],'area':len(coords)})
 return sorted(components,key=lambda c:c['area'],reverse=True)
def footer_annotations(im):
 components=alpha_components(im)
 if len(components)<2: return []
 main=components[0]; main_bottom=main['bbox'][3]; hits=[]
 for component in components[1:]:
  x0,y0,x1,y1=component['bbox']; width=x1-x0; height=y1-y0
  if y0<FOOTER_Y_MIN or y1<FOOTER_BOTTOM_MIN: continue
  if y0<main_bottom: continue
  if component['area']>FOOTER_MAX_AREA or width>FOOTER_MAX_WIDTH or height>FOOTER_MAX_HEIGHT: continue
  hits.append(component)
 return hits
def row_median_height(atlas,row,columns=8):
 heights=[]
 for col in range(columns):
  im=atlas.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); bb=im.getchannel('A').getbbox()
  if bb: heights.append(bb[3]-bb[1])
 return statistics.median(heights) if heights else 0.0
def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--run13',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--pistol',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args(); errors=[]
 atlas=Image.open(a.atlas).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); pistol=Image.open(a.pistol).convert('RGBA'); run=Image.open(a.run13).convert('RGBA'); man=json.loads(a.manifest.read_text())
 if atlas.size!=SIZE or base.size!=SIZE or pistol.size!=SIZE: errors.append('atlas/reference size')
 if run.size!=(CELL*13,CELL): errors.append(f'run13 size={run.size}')
 distinct=[]; dirty=0; guard=[]; retained=[]; feet={}; footer=[]; main_feet={}; scale_ratios={}
 for row in range(ROWS):
  hs=[]; feet[row]=[]; main_feet[row]=[]
  for col in range(COLS):
   box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL); im=atlas.crop(box); b=base.crop(box); bb=im.getchannel('A').getbbox(); hs.append(dig(im))
   if not bb: errors.append(f'empty {(row,col)}')
   else: feet[row].append(bb[3])
   px=im.load(); dirty+=sum(1 for r,g,bv,aa in im.getdata() if aa==0 and (r or g or bv))
   if any(px[q,y][3] for q in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((row,col))
   if row not in REGEN and im.tobytes()!=b.tobytes(): retained.append((row,col))
   components=alpha_components(im)
   if components: main_feet[row].append(components[0]['bbox'][3])
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
  if not main_feet[row] or min(main_feet[row])<MAIN_FOOT_MIN or max(main_feet[row])>MAIN_FOOT_MAX: errors.append(f'row {row} body foot={sorted(set(main_feet[row]))}')
  reference_height=row_median_height(pistol,row); candidate_height=row_median_height(atlas,row); ratio=(candidate_height/reference_height) if reference_height else 0.0; scale_ratios[row]=ratio
  if not SCALE_RATIO_MIN<=ratio<=SCALE_RATIO_MAX: errors.append(f'row {row} canonical scale ratio={ratio:.4f} candidate={candidate_height} pistol={reference_height}')
 for row in REGEN-{16}:
  if distinct[row]!=8: errors.append(f'row {row} distinct={distinct[row]}')
 if distinct[16]<6: errors.append(f'hurt distinct={distinct[16]}')
 rhs=[]; rfeet=[]; run_footer=[]; run_main_feet=[]; run_heights=[]
 for col in range(13):
  im=run.crop((col*CELL,0,(col+1)*CELL,CELL)); bb=im.getchannel('A').getbbox(); rhs.append(dig(im)); rfeet.append(bb[3] if bb else None)
  if bb: run_heights.append(bb[3]-bb[1])
  components=alpha_components(im)
  if components: run_main_feet.append(components[0]['bbox'][3])
  hits=footer_annotations(im)
  if hits: run_footer.append({'frame':col,'components':hits})
 if len(set(rhs))!=13: errors.append(f'run13 distinct={len(set(rhs))}')
 if set(rfeet)!={382}: errors.append(f'run13 feet={sorted(set(rfeet))}')
 if run_footer: errors.append(f'run13 footer annotations={run_footer[:4]}')
 if not run_main_feet or min(run_main_feet)<MAIN_FOOT_MIN or max(run_main_feet)>MAIN_FOOT_MAX: errors.append(f'run13 body foot={sorted(set(run_main_feet))}')
 pistol_run_height=row_median_height(pistol,2); run_ratio=(statistics.median(run_heights)/pistol_run_height) if pistol_run_height and run_heights else 0.0
 if not SCALE_RATIO_MIN<=run_ratio<=SCALE_RATIO_MAX: errors.append(f'run13 canonical scale ratio={run_ratio:.4f}')
 if man.get('actions')!=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']: errors.append('manifest actions')
 counts=man.get('frame_counts',{})
 if int(counts.get('hurt',0))!=6: errors.append('manifest hurt count')
 for action in man.get('actions',[]):
  if action!='hurt' and int(counts.get(action,0))!=8: errors.append(f'manifest count {action}')
 if man.get('run13',{}).get('frames')!=13: errors.append('manifest run13 frames')
 if man.get('atlas_sha256')!=hashlib.sha256(a.atlas.read_bytes()).hexdigest(): errors.append('atlas hash')
 if man.get('run13_sha256')!=hashlib.sha256(a.run13.read_bytes()).hexdigest(): errors.append('run13 hash')
 rep={'ok':not errors,'errors':errors,'summary':{'rows_distinct':distinct,'run13_distinct':len(set(rhs)),'regen_footline':{str(r):sorted(set(feet[r])) for r in REGEN},'body_footline':{str(r):sorted(set(main_feet[r])) for r in REGEN},'canonical_scale_ratio':{str(r):round(scale_ratios.get(r,0.0),4) for r in REGEN},'run13_scale_ratio':round(run_ratio,4),'retained_unchanged':not retained,'dirty':dirty,'guard':len(guard),'footer_annotations':len(footer),'run13_footer_annotations':len(run_footer)}}; a.report.parent.mkdir(parents=True,exist_ok=True); a.report.write_text(json.dumps(rep,indent=2)+'\n'); print(json.dumps(rep['summary']))
 if errors: raise SystemExit('\n'.join(errors))
if __name__=='__main__': main()
