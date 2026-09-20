#!/usr/bin/env python3
"""Re-author the strict Matthias pistol bank as a compact P99-style sidearm.

The strict-v16 pistol atlas remains the canonical body/pose source. This pass is
pure 2D/Pillow and changes only the weapon/hand corridor: the oversized SMG-like
receiver is removed and a deterministic compact service-pistol treatment is
painted at the authored muzzle anchor. The two-glove support grip is explicit.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from png_contract import save_png_contract, sha256_file
VERSION='v18'; SOURCE_GENERATION='v16'; WEAPON='pistol'
CELL=416; COLS=8; ROWS=18; SIZE=(COLS*CELL,ROWS*CELL); PIVOT_X=200.0; FOOT_Y=382.0; GUARD=2
ACTIONS=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']
ANGLE_BY_ROW={8:0.0,9:-58.0,10:34.0,11:-48.0,12:-48.0,13:34.0,14:0.0}

def args():
    p=argparse.ArgumentParser(); p.add_argument('--source',type=Path); p.add_argument('--output',type=Path); p.add_argument('--manifest',type=Path); p.add_argument('--self-test',action='store_true'); return p.parse_args()

def skin_bbox(cell: Image.Image):
    pix=cell.load(); xs=[]; ys=[]
    for y in range(145,320):
        for x in range(85,310):
            r,g,b,a=pix[x,y]
            if a>70 and r>125 and g>55 and b<125 and r>g*1.14 and g>b*1.02: xs.append(x); ys.append(y)
    if len(xs)<40: return (175,190,255,270)
    xs.sort(); ys.sort(); lo=int(len(xs)*.05); hi=min(len(xs)-1,int(len(xs)*.95)); return xs[lo],ys[lo],xs[hi],ys[hi]

def fire_near_edge(cell: Image.Image, angle: float):
    a=np.asarray(cell); r,g,b,al=[a[...,i] for i in range(4)]
    fire=(al>20)&(r>170)&(g>55)&(b<110)&((r.astype(int)-g.astype(int))>35)
    ys,xs=np.where(fire)
    if len(xs)<5: return None
    rad=math.radians(angle); dx,dy=math.cos(rad),math.sin(rad); proj=xs*dx+ys*dy
    q=np.quantile(proj,.82); sel=proj>=q; fxs,fys=xs[sel],ys[sel]; fp=fxs*dx+fys*dy
    qn=np.quantile(fp,.12); near=fp<=qn+2
    return float(fxs[near].mean()),float(fys[near].mean())

def old_tip(cell: Image.Image,bbox):
    a=np.asarray(cell); alpha=a[...,3]; _,y1,x2,y2=bbox; cy=(y1+y2)/2
    ylo=max(0,int(cy-20)); yhi=min(CELL,int(cy+60)); ys,xs=np.where(alpha[ylo:yhi]>25)
    if len(xs)==0: return float(x2+60),float(cy+20)
    tx=float(np.quantile(xs,.99)); near=xs>=tx-4; yy=float((ys[near]+ylo).mean()) if near.any() else float(cy+20); return tx,yy

def pistol_layer(angle=0.0,scale=.82):
    W,H=150,120; muzzle=(109.0,46.0); im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((37,38,103,55),4,fill=(8,10,12,255))
    d.rounded_rectangle((40,39,100,52),4,fill=(85,94,104,255),outline=(13,16,19,255),width=2)
    d.rounded_rectangle((98,41,111,50),2,fill=(24,28,32,255),outline=(8,10,12,255),width=1)
    d.polygon([(48,51),(93,51),(91,60),(61,64),(48,59)],fill=(28,33,38,255),outline=(12,15,18,255))
    d.arc((55,53,80,72),5,190,fill=(8,11,13,255),width=4)
    d.polygon([(69,58),(86,60),(83,88),(74,93),(64,84)],fill=(26,31,36,255))
    for yy in (66,72,78,84): d.line((69,yy,81,yy+1),fill=(66,72,78,160),width=1)
    d.rounded_rectangle((66,41,82,47),1,fill=(22,25,28,255))
    for x in (45,49,53): d.line((x,41,x,49),fill=(104,112,120,170),width=1)
    d.rectangle((44,35,49,39),fill=(17,20,22,255)); d.rectangle((89,35,94,39),fill=(17,20,22,255))
    glove=(72,80,49,255); edge=(24,29,20,255)
    d.ellipse((53,52,68,66),fill=glove,outline=edge,width=2); d.ellipse((66,56,80,70),fill=glove,outline=edge,width=2)
    if scale!=1:
        im=im.resize((round(W*scale),round(H*scale)),Image.Resampling.LANCZOS); muzzle=(muzzle[0]*scale,muzzle[1]*scale)
    if angle: im=im.rotate(-angle,resample=Image.Resampling.BICUBIC,center=muzzle)
    return im,muzzle

def erase_weapon(cell: Image.Image,muzzle,angle,bbox):
    a=np.asarray(cell).copy(); x1,y1,x2,y2=bbox; cy=(y1+y2)/2
    mask=Image.new('L',(CELL,CELL),0); d=ImageDraw.Draw(mask)
    if abs(angle)<1:
        d.rounded_rectangle((int(x2-18),int(cy-16),min(CELL-1,int(muzzle[0]+5)),int(cy+30)),10,fill=255)
    else:
        rad=math.radians(angle); dx,dy=math.cos(rad),math.sin(rad); px,py=-dy,dx; mx,my=muzzle; back=58; half=18
        pts=[(mx-dx*back+px*half,my-dy*back+py*half),(mx+dx*4+px*half,my+dy*4+py*half),(mx+dx*4-px*half,my+dy*4-py*half),(mx-dx*back-px*half,my-dy*back-py*half)]; d.polygon(pts,fill=255)
    m=np.asarray(mask)>0; r,g,b,al=[a[...,i] for i in range(4)]
    skin=(al>20)&(r>125)&(g>55)&(b<140)&(r>g*1.12)
    # Preserve authored muzzle fire; the re-authoring pass must change the gun,
    # not hollow out the flash into an orange ring.
    fire=(al>20)&(r>160)&(g>45)&(b<120)&((r.astype(int)-g.astype(int))>30)
    yy,xx=np.indices((CELL,CELL)); protect_hat=(yy<y1-5)&(xx<x2+8)
    erase=m&(al>0)&(~skin)&(~fire)&(~protect_hat); a[erase]=0; return Image.fromarray(a,'RGBA')

def should_reauthor(row,col):
    if row<=15: return True
    if row==16: return col<=3
    if row==17: return col<=2
    return False

def cell_angle(row,col):
    if row in ANGLE_BY_ROW: return ANGLE_BY_ROW[row]
    if row==17: return (0.0,-10.0,-15.0)[col] if col<=2 else 0.0
    return 0.0

def reauthor(cell: Image.Image,row:int,col:int):
    if not should_reauthor(row,col): return cell.copy()
    bbox=skin_bbox(cell); angle=cell_angle(row,col); muzzle=fire_near_edge(cell,angle) if row in ANGLE_BY_ROW else None
    if muzzle is None: muzzle=old_tip(cell,bbox)
    # Preserve the source cell's authored bottom/foot line exactly. Rotated
    # antialiasing must never add a stray alpha row below the original frame.
    source_alpha=np.asarray(cell)[...,3]
    source_ys=np.where(source_alpha>20)[0]
    source_bottom=int(source_ys.max()+1) if len(source_ys) else CELL-GUARD
    out=erase_weapon(cell,muzzle,angle,bbox); overlay,local_muzzle=pistol_layer(angle)
    out.alpha_composite(overlay,(round(muzzle[0]-local_muzzle[0]),round(muzzle[1]-local_muzzle[1])))
    oa=np.asarray(out).copy()
    if row in ANGLE_BY_ROW:
        # strict-v9/v16 firing rows own the muzzle flash. Restore the complete
        # forward source corridor after painting the new pistol so the flash
        # cannot become a hollow ring under the slide.
        src=np.asarray(cell); sa=src[...,3]
        rad=math.radians(angle); dx,dy=math.cos(rad),math.sin(rad); px,py=-dy,dx
        yy,xx=np.indices((CELL,CELL)); rx=xx-muzzle[0]; ry=yy-muzzle[1]
        forward=rx*dx+ry*dy; lateral=np.abs(rx*px+ry*py)
        flash_restore=(sa>0)&(forward>=-4.0)&(forward<=62.0)&(lateral<=36.0)
        oa[flash_restore]=src[flash_restore]
    # Re-compose the source muzzle fire above the new slide. The old bank bakes
    # these flashes; drawing the pistol over them would leave a hollow ring.
    if source_bottom<CELL:
        oa[source_bottom:]=0
    # Vectorized transparent guard: same contract, no 416x416 Python loop.
    oa[:GUARD]=0; oa[-GUARD:]=0; oa[:,:GUARD]=0; oa[:,-GUARD:]=0
    return Image.fromarray(oa.copy(),'RGBA')

def build(source: Image.Image):
    source=source.convert('RGBA')
    if source.size!=SIZE: raise SystemExit(f'expected source {SIZE}, got {source.size}')
    out=Image.new('RGBA',SIZE,(0,0,0,0))
    for row in range(ROWS):
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL); out.alpha_composite(reauthor(source.crop(box),row,col),(col*CELL,row*CELL))
    return out

def main():
    a=args()
    if a.self_test:
        assert SIZE==(3328,7488) and PIVOT_X==200.0 and FOOT_Y==382.0 and len(ACTIONS)==18
        assert should_reauthor(16,3) and not should_reauthor(16,4) and should_reauthor(17,2) and not should_reauthor(17,3)
        print('OK strict-v18 pack self-test'); return
    if not all((a.source,a.output,a.manifest)): raise SystemExit('--source/--output/--manifest required')
    source=Image.open(a.source).convert('RGBA'); atlas=build(source); save_png_contract(atlas,a.output)
    manifest={'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':WEAPON,
      'source':{'filename':a.source.name,'sha256':sha256_file(a.source),'generation':SOURCE_GENERATION,'weapon':WEAPON,'size':list(SIZE)},
      'atlas':{'filename':a.output.name,'sha256':sha256_file(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'frames_per_pose':COLS,'cell_guard_px':GUARD},
      'actions':{name:{'row':row,'frames':COLS} for row,name in enumerate(ACTIONS)},
      'processing':{'blender':False,'kind':'2d-p99-reauthor','body_pose_contract':'strict-v16 pistol body and 18x8 timing retained','weapon_contract':'compact P99-style slide/frame/grip; no SMG magazine; explicit two-glove support grip','muzzle_contract':'existing authored flash anchors are retained for fire rows','layout_contract':'fixed 8x18 grid; no free packing'}}
    a.manifest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8'); print(a.output)
if __name__=='__main__': main()
