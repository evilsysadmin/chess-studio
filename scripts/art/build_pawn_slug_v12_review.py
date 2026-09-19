#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
CELL=416; COLS=8; ROWS=18; TH=76; LABEL=190; ROW_H=TH*2+34

def main():
 p=argparse.ArgumentParser(); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--report',type=Path,required=True); p.add_argument('--output',type=Path,required=True); c=p.parse_args()
 old=np.array(Image.open(c.baseline).convert('RGBA')); new=np.array(Image.open(c.atlas).convert('RGBA')); m=json.loads(c.manifest.read_text()); rep=json.loads(c.report.read_text()); by={x['row']:x for x in rep['rows']}
 board=np.zeros((ROWS*ROW_H,LABEL+COLS*TH,4),dtype=np.uint8); board[:]=[17,17,17,255]
 for a in m['actions']:
  r=a['row']; y=r*ROW_H
  for col in range(COLS):
   x=LABEL+col*TH; x0=col*CELL; y0=r*CELL
   o=cv2.resize(old[y0:y0+CELL,x0:x0+CELL],(TH,TH),interpolation=cv2.INTER_AREA); n=cv2.resize(new[y0:y0+CELL,x0:x0+CELL],(TH,TH),interpolation=cv2.INTER_AREA)
   board[y+31:y+31+TH,x:x+TH]=o; board[y+31+TH:y+31+2*TH,x:x+TH]=n
 im=Image.fromarray(board,'RGBA'); d=ImageDraw.Draw(im); px=round(200/CELL*TH); fy=round(382/CELL*TH)
 for a in m['actions']:
  r=a['row']; y=r*ROW_H; q=by[r]
  d.text((8,y+4),f'{r:02d} {a["name"]}',fill=(245,245,245,255)); d.text((8,y+20),f'8/8 distinct · sharp {q["sharpness_v11"]:.1f}→{q["sharpness_v12"]:.1f}',fill=(160,160,160,255))
  for col in range(COLS):
   x=LABEL+col*TH; yy=y+31+TH
   d.line((x+px,yy,x+px,yy+TH-1),fill=(65,190,255,150)); d.line((x,yy+fy,x+TH-1,yy+fy),fill=(255,195,70,170))
 im.save(c.output,'PNG',compress_level=3); print(c.output)
if __name__=='__main__': main()
