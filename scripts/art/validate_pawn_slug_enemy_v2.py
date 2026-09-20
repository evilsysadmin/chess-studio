#!/usr/bin/env python3
"""Validate normalized Pawn Slug enemy v2 atlases and manifest."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from PIL import Image
from png_contract import sha256_file, validate_png_contract
from pack_pawn_slug_enemy_v2 import CELL_GUTTER,CELL_HEIGHT,CELL_WIDTH,ENEMY_TYPES,FOOT_LINE,GRID_COLUMNS,GRID_ROWS,PIVOT_X,ACTIONS

def validate_manifest(manifest_path:Path)->dict:
    root=manifest_path.parent; m=json.loads(manifest_path.read_text(encoding='utf-8'))
    expected={'schema':2,'scope':'pawn-slug-godot-enemy-v2','cell':[CELL_WIDTH,CELL_HEIGHT],'grid':[GRID_COLUMNS,GRID_ROWS],'pivot':[PIVOT_X,FOOT_LINE],'footLine':FOOT_LINE,'gutter':CELL_GUTTER,'framesPerType':GRID_COLUMNS*GRID_ROWS,'actions':list(ACTIONS)}
    for k,v in expected.items():
        if m.get(k)!=v: raise ValueError(f'manifest {k}={m.get(k)!r}, expected {v!r}')
    items=m.get('types',[]); seen=[i.get('type') for i in items]
    if seen!=list(ENEMY_TYPES): raise ValueError(f'enemy type order mismatch: {seen}')
    expected_size=(GRID_COLUMNS*CELL_WIDTH,GRID_ROWS*CELL_HEIGHT)
    for item in items:
        atlas_path=root/item['atlas']; info=validate_png_contract(atlas_path,max_side=4096)
        if (info['width'],info['height'])!=expected_size: raise ValueError(f'{atlas_path} size mismatch')
        if item.get('atlasSha256')!=sha256_file(atlas_path): raise ValueError(f'{atlas_path} sha mismatch')
        if not isinstance(item.get('scale'),(int,float)) or not (0.1<float(item['scale'])<20): raise ValueError(f'{atlas_path} invalid shared scale')
        frames=item.get('frames',[])
        if len(frames)!=16: raise ValueError(f'{atlas_path} must expose 16 frames')
        with Image.open(atlas_path) as atlas:
            atlas=atlas.convert('RGBA'); action_hashes={'idle':set(),'run':set()}
            for frame in frames:
                index=int(frame['index']); x,y,w,h=frame['region']
                if (w,h)!=(CELL_WIDTH,CELL_HEIGHT): raise ValueError(f'{atlas_path}: frame {index} wrong cell')
                cell=atlas.crop((x,y,x+w,y+h)); bbox=cell.getchannel('A').getbbox()
                if bbox is None: raise ValueError(f'{atlas_path}: frame {index} empty')
                left,top,right,bottom=bbox
                if left<CELL_GUTTER or top<CELL_GUTTER or right>CELL_WIDTH-CELL_GUTTER: raise ValueError(f'{atlas_path}: frame {index} gutter {bbox}')
                if bottom!=FOOT_LINE: raise ValueError(f'{atlas_path}: frame {index} foot line {bottom}, expected {FOOT_LINE}')
                expected_global=[x+left,y+top,x+right,y+bottom]
                if frame.get('contentBBox')!=expected_global: raise ValueError(f'{atlas_path}: frame {index} contentBBox drift')
                action='idle' if index<8 else 'run'; action_hashes[action].add(hashlib.sha256(cell.tobytes()).hexdigest())
            for action,hashes in action_hashes.items():
                if len(hashes)!=8: raise ValueError(f'{atlas_path}: {action} frame collapse unique={len(hashes)}')
    review=root/m['review']; validate_png_contract(review,max_side=4096)
    if m.get('reviewSha256')!=sha256_file(review): raise ValueError('review sha mismatch')
    return m

def main():
    p=argparse.ArgumentParser(); p.add_argument('manifest',type=Path); a=p.parse_args(); m=validate_manifest(a.manifest)
    print(f"OK enemy v2: {len(m['types'])} types, {m['framesPerType']} frames/type, shared scale + foot anchor, mobile-safe pages")
if __name__=='__main__': main()
