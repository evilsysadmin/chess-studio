#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
from PIL import Image

CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); GUARD=2
REPLACED_ROWS=set(range(8,17)); PRESERVED_ROWS={0,1,2,3,4,5,6,7,17}
FORBIDDEN={b'iCCP',b'gAMA',b'sRGB',b'cHRM'}
SOURCE_SHA256='0f80c7b127b1cd4ea5a5b7bcbfc181dd0bf7a0037bf36288f71cd78aaab75911'

def sha(p: Path) -> str: return hashlib.sha256(p.read_bytes()).hexdigest()

def chunks(path: Path):
    data=path.read_bytes(); pos=8; out=[]
    if data[:8] != b'\x89PNG\r\n\x1a\n': return out
    while pos+12 <= len(data):
        n=struct.unpack('>I',data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; out.append(typ); pos += 12+n
        if typ == b'IEND': break
    return out

def component_stats(cell: Image.Image, threshold: int = 32):
    alpha=cell.getchannel('A'); pix=alpha.load(); seen=set(); sizes=[]
    for y in range(CELL):
        for x in range(CELL):
            if pix[x,y] <= threshold or (x,y) in seen: continue
            stack=[(x,y)]; seen.add((x,y)); n=0
            while stack:
                xx,yy=stack.pop(); n += 1
                for dy in (-1,0,1):
                    for dx in (-1,0,1):
                        if not dx and not dy: continue
                        nx,ny=xx+dx,yy+dy
                        if 0 <= nx < CELL and 0 <= ny < CELL and pix[nx,ny] > threshold and (nx,ny) not in seen:
                            seen.add((nx,ny)); stack.append((nx,ny))
            sizes.append(n)
    sizes.sort(reverse=True); total=sum(sizes)
    return sizes, (sizes[0]/total if total else 0.0)

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument('--atlas',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--baseline',type=Path,required=True)
    p.add_argument('--report',type=Path,required=True)
    a=p.parse_args()
    new=Image.open(a.atlas).convert('RGBA'); old=Image.open(a.baseline).convert('RGBA')
    m=json.loads(a.manifest.read_text(encoding='utf-8')); errors=[]
    if new.size != SIZE or old.size != SIZE: errors.append('bad size')
    am=m.get('atlas',{})
    if m.get('version') != 'v20' or m.get('weapon') != 'pistol': errors.append('manifest version/weapon mismatch')
    if m.get('source',{}).get('sha256') != SOURCE_SHA256: errors.append('source SHA contract mismatch')
    if am.get('sha256') != sha(a.atlas): errors.append('manifest atlas sha mismatch')
    if m.get('baseline',{}).get('sha256') != sha(a.baseline): errors.append('manifest baseline sha mismatch')
    for k,w in (('columns',8),('rows',18),('cell_size',416),('frames_per_pose',8),('cell_guard_px',2)):
        if int(am.get(k,-1)) != w: errors.append(f'manifest {k} mismatch')
    if float(am.get('pivot_x',-1)) != 200.0 or float(am.get('foot_y',-1)) != 382.0: errors.append('pivot/foot mismatch')
    bad=[x.decode() for x in chunks(a.atlas) if x in FORBIDDEN]
    if bad: errors.append('forbidden PNG chunks: '+','.join(bad))

    distinct=[]; guard=[]; dirty=0; changed_rows=set(); cohesion=[]; hurt_bboxes=[]; new_foot=[]
    for r in range(ROWS):
        hashes=[]
        for c in range(COLS):
            box=(c*CELL,r*CELL,(c+1)*CELL,(r+1)*CELL)
            nc=new.crop(box); oc=old.crop(box); hashes.append(hashlib.sha256(nc.tobytes()).hexdigest())
            if nc.tobytes() != oc.tobytes(): changed_rows.add(r)
            px=nc.load()
            if any(px[x,y][3] for x in range(CELL) for y in (0,1,CELL-2,CELL-1)) or any(px[x,y][3] for y in range(CELL) for x in (0,1,CELL-2,CELL-1)):
                guard.append((r,c))
            dirty += sum(1 for rr,gg,bb,aa in nc.getdata() if aa==0 and (rr or gg or bb))
            if r in REPLACED_ROWS:
                bb=nc.getchannel('A').getbbox()
                if not bb: errors.append(f'empty generated frame {r}:{c}')
                else:
                    new_foot.append(bb[3])
                    sizes,ratio=component_stats(nc); cohesion.append(ratio)
                    if ratio < 0.98 or (len(sizes)>1 and sizes[1] > 400):
                        errors.append(f'detached combat silhouette {r}:{c}: ratio={ratio:.4f} components={sizes[:3]}')
                    if r == 16:
                        hurt_bboxes.append(bb)
                        if bb[3] != 382 or bb[1] > 140 or bb[3]-bb[1] < 230:
                            errors.append(f'hurt must remain standing {c}:{bb}')
        distinct.append(len(set(hashes)))
    if changed_rows != REPLACED_ROWS: errors.append(f'changed rows mismatch: {sorted(changed_rows)}')
    if min(distinct) < 8: errors.append(f'duplicate row frames: {distinct}')
    if guard: errors.append(f'guard violated: {guard[:8]}')
    if dirty: errors.append(f'transparent RGB contamination: {dirty}')
    if new_foot and set(new_foot) != {382}: errors.append(f'new rows footline mismatch: {sorted(set(new_foot))}')
    report={'ok':not errors,'errors':errors,'summary':{
        'frames':144,'changed_rows':sorted(changed_rows),'all_rows_8_distinct':min(distinct)==8,
        'guard_ok':not guard,'clean_transparent_rgb':dirty==0,'new_rows_footline':sorted(set(new_foot)),
        'min_connected_component_ratio':round(min(cohesion),6) if cohesion else None,
        'hurt_standing':not any('hurt must remain standing' in e for e in errors),'hurt_bboxes':hurt_bboxes,
    }}
    a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if errors: raise SystemExit('\n'.join(errors))
    print('OK strict-v20 P99 combat bank',report['summary'])
    return 0
if __name__=='__main__': raise SystemExit(main())