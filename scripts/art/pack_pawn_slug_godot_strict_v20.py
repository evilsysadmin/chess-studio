#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, io, json
from pathlib import Path
from PIL import Image

VERSION='v20'; WEAPON='pistol'; CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
PIVOT_X=200.0; FOOT_Y=382.0; GUARD=2
SRC_CELL=128; SRC_COLS=8; SRC_ROWS=11; SRC_SIZE=(1024,1408)
SRC_WEBP_SHA256='f3d22b233444b89396617fb644b564b33ea1e4ec7c8fe87fbcd2e8038f32451c'
SOURCE_ROWS=(0,8,9,10,11,12,13,14,15,16,17)
ACTIONS=('idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die')

def sha_bytes(data): return hashlib.sha256(data).hexdigest()
def sha_file(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def embedded_source_bytes(root: Path) -> bytes:
    parts=sorted((root/'v20_source').glob('chunk_*.b64'))
    if len(parts)!=17: raise RuntimeError(f'expected 17 v20 source chunks, got {len(parts)}')
    raw=base64.b64decode(''.join(p.read_text(encoding='ascii').strip() for p in parts), validate=True)
    if sha_bytes(raw)!=SRC_WEBP_SHA256: raise RuntimeError('v20 embedded source sha256 mismatch')
    return raw

def clean(cell: Image.Image) -> Image.Image:
    cell=cell.convert('RGBA'); px=cell.load()
    for y in range(CELL):
        for x in range(CELL):
            r,g,b,a=px[x,y]
            if x<GUARD or y<GUARD or x>=CELL-GUARD or y>=CELL-GUARD or a==0:
                px[x,y]=(0,0,0,0)
    return cell

def normalize(src_cell: Image.Image) -> Image.Image:
    scaled=src_cell.convert('RGBA').resize((288,288),Image.Resampling.NEAREST)
    out=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    out.alpha_composite(scaled,(56,121))
    return clean(out)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--baseline',type=Path); p.add_argument('--output',type=Path)
    p.add_argument('--manifest',type=Path); p.add_argument('--source',type=Path)
    p.add_argument('--self-test',action='store_true'); a=p.parse_args()
    if a.self_test:
        assert SIZE==(3328,7488) and SRC_SIZE==(1024,1408) and len(SOURCE_ROWS)==11 and len(ACTIONS)==18
        print('OK strict-v20 pack self-test'); return
    if not all((a.baseline,a.output,a.manifest)): raise SystemExit('baseline/output/manifest required')
    baseline=Image.open(a.baseline).convert('RGBA')
    if baseline.size!=SIZE: raise SystemExit(f'expected baseline {SIZE}, got {baseline.size}')
    source_bytes=a.source.read_bytes() if a.source else embedded_source_bytes(Path(__file__).resolve().parent)
    if sha_bytes(source_bytes)!=SRC_WEBP_SHA256: raise SystemExit('v20 source sha mismatch')
    source=Image.open(io.BytesIO(source_bytes)).convert('RGBA')
    if source.size!=SRC_SIZE: raise SystemExit(f'expected source {SRC_SIZE}, got {source.size}')
    out=baseline.copy()
    for sr,target_row in enumerate(SOURCE_ROWS):
        for col in range(COLS):
            src=source.crop((col*SRC_CELL,sr*SRC_CELL,(col+1)*SRC_CELL,(sr+1)*SRC_CELL))
            cell=normalize(src)
            out.paste(Image.new('RGBA',(CELL,CELL),(0,0,0,0)),(col*CELL,target_row*CELL))
            out.alpha_composite(cell,(col*CELL,target_row*CELL))
    a.output.parent.mkdir(parents=True,exist_ok=True); out.save(a.output,'PNG',compress_level=9)
    manifest={'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':WEAPON,
      'baseline':{'filename':a.baseline.name,'sha256':sha_file(a.baseline),'generation':'v19','weapon':'pistol','size':list(SIZE)},
      'source':{'kind':'imagegen-reviewed-mini-atlas','sha256':SRC_WEBP_SHA256,'size':list(SRC_SIZE),'cell_size':SRC_CELL,'rows':list(SOURCE_ROWS)},
      'atlas':{'filename':a.output.name,'sha256':sha_file(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'frames_per_pose':COLS,'cell_guard_px':GUARD},
      'actions':{name:{'row':row,'frames':COLS} for row,name in enumerate(ACTIONS)},
      'processing':{'blender':False,'kind':'imagegen-frames-normalized-over-v19','changed_rows':list(SOURCE_ROWS),'preserved_rows':[1,2,3,4,5,6,7],'scale':2.25,'paste':[56,121],'weapon_contract':'one compact Walther P99, two-hand grip; no second-weapon silhouette','hurt_contract':'standing flinch with squeezed eye/grimace; never knockdown','layout_contract':'fixed 8x18 grid'}}
    a.manifest.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8'); print(a.output)
if __name__=='__main__': main()
