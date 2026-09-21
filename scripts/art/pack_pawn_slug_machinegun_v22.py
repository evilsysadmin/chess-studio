#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image, ImageDraw
VERSION='v22'; WEAPON='machinegun'; CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
ANGLES={9:-62.0,10:34.0,11:-48.0,12:-48.0,13:34.0}

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def face_bbox(im:Image.Image):
    px=im.load(); xs=[]; ys=[]
    for y in range(90,300):
      for x in range(80,310):
        r,g,b,a=px[x,y]
        if a>80 and r>120 and g>55 and b<120 and r>g*1.10 and g>b*1.03: xs.append(x); ys.append(y)
    if not xs: return (160,160,230,230)
    xs.sort(); ys.sort(); lo=int(len(xs)*.08); hi=int(len(xs)*.92); return xs[lo],ys[lo],xs[hi],ys[hi]
def erase_old_weapon(im,anchor,angle,row):
    out=im.copy(); mask=Image.new('L',(CELL,CELL),0); d=ImageDraw.Draw(mask); rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad)
    p0=(anchor[0]-vx*18,anchor[1]-vy*18); p1=(anchor[0]+vx*88,anchor[1]+vy*88); d.line((p0,p1),fill=255,width=50 if row in range(9,14) else 46)
    px,py=-vy,vx; cx=anchor[0]+vx*22+px*13; cy=anchor[1]+vy*22+py*13; d.ellipse((cx-18,cy-14,cx+18,cy+14),fill=255)
    out.paste(Image.new('RGBA',(CELL,CELL),(0,0,0,0)),(0,0),mask); return out
def gun_layer(angle):
    im=Image.new('RGBA',(150,110),(0,0,0,0)); d=ImageDraw.Draw(im); pivot=(42,54)
    d.polygon([(23,45),(43,43),(48,51),(30,56),(18,55)],fill=(36,43,33,255),outline=(8,11,9,255))
    d.rounded_rectangle((39,37,96,56),4,fill=(52,64,42,255),outline=(8,11,9,255),width=2); d.rectangle((48,39,78,43),fill=(72,82,54,255))
    d.rectangle((56,32,86,37),fill=(30,35,31,255)); d.rectangle((83,28,88,33),fill=(75,82,72,255))
    d.rounded_rectangle((94,41,122,48),2,fill=(35,40,38,255),outline=(7,9,9,255),width=1); d.rectangle((120,42,129,47),fill=(20,24,24,255))
    d.polygon([(58,55),(70,55),(67,76),(57,74),(53,61)],fill=(39,47,37,255),outline=(8,11,9,255)); d.polygon([(73,56),(88,57),(85,82),(72,79)],fill=(43,51,36,255),outline=(8,11,9,255))
    for y in (62,68,74): d.line((75,y,84,y+1),fill=(75,82,54,170),width=1)
    if angle: im=im.rotate(-angle,resample=Image.Resampling.BICUBIC,center=pivot)
    return im,pivot
def process(im,row,col):
    x1,y1,x2,y2=face_bbox(im); cy=(y1+y2)/2; angle=ANGLES.get(row,0.0)
    if row in (15,16,17): return im.copy()
    if row in (6,7,14): anchor=(x2+5,cy+33)
    elif angle<-20: anchor=(x2+2,cy+24)
    elif angle>20: anchor=(x2+4,cy+27)
    else: anchor=(x2+5,cy+25)
    out=erase_old_weapon(im,anchor,angle,row); gun,piv=gun_layer(angle); out.alpha_composite(gun,(round(anchor[0]-piv[0]),round(anchor[1]-piv[1])))
    d=ImageDraw.Draw(out); rad=math.radians(angle); vx,vy=math.cos(rad),math.sin(rad); px,py=-vy,vx
    for fwd,side in ((2,7),(22,5)):
      x=anchor[0]+vx*fwd+px*side; y=anchor[1]+vy*fwd+py*side; d.ellipse((x-7,y-6,x+7,y+6),fill=(48,57,43,255),outline=(11,14,11,255),width=2)
    pix=out.load()
    for y in range(CELL):
      for x in range(CELL):
        if pix[x,y][3]==0: pix[x,y]=(0,0,0,0)
    return out
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--manifest',type=Path,required=True); a=ap.parse_args()
    src=Image.open(a.source).convert('RGBA')
    if src.size!=SIZE: raise SystemExit(f'expected {SIZE}, got {src.size}')
    out=Image.new('RGBA',SIZE,(0,0,0,0))
    for row in range(ROWS):
      for col in range(COLS):
        cell=src.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); out.alpha_composite(process(cell,row,col),(col*CELL,row*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9)
    m={'schema':1,'version':VERSION,'weapon':WEAPON,'source_sha256':sha(a.source),'atlas_sha256':sha(a.output),'atlas':{'filename':a.output.name,'sha256':sha(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':200.0,'foot_y':382.0,'frames_per_pose':COLS,'cell_guard_px':2},'processing':'scripted single-SMG silhouette cleanup; body geometry retained'}
    a.manifest.write_text(json.dumps(m,indent=2)+'\n'); print(a.output)
if __name__=='__main__': main()