#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, statistics
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
CELL=416; COLS=8; ROWS=18; SIZE=(3328,7488); SOURCE_CELL=128; SOURCE_COLS=13
ACTIONS=['idle','walk','run','jump','fall','land','crouch','crouch_walk','shoot','shoot_up','shoot_down','shoot_diag_up','shoot_diag_up_alt','shoot_diag_down','shoot_crouch','reload','hurt','die']
SOURCE_ORDER=['idle','walk','run13','shoot','crouch','crouch_shoot','hurt6']
SOURCE_COUNTS={'idle':8,'walk':8,'run13':13,'shoot':8,'crouch':8,'crouch_shoot':8,'hurt6':6}
REGEN={0,1,2,6,8,14,16}
RUN8_INDEX=(0,2,3,5,7,9,10,12)

def sha(p:Path)->str: return hashlib.sha256(p.read_bytes()).hexdigest()
def skin_center(arr):
 R,G,B,A=[arr[:,:,i] for i in range(4)]; m=(A>80)&(R>120)&(G>55)&(B<170)&(R>G*1.06)&((R-G)>10); ys,xs=np.where(m)
 return None if not len(xs) else (float(np.median(xs)),float(np.median(ys)))
def canonical_targets(pistol):
 out={}
 for row in range(ROWS):
  fx=[]; fy=[]; feet=[]; heights=[]
  for col in range(COLS):
   cell=pistol.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); bb=cell.getchannel('A').getbbox()
   if not bb: continue
   face=skin_center(np.array(cell));
   if face: fx.append(face[0]); fy.append(face[1])
   feet.append(bb[3]); heights.append(bb[3]-bb[1])
  out[row]={'fx':statistics.median(fx),'fy':statistics.median(fy),'foot':statistics.median(feet),'height':statistics.median(heights)}
 return out
def source_frame(src,row,col):
 cell=src.crop((col*SOURCE_CELL,row*SOURCE_CELL,(col+1)*SOURCE_CELL,(row+1)*SOURCE_CELL)); bb=cell.getchannel('A').getbbox()
 if not bb: raise ValueError(f'empty source frame {row}:{col}')
 return cell.crop(bb)
def normalize(sp,row,target):
 arr=np.array(sp); face=skin_center(arr); bb=sp.getchannel('A').getbbox(); assert bb
 if face: scale=(target['foot']-target['fy'])/max(1.0,bb[3]-face[1])
 else: scale=target['height']/max(1.0,bb[3]-bb[1])
 scale=max(1.0,min(scale,5.0)); sp=sp.resize((max(1,round(sp.width*scale)),max(1,round(sp.height*scale))),Image.Resampling.NEAREST)
 face=skin_center(np.array(sp)); bb=sp.getchannel('A').getbbox(); assert bb
 if face: x=round(target['fx']-face[0]); y=round(target['fy']-face[1])
 else: x=round(208-sp.width/2); y=round(target['foot']-bb[3])
 cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(sp,(x,y)); bb=cell.getchannel('A').getbbox()
 if bb and bb[3]!=382:
  shifted=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); shifted.alpha_composite(cell,(0,382-bb[3])); cell=shifted
 a=np.array(cell); a[a[:,:,3]==0,:3]=0; return Image.fromarray(a,'RGBA')
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--baseline',type=Path,required=True); ap.add_argument('--pistol',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--run-output',type=Path,required=True); ap.add_argument('--manifest',type=Path,required=True); ap.add_argument('--review-dir',type=Path,required=True); a=ap.parse_args()
 src=Image.open(a.source).convert('RGBA'); base=Image.open(a.baseline).convert('RGBA'); pistol=Image.open(a.pistol).convert('RGBA')
 if src.size!=(SOURCE_COLS*SOURCE_CELL,len(SOURCE_ORDER)*SOURCE_CELL): raise SystemExit(f'bad source size {src.size}')
 if base.size!=SIZE or pistol.size!=SIZE: raise SystemExit('bad baseline size')
 targets=canonical_targets(pistol); src_rows={n:i for i,n in enumerate(SOURCE_ORDER)}; target_row={'idle':0,'walk':1,'run13':2,'shoot':8,'crouch':6,'crouch_shoot':14,'hurt6':16}
 authored={name:[normalize(source_frame(src,src_rows[name],i),target_row[name],targets[target_row[name]]) for i in range(count)] for name,count in SOURCE_COUNTS.items()}
 run13=authored['run13']; run8=[run13[i] for i in RUN8_INDEX]; hurt8=authored['hurt6']+[authored['hurt6'][-1].copy(),authored['hurt6'][-1].copy()]
 repl={0:authored['idle'],1:authored['walk'],2:run8,6:authored['crouch'],8:authored['shoot'],14:authored['crouch_shoot'],16:hurt8}
 atlas=base.copy()
 for row,frames in repl.items():
  for col,fr in enumerate(frames): atlas.paste((0,0,0,0),(col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)); atlas.alpha_composite(fr,(col*CELL,row*CELL))
 ar=np.array(atlas); ar[ar[:,:,3]==0,:3]=0; atlas=Image.fromarray(ar,'RGBA'); a.output.parent.mkdir(parents=True,exist_ok=True); atlas.save(a.output,'PNG',compress_level=9)
 run=Image.new('RGBA',(CELL*13,CELL),(0,0,0,0));
 for i,fr in enumerate(run13): run.alpha_composite(fr,(i*CELL,0))
 rr=np.array(run); rr[rr[:,:,3]==0,:3]=0; run=Image.fromarray(rr,'RGBA'); a.run_output.parent.mkdir(parents=True,exist_ok=True); run.save(a.run_output,'PNG',compress_level=9)
 status={name:('regenerated' if i in REGEN else 'retained-reviewed') for i,name in enumerate(ACTIONS)}
 frame_counts={name:(6 if name=='hurt' else 8) for name in ACTIONS}
 fps={'idle':8.0,'walk':13.333333,'run':16.0,'jump':13.333333,'fall':10.666667,'land':16.0,'crouch':8.0,'crouch_walk':10.666667,'shoot':20.0,'shoot_up':20.0,'shoot_down':20.0,'shoot_diag_up':20.0,'shoot_diag_up_alt':20.0,'shoot_diag_down':20.0,'shoot_crouch':20.0,'reload':13.333333,'hurt':16.0,'die':12.0}
 loop={name:(name in {'idle','walk','run','fall','crouch','crouch_walk'}) for name in ACTIONS}
 manifest={'schema':1,'generation':'strict-v23','weapon':'machinegun','source_sha256':sha(a.source),'baseline_sha256':sha(a.baseline),'pistol_alignment_sha256':sha(a.pistol),'atlas_sha256':sha(a.output),'run13_sha256':sha(a.run_output),'actions':ACTIONS,'frame_counts':frame_counts,'fps':fps,'loop':loop,'atlas':{'size':list(SIZE),'cell_size':CELL,'columns':8,'rows':18,'pivot_x':200,'foot_y':382},'run13':{'size':[CELL*13,CELL],'frames':13,'cell_size':CELL,'fps':26.0,'loop':True},'status':status,'regenerated_rows':sorted(REGEN),'retained_reviewed_rows':[i for i in range(ROWS) if i not in REGEN],'notes':{'hurt':'6 authored phases + 2 intentional final-pose holds in fixed 8-column atlas','source':'dedicated transparent SMG technical source'}}
 a.manifest.write_text(json.dumps(manifest,indent=2)+'\n'); a.review_dir.mkdir(parents=True,exist_ok=True)
 for row,name in enumerate(ACTIONS):
  board=Image.new('RGBA',(CELL*8,CELL+28),(14,16,20,255)); d=ImageDraw.Draw(board); d.text((6,6),f'{row:02d} {name} · {status[name]}',fill='white')
  for col in range(8): board.alpha_composite(atlas.crop((col*CELL,row*CELL,(col+1)*CELL,(row+1)*CELL)),(col*CELL,28))
  board.resize((round(board.width*.32),round(board.height*.32)),Image.Resampling.NEAREST).save(a.review_dir/f'{row:02d}-{name}.png')
 strips=[Image.open(a.review_dir/f'{i:02d}-{name}.png').convert('RGBA') for i,name in enumerate(ACTIONS)]; W=max(x.width for x in strips); H=sum(x.height for x in strips); overview=Image.new('RGBA',(W,H),(8,10,13,255)); y=0
 for x in strips: overview.alpha_composite(x,(0,y)); y+=x.height
 overview.save(a.review_dir/'all-poses.png')
 print(json.dumps({'atlas_sha256':manifest['atlas_sha256'],'run13_sha256':manifest['run13_sha256']}))
if __name__=='__main__': main()