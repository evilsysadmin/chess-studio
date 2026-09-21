#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488)
CHANGED={0,8,9,10,11,12,13,14,15,16,17}; PRESERVED={1,2,3,4,5,6,7}
FORBIDDEN={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def chunks(path):
    data=Path(path).read_bytes(); pos=8; out=[]
    if data[:8]!=b'\x89PNG\r\n\x1a\n': return out
    while pos+12<=len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos+=12+n
        if typ==b'IEND': break
    return out
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--atlas',type=Path,required=True); p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--baseline',type=Path,required=True); p.add_argument('--report',type=Path,required=True); a=p.parse_args()
    new=Image.open(a.atlas).convert('RGBA'); old=Image.open(a.baseline).convert('RGBA'); m=json.loads(a.manifest.read_text()); errors=[]
    if new.size!=SIZE or old.size!=SIZE: errors.append('bad size')
    am=m.get('atlas',{})
    if m.get('version')!='v20' or m.get('weapon')!='pistol': errors.append('manifest version/weapon mismatch')
    if am.get('sha256')!=sha(a.atlas): errors.append('manifest sha mismatch')
    if m.get('baseline',{}).get('sha256')!=sha(a.baseline): errors.append('baseline sha mismatch')
    for k,w in (('columns',8),('rows',18),('cell_size',416),('frames_per_pose',8),('cell_guard_px',2)):
        if int(am.get(k,-1))!=w: errors.append(f'manifest {k} mismatch')
    if float(am.get('pivot_x',-1))!=200.0 or float(am.get('foot_y',-1))!=382.0: errors.append('pivot/foot mismatch')
    bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
    if bad: errors.append('forbidden PNG chunks: '+','.join(bad))
    distinct=[]; guard=[]; dirty=0; changed_rows=[]; preserved_bad=[]; hurt=[]; shoot=[]
    for r in range(ROWS):
        hs=[]; row_changed=0
        for c in range(COLS):
            box=(c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL); nc=new.crop(box); oc=old.crop(box)
            hs.append(hashlib.sha256(nc.tobytes()).hexdigest())
            if nc.tobytes()!=oc.tobytes(): row_changed+=1
            px=nc.load()
            if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)): guard.append((r,c))
            dirty += sum(1 for rr,gg,bb,aa in nc.getdata() if aa==0 and (rr or gg or bb))
            bb=nc.getchannel('A').getbbox()
            if r in CHANGED and (not bb or bb[3]!=382): errors.append(f'row {r} frame {c} foot line mismatch: {bb}')
            if r==16:
                hurt.append(bb)
                if not bb or bb[1]>205 or (bb[3]-bb[1])<190: errors.append(f'hurt frame {c} not standing: {bb}')
            if r==8:
                shoot.append(bb)
                if not bb or (bb[2]-bb[0])>205: errors.append(f'horizontal P99 silhouette too wide: {c}:{bb}')
        distinct.append(len(set(hs)))
        if row_changed: changed_rows.append(r)
        if r in PRESERVED and row_changed: preserved_bad.append(r)
    if min(distinct)<8: errors.append(f'duplicate rows: {distinct}')
    if set(changed_rows)!=CHANGED: errors.append(f'changed rows mismatch: {changed_rows}')
    if preserved_bad: errors.append(f'preserved locomotion rows changed: {preserved_bad}')
    if guard: errors.append(f'guard violated: {guard[:8]}')
    if dirty: errors.append(f'transparent RGB contamination: {dirty}')
    report={'ok':not errors,'errors':errors,'summary':{'frames':144,'all_rows_8_distinct':min(distinct)==8,'changed_rows':changed_rows,'preserved_rows_byte_identical':not preserved_bad,'guard_ok':not guard,'clean_transparent_rgb':dirty==0,'hurt_standing':not any('not standing' in e for e in errors),'horizontal_p99_width_ok':not any('too wide' in e for e in errors),'hurt_bboxes':hurt,'shoot_bboxes':shoot}}
    a.report.write_text(json.dumps(report,indent=2)+'\n')
    if errors: raise SystemExit('\n'.join(errors))
    print('OK strict-v20 imagegen P99 atlas',report['summary'])
if __name__=='__main__': main()
