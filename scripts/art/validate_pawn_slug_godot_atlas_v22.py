#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image

CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); FOOT_Y=382; GUARD=2
CHANGED_ROWS={6,7,14}; FORBIDDEN={b"iCCP",b"gAMA",b"sRGB",b"cHRM"}

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def chunks(path:Path):
    data=path.read_bytes(); pos=8; out=[]
    if data[:8]!=b"\x89PNG\r\n\x1a\n": return out
    while pos+12<=len(data):
        n=struct.unpack(">I",data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos+=12+n
        if typ==b"IEND": break
    return out

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--atlas",type=Path,required=True)
    p.add_argument("--manifest",type=Path,required=True)
    p.add_argument("--baseline",type=Path,required=True)
    p.add_argument("--report",type=Path,required=True)
    a=p.parse_args()
    new=Image.open(a.atlas).convert("RGBA"); old=Image.open(a.baseline).convert("RGBA")
    m=json.loads(a.manifest.read_text()); errors=[]; changed=set(); distinct=[]; bboxes={}
    if new.size!=SIZE or old.size!=SIZE: errors.append("bad atlas size")
    if m.get("version")!="v22" or m.get("weapon")!="pistol": errors.append("manifest version/weapon mismatch")
    if m.get("baseline",{}).get("sha256")!=sha(a.baseline): errors.append("baseline sha mismatch")
    if m.get("atlas",{}).get("sha256")!=sha(a.atlas): errors.append("atlas sha mismatch")
    bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
    if bad: errors.append("forbidden PNG chunks: "+",".join(bad))
    for r in range(ROWS):
        hs=[]
        for c in range(COLS):
            box=(c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)
            nc=new.crop(box); oc=old.crop(box)
            if nc.tobytes()!=oc.tobytes(): changed.add(r)
            hs.append(hashlib.sha256(nc.tobytes()).hexdigest())
            bb=nc.getchannel("A").getbbox()
            bboxes.setdefault(str(r),[]).append(bb)
            if not bb: errors.append(f"empty frame {r}:{c}"); continue
            if bb[3]!=FOOT_Y: errors.append(f"footline {r}:{c}={bb[3]}")
            if r in CHANGED_ROWS and bb[1]<165: errors.append(f"crouch too tall {r}:{c} top={bb[1]}")
            px=nc.load()
            if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)): errors.append(f"guard horizontal {r}:{c}")
            if any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): errors.append(f"guard vertical {r}:{c}")
            if any((rr or gg or bbv) for rr,gg,bbv,aa in nc.getdata() if aa==0): errors.append(f"dirty transparent rgb {r}:{c}")
        distinct.append(len(set(hs)))
    if changed!=CHANGED_ROWS: errors.append(f"changed rows mismatch: {sorted(changed)}")
    if min(distinct)<8: errors.append(f"duplicate row frames: {distinct}")
    report={"ok":not errors,"errors":errors,"summary":{"frames":144,"changed_rows":sorted(changed),"all_rows_8_distinct":min(distinct)==8,"footline":FOOT_Y,"crouch_top_min":min(bb[1] for r in CHANGED_ROWS for bb in bboxes[str(r)] if bb),"crouch_bboxes":{str(r):bboxes[str(r)] for r in sorted(CHANGED_ROWS)}}}
    a.report.write_text(json.dumps(report,indent=2)+"\n")
    if errors: raise SystemExit("\n".join(errors))
    print("OK strict-v22 crouch bank",report["summary"]); return 0
if __name__=="__main__": raise SystemExit(main())
