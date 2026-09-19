#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image,ImageDraw
CELL=416; ROWS=18; PICKS=(0,3,6); TH=112; LABEL=120; PAIR=len(PICKS)*TH; ROWH=TH+24

def main():
    p=argparse.ArgumentParser(); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--output',type=Path,required=True); a=p.parse_args()
    old=Image.open(a.baseline).convert('RGBA'); new=Image.open(a.atlas).convert('RGBA')
    board=Image.new('RGBA',(LABEL+PAIR*2,ROWS*ROWH),(18,18,18,255)); d=ImageDraw.Draw(board)
    d.text((LABEL,2),'v12 baseline',fill=(170,170,170,255)); d.text((LABEL+PAIR,2),'v13 candidate',fill=(170,170,170,255))
    for r in range(ROWS):
        y=r*ROWH; d.text((6,y+5),f'{r:02d}',fill=(240,240,240,255))
        for side,img in enumerate((old,new)):
            for j,c in enumerate(PICKS):
                crop=img.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)).resize((TH,TH),Image.Resampling.LANCZOS)
                board.alpha_composite(crop,(LABEL+side*PAIR+j*TH,y+20))
    board.save(a.output,'PNG',compress_level=3); print(a.output)
if __name__=='__main__': main()
