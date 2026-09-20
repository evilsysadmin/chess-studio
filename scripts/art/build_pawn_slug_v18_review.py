#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image,ImageDraw
CELL=416;COLS=8;ROWS=18;SHOW=(0,1,2,6,8,9,10,11,13,14,15,16,17)
def main():
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--atlas',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();old=Image.open(a.baseline).convert('RGBA');new=Image.open(a.atlas).convert('RGBA')
 scale=.28; tw=round(CELL*scale);th=round(CELL*scale);margin=34;gap=18; out=Image.new('RGB',(margin+6*tw+gap*2,30+len(SHOW)*(th+8)),(18,18,18));d=ImageDraw.Draw(out);d.text((margin,8),'strict-v16 baseline',fill='white');d.text((margin+3*tw+gap,8),'strict-v18 P99',fill='white')
 for i,row in enumerate(SHOW):
  y=30+i*(th+8);d.text((4,y+4),f'{row:02d}',fill=(210,210,210))
  for side,src in enumerate((old,new)):
   xbase=margin+side*(3*tw+gap)
   for j,col in enumerate((0,3,7)):
    cell=src.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)).resize((tw,th),Image.Resampling.LANCZOS);bg=Image.new('RGB',(tw,th),(18,18,18));bg.paste(cell,(0,0),cell);out.paste(bg,(xbase+j*tw,y))
 a.output.parent.mkdir(parents=True,exist_ok=True);out.save(a.output,'PNG',compress_level=9);print(a.output)
if __name__=='__main__':main()
