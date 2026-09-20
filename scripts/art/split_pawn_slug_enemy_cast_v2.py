#!/usr/bin/env python3
"""Split one compact 3x3 Pawn Slug cast worksheet into nine 4x4 enemy worksheets."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from PIL import Image
from png_contract import clean_transparent_rgb, save_png_contract, sha256_file
CAST_TYPES=('pawn','knight','rook','bishop','queen','grenadier','scout','commando','shield')
GRID=3

def edges(size:int)->list[int]: return [round(i*size/GRID) for i in range(GRID+1)]

def main()->None:
    p=argparse.ArgumentParser(); p.add_argument('--source',type=Path,required=True); p.add_argument('--output-dir',type=Path,required=True); a=p.parse_args()
    source=Image.open(a.source).convert('RGBA')
    if source.width<GRID*4 or source.height<GRID*4: raise SystemExit(f'cast worksheet too small: {source.size}')
    if source.getchannel('A').getextrema()[0]==255: raise SystemExit('cast worksheet must contain transparency')
    xs,ys=edges(source.width),edges(source.height); a.output_dir.mkdir(parents=True,exist_ok=True); items=[]
    for i,kind in enumerate(CAST_TYPES):
        row,col=divmod(i,GRID); region=(xs[col],ys[row],xs[col+1],ys[row+1]); tile=clean_transparent_rgb(source.crop(region))
        out=a.output_dir/f'enemy-{kind}-worksheet.png'; save_png_contract(tile,out)
        items.append({'type':kind,'sourceRegion':list(region),'file':out.name,'size':list(tile.size),'sha256':sha256_file(out)})
    manifest={'schema':1,'scope':'pawn-slug-enemy-cast-v2-intake','source':a.source.name,'sourceSha256':sha256_file(a.source),'sourceSize':list(source.size),'types':items}
    (a.output_dir/'enemy-cast-v2-sources.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(f'OK: split cast worksheet into {len(items)} enemy worksheets')
if __name__=='__main__': main()
