#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from PIL import Image,ImageDraw
ACTIONS=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']
CELL=416; COLS=8; ROWS=18

def main():
 p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--output-dir',type=Path,required=True); p.add_argument('--scale',type=float,default=0.5); a=p.parse_args()
 im=Image.open(a.atlas).convert('RGBA'); a.output_dir.mkdir(parents=True,exist_ok=True); rows=[]
 for r,name in enumerate(ACTIONS):
  strip=im.crop((0,r*CELL,COLS*CELL,(r+1)*CELL))
  w=max(1,round(strip.width*a.scale)); h=max(1,round(strip.height*a.scale)); strip=strip.resize((w,h),Image.Resampling.LANCZOS)
  board=Image.new('RGBA',(w,h+38),(18,20,24,255)); board.alpha_composite(strip,(0,38)); d=ImageDraw.Draw(board); d.text((10,10),f'{r:02d} {name} · 8 frames',fill=(240,240,240,255))
  path=a.output_dir/f'{r:02d}-{name}.png'; board.save(path,'PNG',compress_level=9); rows.append(path.name)
 overview=Image.new('RGBA',(max(Image.open(a.output_dir/x).width for x in rows),sum(Image.open(a.output_dir/x).height for x in rows)),(12,14,18,255)); y=0
 for x in rows:
  row=Image.open(a.output_dir/x).convert('RGBA'); overview.alpha_composite(row,(0,y)); y+=row.height
 overview.save(a.output_dir/'all-poses.png','PNG',compress_level=9)
 (a.output_dir/'pose-review.json').write_text(json.dumps({'schema':1,'rows':[{'row':i,'action':name,'file':rows[i]} for i,name in enumerate(ACTIONS)]},indent=2)+'\n')
 print(a.output_dir/'all-poses.png')
if __name__=='__main__': main()