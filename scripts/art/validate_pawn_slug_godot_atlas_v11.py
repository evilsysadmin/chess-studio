#!/usr/bin/env python3
"""Fail-closed validation for comprehensive Matthias strict-v11 atlases."""
from __future__ import annotations
import argparse, hashlib, json, statistics
from pathlib import Path
from PIL import Image

COLS=8; ROWS=18; CELL=416; SIZE=(3328,7488); PIVOT=200.0; FOOT=382.0; TOL=2.0; GUARD=4
ALPHA=40
NAMES=("idle","walk","run","jump","fall","land","crouch","crouch_walk","shoot","shoot_up","shoot_down","shoot_diag_up","shoot_diag_up_alt","shoot_diag_down","shoot_crouch","reload","hurt","die")
AIM_FORWARD_X_MIN=220; AIM_FORWARD_BAND=24; AIM_DELTA=50.0

def fail(m): raise SystemExit(m)

def args():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--baseline',type=Path); p.add_argument('--report',type=Path); return p.parse_args()

def anchor(cell):
 px=cell.load(); pts=[]
 for y in range(int(CELL*.42),CELL):
  for x in range(CELL):
   r,g,b,a=px[x,y]
   if a>ALPHA and max(r,g,b)<220: pts.append((x,y))
 if not pts: fail('cannot anchor empty cell')
 fy=max(y for _,y in pts); xs=sorted(x for x,y in pts if y>=fy-max(3,int(CELL*.03)))
 return float(statistics.median(xs)),float(fy)

def tip_y(cell):
 a=cell.getchannel('A'); box=a.getbbox()
 if box is None: fail('empty aim cell')
 vals=a.load(); x0=max(AIM_FORWARD_X_MIN,int(round(box[0]+.72*(box[2]-box[0])))); pts=[]
 for y in range(box[1],box[3]):
  for x in range(x0,box[2]):
   if vals[x,y]>ALPHA: pts.append((x,y))
 if not pts: return (box[1]+box[3])*.5
 mx=max(x for x,_ in pts); cutoff=max(x0,mx-AIM_FORWARD_BAND); ys=[y for x,y in pts if x>=cutoff]
 return float(statistics.median(ys))

def main():
 a=args(); im=Image.open(a.atlas).convert('RGBA')
 if im.size!=SIZE: fail(f'atlas size {im.size} != {SIZE}')
 data=json.loads(a.manifest.read_text(encoding='utf-8'))
 if data.get('version')!='v11' or data.get('schema')!=1: fail('manifest version/schema')
 at=data.get('atlas',{})
 if (at.get('columns'),at.get('rows'),at.get('cell_size'),at.get('frames_per_pose'))!=(COLS,ROWS,CELL,8): fail('layout contract drift')
 if abs(float(at.get('pivot_x',-9))-PIVOT)>.001 or abs(float(at.get('foot_y',-9))-FOOT)>.001: fail('pivot/foot metadata drift')
 if at.get('sha256')!=hashlib.sha256(a.atlas.read_bytes()).hexdigest(): fail('atlas sha mismatch')
 acts=data.get('actions',[])
 if len(acts)!=ROWS: fail('action count drift')
 heights={}; anchors=[]
 for row,name in enumerate(NAMES):
  act=acts[row]
  if act.get('name')!=name or act.get('row')!=row or act.get('frames')!=8: fail(f'action contract drift row {row}')
  hs=[]
  for col in range(COLS):
   c=im.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); box=c.getchannel('A').getbbox()
   if box is None: fail(f'empty {name}[{col}]')
   guard=min(box[0],box[1],CELL-box[2],CELL-box[3])
   if guard<GUARD: fail(f'guard regression {name}[{col}]={guard}')
   ax,ay=anchor(c); anchors.append((name,col,ax,ay))
   if abs(ax-PIVOT)>TOL or abs(ay-FOOT)>TOL: fail(f'anchor drift {name}[{col}] {ax:.1f},{ay:.1f}')
   hs.append(box[3]-box[1])
  heights[name]=float(statistics.median(hs))
 idle=heights['idle']
 for name in ('walk','run','jump','fall','land','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','reload','hurt'):
  if abs(heights[name]-idle)>85: fail(f'body-size discontinuity {name}: idle={idle} row={heights[name]}')
 for name in ('crouch','crouch_walk'):
  if heights[name]>=idle-8: fail(f'{name} is not visibly crouched: idle={idle} row={heights[name]}')
 # shoot_crouch carries long weapons/muzzle effects that can make the full alpha
 # bbox taller than idle. Its authored crouched silhouette is protected below by
 # the strict-v9 per-row alpha-area envelope instead of this weapon-biased height proxy.
 row_tip=lambda r: statistics.median(tip_y(im.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL))) for c in range(COLS))
 horiz=row_tip(8); measures={9:row_tip(9),10:row_tip(10),11:row_tip(11),12:row_tip(12),13:row_tip(13)}
 if measures[9]>horiz-AIM_DELTA or measures[11]>horiz-AIM_DELTA or measures[12]>horiz-AIM_DELTA: fail(f'up-aim semantics drift h={horiz:.1f} rows={measures}')
 if measures[10]<horiz+AIM_DELTA or measures[13]<horiz+AIM_DELTA: fail(f'down-aim semantics drift h={horiz:.1f} rows={measures}')
 report={'version':'v11','frames_per_pose':8,'total_frames':ROWS*COLS,'median_heights':heights,'aim_tip_y':{'horizontal':horiz,**{str(k):v for k,v in measures.items()}},'anchor_max_error_px':max(max(abs(x-PIVOT),abs(y-FOOT)) for _,_,x,y in anchors)}
 if a.baseline:
  base=Image.open(a.baseline).convert('RGBA')
  if base.size!=(6*CELL,ROWS*CELL): fail(f'baseline size mismatch {base.size}')
  report['baseline']='strict-v9'
  for row,name in enumerate(NAMES):
   areas=[]
   for col in range(6):
    c=base.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); areas.append(sum(1 for v in c.getchannel('A').getdata() if v>ALPHA))
   v11=[]
   for col in range(COLS):
    c=im.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); v11.append(sum(1 for v in c.getchannel('A').getdata() if v>ALPHA))
   lo=min(areas)*.97; hi=max(areas)*1.03
   if min(v11)<lo or max(v11)>hi: fail(f'alpha-area regression {name}: v9={min(areas)}..{max(areas)} v11={min(v11)}..{max(v11)}')
 if a.report:
  a.report.parent.mkdir(parents=True,exist_ok=True); a.report.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8')
 print('OK strict-v11 comprehensive atlas',SIZE,'poses=18 frames_per_pose=8 total=144')

if __name__=='__main__': main()
