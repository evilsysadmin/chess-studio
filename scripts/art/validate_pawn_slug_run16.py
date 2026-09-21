#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

CELL=416
COLS=16
SIZE=(CELL*COLS,CELL)
SOURCE_COLS=8
SOURCE_SIZE=(3328,7488)
RUN_ROW=2
FOOT_Y=382
GUARD=2
FORBIDDEN={b"iCCP",b"gAMA",b"sRGB",b"cHRM"}

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()

def chunks(path:Path):
    data=path.read_bytes(); pos=8; out=[]
    if data[:8]!=b"\x89PNG\r\n\x1a\n": return out
    while pos+12<=len(data):
        n=struct.unpack(">I",data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos+=12+n
        if typ==b"IEND": break
    return out

def frame(im:Image.Image,i:int)->Image.Image:
    return im.crop((i*CELL,0,(i+1)*CELL,CELL))

def source_frame(im:Image.Image,i:int)->Image.Image:
    return im.crop((i*CELL,RUN_ROW*CELL,(i+1)*CELL,(RUN_ROW+1)*CELL))

def silhouette_delta(a:Image.Image,b:Image.Image)->float:
    aa=np.asarray(a.getchannel("A"))>40
    bb=np.asarray(b.getchannel("A"))>40
    union=np.count_nonzero(aa|bb)
    return float(np.count_nonzero(aa^bb))/float(max(1,union))

def center_x(im:Image.Image)->float:
    bb=im.getchannel("A").getbbox()
    return 0.0 if not bb else (bb[0]+bb[2])*0.5

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--strip",type=Path,required=True)
    p.add_argument("--manifest",type=Path,required=True)
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    a=p.parse_args()
    strip=Image.open(a.strip).convert("RGBA")
    source=Image.open(a.source).convert("RGBA")
    m=json.loads(a.manifest.read_text())
    errors=[]
    if strip.size!=SIZE: errors.append(f"bad strip size {strip.size}")
    if source.size!=SOURCE_SIZE: errors.append(f"bad source size {source.size}")
    if m.get("strip",{}).get("sha256")!=sha(a.strip): errors.append("strip sha mismatch")
    if m.get("source",{}).get("sha256")!=sha(a.source): errors.append("source sha mismatch")
    bad=[x.decode() for x in chunks(a.strip) if x in FORBIDDEN]
    if bad: errors.append("forbidden PNG chunks: "+",".join(bad))
    hashes=[]; deltas=[]; centers=[]
    for i in range(COLS):
        f=frame(strip,i); hashes.append(hashlib.sha256(f.tobytes()).hexdigest())
        bb=f.getchannel("A").getbbox()
        if not bb: errors.append(f"empty frame {i}"); continue
        if bb[3]!=FOOT_Y: errors.append(f"footline {i}={bb[3]}")
        px=f.load()
        if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)): errors.append(f"guard horizontal {i}")
        if any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): errors.append(f"guard vertical {i}")
        arr=np.asarray(f)
        if np.any(arr[arr[...,3]==0,:3]!=0): errors.append(f"transparent RGB contamination {i}")
        centers.append(center_x(f))
        if i%2==0:
            src=source_frame(source,i//2)
            if f.tobytes()!=src.tobytes(): errors.append(f"keyframe {i} not byte-identical to source")
    if len(set(hashes))!=COLS: errors.append(f"expected 16 distinct frames, got {len(set(hashes))}")
    for i in range(COLS):
        deltas.append(silhouette_delta(frame(strip,i),frame(strip,(i+1)%COLS)))
    positive=[d for d in deltas if d>0]
    median=float(np.median(positive)) if positive else 0.0
    if median<=0.01: errors.append(f"insufficient run phase motion median={median:.4f}")
    if positive and max(positive)>max(0.22,median*2.6): errors.append(f"run loop/step outlier max={max(positive):.4f} median={median:.4f}")
    for i in range(1,COLS,2):
        left=centers[i-1]; right=centers[(i+1)%COLS]
        lo=min(left,right)-18.0; hi=max(left,right)+18.0
        if not (lo<=centers[i]<=hi): errors.append(f"horizontal drift inbetween {i}: {centers[i]:.1f} outside {lo:.1f}..{hi:.1f}")
    report={"ok":not errors,"errors":errors,"summary":{"frames":COLS,"distinct":len(set(hashes)),"footline":FOOT_Y,"silhouette_step_median":round(median,6),"silhouette_step_max":round(max(positive) if positive else 0.0,6),"centers_x":[round(x,2) for x in centers]}}
    a.report.write_text(json.dumps(report,indent=2)+"\n")
    if errors: raise SystemExit("\n".join(errors))
    print("OK run16 strip",report["summary"])
    return 0

if __name__=="__main__": raise SystemExit(main())
