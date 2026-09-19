#!/usr/bin/env python3
"""Fail-closed Godot contract gate for Pawn Slug Matthias v9 atlases."""
from __future__ import annotations
import argparse, hashlib, json, re
from pathlib import Path
from PIL import Image, ImageDraw

V="v9"; COLS=6; ROWS=18; CELL=416; SIZE=(2496,7488); FOOT=382.0; PIVOT=200.0; TOL=6.0; GUARD=2
RELOAD_FLASH_X_MIN=260; RELOAD_FLASH_SCORE_LIMIT=180
AIM_FORWARD_X_MIN=220; AIM_FORWARD_BAND_PX=24; AIM_UP_DELTA=50.0; AIM_DOWN_DELTA=50.0; CROUCH_HEIGHT_REDUCTION=10.0
ACTIONS=(
 ("idle",0,6.0,True),("walk",1,10.0,True),("run",2,12.0,True),("jump",3,10.0,False),
 ("fall",4,8.0,True),("land",5,12.0,False),("crouch",6,6.0,True),("crouch_walk",7,8.0,True),
 ("shoot",8,15.0,False),("shoot_up",9,15.0,False),("shoot_down",10,15.0,False),
 ("shoot_diag_up",11,15.0,False),("shoot_diag_up_alt",12,15.0,False),
 ("shoot_diag_down",13,15.0,False),("shoot_crouch",14,15.0,False),("reload",15,10.0,False),
 ("hurt",16,12.0,False),("die",17,9.0,False),
)
ORDER=tuple(n for n,_,_,_ in ACTIONS)
BYROW={r:(n,f,l) for n,r,f,l in ACTIONS}
WEAPONS=("pistol","machinegun","shotgun","panzerfaust")

def fail(s): raise SystemExit(s)

def args():
 p=argparse.ArgumentParser()
 p.add_argument("--atlas",type=Path,required=True); p.add_argument("--weapon",choices=WEAPONS,required=True)
 p.add_argument("--runtime",type=Path,required=True); p.add_argument("--manifest",type=Path,required=True)
 p.add_argument("--contact-sheet",type=Path,required=True); p.add_argument("--review-board",type=Path,required=True)
 p.add_argument("--strips-dir",type=Path,required=True)
 return p.parse_args()

def runtime_contract(path):
 t=path.read_text(encoding="utf-8")
 def num(k):
  m=re.search(rf"const\s+{k}\s*:=\s*(\d+)",t)
  if not m: fail(f"runtime missing {k}")
  return int(m.group(1))
 def decimal(k):
  m=re.search(rf"const\s+{k}\s*:=\s*([\d.]+)",t)
  if not m: fail(f"runtime missing {k}")
  return float(m.group(1))
 actions_match=re.search(r"const\s+V9_ACTIONS\s*:=\s*\{(.*?)\n\}",t,re.S)
 if not actions_match: fail("runtime missing V9_ACTIONS")
 rx=re.compile(r'"([^"]+)"\s*:\s*\{\s*"row"\s*:\s*(\d+)\s*,\s*"fps"\s*:\s*([\d.]+)\s*,\s*"loop"\s*:\s*(true|false)\s*\}')
 ac={n:{"row":int(r),"fps":float(f),"loop":l=="true"} for n,r,f,l in rx.findall(actions_match.group(1))}
 order_match=re.search(r"const\s+V9_ACTION_ORDER\s*:=\s*\[(.*?)\]",t,re.S)
 if not order_match: fail("runtime missing V9_ACTION_ORDER")
 order=tuple(re.findall(r'"([^"]+)"',order_match.group(1)))
 return {"columns":num("V9_ATLAS_COLUMNS"),"rows":num("V9_ATLAS_ROWS"),"cell_size":num("V9_ATLAS_CELL_SIZE"),
  "packed_foot_y":decimal("V9_PACKED_FOOT_Y"),"action_order":order,"actions":ac}

def check_runtime(rt):
 if rt["rows"]!=ROWS or rt["cell_size"]!=CELL or rt["columns"]<COLS: fail(f"runtime layout drift: {rt}")
 if abs(rt["packed_foot_y"]-FOOT)>0.001: fail(f"runtime packed foot drift: {rt['packed_foot_y']} != {FOOT}")
 if tuple(rt["action_order"])!=ORDER: fail(f"runtime action order drift: {rt['action_order']} != {ORDER}")
 exp={n:{"row":r,"loop":l} for n,r,_,l in ACTIONS}
 actual={n:{"row":v["row"],"loop":v["loop"]} for n,v in rt["actions"].items()}
 if actual!=exp: fail(f"runtime V9 semantic drift: expected={exp} actual={actual}")

def anchor(cell,box):
 px=cell.load(); pts=[]; y0=box[1]+int((box[3]-box[1])*.42)
 for y in range(y0,box[3]):
  for x in range(box[0],box[2]):
   r,g,b,a=px[x,y]
   if a>40 and max(r,g,b)<210: pts.append((x,y))
 if not pts: return (box[0]+box[2])*.5,float(box[3]-1)
 my=max(y for _,y in pts)
 band=[x for x,y in pts if y>=my-max(3,int(round((box[3]-box[1])*.08)))]
 band.sort()
 return float(band[len(band)//2]),float(my)

def forward_tip_y(cell):
 alpha=cell.getchannel("A"); box=alpha.getbbox()
 if box is None: fail("cannot measure direction of empty cell")
 px=alpha.load(); x0=max(AIM_FORWARD_X_MIN,int(round(box[0]+.72*(box[2]-box[0])))); pts=[]
 for y in range(box[1],box[3]):
  for x in range(x0,box[2]):
   if px[x,y]>40: pts.append((x,y))
 if not pts: return float((box[1]+box[3])*.5)
 max_x=max(x for x,_ in pts); cutoff=max(x0,max_x-AIM_FORWARD_BAND_PX)
 ys=[y for x,y in pts if x>=cutoff]
 return float(sorted(ys)[len(ys)//2]) if len(ys)%2 else float((sorted(ys)[len(ys)//2-1]+sorted(ys)[len(ys)//2])*.5)

def row_tip_y(image,row):
 vals=[forward_tip_y(image.crop((c*CELL,row*CELL,(c+1)*CELL,(row+1)*CELL))) for c in range(COLS)]
 vals.sort()
 return float(vals[len(vals)//2]) if len(vals)%2 else float((vals[len(vals)//2-1]+vals[len(vals)//2])*.5)

def row_height(image,row):
 vals=[]
 for c in range(COLS):
  b=image.crop((c*CELL,row*CELL,(c+1)*CELL,(row+1)*CELL)).getchannel("A").getbbox()
  if b is None: fail(f"empty row while measuring height row={row} frame={c}")
  vals.append(b[3]-b[1])
 vals.sort()
 return float(vals[len(vals)//2]) if len(vals)%2 else float((vals[len(vals)//2-1]+vals[len(vals)//2])*.5)

def semantic_report(image):
 horizontal=row_tip_y(image,8)
 tips={str(row):round(row_tip_y(image,row),2) for row in (9,10,11,12,13)}
 return {
  "horizontal_tip_y":round(horizontal,2),
  "direction_tip_y":tips,
  "idle_height":round(row_height(image,0),2),
  "crouch_height":round(row_height(image,6),2),
  "crouch_walk_height":round(row_height(image,7),2),
 }

def validate_semantics(image):
 report=semantic_report(image); horizontal=float(report["horizontal_tip_y"])
 for row in (9,11,12):
  tip=float(report["direction_tip_y"][str(row)])
  if tip>horizontal-AIM_UP_DELTA: fail(f"semantic aim mismatch row={row} expected=up horizontal={horizontal} tip_y={tip}")
 for row in (10,13):
  tip=float(report["direction_tip_y"][str(row)])
  if tip<horizontal+AIM_DOWN_DELTA: fail(f"semantic aim mismatch row={row} expected=down horizontal={horizontal} tip_y={tip}")
 for key in ("crouch_height","crouch_walk_height"):
  if float(report[key])>float(report["idle_height"])-CROUCH_HEIGHT_REDUCTION:
   fail(f"semantic crouch posture too tall: {key}={report[key]} idle={report['idle_height']}")
 return report

def reload_muzzle_flash_score(cell):
 px=cell.load(); score=0
 for y in range(CELL):
  for x in range(RELOAD_FLASH_X_MIN,CELL):
   r,g,b,a=px[x,y]
   if a>50 and r>180 and g>75 and b<90 and r>g*1.15 and g>b*1.20: score+=1
 return score

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
   flash_score=reload_muzzle_flash_score(c) if row==15 else 0
   if row==15 and flash_score>RELOAD_FLASH_SCORE_LIMIT: fail(f"forbidden reload muzzle flash {name}[{col}] score={flash_score}")
   ax,ay=anchor(c,b); h=hashlib.sha256(c.tobytes()).hexdigest(); unique[name].add(h)
   if row<=15 and (abs(ax-PIVOT)>TOL or abs(ay-FOOT)>TOL): fail(f"anchor drift {name}[{col}] x={ax:.1f} y={ay:.1f}")
   if row==0: idle.append(b[3]-b[1])
   frames.append({"action":name,"row":row,"frame":col,"bbox":list(b),"guard_px":g,"alpha_pixels":pixels,
    "anchor_x":round(ax,2),"anchor_y":round(ay,2),"reload_flash_score":flash_score,"sha256_rgba":h})
 if max(idle)-min(idle)>8 or not 215<=sorted(idle)[len(idle)//2]<=245: fail(f"idle scale drift: {idle}")
 for n in ("walk","run","crouch_walk"):
  if len(unique[n])<2: fail(f"no frame variation in {n}")
 validate_semantics(image)
 return frames

def make_contact_sheet(image,path):
 thumb=96; lh=20
 out=Image.new("RGBA",(COLS*thumb,ROWS*(thumb+lh)),(20,20,20,255)); d=ImageDraw.Draw(out)
 for r in range(ROWS):
  n,_,_=BYROW[r]; d.text((4,r*(thumb+lh)+3),f"{r:02d} {n}",fill=(235,235,235,255))
  for c in range(COLS):
   x=image.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)); x.thumbnail((thumb,thumb),Image.Resampling.LANCZOS)
   out.alpha_composite(x,(c*thumb+(thumb-x.width)//2,r*(thumb+lh)+lh+(thumb-x.height)//2))
 path.parent.mkdir(parents=True,exist_ok=True); out.save(path,"PNG",optimize=True)

def make_review_board(image,path):
 label=176; thumb=112; row_h=132
 out=Image.new("RGBA",(label+COLS*thumb,ROWS*row_h),(18,18,18,255)); d=ImageDraw.Draw(out)
 pivot_x=int(round(PIVOT/CELL*thumb)); foot_y=int(round(FOOT/CELL*thumb))
 for r in range(ROWS):
  n,fps,loop=BYROW[r]; y0=r*row_h
  d.text((8,y0+8),f"{r:02d} {n}",fill=(245,245,245,255))
  d.text((8,y0+27),f"{fps:g} fps · {'loop' if loop else 'once'}",fill=(165,165,165,255))
  for c in range(COLS):
   cell=image.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)).resize((thumb,thumb),Image.Resampling.LANCZOS)
   cd=ImageDraw.Draw(cell)
   cd.line((pivot_x,0,pivot_x,thumb-1),fill=(65,190,255,150),width=1)
   cd.line((0,foot_y,thumb-1,foot_y),fill=(255,195,70,170),width=1)
   x0=label+c*thumb; out.alpha_composite(cell,(x0,y0+16))
   d.rectangle((x0,y0+16,x0+thumb-1,y0+16+thumb-1),outline=(75,75,75,255),width=1)
 path.parent.mkdir(parents=True,exist_ok=True); out.save(path,"PNG",optimize=True)

def artifacts(image,a,rt,frames):
 a.strips_dir.mkdir(parents=True,exist_ok=True)
 for n,r,_,_ in ACTIONS:
  image.crop((0,r*CELL,COLS*CELL,(r+1)*CELL)).save(a.strips_dir/f"{r:02d}_{n}.png","PNG",optimize=True)
 make_contact_sheet(image,a.contact_sheet); make_review_board(image,a.review_board)
 data={"schema":2,"kind":"pawn-slug-godot-strict-sprite-atlas","version":V,"weapon":a.weapon,
  "atlas":{"filename":a.atlas.name,"sha256":hashlib.sha256(a.atlas.read_bytes()).hexdigest(),"format":"PNG","mode":"RGBA",
   "width":SIZE[0],"height":SIZE[1],"columns":COLS,"rows":ROWS,"cell_size":CELL,"cell_guard_min_px":GUARD,
   "target_pivot_x":PIVOT,"target_foot_y":FOOT,"anchor_tolerance_px":TOL},
  "godot_runtime_contract":rt,"action_order":list(ORDER),"semantics":semantic_report(image),
  "actions":[{"name":n,"row":r,"frames":COLS,"fps":f,"loop":l} for n,r,f,l in ACTIONS],"frames":frames}
 a.manifest.parent.mkdir(parents=True,exist_ok=True)
 a.manifest.write_text(json.dumps(data,indent=2,sort_keys=True)+"\n",encoding="utf-8")

def main():
 a=args(); im=Image.open(a.atlas)
 if im.format!="PNG" or im.mode!="RGBA" or im.size!=SIZE: fail(f"PNG contract mismatch format={im.format} mode={im.mode} size={im.size}")
 if im.info.get("icc_profile") or im.info.get("exif") or int(im.info.get("interlace",0) or 0): fail("PNG metadata/interlace contract mismatch")
 rt=runtime_contract(a.runtime); check_runtime(rt); frames=validate(im); artifacts(im,a,rt,frames)
 print(f"OK strict Godot atlas {a.weapon}: {SIZE[0]}x{SIZE[1]} grid={COLS}x{ROWS} cell={CELL}px manifest_schema=2")

if __name__=="__main__": main()
