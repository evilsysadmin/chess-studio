#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); FORBIDDEN={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def chunks(path):
    data=Path(path).read_bytes(); pos=8; out=[]
    if data[:8]!=b'\x89PNG\r\n\x1a\n': return out
    while pos+12<=len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos+=12+n
        if typ==b'IEND': break
    return out
def main():
    p=argparse.ArgumentParser(); p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
    new=Image.open(a.atlas).convert('RGBA'); old=Image.open(a.baseline).convert('RGBA'); m=json.loads(a.manifest.read_text()); errors=[]
    if new.size!=SIZE or old.size!=SIZE: errors.append('bad size')
    am=m.get('atlas',{})
    if m.get('version')!='v19' or m.get('weapon')!='pistol': errors.append('manifest version/weapon mismatch')
    if am.get('sha256')!=sha(a.atlas): errors.append('manifest sha mismatch')
    for k,w in (('columns',8),('rows',18),('cell_size',416),('frames_per_pose',8),('cell_guard_px',2)):
        if int(am.get(k,-1))!=w: errors.append(f'manifest {k} mismatch')
    if float(am.get('pivot_x',-1))!=200.0 or float(am.get('foot_y',-1))!=382.0: errors.append('pivot/foot mismatch')
    bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
    if bad: errors.append('forbidden PNG chunks: '+','.join(bad))
    changed=0; guard=[]; distinct=[]; dirty=0; hurt=[]
    for r in range(ROWS):
        hs=[]
        for c in range(COLS):
            box=(c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL); nc=new.crop(box); oc=old.crop(box)
            hs.append(hashlib.sha256(nc.tobytes()).hexdigest())
            changed += sum(1 for x,y in zip(nc.getdata(),oc.getdata()) if x!=y)
            px=nc.load()
            if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((r,c))
            dirty += sum(1 for rr,gg,bb,aa in nc.getdata() if aa==0 and (rr or gg or bb))
            if r==16:
                bb=nc.getbbox(); hurt.append(bb)
                if not bb or bb[1]>190 or bb[3]<378 or bb[2]-bb[0]>245: errors.append(f'hurt must stay standing: {c}:{bb}')
        distinct.append(len(set(hs)))
    if min(distinct)<8: errors.append(f'duplicate rows: {distinct}')
    if guard: errors.append(f'guard violated: {guard[:8]}')
    if dirty: errors.append(f'transparent RGB contamination: {dirty}')
    if not (100000 <= changed <= 2500000): errors.append(f'suspicious changed pixels: {changed}')
    report={'ok':not errors,'errors':errors,'summary':{'frames':144,'all_rows_8_distinct':min(distinct)==8,'changed_pixels':changed,'guard_ok':not guard,'clean_transparent_rgb':dirty==0,'hurt_standing':not any('hurt must stay standing' in e for e in errors),'hurt_bboxes':hurt}}
    a.report.write_text(json.dumps(report,indent=2)+'\n')
    if errors: raise SystemExit('\n'.join(errors))
    print('OK strict-v19 P99 atlas',report['summary'])
if __name__=='__main__': main()
