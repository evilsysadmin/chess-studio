#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, statistics
from pathlib import Path
from PIL import Image, ImageDraw

VERSION='v2'
TYPES=('pawn','knight','rook','bishop','queen','grenadier','scout','commando','shield')
ACTIONS=(('idle',0,8,6.0,True),('run',8,8,10.0,True))
SOURCE_SIZE=(576,576); TYPE_GRID=3; TYPE_TILE=192; SRC_COLS=4; SRC_ROWS=4; SRC_CELL=48
COLS=8; ROWS=len(TYPES)*2; CELL=128; OUT_SIZE=(COLS*CELL,ROWS*CELL)
GUARD=6; PIVOT_X=46.0; FOOT_Y=117.0; ALPHA=24

def sha(path:Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for c in iter(lambda:f.read(1<<20),b''): h.update(c)
    return h.hexdigest()

def clean_rgba(im:Image.Image)->Image.Image:
    im=im.convert('RGBA'); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a==0: px[x,y]=(0,0,0,0)
    return im

def lower_anchor(sprite:Image.Image)->tuple[float,float]:
    box=sprite.getchannel('A').getbbox()
    if box is None: raise SystemExit('empty sprite')
    px=sprite.load(); x0,y0,x1,y1=box
    band=max(4,int((y1-y0)*0.16)); pts=[]
    for y in range(max(y0,y1-band),y1):
        for x in range(x0,x1):
            if px[x,y][3]>ALPHA: pts.append((x,y))
    if not pts: return ((x0+x1-1)/2.0,float(y1-1))
    maxy=max(y for _,y in pts); xs=sorted(x for x,y in pts if y>=maxy-2)
    return (float(statistics.median(xs)),float(maxy))

def extract_frames(source:Image.Image, idx:int):
    tx=(idx%TYPE_GRID)*TYPE_TILE; ty=(idx//TYPE_GRID)*TYPE_TILE
    tile=source.crop((tx,ty,tx+TYPE_TILE,ty+TYPE_TILE))
    out=[]
    for r in range(SRC_ROWS):
        for c in range(SRC_COLS):
            cell=tile.crop((c*SRC_CELL,r*SRC_CELL,(c+1)*SRC_CELL,(r+1)*SRC_CELL))
            box=cell.getchannel('A').getbbox()
            if box is None: raise SystemExit(f'{TYPES[idx]} source frame {r*4+c} empty')
            pad=2; x0=max(0,box[0]-pad); y0=max(0,box[1]-pad); x1=min(SRC_CELL,box[2]+pad); y1=min(SRC_CELL,box[3]+pad)
            out.append(clean_rgba(cell.crop((x0,y0,x1,y1))))
    return out

def build(source:Image.Image, source_path:Path):
    if source.size!=SOURCE_SIZE: raise SystemExit(f'worksheet size {source.size} != {SOURCE_SIZE}')
    if source.getchannel('A').getextrema()[0]==255: raise SystemExit('worksheet has no transparency')
    atlas=Image.new('RGBA',OUT_SIZE,(0,0,0,0)); types_meta=[]
    for ti,kind in enumerate(TYPES):
        frames=extract_frames(source,ti)
        anchors=[lower_anchor(f) for f in frames]
        left=max(ax for f,(ax,ay) in zip(frames,anchors))
        right=max(f.width-1-ax for f,(ax,ay) in zip(frames,anchors))
        up=max(ay for f,(ax,ay) in zip(frames,anchors))
        limits=[]
        if left>0: limits.append((PIVOT_X-GUARD)/left)
        if right>0: limits.append((CELL-GUARD-1-PIVOT_X)/right)
        if up>0: limits.append((FOOT_Y-GUARD)/up)
        scale=min(2.30,min(limits)*0.96)
        if scale<0.50: raise SystemExit(f'{kind} implausible scale {scale:.3f}')
        action_meta=[]
        for ai,(name,start,count,fps,loop) in enumerate(ACTIONS):
            row=ti*2+ai; fm=[]
            for col in range(count):
                src=frames[start+col]
                nw=max(1,round(src.width*scale)); nh=max(1,round(src.height*scale))
                spr=clean_rgba(src.resize((nw,nh),Image.Resampling.LANCZOS))
                sax,say=lower_anchor(spr)
                dx=round(col*CELL+PIVOT_X-sax); dy=round(row*CELL+FOOT_Y-say)
                lx=dx-col*CELL; ly=dy-row*CELL
                abox=spr.getchannel('A').getbbox()
                if abox is None: raise SystemExit(f'{kind}/{name}[{col}] became empty after resize')
                vis=[lx+abox[0],ly+abox[1],lx+abox[2],ly+abox[3]]
                if vis[0]<GUARD or vis[1]<GUARD or vis[2]>CELL-GUARD or vis[3]>CELL-GUARD:
                    raise SystemExit(f'{kind}/{name}[{col}] guard fail bbox={vis} scale={scale:.3f}')
                atlas.alpha_composite(spr,(dx,dy))
                fm.append({'frame':col,'source_index':start+col,'bbox':vis})
            action_meta.append({'name':name,'row':row,'frames':count,'fps':fps,'loop':loop,'frames_meta':fm})
        types_meta.append({'type':kind,'scale':round(scale,8),'actions':action_meta})
    manifest={'schema':1,'kind':'pawn-slug-godot-enemy-atlas','version':VERSION,'source':{'filename':source_path.name,'sha256':sha(source_path),'size':list(source.size)},'atlas':{'columns':COLS,'rows':ROWS,'cell_size':CELL,'width':OUT_SIZE[0],'height':OUT_SIZE[1],'pivot_x':PIVOT_X,'foot_y':FOOT_Y,'cell_guard_min_px':GUARD},'types':types_meta}
    return atlas,manifest

def save(atlas,manifest,out:Path,mf:Path,review:Path|None,sheets_dir:Path|None):
    out.parent.mkdir(parents=True,exist_ok=True); mf.parent.mkdir(parents=True,exist_ok=True)
    atlas.save(out,'PNG',optimize=True); manifest['atlas']['filename']=out.name; manifest['atlas']['sha256']=sha(out)
    if sheets_dir:
        sheets_dir.mkdir(parents=True,exist_ok=True)
        for ti,item in enumerate(manifest['types']):
            sheet=atlas.crop((0,ti*2*CELL,COLS*CELL,(ti*2+2)*CELL))
            path=sheets_dir/f"{item['type']}_godot_8x2_128_v2.png"
            sheet.save(path,'PNG',optimize=True)
            item['sheet']={'filename':path.name,'sha256':sha(path),'width':COLS*CELL,'height':2*CELL}
    mf.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    if review:
        thumb=96; label=115; rowh=thumb*2+42
        board=Image.new('RGBA',(label+COLS*thumb,len(TYPES)*rowh),(17,18,20,255)); d=ImageDraw.Draw(board)
        for ti,kind in enumerate(TYPES):
            y=ti*rowh
            d.text((8,y+8),kind.upper(),fill=(240,240,240,255))
            d.text((8,y+27),'idle',fill=(170,170,170,255))
            d.text((8,y+thumb+31),'run',fill=(170,170,170,255))
            for ai in range(2):
                row=ti*2+ai
                for col in range(COLS):
                    fr=atlas.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)).resize((thumb,thumb),Image.Resampling.LANCZOS)
                    board.alpha_composite(fr,(label+col*thumb,y+34+ai*thumb))
        review.parent.mkdir(parents=True,exist_ok=True); board.save(review,'PNG',optimize=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--review',type=Path)
    p.add_argument('--sheets-dir',type=Path)
    a=p.parse_args()
    src=Image.open(a.source).convert('RGBA')
    atlas,m=build(src,a.source)
    save(atlas,m,a.output,a.manifest,a.review,a.sheets_dir)
    print(f'OK enemy {VERSION}: {len(TYPES)} types, {ROWS} rows, {COLS*ROWS} frames, atlas={OUT_SIZE}')
if __name__=='__main__': main()
