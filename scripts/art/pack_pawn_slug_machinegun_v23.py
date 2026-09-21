#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw

CELL=416; COLS=8; ROWS=18; SIZE=(CELL*COLS,CELL*ROWS); FOOT=382
# poster source coordinates: y0,y1, x centers, target visible height
SPECS={
  'idle':(20,108,[70,177,279,384,489,595,700,802],236),
  'walk':(145,238,[77,178,286,392,496,605,710,814],236),
  'run13':(270,374,[76,173,268,365,458,545,641,731,818,908,999,1091,1184],236),
  'shoot':(405,502,[73,178,281,391,503,617,724,835],236),
  'crouch':(680,760,[70,175,278,384,490,595,702,806],185),
  'crouch_shoot':(802,885,[73,178,285,392,502,606,717,825],185),
  'hurt6':(925,1012,[57,155,252,352,451,550],236),
}
NEW_ROWS={0:'idle',1:'walk',6:'crouch',8:'shoot',14:'crouch_shoot',16:'hurt6'}
RUN8_INDEX=[0,2,3,5,7,9,10,12]
RETAINED_ROWS=[3,4,5,7,9,10,11,12,13,15,17]

def sha(path:Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()

def flood_extract(src_bgr, center:int, y0:int, y1:int, half:int=54, tol:int=6) -> Image.Image:
    x0=max(0,center-half); x1=min(src_bgr.shape[1],center+half)
    crop=src_bgr[y0:y1,x0:x1].copy(); h,w=crop.shape[:2]
    mask=np.zeros((h+2,w+2),np.uint8); work=crop.copy(); flags=4|cv2.FLOODFILL_MASK_ONLY|(255<<8)
    for x in range(0,w,3):
        for y in (0,h-1): cv2.floodFill(work,mask,(x,y),(0,0,0),(tol,tol,tol),(tol,tol,tol),flags)
    for y in range(0,h,3):
        for x in (0,w-1): cv2.floodFill(work,mask,(x,y),(0,0,0),(tol,tol,tol),(tol,tol,tol),flags)
    fg=(mask[1:-1,1:-1]==0).astype(np.uint8)*255
    n,lab,stats,_=cv2.connectedComponentsWithStats(fg,8)
    if n<=1: raise RuntimeError('poster frame has no foreground')
    keep_i=max(range(1,n),key=lambda i:int(stats[i,cv2.CC_STAT_AREA]))
    keep=np.where(lab==keep_i,255,0).astype(np.uint8)
    rgba=cv2.cvtColor(crop,cv2.COLOR_BGR2RGBA); rgba[:,:,3]=keep; rgba[keep==0,:3]=0
    pil=Image.fromarray(rgba,'RGBA')
    # Remove baked muzzle flash while preserving face/beret insignia: only bright warm pixels well to the right of face.
    ar=np.array(pil); a=ar[:,:,3]; r,g,b=ar[:,:,0],ar[:,:,1],ar[:,:,2]
    skin=(a>80)&(r>115)&(g>55)&(r>g*1.07)&(g>b*1.02)
    ys,xs=np.where(skin); face_x=float(np.median(xs)) if len(xs) else w*0.45
    flash=(a>0)&(np.indices(a.shape)[1] > face_x+34)&(r>165)&(g>70)&(b<110)&((r-g)>35)
    ar[flash]=0
    # keep only components connected to the main body/weapon after flash removal, plus tiny hand pixels within 8px
    alpha=(ar[:,:,3]>0).astype(np.uint8)*255
    n,lab,stats,_=cv2.connectedComponentsWithStats(alpha,8)
    if n>1:
        main=max(range(1,n),key=lambda i:int(stats[i,cv2.CC_STAT_AREA]))
        ar[lab!=main]=0
    pil=Image.fromarray(ar,'RGBA'); bb=pil.getchannel('A').getbbox()
    if not bb: raise RuntimeError('poster frame became empty')
    return pil.crop(bb)

def normalize(sprite:Image.Image,target_h:int)->Image.Image:
    w,h=sprite.size; scale=target_h/h; tw=max(1,round(w*scale)); sp=sprite.resize((tw,target_h),Image.Resampling.NEAREST)
    arr=np.array(sp); r,g,b,a=[arr[:,:,i] for i in range(4)]
    skin=(a>80)&(r>115)&(g>55)&(r>g*1.07)&(g>b*1.02); ys,xs=np.where(skin)
    face_x=float(np.median(xs)) if len(xs) else tw*.45
    x=round(220-face_x); y=FOOT-target_h
    cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(sp,(x,y))
    ar=np.array(cell); ar[ar[:,:,3]==0,:3]=0
    return Image.fromarray(ar,'RGBA')

def source_frames(src_bgr):
    out={}
    for name,(y0,y1,centers,target_h) in SPECS.items():
        frames=[]
        for c in centers:
            frame=normalize(flood_extract(src_bgr,c,y0,y1),target_h)
            if name in ('shoot','crouch_shoot'):
                ar=np.array(frame)
                # Poster bakes a warm/white muzzle flash. Godot owns muzzle FX. Strip only
                # bright forward pixels so the dark/green barrel remains intact.
                yy,xx=np.indices(ar.shape[:2]); rr,gg,bb,aa=[ar[:,:,i] for i in range(4)]
                bright=rr.astype(np.int16)+gg.astype(np.int16)+bb.astype(np.int16)
                flash=(aa>0)&(xx>258)&(rr>135)&(gg>70)&(bright>330)
                ar[flash]=0
                frame=Image.fromarray(ar,'RGBA')
            frames.append(frame)
        out[name]=frames
    # Remove any residual baked muzzle-flash geometry using the first two
    # no-flash frames as the authored SMG silhouette. This is spatial, not
    # color-based, so orange/white antialias remnants cannot survive.
    for name in ('shoot','crouch_shoot'):
        frames=out[name]
        allowed=np.zeros((CELL,CELL),np.uint8)
        for fr in frames[:1]: allowed=np.maximum(allowed,(np.array(fr)[:,:,3]>0).astype(np.uint8)*255)
        allowed=cv2.dilate(allowed,np.ones((3,3),np.uint8),iterations=1)
        xx=np.indices(allowed.shape)[1]
        for i in range(2,len(frames)):
            ar=np.array(frames[i]); alpha=ar[:,:,3]
            remove=(xx>238)&(alpha>0)&(allowed==0)
            ar[remove]=0; ar[ar[:,:,3]==0,:3]=0
            # Remove residual warm muzzle-flash antialias that can remain inside
            # the allowed silhouette. Verified no-flash frames contain no warm
            # SMG pixels beyond x=285, so this does not trim authored gun geometry.
            rr,gg,bb,aa=[ar[:,:,j].astype(np.int16) for j in range(4)]
            warm=(aa>0)&(xx>285)&(rr>gg*1.15)&(rr>bb*1.20)&((rr-gg)>18)
            ar[warm]=0; ar[ar[:,:,3]==0,:3]=0
            frames[i]=Image.fromarray(ar,'RGBA')
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--baseline',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--run-output',type=Path,required=True); ap.add_argument('--manifest',type=Path,required=True); ap.add_argument('--review-dir',type=Path,required=True); a=ap.parse_args()
    src_bgr=cv2.imread(str(a.source),cv2.IMREAD_COLOR)
    if src_bgr is None: raise SystemExit('cannot load source poster')
    base=Image.open(a.baseline).convert('RGBA')
    if base.size!=SIZE: raise SystemExit(f'baseline size {base.size}')
    sf=source_frames(src_bgr)
    atlas=base.copy()
    # New poster-authored rows.
    for row,name in NEW_ROWS.items():
        frames=sf[name]
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)
            atlas.paste((0,0,0,0),box)
            if col < len(frames): atlas.alpha_composite(frames[col],(col*CELL,row*CELL))
    # Fallback run row uses 8 authored phases sampled across all 13; runtime overlay uses all 13.
    for col,idx in enumerate(RUN8_INDEX):
        box=(col*CELL,2*CELL,(col+1)*CELL,3*CELL); atlas.paste((0,0,0,0),box); atlas.alpha_composite(sf['run13'][idx],(col*CELL,2*CELL))
    # Runtime run13 overlay.
    run=Image.new('RGBA',(CELL*13,CELL),(0,0,0,0))
    for i,fr in enumerate(sf['run13']): run.alpha_composite(fr,(i*CELL,0))
    for im in (atlas,run):
        ar=np.array(im); ar[ar[:,:,3]==0,:3]=0; im.paste(Image.fromarray(ar,'RGBA'))
    a.output.parent.mkdir(parents=True,exist_ok=True); a.run_output.parent.mkdir(parents=True,exist_ok=True); a.review_dir.mkdir(parents=True,exist_ok=True)
    atlas.save(a.output,'PNG',compress_level=9); run.save(a.run_output,'PNG',compress_level=9)
    actions=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']
    status={name:('regenerated' if i in [0,1,2,6,8,14,16] else 'retained-reviewed') for i,name in enumerate(actions)}
    counts={name:(6 if name=='hurt' else 8) for name in actions}; counts['run_overlay']=13
    m={'schema':1,'generation':'strict-v23','weapon':'machinegun','source_sha256':sha(a.source),'baseline_sha256':sha(a.baseline),'atlas_sha256':sha(a.output),'run13_sha256':sha(a.run_output),'atlas':{'size':list(SIZE),'cell_size':CELL,'columns':8,'rows':18,'pivot_x':200,'foot_y':FOOT},'actions':actions,'status':status,'frame_counts':counts,'run13_size':[CELL*13,CELL],'notes':'Poster-authored SMG idle/walk/run/shoot/crouch/crouch-shoot/hurt; missing directional/jump/fall/land/crouch-walk/reload/die rows retained only after explicit visual review.'}
    a.manifest.write_text(json.dumps(m,indent=2)+'\n')
    # Per-row review strips with actual runtime count.
    for row,name in enumerate(actions):
        count=counts[name]; strip=Image.new('RGBA',(CELL*count,CELL),(14,16,20,255))
        for col in range(count): strip.alpha_composite(atlas.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)),(col*CELL,0))
        strip.resize((max(1,round(strip.width*.35)),round(CELL*.35)),Image.Resampling.NEAREST).save(a.review_dir/f'{row:02d}-{name}.png')
    # overview
    strips=[Image.open(a.review_dir/f'{i:02d}-{name}.png').convert('RGBA') for i,name in enumerate(actions)]
    W=max(x.width for x in strips); H=sum(x.height+20 for x in strips); board=Image.new('RGBA',(W,H),(8,10,13,255)); d=ImageDraw.Draw(board); y=0
    for i,(name,im) in enumerate(zip(actions,strips)):
        d.text((4,y+2),f'{i:02d} {name} [{status[name]}]',fill='white'); board.alpha_composite(im,(0,y+18)); y+=im.height+20
    board.save(a.review_dir/'all-poses.png')
    print(json.dumps({'atlas':str(a.output),'atlas_sha256':sha(a.output),'run13':str(a.run_output),'run13_sha256':sha(a.run_output)}))
if __name__=='__main__': main()