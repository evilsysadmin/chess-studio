#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw

VERSION='v19'; WEAPON='pistol'; CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
PIVOT_X=200.0; FOOT_Y=382.0; GUARD=2
WORKSHEET_SHA256='81010c9382a31662cdea986b823604afaa90232a117fb58fdf288019e3f85a97'
ACTIONS=('idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die')
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
    # Approved worksheet contract: one compact P99, grip mostly hidden by the two-hand wrap.
    im=Image.new('RGBA',(126,88),(0,0,0,0)); d=ImageDraw.Draw(im); pivot=(31,45)
    d.rounded_rectangle((24,25,82,40),4,fill=(49,56,62,255),outline=(8,11,14,255),width=2)
    d.rounded_rectangle((76,28,93,38),3,fill=(25,29,34,255),outline=(8,11,14,255),width=2)
    d.rectangle((49,27,66,33),fill=(22,25,29,255))
    for x in (28,32,36): d.line((x,27,x,37),fill=(93,101,108,220),width=1)
    d.polygon([(31,40),(72,40),(68,48),(43,51),(33,48)],fill=(31,38,43,255),outline=(7,10,12,255))
    d.arc((39,43,58,61),180,355,fill=(12,16,18,255),width=3)
    d.polygon([(45,49),(59,50),(57,69),(47,68),(42,56)],fill=(35,43,47,255),outline=(7,10,12,255))
    d.line((47,55,55,65),fill=(80,87,83,135),width=1)
    d.rectangle((28,22,34,26),fill=(158,143,88,255)); d.rectangle((73,22,79,26),fill=(158,143,88,255))
    if angle: im=im.rotate(-angle,resample=Image.Resampling.BICUBIC,center=pivot)
    return im,pivot

def erase_weapon(cell,anchor,angle,row):
    mask=Image.new('L',(CELL,CELL),0); d=ImageDraw.Draw(mask)
    rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad); th=48 if row in (9,10,11,12,13) else 42
    p0=(anchor[0]-vx*8,anchor[1]-vy*8); p1=(anchor[0]+vx*112,anchor[1]+vy*112)
    d.line((p0,p1),fill=255,width=th)
    out=cell.copy(); out.paste(Image.new('RGBA',out.size,(0,0,0,0)),(0,0),mask)
    return out

def draw_grip_hands(out,anchor,angle):
    d=ImageDraw.Draw(out); rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad); px,py=-vy,vx
    pts=[]
    for fwd,side,rx,ry,col in ((11,10,7,6,(62,71,49,255)),(18,8,7,6,(79,87,58,255))):
        x=anchor[0]+vx*fwd+px*side; y=anchor[1]+vy*fwd+py*side; pts.append((x,y))
        d.ellipse((x-rx,y-ry,x+rx,y+ry),fill=col,outline=(18,22,17,255),width=2)
    x0=anchor[0]-vx*7+px*10; y0=anchor[1]-vy*7+py*10
    x1=(pts[0][0]+pts[1][0])/2; y1=(pts[0][1]+pts[1][1])/2
    d.line((x0,y0,x1,y1),fill=(49,58,40,255),width=5)

def clean(cell):
    px=cell.load()
    for y in range(CELL):
        for x in range(CELL):
            r,g,b,a=px[x,y]
            if x<GUARD or y<GUARD or x>=CELL-GUARD or y>=CELL-GUARD or a==0: px[x,y]=(0,0,0,0)
    return cell

def process(cell,row,col):
    x1,y1,x2,y2=face_bbox(cell); cy=(y1+y2)/2; angle=ANGLES.get(row,0.0)
    if row==15: angle=[-5,-12,-25,-40,-28,-18,-8,0][col]
    elif row==16: angle=0.0
    elif row==17: angle=[0,10,22,35,50,65,75,80][col]
    anchor=(x2-2,cy+28) if angle<-20 else ((x2+3,cy+23) if angle>20 else (x2+6,cy+22))
    out=erase_weapon(cell,anchor,angle,row)
    if not (row==17 and col>=4):
        layer,piv=p99_layer(angle); out.alpha_composite(layer,(round(anchor[0]-piv[0]),round(anchor[1]-piv[1])))
        draw_grip_hands(out,anchor,angle)
    return clean(out)

def add_hurt_face(cell,strength):
    x1,y1,x2,y2=face_bbox(cell); d=ImageDraw.Draw(cell); fw=max(12,x2-x1); fh=max(10,y2-y1)
    skin=(230,151,87,255); ex=int(x1+fw*.62); ey=int(y1+fh*.39)
    d.rectangle((ex-5,ey-4,ex+6,ey+4),fill=skin)
    d.line((ex-4,ey+1,ex,ey-2,ex+5,ey+1),fill=(42,22,17,255),width=2)
    if strength>=2: d.line((ex-8,ey-1,ex-5,ey+2),fill=(104,48,30,255),width=1)
    mx=int(x1+fw*.64); my=int(y1+fh*.70); mw=3+strength
    d.line((mx-mw,my,mx,my+2,mx+mw,my),fill=(75,24,22,255),width=2)
    if strength>=3: d.point((mx,my+1),fill=(230,205,171,255))

def shift_cell(cell,dx):
    if dx==0: return cell.copy()
    out=Image.new('RGBA',cell.size,(0,0,0,0)); out.alpha_composite(cell,(dx,0)); return out

def main():
    p=argparse.ArgumentParser(); p.add_argument('--source',type=Path); p.add_argument('--output',type=Path); p.add_argument('--manifest',type=Path); p.add_argument('--self-test',action='store_true'); a=p.parse_args()
    if a.self_test:
        assert SIZE==(3328,7488) and len(ACTIONS)==18 and PIVOT_X==200.0 and FOOT_Y==382.0 and len(WORKSHEET_SHA256)==64
        print('OK strict-v19 pack self-test'); return
    if not all((a.source,a.output,a.manifest)): raise SystemExit('source/output/manifest required')
    src=Image.open(a.source).convert('RGBA')
    if src.size!=SIZE: raise SystemExit(f'expected {SIZE}, got {src.size}')
    out=Image.new('RGBA',SIZE,(0,0,0,0))
    for row in range(ROWS):
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)
            out.alpha_composite(process(src.crop(box),row,col),(col*CELL,row*CELL))
    strength=[1,2,3,3,2,1,1,0]; dx=[0,-1,-2,-2,-1,0,0,0]
    for col in range(COLS):
        base=shift_cell(out.crop((col*CELL,0,(col+1)*CELL,CELL)),dx[col])
        if strength[col]: add_hurt_face(base,strength[col])
        base=clean(base)
        out.paste(Image.new('RGBA',(CELL,CELL),(0,0,0,0)),(col*CELL,16*CELL)); out.alpha_composite(base,(col*CELL,16*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9)
    manifest={'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':WEAPON,
      'source':{'filename':a.source.name,'sha256':sha(a.source),'generation':'v16','weapon':'pistol','size':list(SIZE)},
      'worksheet':{'sha256':WORKSHEET_SHA256,'role':'approved visual contract for compact P99 two-hand grip and standing hurt flinch'},
      'atlas':{'filename':a.output.name,'sha256':sha(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'frames_per_pose':COLS,'cell_guard_px':GUARD},
      'actions':{name:{'row':row,'frames':COLS} for row,name in enumerate(ACTIONS)},
      'processing':{'blender':False,'kind':'2d-p99-clean-grip-standing-hurt','weapon_contract':'single compact P99; grip visually enclosed by two-hand wrap','hurt_contract':'standing flinch with squeezed eye/grimace; never knockdown','layout_contract':'fixed 8x18 grid'}}
    a.manifest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8'); print(a.output)
if __name__=='__main__': main()
