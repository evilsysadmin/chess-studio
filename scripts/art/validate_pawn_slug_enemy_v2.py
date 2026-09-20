#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image

TYPES=('pawn','knight','rook','bishop','queen','grenadier','scout','commando','shield')
ACTIONS=('idle','run')
COLS=8; ROWS=18; CELL=128; SIZE=(1024,2304); GUARD=6; FOOT_Y=117.0
FORBIDDEN_CHUNKS={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}

def fail(msg): raise SystemExit(msg)
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def png_chunks(path:Path):
    data=path.read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'): fail('atlas is not PNG')
    pos=8
    while pos+12<=len(data):
        length=struct.unpack('>I',data[pos:pos+4])[0]; kind=data[pos+4:pos+8]
        yield kind
        pos += 12 + length
        if kind==b'IEND': break

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--atlas',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--sheets-dir',type=Path,required=True)
    a=p.parse_args()
    im=Image.open(a.atlas)
    if im.format!='PNG' or im.mode!='RGBA' or im.size!=SIZE: fail(f'PNG contract mismatch format={im.format} mode={im.mode} size={im.size}')
    bad=[c.decode('ascii') for c in png_chunks(a.atlas) if c in FORBIDDEN_CHUNKS]
    if bad: fail(f'forbidden PNG chunks: {bad}')
    for r,g,b,alpha in im.get_flattened_data():
        if alpha==0 and (r or g or b): fail('RGB data exists under alpha=0')
    data=json.loads(a.manifest.read_text(encoding='utf-8'))
    if data.get('schema')!=1 or data.get('version')!='v2' or data.get('kind')!='pawn-slug-godot-enemy-atlas': fail('manifest schema/version/kind mismatch')
    at=data.get('atlas',{})
    if (at.get('columns'),at.get('rows'),at.get('cell_size'),at.get('width'),at.get('height'))!=(COLS,ROWS,CELL,*SIZE): fail('atlas layout mismatch')
    if int(at.get('cell_guard_min_px',-1))!=GUARD: fail('cell guard mismatch')
    if at.get('sha256')!=sha(a.atlas): fail('atlas sha256 mismatch')
    src=data.get('source',{})
    if src.get('sha256')!=sha(a.source) or src.get('size')!=[576,576]: fail('worksheet source contract mismatch')
    types=data.get('types',[])
    if [x.get('type') for x in types]!=list(TYPES): fail('enemy type order mismatch')
    seen_rows=set(); total=0
    for ti,t in enumerate(types):
        acts=t.get('actions',[])
        if [x.get('name') for x in acts]!=list(ACTIONS): fail(f'{TYPES[ti]} action order mismatch')
        sheet_meta=t.get('sheet',{})
        sheet_path=a.sheets_dir/sheet_meta.get('filename','')
        if not sheet_path.is_file(): fail(f'missing type sheet for {TYPES[ti]}')
        sheet=Image.open(sheet_path)
        if sheet.format!='PNG' or sheet.mode!='RGBA' or sheet.size!=(1024,256): fail(f'type sheet contract mismatch for {TYPES[ti]}')
        if sheet_meta.get('sha256')!=sha(sheet_path): fail(f'type sheet hash mismatch for {TYPES[ti]}')
        if sheet.tobytes()!=im.crop((0,ti*2*CELL,1024,(ti*2+2)*CELL)).tobytes(): fail(f'type sheet differs from atlas for {TYPES[ti]}')
        for ai,act in enumerate(acts):
            row=int(act.get('row',-1)); count=int(act.get('frames',-1))
            if row!=ti*2+ai or row in seen_rows: fail(f'row mismatch/duplicate for {TYPES[ti]}/{ACTIONS[ai]}')
            seen_rows.add(row)
            if count!=8 or float(act.get('fps',0))<=0: fail(f'frame/fps contract mismatch for row {row}')
            hashes=set()
            for col in range(COLS):
                cell=im.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); box=cell.getchannel('A').getbbox()
                if box is None: fail(f'empty frame row={row} col={col}')
                guard=min(box[0],box[1],CELL-box[2],CELL-box[3])
                if guard<GUARD: fail(f'cell bleed row={row} col={col} guard={guard}')
                bottom=box[3]-1
                if abs(bottom-FOOT_Y)>4: fail(f'foot-line drift row={row} col={col} bottom={bottom}')
                if box[2]-box[0]<36 or box[3]-box[1]<42: fail(f'implausibly small frame row={row} col={col} bbox={box}')
                hashes.add(hashlib.sha256(cell.tobytes()).hexdigest()); total+=1
            if len(hashes)!=8: fail(f'animation frame collapse row={row}: unique={len(hashes)}')
    if len(seen_rows)!=ROWS or total!=144: fail(f'row/frame totals mismatch rows={len(seen_rows)} frames={total}')
    print(f'OK enemy v2 strict atlas: {len(TYPES)} types, {ROWS} rows, {total} unique frames, size={SIZE}')
if __name__=='__main__': main()
