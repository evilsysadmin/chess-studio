#!/usr/bin/env python3
"""Normalize image-generated Pawn Slug enemy worksheets into Godot-safe atlases.

The 4x4 worksheet may have arbitrary pixel dimensions. All 16 frames of one
unit share one scale and are anchored by their lower-body/foot contact so the
runtime cannot breathe in size or jitter laterally between frames.
"""
from __future__ import annotations
import argparse, json, statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from PIL import Image, ImageDraw
from png_contract import save_png_contract, sha256_file

ENEMY_TYPES=('pawn','knight','rook','queen','grenadier','scout','commando','shield','bishop')
ACTIONS=(
    {'name':'idle','indices':list(range(0,8)),'fps':6.0,'loop':True},
    {'name':'run','indices':list(range(8,16)),'fps':10.0,'loop':True},
)
GRID_COLUMNS=4; GRID_ROWS=4; CELL_WIDTH=256; CELL_HEIGHT=416; PIVOT_X=CELL_WIDTH//2; FOOT_LINE=392; CELL_GUTTER=12
MAX_BODY_WIDTH=CELL_WIDTH-CELL_GUTTER*2; MAX_BODY_HEIGHT=FOOT_LINE-CELL_GUTTER; ALPHA_THRESHOLD=4

@dataclass(frozen=True)
class PackedFrame:
    index:int; source_region:tuple[int,int,int,int]; source_bbox:tuple[int,int,int,int]; region:tuple[int,int,int,int]; content_bbox:tuple[int,int,int,int]

def _grid_edges(size:int,cells:int)->list[int]: return [round(i*size/cells) for i in range(cells+1)]
def _alpha_bbox(image:Image.Image,*,threshold:int=ALPHA_THRESHOLD):
    alpha=image.getchannel('A'); mask=alpha.point(lambda value:255 if value>=threshold else 0); return mask.getbbox()

def _foot_anchor(image:Image.Image)->tuple[float,int]:
    box=_alpha_bbox(image)
    if box is None: raise ValueError('cannot anchor empty frame')
    x0,y0,x1,y1=box; px=image.load(); band=max(3,round((y1-y0)*0.08)); xs=[]
    for y in range(max(y0,y1-band),y1):
        for x in range(x0,x1):
            if px[x,y][3]>=ALPHA_THRESHOLD: xs.append(x)
    if not xs: return ((x0+x1-1)/2.0,y1)
    return (float(statistics.median(xs)),y1)

def _isolate_main_component(source_cell:Image.Image)->Image.Image:
    rgba=source_cell.convert('RGBA'); alpha=rgba.getchannel('A'); px=alpha.load(); w,h=rgba.size; seen=bytearray(w*h); components=[]
    for sy in range(h):
        for sx in range(w):
            idx=sy*w+sx
            if seen[idx] or px[sx,sy]==0: continue
            seen[idx]=1; stack=[(sx,sy)]; points=[]
            while stack:
                x,y=stack.pop(); points.append((x,y))
                for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    if 0<=nx<w and 0<=ny<h:
                        ni=ny*w+nx
                        if not seen[ni] and px[nx,ny]>0:
                            seen[ni]=1; stack.append((nx,ny))
            components.append(points)
    if not components: raise ValueError('source frame is fully transparent')
    keep=max(components,key=len); src=rgba.load(); out=Image.new('RGBA',rgba.size,(0,0,0,0)); dst=out.load()
    for x,y in keep: dst[x,y]=src[x,y]
    return out

def _trim(source_cell:Image.Image)->tuple[Image.Image,tuple[int,int,int,int]]:
    rgba=_isolate_main_component(source_cell); bbox=_alpha_bbox(rgba)
    if bbox is None: raise ValueError('source frame is fully transparent')
    return rgba.crop(bbox),bbox

def _normalize_frame(trimmed:Image.Image,scale:float)->tuple[Image.Image,tuple[int,int,int,int]]:
    size=(max(1,round(trimmed.width*scale)),max(1,round(trimmed.height*scale)))
    sprite=trimmed.resize(size,Image.Resampling.LANCZOS) if size!=trimmed.size else trimmed.copy()
    foot_x,foot_bottom=_foot_anchor(sprite)
    canvas=Image.new('RGBA',(CELL_WIDTH,CELL_HEIGHT),(0,0,0,0))
    x=round(PIVOT_X-foot_x); y=FOOT_LINE-foot_bottom
    canvas.alpha_composite(sprite,(x,y)); content=_alpha_bbox(canvas)
    if content is None: raise ValueError('normalized frame unexpectedly empty')
    left,top,right,bottom=content
    if left<CELL_GUTTER or top<CELL_GUTTER or right>CELL_WIDTH-CELL_GUTTER: raise ValueError(f'normalized frame violates cell gutter: {content}')
    if bottom!=FOOT_LINE: raise ValueError(f'normalized frame foot line {bottom}, expected {FOOT_LINE}')
    if bottom>CELL_HEIGHT-CELL_GUTTER: raise ValueError(f'normalized frame violates bottom gutter: {content}')
    return canvas,content

def split_worksheet(image:Image.Image)->Iterable[tuple[int,tuple[int,int,int,int],Image.Image]]:
    xs=_grid_edges(image.width,GRID_COLUMNS); ys=_grid_edges(image.height,GRID_ROWS); index=0
    for row in range(GRID_ROWS):
        for col in range(GRID_COLUMNS):
            region=(xs[col],ys[row],xs[col+1],ys[row+1]); yield index,region,image.crop(region); index+=1

def pack_type(enemy_type:str,worksheet_path:Path,output_dir:Path)->dict:
    source=Image.open(worksheet_path).convert('RGBA')
    if source.width<GRID_COLUMNS or source.height<GRID_ROWS: raise ValueError(f'{worksheet_path} is too small for 4x4')
    if source.getchannel('A').getextrema()[0]==255: raise ValueError(f'{worksheet_path} has no transparent pixels')
    raw=[]
    for index,source_region,source_cell in split_worksheet(source):
        trimmed,bbox=_trim(source_cell); raw.append((index,source_region,bbox,trimmed))
    anchor_geometry=[]
    for *_,trimmed in raw:
        foot_x,foot_bottom=_foot_anchor(trimmed)
        anchor_geometry.append((foot_x,trimmed.width-foot_x,foot_bottom))
    max_left=max(v[0] for v in anchor_geometry); max_right=max(v[1] for v in anchor_geometry); max_up=max(v[2] for v in anchor_geometry)
    limits=[(PIVOT_X-CELL_GUTTER-2)/max_left,(CELL_WIDTH-CELL_GUTTER-2-PIVOT_X)/max_right,(FOOT_LINE-CELL_GUTTER-2)/max_up]
    scale=min(limits)*0.96
    if scale<=0: raise ValueError('invalid shared frame scale')
    atlas=Image.new('RGBA',(GRID_COLUMNS*CELL_WIDTH,GRID_ROWS*CELL_HEIGHT),(0,0,0,0)); frames=[]
    for index,source_region,source_bbox,trimmed in raw:
        normalized,content_bbox=_normalize_frame(trimmed,scale); row,col=divmod(index,GRID_COLUMNS); x,y=col*CELL_WIDTH,row*CELL_HEIGHT
        atlas.alpha_composite(normalized,(x,y))
        frames.append(PackedFrame(index,source_region,source_bbox,(x,y,CELL_WIDTH,CELL_HEIGHT),(x+content_bbox[0],y+content_bbox[1],x+content_bbox[2],y+content_bbox[3])))
    atlas_path=output_dir/f'enemy-{enemy_type}-v2.png'; save_png_contract(atlas,atlas_path)
    return {'type':enemy_type,'source':worksheet_path.name,'sourceSha256':sha256_file(worksheet_path),'sourceSize':[source.width,source.height],'scale':round(scale,8),'atlas':atlas_path.name,'atlasSha256':sha256_file(atlas_path),'atlasSize':[atlas.width,atlas.height],'frames':[{'index':f.index,'sourceRegion':list(f.source_region),'sourceAlphaBBox':list(f.source_bbox),'region':list(f.region),'contentBBox':list(f.content_bbox)} for f in frames]}

def build_review(manifest:dict,output_dir:Path)->Path:
    card_w,card_h=500,300; cols=3; rows=(len(manifest['types'])+cols-1)//cols
    review=Image.new('RGBA',(cols*card_w,rows*card_h),(24,25,27,255)); draw=ImageDraw.Draw(review); samples=(0,4,8,12)
    for index,item in enumerate(manifest['types']):
        atlas=Image.open(output_dir/item['atlas']).convert('RGBA'); x0=(index%cols)*card_w; y0=(index//cols)*card_h
        draw.text((x0+12,y0+10),f"{item['type'].upper()}  scale={item['scale']:.3f}",fill=(240,238,226,255))
        draw.text((x0+12,y0+30),'idle 0/4   run 8/12',fill=(170,170,170,255))
        for slot,frame_index in enumerate(samples):
            row,col=divmod(frame_index,GRID_COLUMNS); frame=atlas.crop((col*CELL_WIDTH,row*CELL_HEIGHT,(col+1)*CELL_WIDTH,(row+1)*CELL_HEIGHT)); frame.thumbnail((108,220),Image.Resampling.LANCZOS)
            px=x0+10+slot*120+(108-frame.width)//2; py=y0+62+(220-frame.height)//2; review.alpha_composite(frame,(px,py))
    out=output_dir/'enemy-v2-review.png'; save_png_contract(review,out); return out

def parse_args():
    p=argparse.ArgumentParser(); p.add_argument('--source-dir',type=Path,required=True); p.add_argument('--output-dir',type=Path,required=True); p.add_argument('--types',nargs='*',default=list(ENEMY_TYPES),choices=ENEMY_TYPES); return p.parse_args()
def main():
    cfg=parse_args(); cfg.output_dir.mkdir(parents=True,exist_ok=True); packed=[]
    for enemy_type in cfg.types:
        source=cfg.source_dir/f'enemy-{enemy_type}-worksheet.png'
        if not source.is_file(): raise SystemExit(f'missing worksheet: {source}')
        packed.append(pack_type(enemy_type,source,cfg.output_dir))
    manifest={'schema':2,'scope':'pawn-slug-godot-enemy-v2','cell':[CELL_WIDTH,CELL_HEIGHT],'grid':[GRID_COLUMNS,GRID_ROWS],'pivot':[PIVOT_X,FOOT_LINE],'footLine':FOOT_LINE,'gutter':CELL_GUTTER,'framesPerType':GRID_COLUMNS*GRID_ROWS,'actions':list(ACTIONS),'types':packed}
    review=build_review(manifest,cfg.output_dir); manifest['review']=review.name; manifest['reviewSha256']=sha256_file(review)
    path=cfg.output_dir/'enemy-v2-manifest.json'; path.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(f'OK: packed {len(packed)} enemy types into {len(packed)} mobile-safe 1024x1664 atlases')
if __name__=='__main__': main()
