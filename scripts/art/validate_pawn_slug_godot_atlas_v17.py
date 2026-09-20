#!/usr/bin/env python3
"""Fail-closed validation for the strict-v17 Matthias machinegun bank."""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from pathlib import Path
from PIL import Image

VERSION="v17"; WEAPON="machinegun"; SOURCE_WEAPON="shotgun"
CELL=416; COLS=8; ROWS=18; SIZE=(COLS*CELL,ROWS*CELL); GUARD=2
FORBIDDEN={b"iCCP",b"gAMA",b"sRGB",b"cHRM"}


def sha(path: Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''): h.update(chunk)
    return h.hexdigest()


def chunks(path: Path):
    data=path.read_bytes(); pos=8
    if data[:8]!=b"\x89PNG\r\n\x1a\n": return []
    out=[]
    while pos+12<=len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0]; typ=data[pos+4:pos+8]
        out.append(typ); pos+=12+n
        if typ==b'IEND': break
    return out


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--atlas',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--report',type=Path,required=True)
    args=p.parse_args()
    new=Image.open(args.atlas).convert('RGBA'); src=Image.open(args.source).convert('RGBA')
    manifest=json.loads(args.manifest.read_text(encoding='utf-8'))
    errors=[]
    if new.size!=SIZE or src.size!=SIZE: errors.append(f'bad atlas/source size: {new.size} / {src.size}')
    if manifest.get('version')!=VERSION or manifest.get('weapon')!=WEAPON: errors.append('manifest version/weapon mismatch')
    sm=manifest.get('source',{}); am=manifest.get('atlas',{})
    if sm.get('weapon')!=SOURCE_WEAPON or sm.get('generation')!='v16': errors.append('manifest source contract mismatch')
    if sm.get('sha256')!=sha(args.source): errors.append('manifest source sha256 mismatch')
    if am.get('sha256')!=sha(args.atlas): errors.append('manifest atlas sha256 mismatch')
    for key,want in [('columns',COLS),('rows',ROWS),('cell_size',CELL),('frames_per_pose',COLS),('cell_guard_px',GUARD)]:
        if int(am.get(key,-1))!=want: errors.append(f'manifest {key} mismatch')
    if float(am.get('pivot_x',-1))!=200.0 or float(am.get('foot_y',-1))!=382.0: errors.append('pivot/foot contract mismatch')
    bad=[x.decode() for x in chunks(args.atlas) if x in FORBIDDEN]
    if bad: errors.append('forbidden PNG chunks: '+','.join(bad))
    if max(new.size)>16384: errors.append('texture side exceeds 16384')

    changed_total=0; removed_alpha=0; bad_transparent=0; distinct=[]; max_alpha_y=0
    changed_by_row=[]; guard_cells=[]
    for row in range(ROWS):
        hashes=[]; row_changed=0
        for col in range(COLS):
            box=(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)
            nc=new.crop(box); sc=src.crop(box)
            hashes.append(hashlib.sha256(nc.tobytes()).hexdigest())
            nd=list(nc.getdata()); sd=list(sc.getdata())
            diff=sum(1 for a,b in zip(nd,sd) if a!=b); changed_total+=diff; row_changed+=diff
            removed_alpha += sum(1 for a,b in zip(nd,sd) if a[3] < b[3])
            bad_transparent += sum(1 for r,g,b,a in nd if a==0 and (r or g or b))
            bbox=nc.getchannel('A').getbbox()
            if bbox: max_alpha_y=max(max_alpha_y,bbox[3]-1)
            pix=nc.load(); bad_guard=False
            for x in range(CELL):
                if any(pix[x,y][3] for y in (0,1,CELL-2,CELL-1)): bad_guard=True; break
            if not bad_guard:
                for y in range(CELL):
                    if any(pix[x,y][3] for x in (0,1,CELL-2,CELL-1)): bad_guard=True; break
            if bad_guard: guard_cells.append([row,col])
        distinct.append(len(set(hashes))); changed_by_row.append(row_changed)
    if removed_alpha: errors.append(f'{removed_alpha} validated source alpha samples removed')
    if bad_transparent: errors.append(f'{bad_transparent} RGB-contaminated fully transparent pixels')
    if guard_cells: errors.append(f'2px cell guard violated: {guard_cells[:8]}')
    if distinct != [8]*ROWS: errors.append(f'duplicate frame row(s): {distinct}')
    if not (150_000 <= changed_total <= 800_000): errors.append(f'suspicious changed pixel count: {changed_total}')
    if any(changed_by_row[row] < 4_000 for row in range(16)): errors.append(f'machinegun treatment missing from active row(s): {changed_by_row}')
    if max_alpha_y > 392: errors.append(f'foot/effect envelope regressed: {max_alpha_y} > 392')

    report={
      'ok':not errors,'errors':errors,
      'summary':{
        'frames':ROWS*COLS,'rows':ROWS,'all_rows_8_distinct':distinct==[8]*ROWS,
        'source_weapon':SOURCE_WEAPON,'changed_pixels_vs_source':changed_total,
        'changed_pixels_by_row':changed_by_row,'removed_source_alpha_samples':removed_alpha,
        'max_alpha_y':max_alpha_y,'guard_ok':not guard_cells,'clean_transparent_rgb':bad_transparent==0,
        'png_chunks':sorted(x.decode() for x in set(chunks(args.atlas))),
      }
    }
    args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if errors: raise SystemExit('\n'.join(errors))
    print('OK strict-v17 atlas',report['summary'])

if __name__=='__main__': main()
