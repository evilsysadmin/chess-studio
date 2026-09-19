#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image
VERSION='v12'; COLS=8; ROWS=18; CELL=416; SIZE=(COLS*CELL,ROWS*CELL); ALPHA=40
ACTIONS=(('idle',6.0,True),('walk',10.0,True),('run',12.0,True),('jump',10.0,False),('fall',8.0,True),('land',12.0,False),('crouch',6.0,True),('crouch_walk',8.0,True),('shoot',15.0,False),('shoot_up',15.0,False),('shoot_down',15.0,False),('shoot_diag_up',15.0,False),('shoot_diag_up_alt',15.0,False),('shoot_diag_down',15.0,False),('shoot_crouch',15.0,False),('reload',10.0,False),('hurt',12.0,False),('die',9.0,False))
FIRE_ROWS={8,9,10,11,12,13,14}
def args():
 p=argparse.ArgumentParser(); p.add_argument('--source',type=Path); p.add_argument('--output',type=Path); p.add_argument('--manifest',type=Path); p.add_argument('--weapon'); p.add_argument('--self-test',action='store_true'); return p.parse_args()
def bbox(alpha):
 ys,xs=np.nonzero(alpha>0)
 return None if not len(xs) else (int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
def anchor(alpha):
 ys,xs=np.nonzero(alpha>ALPHA)
 if not len(xs): raise SystemExit('empty frame')
 foot=int(ys.max()); floor=np.sort(xs[ys>=foot-max(3,int(CELL*.03))]); return float(floor[len(floor)//2]),float(foot)
def lum(rgb,alpha):
 m=alpha>ALPHA
 if not m.any(): return 0.0
 y=.2126*rgb[...,0]+.7152*rgb[...,1]+.0722*rgb[...,2]; return float(y[m].mean())
def crop_cell(a,r,c): return a[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL].copy()
def paste_cell(a,r,c,cell): a[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL]=cell
def sha_rgba(cell): return hashlib.sha256(cell.tobytes()).hexdigest()
def premul(a):
 f=a.astype(np.float32); al=f[...,3:4]/255.0; return np.concatenate([f[...,:3]*al,f[...,3:4]],axis=2)
def unpremul(a):
 al=a[...,3:4]; rgb=np.where(al>1.0,a[...,:3]*255.0/np.maximum(al,1.0),0.0); return np.clip(np.concatenate([rgb,al],axis=2),0,255).astype(np.uint8)
def warp_rgba(first,second,fraction=0.45):
 aa=first[...,3].astype(np.float32)/255.; ab=second[...,3].astype(np.float32)/255.
 ga=(cv2.cvtColor(first[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*aa).astype(np.uint8)
 gb=(cv2.cvtColor(second[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*ab).astype(np.uint8)
 small=(CELL//2,CELL//2); sa=cv2.resize(ga,small,interpolation=cv2.INTER_AREA); sb=cv2.resize(gb,small,interpolation=cv2.INTER_AREA)
 flow=cv2.calcOpticalFlowFarneback(sa,sb,None,0.5,2,17,2,5,1.2,0); flow=cv2.resize(flow,(CELL,CELL),interpolation=cv2.INTER_LINEAR)*2.0
 gx,gy=np.meshgrid(np.arange(CELL,dtype=np.float32),np.arange(CELL,dtype=np.float32)); mx=gx-fraction*flow[...,0]; my=gy-fraction*flow[...,1]
 p=premul(first); warped=np.stack([cv2.remap(p[...,ch],mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0) for ch in range(4)],axis=2)
 return unpremul(warped)
def shift_to_anchor(cell,target_anchor):
 ax,ay=anchor(cell[...,3]); tx,ty=target_anchor; dx=int(round(tx-ax)); dy=int(round(ty-ay))
 if dx==0 and dy==0: return cell
 out=np.zeros_like(cell); x0=max(0,dx); y0=max(0,dy); sx0=max(0,-dx); sy0=max(0,-dy); w=CELL-max(x0,sx0); h=CELL-max(y0,sy0)
 if w>0 and h>0: out[y0:y0+h,x0:x0+w]=cell[sy0:sy0+h,sx0:sx0+w]
 return out

def cleanup_detached_artifacts(src, weapon):
 work=src.copy(); cleanups=[]
 if weapon != 'shotgun':
  return work,cleanups
 for r in (8,9):
  for c in range(COLS):
   cell=crop_cell(work,r,c); mask=(cell[...,3]>12).astype(np.uint8)
   n,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
   if n<=2: continue
   main=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA])); mx,my,mw,mh,_=stats[main]
   removed=[]
   for k in range(1,n):
    if k==main: continue
    x,y,w,h,area=stats[k]; inside=(x>=mx and y>=my and x+w<=mx+mw and y+h<=my+mh)
    pix=cell[labels==k,:3].astype(np.float32); mean_luma=float((.2126*pix[:,0]+.7152*pix[:,1]+.0722*pix[:,2]).mean()) if pix.size else 0.0
    if 100 <= int(area) <= 1500 and (inside or mean_luma < 80.0):
     removed.append({'component':int(k),'area':int(area),'bbox':[int(x),int(y),int(w),int(h)]})
     cell[labels==k]=0
   if removed:
    paste_cell(work,r,c,cell); cleanups.append({'row':r,'action':ACTIONS[r][0],'frame':c,'method':'remove detached in-silhouette raster artifact','removed':removed,'removed_pixels':sum(x['area'] for x in removed)})
 return work,cleanups

def repair_duplicate_keys(src):
 work=src.copy(); repairs=[]
 for r,(name,_,loop) in enumerate(ACTIONS):
  cells=[crop_cell(work,r,c) for c in range(COLS)]; seen={}
  for c,cell in enumerate(cells):
   h=sha_rgba(cell)
   if h not in seen: seen[h]=c; continue
   duplicate_of=seen[h]; prev=cells[c-1] if c>0 else cells[duplicate_of]
   nxt=cells[(c+1)%COLS] if (c+1<COLS or loop) else cells[0]
   target=anchor(cell[...,3]); syn=shift_to_anchor(warp_rgba(prev,nxt,0.45),target)
   sb=bbox(cell[...,3]); nb=bbox(syn[...,3]);
   if not sb or not nb: raise SystemExit(f'failed duplicate repair {name}[{c}]')
   sw,sh=sb[2]-sb[0],sb[3]-sb[1]; nw,nh=nb[2]-nb[0],nb[3]-nb[1]
   if abs(nw-sw)>max(8,int(sw*.10)) or abs(nh-sh)>max(8,int(sh*.10)): raise SystemExit(f'duplicate repair geometry outlier {name}[{c}]')
   cells[c]=syn; paste_cell(work,r,c,syn)
   repairs.append({'row':r,'action':name,'frame':c,'duplicate_of':duplicate_of,'method':'single-silhouette optical-flow settle','target_anchor':[target[0],target[1]],'source_bbox':list(sb),'synth_bbox':list(nb)})
   seen[sha_rgba(syn)]=c
 return work,repairs
def main():
 c=args()
 if c.self_test:
  assert len(ACTIONS)==18 and SIZE==(3328,7488) and len(FIRE_ROWS)==7; print('OK strict-v12 pack self-test'); return
 if not (c.source and c.output and c.manifest and c.weapon): raise SystemExit('source/output/manifest/weapon required')
 original=np.array(Image.open(c.source).convert('RGBA'))
 if (original.shape[1],original.shape[0])!=SIZE: raise SystemExit(f'expected {SIZE}, got {(original.shape[1],original.shape[0])}')
 cleaned,cleanups=cleanup_detached_artifacts(original,c.weapon); src,repairs=repair_duplicate_keys(cleaned); repaired={(x['row'],x['frame']) for x in repairs}; cleaned_frames={(x['row'],x['frame']) for x in cleanups}
 alpha=src[...,3].copy(); rgb=src[...,:3].copy()
 rgb=cv2.medianBlur(rgb,3); blur=cv2.GaussianBlur(rgb,(0,0),0.72); rgb=cv2.addWeighted(rgb,1.50,blur,-0.50,0)
 f=rgb.astype(np.float32); f=(f-112.0)*1.085+112.0; f=np.clip(f*1.025,0,255)
 hsv=cv2.cvtColor(f.astype(np.uint8),cv2.COLOR_RGB2HSV).astype(np.float32); hsv[...,1]=np.clip(hsv[...,1]*1.055,0,255); rgb=cv2.cvtColor(hsv.astype(np.uint8),cv2.COLOR_HSV2RGB)
 mask=(alpha>28).astype(np.uint8); eroded=cv2.erode(mask,np.ones((3,3),np.uint8),iterations=1); contour=(mask==1)&(eroded==0)
 rr=rgb.astype(np.float32); rr[contour]*=.76; warm=(alpha>28)&(rr[...,0]>80)&(rr[...,0]>rr[...,1]*1.16)&(rr[...,0]>rr[...,2]*1.35)
 rr[warm,0]=np.minimum(255,rr[warm,0]*1.10+5); rr[warm,1]=np.minimum(255,rr[warm,1]*1.035+2); rgb=np.clip(rr,0,255).astype(np.uint8)
 rgb=np.clip(rgb.astype(np.float32)*0.88 + src[...,:3].astype(np.float32)*0.12,0,255).astype(np.uint8)
 out=np.dstack([rgb,alpha]); actions=[]
 for r,(name,fps,loop) in enumerate(ACTIONS):
  vals=[]
  for col in range(COLS):
   y0=r*CELL; x0=col*CELL; vals.append(lum(out[y0:y0+CELL,x0:x0+CELL,:3],alpha[y0:y0+CELL,x0:x0+CELL]))
  target=float(np.median(vals)); metas=[]
  for col,v in enumerate(vals):
   y0=r*CELL; x0=col*CELL; sl=out[y0:y0+CELL,x0:x0+CELL]; aa=alpha[y0:y0+CELL,x0:x0+CELL]
   factor=max(.965,min(1.035,target/v)) if v>0 else 1.0; q=sl[...,:3].astype(np.float32)*factor
   if r in FIRE_ROWS:
    hot=(aa>24)&(q.max(axis=2)>165)&(q[...,0]>q[...,2]*1.15); q[hot,0]=np.minimum(255,q[hot,0]+14); q[hot,1]=np.minimum(255,q[hot,1]+7)
   sl[...,:3]=np.clip(q,0,255).astype(np.uint8); sl[aa==0,:3]=0; out[y0:y0+CELL,x0:x0+CELL]=sl
   base=crop_cell(original,r,col); repaired_here=(r,col) in repaired; cleaned_here=(r,col) in cleaned_frames
   if not repaired_here and not cleaned_here and not np.array_equal(base[...,3],sl[...,3]): raise SystemExit(f'alpha changed {name}[{col}]')
   if cleaned_here and not repaired_here:
    if np.any(sl[...,3] > base[...,3]): raise SystemExit(f'artifact cleanup added alpha {name}[{col}]')
    if bbox(base[...,3]) != bbox(sl[...,3]): raise SystemExit(f'artifact cleanup changed bbox {name}[{col}]')
   ax,ay=anchor(sl[...,3]); bx,by=anchor(base[...,3])
   if cleaned_here and not repaired_here:
    if abs(ay-by)>1.0: raise SystemExit(f'foot-line drift after cleanup {name}[{col}] {by:.1f}->{ay:.1f}')
   elif abs(ax-bx)>1.0 or abs(ay-by)>1.0:
    raise SystemExit(f'anchor drift {name}[{col}] {bx:.1f},{by:.1f}->{ax:.1f},{ay:.1f}')
   metas.append({'frame':col,'bbox':list(bbox(sl[...,3])),'anchor':[ax,ay],'sha256_rgba':hashlib.sha256(sl.tobytes()).hexdigest(),'mean_luma':round(lum(sl[...,:3],sl[...,3]),3),'motion_repaired':repaired_here,'artifact_cleaned':cleaned_here})
  actions.append({'row':r,'name':name,'fps':fps,'loop':loop,'frames':COLS,'frames_meta':metas,'luma_spread':round(max(x['mean_luma'] for x in metas)-min(x['mean_luma'] for x in metas),3)})
 Image.fromarray(out,'RGBA').save(c.output,'PNG',compress_level=3)
 man={'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':c.weapon,'source':{'filename':c.source.name,'sha256':hashlib.sha256(c.source.read_bytes()).hexdigest(),'size':list(SIZE),'generation':'v11'},'atlas':{'filename':c.output.name,'sha256':hashlib.sha256(c.output.read_bytes()).hexdigest(),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':200.0,'foot_y':382.0,'frames_per_pose':COLS},'processing':{'blender':False,'kind':'2d-canonical-readability-and-motion-repair','geometry_contract':'strict-v11 geometry preserved except explicit duplicate-key repair and detached-raster cleanup','visual_pass':'2D denoise + contour reinforcement + color separation + luminance stabilization','motion_repairs':len(repairs),'artifact_cleanups':len(cleanups)},'motion_repairs':repairs,'artifact_cleanups':cleanups,'actions':actions}
 c.manifest.write_text(json.dumps(man,indent=2),encoding='utf-8'); print(c.output)
if __name__=='__main__': main()
