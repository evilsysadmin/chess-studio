#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image,ImageDraw
CELL=416

def main():
 p=argparse.ArgumentParser(); p.add_argument('--machinegun',type=Path,required=True); p.add_argument('--run-dir',type=Path,required=True); p.add_argument('--output',type=Path,required=True); a=p.parse_args(); panels=[]
 mg=Image.open(a.machinegun).convert('RGBA'); rows=[0,2,6,8,9,10,11,12,13,14]; sc=.42; fw=int(CELL*sc); fh=int(CELL*sc)
 board=Image.new('RGBA',(fw*8,(fh+24)*len(rows)),(14,16,19,255)); d=ImageDraw.Draw(board)
 for rr,row in enumerate(rows):
  d.text((5,rr*(fh+24)+4),f'SMG row {row}',fill='white')
  for c in range(8): board.alpha_composite(mg.crop((c*CELL,row*CELL,(c+1)*CELL,(row+1)*CELL)).resize((fw,fh),Image.Resampling.LANCZOS),(c*fw,rr*(fh+24)+24))
 panels.append(board)
 for w in ['pistol','machinegun','shotgun','panzerfaust']:
  im=Image.open(a.run_dir/f'{w}-v22.png').convert('RGBA'); sc=.5; fw=int(CELL*sc); fh=int(CELL*sc); b=Image.new('RGBA',(fw*6,fh*2+28),(14,16,19,255)); dd=ImageDraw.Draw(b); dd.text((6,5),f'{w} RUN12',fill='white')
  for c in range(12): b.alpha_composite(im.crop((c*CELL,0,(c+1)*CELL,CELL)).resize((fw,fh),Image.Resampling.LANCZOS),((c%6)*fw,28+(c//6)*fh))
  panels.append(b)
 W=max(x.width for x in panels); H=sum(x.height for x in panels); out=Image.new('RGBA',(W,H),(9,11,14,255)); y=0
 for x in panels: out.alpha_composite(x,(0,y)); y+=x.height
 a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9); print(a.output)
if __name__=='__main__': main()