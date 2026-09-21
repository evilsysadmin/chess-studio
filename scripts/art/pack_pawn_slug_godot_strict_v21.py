#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

VERSION='v21'; WEAPON='pistol'
SRC_CELL=128; SRC_COLS=8; SRC_ROWS=18; SRC_SIZE=(1024,2304)
SOURCE_SHA256='4d9057f0e194a8d67e463d79d5c968b5f83e2da162186f52e764e67ab5ff91e3'
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
PIVOT_X=200.0; FOOT_Y=382.0; SRC_PIVOT_X=64.0; SRC_FOOT_Y=116.0
SCALE=2.75; GUARD=2
ACTIONS=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']

def sha(path: Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()

def clean_cell(cell: Image.Image)->Image.Image:
    px=cell.load()
    for y in range(CELL):
        for x in range(CELL):
            r,g,b,a=px[x,y]
            if a==0 or x<GUARD or y<GUARD or x>=CELL-GUARD or y>=CELL-GUARD:
                px[x,y]=(0,0,0,0)
    return cell

def normalize_source_cell(cell: Image.Image)->Image.Image:
    target=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    scaled=cell.convert('RGBA').resize((round(SRC_CELL*SCALE),round(SRC_CELL*SCALE)),Image.Resampling.NEAREST)
    x=round(PIVOT_X-SRC_PIVOT_X*SCALE)
    y=round(FOOT_Y-SRC_FOOT_Y*SCALE)
    target.alpha_composite(scaled,(x,y))
    return clean_cell(target)

def main()->int:
    p=argparse.ArgumentParser(); p.add_argument('--source',type=Path); p.add_argument('--output',type=Path); p.add_argument('--manifest',type=Path); p.add_argument('--self-test',action='store_true'); a=p.parse_args()
    if a.self_test:
        assert SRC_SIZE==(SRC_COLS*SRC_CELL,SRC_ROWS*SRC_CELL)
        assert SIZE==(COLS*CELL,ROWS*CELL)
        assert len(ACTIONS)==ROWS
        print('OK strict-v21 full-bank pack self-test'); return 0
    if not all((a.source,a.output,a.manifest)): raise SystemExit('source/output/manifest required')
    actual=sha(a.source)
    if actual!=SOURCE_SHA256: raise SystemExit(f'source SHA mismatch: {actual}')
    src=Image.open(a.source).convert('RGBA')
    if src.size!=SRC_SIZE: raise SystemExit(f'expected source {SRC_SIZE}, got {src.size}')
    out=Image.new('RGBA',SIZE,(0,0,0,0))
    for row in range(ROWS):
        for col in range(COLS):
            box=(col*SRC_CELL,row*SRC_CELL,(col+1)*SRC_CELL,(row+1)*SRC_CELL)
            out.alpha_composite(normalize_source_cell(src.crop(box)),(col*CELL,row*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9)
    manifest={
      'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':WEAPON,
      'source':{'filename':a.source.name,'sha256':SOURCE_SHA256,'cell_size':SRC_CELL,'columns':SRC_COLS,'rows':SRC_ROWS,'pivot_x':SRC_PIVOT_X,'foot_y':SRC_FOOT_Y},
      'atlas':{'filename':a.output.name,'sha256':sha(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'frames_per_pose':COLS,'cell_guard_px':GUARD},
      'actions':{name:{'row':row,'frames':COLS} for row,name in enumerate(ACTIONS)},
      'processing':{'blender':False,'kind':'2d-full-bank-normalization','resample':'nearest','scale':SCALE,'replaced_rows':list(range(ROWS)),'preserved_rows':[],'weapon_contract':'single compact Walther P99; two-hand grip where semantically applicable','hurt_contract':'standing flinch with squeezed eye/grimace; never knockdown','die_contract':'prone only in die','layout_contract':'fixed 8x18 grid'}
    }
    a.manifest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8'); print(a.output); return 0
if __name__=='__main__': raise SystemExit(main())