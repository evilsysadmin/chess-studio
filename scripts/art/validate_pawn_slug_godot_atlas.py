#!/usr/bin/env python3
"""Fail-closed Godot contract gate for Pawn Slug Matthias v9 atlases."""
from __future__ import annotations
import argparse, hashlib, json, re
from pathlib import Path
from PIL import Image, ImageDraw

V="v9"; COLS=6; ROWS=18; CELL=416; SIZE=(2496,7488); FOOT=382.0; PIVOT=200.0; TOL=6.0; GUARD=2
ACTIONS=(
 ("idle",0,6.0,True),("walk",1,10.0,True),("run",2,12.0,True),("jump",3,10.0,False),
 ("fall",4,8.0,True),("land",5,12.0,False),("crouch",6,6.0,True),("crouch_walk",7,8.0,True),
 ("shoot",8,15.0,False),("shoot_up",9,15.0,False),("shoot_down",10,15.0,False),
 ("shoot_diag_up",11,15.0,False),("shoot_diag_up_alt",12,15.0,False),
 ("shoot_diag_down",13,15.0,False),("shoot_crouch",14,15.0,False),("reload",15,10.0,False),
 ("hurt",16,12.0,False),("die",17,9.0,False),
)
BYROW={r:(n,f,l) for n,r,f,l in ACTIONS}; WEAPONS=("pistol","machinegun","shotgun","panzerfaust")

def fail(s): raise SystemExit(s)
def args():
 p=argparse.ArgumentParser(); p.add_argument("--atlas",type=Path,required=True); p.add_argument("--weapon",choices=WEAPONS,required=True)
 p.add_argument("--runtime",type=Path,required=True); p.add_argument("--manifest",type=Path,required=True)
 p.add_argument("--contact-sheet",type=Path,required=True); p.add_argument("--strips-dir",type=Path,required=True); return p.parse_args()

def runtime_contract(path):
 t=path.read_text(encoding="utf-8")
 def num(k):
  m=re.search(rf"const\s+{k}\s*:=\s*(\d+)",t)
  if not m: fail(f"runtime missing {k}")
  return int(m.group(1))
 m=re.search(r"const\s+V9_ACTIONS\s*:=\s*\{(.*?)\n\}",t,re.S)
 if not m: fail("runtime missing V9_ACTIONS")
 rx=re.compile(r'"([^"]+)"\s*:\s*\{\s*"row"\s*:\s*(\d+)\s*,\s*"fps"\s*:\s*([\d.]+)\s*,\s*"loop"\s*:\s*(true|false)\s*\}')
 ac={n:{"row":int(r),"fps":float(f),"loop":l=="true"} for n,r,f,l in rx.findall(m.group(1))}
 return {"columns":num("V9_ATLAS_COLUMNS"),"rows":num("V9_ATLAS_ROWS"),"cell_size":num("V9_ATLAS_CELL_SIZE"),"actions":ac}

def check_runtime(rt):
 if (rt["columns"],rt["rows"],rt["cell_size"])!=(COLS,ROWS,CELL): fail(f"runtime layout drift: {rt}")
 exp={n:{"row":r,"fps":f,"loop":l} for n,r,f,l in ACTIONS}
 if rt["actions"]!=exp: fail(f"runtime V9_ACTIONS drift: expected={exp} actual={rt['actions']}")

def anchor(cell,box):
 px=cell.load(); pts=[]; y0=box[1]+int((box[3]-box[1])*.42)
 for y in range(y0,box[3]):
  for x in range(box[0],box[2]):
   r,g,b,a=px[x,y]
   if a>40 and max(r,g,b)<210: pts.append((x,y))
 if not pts: return (box[0]+box[2])*.5,float(box[3]-1)
 my=max(y for _,y in pts); band=[x for x,y in pts if y>=my-max(3,int(round((box[3]-box[1])*.08)))]; band.sort()
 return float(band[len(band)//2]),float(my)

def validate(image):
 frames=[]; idle=[]; unique={n:set() for n,_,_,_ in ACTIONS}
 for row in range(ROWS):
  name,_,_=BYROW[row]
  for col in range(COLS):
   c=image.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); b=c.getchannel("A").getbbox()
   if b is None: fail(f"empty cell {name}[{col}]")
   g=min(b[0],b[1],CELL-b[2],CELL-b[3]); pixels=sum(c.getchannel("A").histogram()[31:])
   if g<GUARD: fail(f"cell bleed {name}[{col}] bbox={b} guard={g}px")
   if pixels<2000: fail(f"sparse frame {name}[{col}] alpha_pixels={pixels}")
   ax,ay=anchor(c,b); h=hashlib.sha256(c.tobytes()).hexdigest(); unique[name].add(h)
   if row<=15 and (abs(ax-PIVOT)>TOL or abs(ay-FOOT)>TOL): fail(f"anchor drift {name}[{col}] x={ax:.1f} y={ay:.1f}")
   if row==0: idle.append(b[3]-b[1])
   frames.append({"action":name,"frame":col,"bbox":list(b),"guard_px":g,"alpha_pixels":pixels,"anchor_x":round(ax,2),"anchor_y":round(ay,2),"sha256_rgba":h})
 if max(idle)-min(idle)>8 or not 215<=sorted(idle)[len(idle)//2]<=245: fail(f"idle scale drift: {idle}")
 for n in ("walk","run","crouch_walk"):
  if len(unique[n])<2: fail(f"no frame variation in {n}")
 return frames

def artifacts(image,a,rt,frames):
 a.strips_dir.mkdir(parents=True,exist_ok=True)
 for n,r,_,_ in ACTIONS: image.crop((0,r*CELL,COLS*CELL,(r+1)*CELL)).save(a.strips_dir/f"{r:02d}_{n}.png","PNG",optimize=True)
 thumb=96; lh=20; out=Image.new("RGBA",(COLS*thumb,ROWS*(thumb+lh)),(20,20,20,255)); d=ImageDraw.Draw(out)
 for r in range(ROWS):
  n,_,_=BYROW[r]; d.text((4,r*(thumb+lh)+3),f"{r:02d} {n}",fill=(235,235,235,255))
  for c in range(COLS):
   x=image.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)); x.thumbnail((thumb,thumb),Image.Resampling.LANCZOS)
   out.alpha_composite(x,(c*thumb+(thumb-x.width)//2,r*(thumb+lh)+lh+(thumb-x.height)//2))
 a.contact_sheet.parent.mkdir(parents=True,exist_ok=True); out.save(a.contact_sheet,"PNG",optimize=True)
 data={"schema":1,"kind":"pawn-slug-godot-strict-sprite-atlas","version":V,"weapon":a.weapon,
  "atlas":{"filename":a.atlas.name,"sha256":hashlib.sha256(a.atlas.read_bytes()).hexdigest(),"format":"PNG","mode":"RGBA","width":SIZE[0],"height":SIZE[1],"columns":COLS,"rows":ROWS,"cell_size":CELL,"cell_guard_min_px":GUARD,"target_pivot_x":PIVOT,"target_foot_y":FOOT,"anchor_tolerance_px":TOL},
  "godot_runtime_contract":rt,"actions":[{"name":n,"row":r,"frames":COLS,"fps":f,"loop":l} for n,r,f,l in ACTIONS],"frames":frames}
 a.manifest.parent.mkdir(parents=True,exist_ok=True); a.manifest.write_text(json.dumps(data,indent=2,sort_keys=True)+"\n",encoding="utf-8")

def main():
 a=args(); im=Image.open(a.atlas)
 if im.format!="PNG" or im.mode!="RGBA" or im.size!=SIZE: fail(f"PNG contract mismatch format={im.format} mode={im.mode} size={im.size}")
 if im.info.get("icc_profile") or im.info.get("exif") or int(im.info.get("interlace",0) or 0): fail("PNG metadata/interlace contract mismatch")
 rt=runtime_contract(a.runtime); check_runtime(rt); frames=validate(im); artifacts(im,a,rt,frames)
 print(f"OK strict Godot atlas {a.weapon}: {SIZE[0]}x{SIZE[1]} grid={COLS}x{ROWS} cell={CELL}px")
if __name__=="__main__": main()
