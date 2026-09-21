#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

VERSION='v22'; WEAPON='pistol'
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
PIVOT_X=200.0; FOOT_Y=382.0; GUARD=2
CROUCH_SCALE_Y=0.84
EXPECTED_SHA256='778e2fb3da5649b484c36af633723de3218ca83a09a071d75c239c1130fd4c87'
ACTIONS=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']

def sha(path: Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()

def cell(im: Image.Image, r:int, c:int)->Image.Image:
    return im.crop((c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL))

def squash_crouch(src: Image.Image)->Image.Image:
    bb=src.getchannel('A').getbbox()
    if not bb: return src.copy()
    crop=src.crop(bb)
    nw=crop.width; nh=max(1,round(crop.height*CROUCH_SCALE_Y))
    scaled=crop.resize((nw,nh),Image.Resampling.NEAREST)
    out=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    x=(bb[0]+bb[2])//2-nw//2
    y=round(FOOT_Y)-nh
    out.alpha_composite(scaled,(x,y))
    return out

def clean(im: Image.Image)->None:
    px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a==0: px[x,y]=(0,0,0,0)

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument('--v21',type=Path)
    p.add_argument('--v20',type=Path)
    p.add_argument('--output',type=Path)
    p.add_argument('--manifest',type=Path)
    p.add_argument('--self-test',action='store_true')
    a=p.parse_args()
    if a.self_test:
        assert SIZE==(CELL*COLS,CELL*ROWS) and len(ACTIONS)==ROWS and CROUCH_SCALE_Y==0.84
        print('OK strict-v22 hybrid pack self-test'); return 0
    if not all((a.v21,a.v20,a.output,a.manifest)): raise SystemExit('v21/v20/output/manifest required')
    v21=Image.open(a.v21).convert('RGBA'); v20=Image.open(a.v20).convert('RGBA')
    if v21.size!=SIZE or v20.size!=SIZE: raise SystemExit(f'expected {SIZE}')
    out=Image.new('RGBA',SIZE,(0,0,0,0))
    for r in range(ROWS):
        for c in range(COLS):
            if r<=5:
                src=cell(v21,r,c)
            elif r in (6,7):
                src=squash_crouch(cell(v21,r,c))
            elif 8<=r<=14:
                src=cell(v20,r,c)
            else:
                src=cell(v21,r,c)
            out.alpha_composite(src,(c*CELL,r*CELL))
    clean(out)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    out.save(a.output,'PNG',compress_level=9)
    actual=sha(a.output)
    if actual!=EXPECTED_SHA256: raise SystemExit(f'v22 SHA mismatch: {actual}')
    manifest={
      'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':WEAPON,
      'sources':{
        'v21':{'filename':a.v21.name,'sha256':sha(a.v21),'rows':[0,1,2,3,4,5,6,7,15,16,17]},
        'v20':{'filename':a.v20.name,'sha256':sha(a.v20),'rows':[8,9,10,11,12,13,14]},
      },
      'atlas':{'filename':a.output.name,'sha256':actual,'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'frames_per_pose':COLS,'cell_guard_px':GUARD},
      'actions':{name:{'row':r,'frames':COLS} for r,name in enumerate(ACTIONS)},
      'processing':{
        'blender':False,'kind':'2d-reviewed-hybrid-bank','crouch_scale_y':CROUCH_SCALE_Y,
        'row_contract':{'v21':[0,1,2,3,4,5,15,16,17],'v21_crouch_scaled':[6,7],'v20_combat':[8,9,10,11,12,13,14]},
        'weapon_contract':'single compact Walther P99; no apparent second weapon',
        'hurt_contract':'standing flinch; never knockdown','die_contract':'prone only in die','layout_contract':'fixed 8x18 grid'}
    }
    a.manifest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(a.output)
    return 0
if __name__=='__main__': raise SystemExit(main())