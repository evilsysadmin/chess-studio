#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image
COLS=8; ROWS=18; CELL=416; SIZE=(COLS*CELL,ROWS*CELL); ALPHA=40

def bbox(a):
 ys,xs=np.nonzero(a>0); return None if not len(xs) else (int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
def anchor(a):
 ys,xs=np.nonzero(a>ALPHA)
 if not len(xs): return None
 foot=int(ys.max()); floor=np.sort(xs[ys>=foot-max(3,int(CELL*.03))]); return float(floor[len(floor)//2]),float(foot)
def ymap(rgb):
 f=rgb.astype(np.float32); return .2126*f[...,0]+.7152*f[...,1]+.0722*f[...,2]
def row_metrics(a):
 alpha=a[...,3]; m=alpha>ALPHA; y=ymap(a[...,:3]); vals=y[m]; lap=cv2.Laplacian(y,cv2.CV_32F)
 return float(vals.std()),float(np.mean(np.abs(lap[m]))),float(np.percentile(vals,90)-np.percentile(vals,10))
def frame_luma(a):
 m=a[...,3]>ALPHA; return float(ymap(a[...,:3])[m].mean()) if m.any() else 0.0
def area(a): return int(np.count_nonzero(a>ALPHA))

def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); c=p.parse_args()
 new=np.array(Image.open(c.atlas).convert('RGBA')); old=np.array(Image.open(c.baseline).convert('RGBA')); data=json.loads(c.manifest.read_text()); errs=[]; rows=[]
 if (new.shape[1],new.shape[0])!=SIZE or (old.shape[1],old.shape[0])!=SIZE: errs.append('bad atlas size')
 if len(data.get('actions',[]))!=ROWS: errs.append('bad action count')
 repairs={(int(x['row']),int(x['frame'])):x for x in data.get('motion_repairs',[])}
 cleanups={(int(x['row']),int(x['frame'])):x for x in data.get('artifact_cleanups',[])}
 if np.any(new[new[...,3]==0,:3]!=0): errs.append('transparent RGB contamination')
 for r,a in enumerate(data.get('actions',[])):
  y0=r*CELL; oldrow=old[y0:y0+CELL]; newrow=new[y0:y0+CELL]; old_l=[]; new_l=[]; hs=[]
  for col in range(COLS):
   x0=col*CELL; o=oldrow[:,x0:x0+CELL]; n=newrow[:,x0:x0+CELL]; key=(r,col); meta=a['frames_meta'][col]
   if key not in repairs and key not in cleanups:
    if not np.array_equal(o[...,3],n[...,3]): errs.append(f'alpha regression {a["name"]}[{col}]')
    if bbox(o[...,3])!=bbox(n[...,3]): errs.append(f'bbox regression {a["name"]}[{col}]')
   elif key in cleanups and key not in repairs:
    if np.any(n[...,3] > o[...,3]): errs.append(f'cleanup added alpha {a["name"]}[{col}]')
    if bbox(o[...,3])!=bbox(n[...,3]): errs.append(f'cleanup bbox regression {a["name"]}[{col}]')
    oa=anchor(o[...,3]); na=anchor(n[...,3])
    if oa is None or na is None or abs(oa[1]-na[1])>1.0: errs.append(f'cleanup foot-line drift {a["name"]}[{col}] {oa}->{na}')
    removed=int(np.count_nonzero((o[...,3]>12)&(n[...,3]==0)))
    expected=int(cleanups[key].get('removed_pixels',0))
    if removed!=expected: errs.append(f'cleanup pixel mismatch {a["name"]}[{col}] {removed}!={expected}')
   else:
    oa=anchor(o[...,3]); na=anchor(n[...,3])
    if oa is None or na is None or abs(oa[0]-na[0])>1.0 or abs(oa[1]-na[1])>1.0: errs.append(f'repaired anchor drift {a["name"]}[{col}] {oa}->{na}')
    ob=bbox(o[...,3]); nb=bbox(n[...,3])
    if not ob or not nb: errs.append(f'repaired empty geometry {a["name"]}[{col}]')
    else:
     ow,oh=ob[2]-ob[0],ob[3]-ob[1]; nw,nh=nb[2]-nb[0],nb[3]-nb[1]
     if abs(nw-ow)>max(8,int(ow*.10)) or abs(nh-oh)>max(8,int(oh*.10)): errs.append(f'repaired bbox scale drift {a["name"]}[{col}] {ob}->{nb}')
     ar=area(n[...,3])/max(1,area(o[...,3]))
     if not .82<=ar<=1.18: errs.append(f'repaired alpha area drift {a["name"]}[{col}] ratio={ar:.3f}')
   if bool(meta.get('motion_repaired')) != (key in repairs): errs.append(f'manifest repair mismatch {a["name"]}[{col}]')
   if bool(meta.get('artifact_cleaned')) != (key in cleanups): errs.append(f'manifest cleanup mismatch {a["name"]}[{col}]')
   old_l.append(frame_luma(o)); new_l.append(frame_luma(n)); hs.append(meta['sha256_rgba'])
  distinct=len(set(hs)); old_sp=max(old_l)-min(old_l); new_sp=max(new_l)-min(new_l)
  if distinct<8: errs.append(f'duplicate frames {a["name"]}: {distinct}/8')
  if new_sp>old_sp+1.5: errs.append(f'luma flicker regression {a["name"]}: {old_sp:.2f}->{new_sp:.2f}')
  osd,osh,osep=row_metrics(oldrow); nsd,nsh,nsep=row_metrics(newrow)
  if nsh<osh*1.12: errs.append(f'sharpness gain too small {a["name"]}: {osh:.2f}->{nsh:.2f}')
  if nsep<osep*1.05: errs.append(f'tonal separation gain too small {a["name"]}: {osep:.2f}->{nsep:.2f}')
  rows.append({'row':r,'name':a['name'],'distinct':distinct,'luma_spread_v11':round(old_sp,3),'luma_spread_v12':round(new_sp,3),'sharpness_v11':round(osh,3),'sharpness_v12':round(nsh,3),'tonal_separation_v11':round(osep,3),'tonal_separation_v12':round(nsep,3),'contrast_std_v11':round(osd,3),'contrast_std_v12':round(nsd,3),'motion_repairs':sum(1 for c2 in range(COLS) if (r,c2) in repairs)})
 summary={'rows':ROWS,'frames':ROWS*COLS,'geometry_preserved_or_explicitly_repaired':not any('regression' in e or 'drift' in e or 'mismatch' in e for e in errs),'all_frames_distinct':all(x['distinct']==8 for x in rows),'motion_repairs':len(repairs),'artifact_cleanups':len(cleanups),'min_sharpness_gain':round(min(x['sharpness_v12']/x['sharpness_v11'] for x in rows),3),'min_tonal_separation_gain':round(min(x['tonal_separation_v12']/x['tonal_separation_v11'] for x in rows),3)}
 report={'ok':not errs,'errors':errs,'rows':rows,'summary':summary}; c.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
 if errs: raise SystemExit('\n'.join(errs))
 print('OK strict-v12 atlas',summary)
if __name__=='__main__': main()
