#!/usr/bin/env python3
"""Build a 16-frame Pawn Slug run strip from an approved 8-frame strict atlas.

The source keyframes stay byte-identical at even positions. Odd positions are
motion-compensated half-steps warped from one silhouette toward the next,
including the loop closure 7 -> 0. No cross-fade of two bodies/weapons is used.
Horizontal placement is preserved; only vertical footline drift introduced by
optical flow may be corrected.
"""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

CELL=416
SOURCE_COLS=8
OUTPUT_COLS=16
RUN_ROW=2
SOURCE_SIZE=(3328,7488)
OUTPUT_SIZE=(CELL*OUTPUT_COLS,CELL)
FOOT_Y=382
GUARD=2
VERSION="run16-v1"

def sha(path:Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def premul(a:np.ndarray)->np.ndarray:
    alpha=a[...,3:4].astype(np.float32)/255.0
    return np.concatenate((a[...,:3].astype(np.float32)*alpha,a[...,3:4].astype(np.float32)),axis=2)

def unpremul(a:np.ndarray)->np.ndarray:
    alpha=a[...,3:4]
    rgb=np.where(alpha>1.0,a[...,:3]*255.0/np.maximum(alpha,1.0),0.0)
    return np.clip(np.concatenate((rgb,alpha),axis=2),0,255).astype(np.uint8)

def warp(array:np.ndarray,flow:np.ndarray,fraction:float)->np.ndarray:
    h,w=flow.shape[:2]
    gx,gy=np.meshgrid(np.arange(w,dtype=np.float32),np.arange(h,dtype=np.float32))
    mx=gx-fraction*flow[...,0]
    my=gy-fraction*flow[...,1]
    return np.stack([
        cv2.remap(array[...,ch],mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
        for ch in range(array.shape[2])
    ],axis=2)

def foot_align_only(im:Image.Image)->Image.Image:
    bb=im.getchannel("A").getbbox()
    if not bb:
        return im.copy()
    dy=FOOT_Y-bb[3]
    if dy==0:
        return im.copy()
    out=Image.new("RGBA",(CELL,CELL),(0,0,0,0))
    out.alpha_composite(im,(0,dy))
    return out

def clean(im:Image.Image)->Image.Image:
    arr=np.array(im.convert("RGBA"))
    arr[arr[...,3]==0,:3]=0
    arr[:GUARD,:,:]=0
    arr[-GUARD:,:,:]=0
    arr[:,:GUARD,:]=0
    arr[:,-GUARD:,:]=0
    return Image.fromarray(arr,"RGBA")

def inbetween(first:Image.Image,second:Image.Image)->Image.Image:
    a=np.array(first.convert("RGBA"))
    b=np.array(second.convert("RGBA"))
    aa=a[...,3].astype(np.float32)/255.0
    ba=b[...,3].astype(np.float32)/255.0
    ga=(cv2.cvtColor(a[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*aa).astype(np.uint8)
    gb=(cv2.cvtColor(b[...,:3],cv2.COLOR_RGB2GRAY).astype(np.float32)*ba).astype(np.uint8)
    half=(CELL//2,CELL//2)
    sa=cv2.resize(ga,half,interpolation=cv2.INTER_AREA)
    sb=cv2.resize(gb,half,interpolation=cv2.INTER_AREA)
    flow_small=cv2.calcOpticalFlowFarneback(sa,sb,None,0.5,2,17,2,5,1.2,0)
    flow=cv2.resize(flow_small,(CELL,CELL),interpolation=cv2.INTER_LINEAR)*2.0
    mid=Image.fromarray(unpremul(warp(premul(a),flow,0.5)),"RGBA")
    alpha=mid.getchannel("A")
    rgb=ImageEnhance.Contrast(mid.convert("RGB")).enhance(1.025)
    rgb=rgb.filter(ImageFilter.UnsharpMask(radius=0.65,percent=85,threshold=2))
    mid=Image.merge("RGBA",(*rgb.split(),alpha))
    return clean(foot_align_only(mid))

def source_frames(atlas:Image.Image)->list[Image.Image]:
    return [
        atlas.crop((c*CELL,RUN_ROW*CELL,(c+1)*CELL,(RUN_ROW+1)*CELL))
        for c in range(SOURCE_COLS)
    ]

def build(atlas:Image.Image)->list[Image.Image]:
    keys=source_frames(atlas)
    out=[]
    for i,key in enumerate(keys):
        out.append(key)
        out.append(inbetween(key,keys[(i+1)%SOURCE_COLS]))
    return out

def write_review(frames:list[Image.Image],path:Path)->None:
    strip=Image.new("RGBA",(OUTPUT_COLS*CELL,CELL),(0,0,0,0))
    for i,frame in enumerate(frames):
        strip.alpha_composite(frame,(i*CELL,0))
    preview=strip.resize((OUTPUT_COLS*208,208),Image.Resampling.LANCZOS)
    board=Image.new("RGBA",(preview.width,252),(18,20,24,255))
    board.alpha_composite(preview,(0,44))
    ImageDraw.Draw(board).text(
        (10,12),
        "run · 16 frames · keyframes + phase-preserving motion-compensated in-betweens",
        fill=(240,240,240,255),
    )
    path.parent.mkdir(parents=True,exist_ok=True)
    board.save(path,"PNG",compress_level=9)

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--source",type=Path)
    p.add_argument("--output",type=Path)
    p.add_argument("--manifest",type=Path)
    p.add_argument("--review",type=Path)
    p.add_argument("--weapon",default="pistol")
    p.add_argument("--self-test",action="store_true")
    a=p.parse_args()
    if a.self_test:
        assert SOURCE_SIZE==(SOURCE_COLS*CELL,18*CELL)
        assert OUTPUT_SIZE==(OUTPUT_COLS*CELL,CELL)
        print("OK run16 builder self-test")
        return 0
    if not all((a.source,a.output,a.manifest)):
        raise SystemExit("--source --output --manifest required")
    atlas=Image.open(a.source).convert("RGBA")
    if atlas.size!=SOURCE_SIZE:
        raise SystemExit(f"expected strict atlas {SOURCE_SIZE}, got {atlas.size}")
    frames=build(atlas)
    strip=Image.new("RGBA",OUTPUT_SIZE,(0,0,0,0))
    for i,frame in enumerate(frames):
        strip.alpha_composite(frame,(i*CELL,0))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    strip.save(a.output,"PNG",compress_level=9)
    manifest={
      "schema":1,
      "kind":"pawn-slug-godot-run-strip",
      "version":VERSION,
      "weapon":a.weapon,
      "source":{"filename":a.source.name,"sha256":sha(a.source),"row":RUN_ROW,"keyframes":SOURCE_COLS},
      "strip":{"filename":a.output.name,"sha256":sha(a.output),"columns":OUTPUT_COLS,"rows":1,"cell_size":CELL,"width":OUTPUT_SIZE[0],"height":OUTPUT_SIZE[1],"foot_y":FOOT_Y,"frames":OUTPUT_COLS},
      "phases":[{"frame":i,"kind":"keyframe" if i%2==0 else "motion_inbetween","source_phase":i/2.0} for i in range(OUTPUT_COLS)],
      "processing":{"kind":"motion-compensated-half-step","crossfade":False,"horizontal_reanchor":False,"vertical_footline_reanchor":True,"loop_closure":"7->0"},
    }
    a.manifest.write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    if a.review:
        write_review(frames,a.review)
    print(a.output)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
