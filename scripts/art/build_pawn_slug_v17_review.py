#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
from PIL import Image, ImageDraw
CELL=416; ROWS=18; PICKS=(0,3,6); TH=112; LABEL=140; PAIR=len(PICKS)*TH; ROWH=TH+24
ACTIONS=("idle","walk","run","jump","fall","land","crouch","crouch_walk","shoot","shoot_up","shoot_down","shoot_diag_up","shoot_diag_up_alt","shoot_diag_down","shoot_crouch","reload","hurt","die")
def main():
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--atlas',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    old=Image.open(a.baseline).convert('RGBA');new=Image.open(a.atlas).convert('RGBA')
    board=Image.new('RGBA',(LABEL+PAIR*2,ROWS*ROWH),(18,18,18,255));d=ImageDraw.Draw(board)
    d.text((LABEL,2),'v16 machinegun',fill=(170,170,170,255));d.text((LABEL+PAIR,2),'v17 candidate',fill=(120,220,140,255))
    for row,name in enumerate(ACTIONS):
        y=row*ROWH;d.text((6,y+5),f'{row:02d} {name}',fill=(240,240,240,255))
        for side,image in enumerate((old,new)):
            for i,col in enumerate(PICKS):
                crop=image.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)).resize((TH,TH),Image.Resampling.LANCZOS)
                board.alpha_composite(crop,(LABEL+side*PAIR+i*TH,y+20))
    board.save(a.output,'PNG',compress_level=3);print(a.output)
if __name__=='__main__':main()
