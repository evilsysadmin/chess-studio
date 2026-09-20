#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw

VERSION="v18"; WEAPON="pistol"; CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
PIVOT_X=200.0; FOOT_Y=382.0; GUARD=2
ACTIONS=["idle","walk","run","jump","fall","land","crouch","crouch_walk","shoot","shoot_up","shoot_down","shoot_diag_up","shoot_diag_up_alt","shoot_diag_down","shoot_crouch","reload","hurt","die"]
ANGLES={9:-58.0,10:34.0,11:-46.0,12:-46.0,13:34.0}

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def face_bbox(cell):
    px=cell.load(); xs=[]; ys=[]
    for y in range(130,310):
        for x in range(120,290):
            r,g,b,a=px[x,y]
            if a>80 and r>130 and g>65 and b<125 and r*100>g*112 and g*100>b*105:
                xs.append(x); ys.append(y)
    if len(xs)<20: return (165,180,235,245)
    xs.sort(); ys.sort(); lo=max(0,int(len(xs)*.05)); hi=min(len(xs)-1,int(len(xs)*.95))
    return xs[lo],ys[lo],xs[hi],ys[hi]

def p99_layer(angle):
    im=Image.new("RGBA",(140,100),(0,0,0,0)); d=ImageDraw.Draw(im); pivot=(36,52)
    d.rounded_rectangle((28,31,92,47),5,fill=(48,55,61,255),outline=(8,11,14,255),width=2)
    d.rounded_rectangle((84,34,101,44),3,fill=(25,29,34,255),outline=(8,11,14,255),width=2)
    d.rectangle((55,33,72,39),fill=(22,25,29,255))
    for x in (32,36,40): d.line((x,33,x,44),fill=(93,101,108,220),width=1)
    d.polygon([(36,47),(80,47),(76,55),(50,58),(38,55)],fill=(31,38,43,255),outline=(7,10,12,255))
    d.arc((43,49,65,68),180,355,fill=(12,16,18,255),width=3)
    d.polygon([(48,55),(67,56),(62,86),(48,82),(42,63)],fill=(35,43,47,255),outline=(7,10,12,255))
    d.line((49,63,60,79),fill=(80,87,83,150),width=2)
    d.rectangle((32,27,38,32),fill=(158,143,88,255)); d.rectangle((82,27,88,32),fill=(158,143,88,255))
    d.line((35,32,81,32),fill=(103,111,117,150),width=1)
    if angle: im=im.rotate(-angle,resample=Image.Resampling.BICUBIC,center=pivot)
    return im,pivot

def erase_weapon(cell,anchor,angle,row):
    mask=Image.new("L",(CELL,CELL),0); d=ImageDraw.Draw(mask)
    rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad); th=48 if row in (9,10,11,12,13) else 42
    p0=(anchor[0]-vx*8,anchor[1]-vy*8); p1=(anchor[0]+vx*112,anchor[1]+vy*112)
    d.line((p0,p1),fill=255,width=th)
    out=cell.copy(); out.paste(Image.new("RGBA",out.size,(0,0,0,0)),(0,0),mask)
    return out

def process(cell,row,col):
    x1,y1,x2,y2=face_bbox(cell); cy=(y1+y2)/2; angle=ANGLES.get(row,0.0)
    if row==15: angle=[-5,-12,-25,-40,-28,-18,-8,0][col]
    elif row==16: angle=[0,5,10,18,22,28,35,45][col]
    elif row==17: angle=[0,10,22,35,50,65,75,80][col]
    anchor=(x2-2,cy+28) if angle<-20 else ((x2+3,cy+23) if angle>20 else (x2+6,cy+22))
    out=erase_weapon(cell,anchor,angle,row)
    if not (row==17 and col>=4):
        layer,piv=p99_layer(angle); out.alpha_composite(layer,(round(anchor[0]-piv[0]),round(anchor[1]-piv[1])))
        d=ImageDraw.Draw(out); rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad); px,py=-vy,vx
        for fwd,side in ((-2,7),(7,4)):
            x=anchor[0]+vx*fwd+px*side; y=anchor[1]+vy*fwd+py*side
            d.ellipse((x-7,y-6,x+7,y+6),fill=(61,70,48,255),outline=(18,22,17,255),width=2)
    pix=out.load()
    for y in range(CELL):
        for x in range(CELL):
            if x<GUARD or y<GUARD or x>=CELL-GUARD or y>=CELL-GUARD or pix[x,y][3]==0:
                pix[x,y]=(0,0,0,0)
    return out

def main():
    p=argparse.ArgumentParser(); p.add_argument("--source",type=Path); p.add_argument("--output",type=Path); p.add_argument("--manifest",type=Path); p.add_argument("--self-test",action="store_true"); a=p.parse_args()
    if a.self_test:
        assert SIZE==(3328,7488) and len(ACTIONS)==18 and PIVOT_X==200.0 and FOOT_Y==382.0
        print("OK strict-v18 pack self-test"); return
    if not all((a.source,a.output,a.manifest)): raise SystemExit("source/output/manifest required")
    src=Image.open(a.source).convert("RGBA")
    if src.size!=SIZE: raise SystemExit(f"expected {SIZE}, got {src.size}")
    out=Image.new("RGBA",SIZE,(0,0,0,0))
    for row in range(ROWS):
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)
            out.alpha_composite(process(src.crop(box),row,col),(col*CELL,row*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,"PNG",compress_level=9)
    manifest={"schema":1,"kind":"pawn-slug-godot-strict-atlas","version":VERSION,"weapon":WEAPON,
      "source":{"filename":a.source.name,"sha256":sha(a.source),"generation":"v16","weapon":"pistol","size":list(SIZE)},
      "atlas":{"filename":a.output.name,"sha256":sha(a.output),"columns":COLS,"rows":ROWS,"cell_size":CELL,"width":SIZE[0],"height":SIZE[1],"pivot_x":PIVOT_X,"foot_y":FOOT_Y,"frames_per_pose":COLS,"cell_guard_px":GUARD},
      "actions":{name:{"row":row,"frames":COLS} for row,name in enumerate(ACTIONS)},
      "processing":{"blender":False,"kind":"2d-p99-weapon-reauthor","body_scale_contract":"strict-v16 body scale, pivot and foot line preserved","weapon_contract":"compact P99 silhouette with no SMG magazine; two-hand tactical grip","layout_contract":"fixed 8x18 grid"}}
    a.manifest.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8"); print(a.output)
if __name__=="__main__": main()
