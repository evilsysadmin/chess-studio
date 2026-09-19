#!/usr/bin/env python3
"""Build Matthias strict-v13 from a strict-v12 atlas without changing geometry."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image

VERSION='v13'; COLS=8; ROWS=18; CELL=416; SIZE=(COLS*CELL,ROWS*CELL)

def parse_args():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path)
    p.add_argument('--output',type=Path)
    p.add_argument('--manifest',type=Path)
    p.add_argument('--weapon',default='pistol')
    p.add_argument('--self-test',action='store_true')
    return p.parse_args()

def sha(path:Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    a=parse_args()
    if a.self_test:
        assert SIZE==(3328,7488) and COLS==8 and ROWS==18
        print('OK strict-v13 pack self-test'); return
    if not (a.source and a.output and a.manifest): raise SystemExit('source/output/manifest required')
    src=np.array(Image.open(a.source).convert('RGBA'))
    if (src.shape[1],src.shape[0])!=SIZE: raise SystemExit(f'expected {SIZE}, got {(src.shape[1],src.shape[0])}')
    alpha=src[...,3].copy(); rgb=src[...,:3].astype(np.float32)
    R,G,B=[rgb[...,i] for i in range(3)]
    skin=(alpha>32)&(R>145)&(G>70)&(G<R*.80)&(B<R*.60)&(B<125)
    rgb[skin,0]=np.minimum(rgb[skin,0]*0.93,242); rgb[skin,1]*=.91; rgb[skin,2]*=.90
    R,G,B=[rgb[...,i] for i in range(3)]; luma=.2126*R+.7152*G+.0722*B
    weapon=(alpha>32)&(luma>22)&(luma<118)&(G>R*.70)&(G>B*1.06)&((G-B)>4)
    rgb[weapon]=np.clip(rgb[weapon]*1.16+3.0,0,255); rgb[weapon,1]=np.minimum(255,rgb[weapon,1]*1.035)
    R,G,B=[rgb[...,i] for i in range(3)]; luma=.2126*R+.7152*G+.0722*B
    shadow=(alpha>40)&(luma>10)&(luma<52)&(~weapon)
    rgb[shadow]*=.90
    out=np.dstack([np.clip(rgb,0,255).astype(np.uint8),alpha]); out[alpha==0,:3]=0
    if not np.array_equal(out[...,3],src[...,3]): raise SystemExit('alpha changed')
    Image.fromarray(out,'RGBA').save(a.output,'PNG',compress_level=3)
    manifest={
      'schema':1,'kind':'pawn-slug-godot-strict-atlas','version':VERSION,'weapon':a.weapon,
      'source':{'filename':a.source.name,'sha256':sha(a.source),'generation':'v12','size':list(SIZE)},
      'atlas':{'filename':a.output.name,'sha256':sha(a.output),'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':SIZE[0],'height':SIZE[1],'pivot_x':200.0,'foot_y':382.0,'frames_per_pose':COLS},
      'processing':{'blender':False,'kind':'2d-tonal-separation','geometry_contract':'strict-v12 alpha preserved byte-for-byte','visual_pass':'reduce clipped warm skin highlights; lift olive/steel weapon mids; deepen near-black uniform contours'},
      'metrics':{'skin_pixels':int(skin.sum()),'weapon_pixels':int(weapon.sum()),'shadow_pixels':int(shadow.sum()),'changed_rgb_pixels':int(np.any(out[...,:3]!=src[...,:3],axis=2).sum())}
    }
    a.manifest.write_text(json.dumps(manifest,indent=2),encoding='utf-8'); print(a.output)
if __name__=='__main__': main()
