#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import cv2, numpy as np
from PIL import Image
VERSION='v22'; CELL=416; SOURCE_COLS=8; SOURCE_ROWS=18; SOURCE_SIZE=(3328,7488); RUN_ROW=2; OUT_COLS=12; OUT_SIZE=(CELL*OUT_COLS,CELL)
def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def premult(rgba):
    x=rgba.astype(np.float32)/255.; x[...,:3]*=x[...,3:4]; return x
def unpremult(x):
    a=np.clip(x[...,3:4],0,1); rgb=np.zeros_like(x[...,:3]); m=a[...,0]>1e-4; rgb[m]=x[...,:3][m]/a[m]; out=np.concatenate([np.clip(rgb,0,1),a],2); out=(out*255+.5).astype(np.uint8); out[out[...,3]==0,:3]=0; return out
def morph(a,b,t):
    aa=a[...,3].astype(np.float32)/255; bb=b[...,3].astype(np.float32)/255; ga=cv2.cvtColor(a[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*aa; gb=cv2.cvtColor(b[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*bb
    sc=.5; gas=cv2.resize(ga,None,fx=sc,fy=sc,interpolation=cv2.INTER_AREA); gbs=cv2.resize(gb,None,fx=sc,fy=sc,interpolation=cv2.INTER_AREA)
    f=cv2.calcOpticalFlowFarneback(gas,gbs,None,.5,3,21,4,5,1.1,0); r=cv2.calcOpticalFlowFarneback(gbs,gas,None,.5,3,21,4,5,1.1,0); f=cv2.resize(f,(CELL,CELL),interpolation=cv2.INTER_LINEAR)/sc; r=cv2.resize(r,(CELL,CELL),interpolation=cv2.INTER_LINEAR)/sc
    yy,xx=np.mgrid[0:CELL,0:CELL].astype(np.float32); ma=((xx+f[...,0]*t).astype(np.float32),(yy+f[...,1]*t).astype(np.float32)); mb=((xx+r[...,0]*(1-t)).astype(np.float32),(yy+r[...,1]*(1-t)).astype(np.float32))
    wa=cv2.remap(premult(a),*ma,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0); wb=cv2.remap(premult(b),*mb,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0); out=unpremult(wa*(1-t)+wb*t); out[out[...,3]<24]=0; out[...,3]=np.where(out[...,3]>220,255,out[...,3]); return out
def quant(im,src):
    rgba=Image.fromarray(im,'RGBA'); alpha=rgba.getchannel('A'); pal=Image.fromarray(src[...,:3],'RGB').quantize(colors=96,method=Image.Quantize.MEDIANCUT); rgb=rgba.convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'); out=Image.merge('RGBA',(*rgb.split(),alpha)); arr=np.array(out); arr[arr[...,3]==0,:3]=0; return arr
def align_foot(arr,target=382):
    im=Image.fromarray(arr,'RGBA'); bb=im.getchannel('A').getbbox()
    if not bb: return arr
    dy=target-bb[3]
    if dy==0: return arr
    out=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); out.alpha_composite(im,(0,dy)); return np.array(out)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--weapon',required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--manifest',type=Path,required=True); a=ap.parse_args()
    src=Image.open(a.source).convert('RGBA');
    if src.size!=SOURCE_SIZE: raise SystemExit(f'expected {SOURCE_SIZE}, got {src.size}')
    orig=[np.array(src.crop((i*CELL,RUN_ROW*CELL,(i+1)*CELL,(RUN_ROW+1)*CELL)).convert('RGBA')) for i in range(8)]; pal=np.concatenate(orig,1); frames=[]
    for j in range(12):
      pos=j*8/12; i=int(pos)%8; t=pos-int(pos); 
      if t<1e-6:
        arr=orig[i].copy()
      else:
        lower=quant(morph(orig[i],orig[(i+1)%8],t),pal)
        upper=orig[i if t<0.5 else (i+1)%8].copy()
        # Keep face/torso/weapon crisp; morph only the stride. Feather the seam.
        yy=np.arange(CELL,dtype=np.float32)[:,None]
        w=np.clip((yy-230.0)/55.0,0.0,1.0)[...,None]
        arr=(upper.astype(np.float32)*(1.0-w)+lower.astype(np.float32)*w).round().clip(0,255).astype(np.uint8)
        arr[arr[...,3]==0,:3]=0
      arr=align_foot(arr); frames.append(Image.fromarray(arr,'RGBA'))
    out=Image.new('RGBA',OUT_SIZE,(0,0,0,0))
    for j,im in enumerate(frames): out.alpha_composite(im,(j*CELL,0))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9)
    m={'schema':1,'version':VERSION,'weapon':a.weapon,'source_sha256':sha(a.source),'atlas_sha256':sha(a.output),'size':list(OUT_SIZE),'cell_size':CELL,'frames':12,'source_run_frames':8,'processing':'deterministic optical-flow inbetweens + fixed palette quantization'}; a.manifest.write_text(json.dumps(m,indent=2)+'\n'); print(a.output)
if __name__=='__main__': main()