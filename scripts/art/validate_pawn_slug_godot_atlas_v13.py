#!/usr/bin/env python3
"""Fail-closed validation for Matthias strict-v13 tonal pass."""
from __future__ import annotations
import argparse, json, struct
from pathlib import Path
import numpy as np
from PIL import Image
COLS=8; ROWS=18; CELL=416; SIZE=(COLS*CELL,ROWS*CELL)
FORBIDDEN={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}

def chunks(path:Path):
    data=path.read_bytes(); pos=8
    if data[:8]!=b'\x89PNG\r\n\x1a\n': return []
    out=[]
    while pos+12<=len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos+=12+n
        if typ==b'IEND': break
    return out

def frame_hashes(a):
    import hashlib
    return [hashlib.sha256(a[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL].tobytes()).hexdigest() for r in range(ROWS) for c in range(COLS)]

def main():
    p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
    new=np.array(Image.open(a.atlas).convert('RGBA')); old=np.array(Image.open(a.baseline).convert('RGBA')); m=json.loads(a.manifest.read_text()); errs=[]
    if (new.shape[1],new.shape[0])!=SIZE or (old.shape[1],old.shape[0])!=SIZE: errs.append('bad atlas size')
    if not np.array_equal(new[...,3],old[...,3]): errs.append('alpha geometry changed')
    if np.any(new[new[...,3]==0,:3]!=0): errs.append('transparent RGB contamination')
    bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
    if bad: errs.append('forbidden PNG chunks: '+','.join(bad))
    if max(new.shape[:2])>16384: errs.append('texture side exceeds 16384')
    changed=int(np.any(new[...,:3]!=old[...,:3],axis=2).sum())
    if changed<500000: errs.append(f'tonal pass too small: {changed} changed RGB pixels')
    hs=frame_hashes(new)
    distinct=[len(set(hs[r*COLS:(r+1)*COLS])) for r in range(ROWS)]
    if min(distinct)<8: errs.append(f'duplicate frame row(s): {distinct}')
    spreads=[]
    for r in range(ROWS):
        old_l=[]; new_l=[]
        for c in range(COLS):
            for arr,dst in ((old,old_l),(new,new_l)):
                cell=arr[r*CELL:(r+1)*CELL,c*CELL:(c+1)*CELL]; mask=cell[...,3]>40; rgb=cell[...,:3].astype(np.float32); y=.2126*rgb[...,0]+.7152*rgb[...,1]+.0722*rgb[...,2]; dst.append(float(y[mask].mean()))
        os=max(old_l)-min(old_l); ns=max(new_l)-min(new_l); spreads.append((os,ns))
        if ns>os+1.0: errs.append(f'luma flicker regression row {r}: {os:.2f}->{ns:.2f}')
    metrics=m.get('metrics',{})
    for key in ('skin_pixels','weapon_pixels','shadow_pixels','changed_rgb_pixels'):
        if int(metrics.get(key,0))<=0: errs.append(f'missing metric {key}')
    report={'ok':not errs,'errors':errs,'summary':{'frames':ROWS*COLS,'rows':ROWS,'all_rows_8_distinct':min(distinct)==8,'alpha_byte_identical':bool(np.array_equal(new[...,3],old[...,3])),'changed_rgb_pixels':changed,'max_luma_spread_delta':round(max(n-o for o,n in spreads),3)}}
    a.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
    if errs: raise SystemExit('\n'.join(errs))
    print('OK strict-v13 atlas',report['summary'])
if __name__=='__main__': main()
