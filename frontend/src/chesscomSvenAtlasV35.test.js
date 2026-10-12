import {describe,it,expect} from 'vitest';
import {
  CHESSCOM_SVEN_ATLAS_V35 as C,
  chesscomSvenAtlasEnabledV35 as enabled,
  chesscomSvenClipV35 as clip,
  chesscomSvenFacingV35 as facing,
  chesscomSvenMovementFacingV36 as motionFacing,
  chesscomSvenEffectiveFacingV36 as effectiveFacing,
  chesscomSvenAtlasFrameV35 as frame,
  chesscomSvenAtlasGroundPivotV37 as groundPivot,
  chesscomVerifySvenAtlasBytesV35 as verify,
  installChesscomSvenAtlasV35 as install,
} from './chesscomSvenAtlasV35.js';

const seq=(count)=>Array.from({length:count},(_,i)=>({x:i*128,y:0,width:128,height:192}));
describe('CHESSCOM Sven real directional atlas V35',()=>{
  it('does not touch the scene, network or gameplay without explicit opt-in',async()=>{
    let touched=0;
    const host={dataset:{}};
    const h=install(null,null,{host,search:'',loadManifest:()=>{touched++}});
    h.update({friendlies:[]});
    expect(await h.ready).toBe(false);
    h.destroy();
    expect(touched).toBe(0);
    expect(host.dataset.chesscomSvenAtlas).toBeUndefined();
    expect(enabled('?chesscomSven=sprite')).toBe(false);
    expect(enabled('?chesscomSven=atlas')).toBe(true);
    expect(C.maxSpritePlanes).toBe(1);
  });
  it('prioritizes casualty, shot and movement over idle without invented clips',()=>{
    expect(clip({alive:false,moving:true,recoil:true})).toBe('die');
    expect(clip({hit:true,moving:true})).toBe('hit');
    expect(clip({recoil:true,moving:true})).toBe('shoot');
    expect(clip({moving:true})).toBe('walk');
    expect(clip()).toBe('idle');
  });
  it('projects actual rifle yaw through camera basis into 8 authored directions',()=>{
    const m=new Array(16).fill(0);m[0]=1;m[9]=1;m[8]=0;m[1]=0;
    expect(facing(0,{m})).toBe('E');
    expect(facing(Math.PI/2,{m})).toBe('S');
    expect(facing(Math.PI,{m})).toBe('W');
    expect(()=>facing(Infinity,{m})).toThrow(RangeError);
    expect(()=>facing(0,null)).toThrow(RangeError);
  });
  it('selects complete authored animation frames and clamps death',()=>{
    const bank={clips:{walk:{fps:4,directions:{NE:seq(4)}},die:{fps:8,directions:{S:seq(2)}}}};
    expect(frame(bank,'walk','NE',.5).index).toBe(2);
    expect(frame(bank,'walk','NE',1.5).index).toBe(2);
    expect(frame(bank,'die','S',100).index).toBe(1);
    expect(()=>frame(bank,'walk','N',0)).toThrow(RangeError);
    expect(()=>frame(bank,'walk','NE',-1)).toThrow(RangeError);
  });
  it('never trusts an atlas SHA field without digesting the actual bytes',async()=>{
    const bytes=new Uint8Array([1,2,3,4]).buffer;
    const subtle={digest:async()=>new Uint8Array(32).fill(0xab).buffer};
    expect(await verify(bytes,'ab'.repeat(32),subtle)).toBe(true);
    expect(await verify(bytes,'cd'.repeat(32),subtle)).toBe(false);
    expect(await verify(new Uint8Array(0).buffer,'ab'.repeat(32),subtle)).toBe(false);
    expect(await verify(bytes,'invalid',subtle)).toBe(false);
    expect(await verify(new Uint8Array(C.maxAtlasBytes+1).buffer,'ab'.repeat(32),subtle)).toBe(false);
  });
  it('falls back to the existing 3D when a missing bank or invalid manifest is requested',async()=>{
    const host={dataset:{}},scene={onBeforeRenderObservable:{add:()=>0,remove:()=>{}}};
    const missing=install(null,scene,{host,search:'?chesscomSven=atlas',loadManifest:async()=>{throw new Error('404')}});
    expect(await missing.ready).toBe(false);
    expect(host.dataset.chesscomSvenAtlas).toBe('fallback');
    missing.destroy();
    expect(host.dataset.chesscomSvenAtlas).toBeUndefined();
    const invalid=install(null,scene,{host,search:'?chesscomSven=atlas',loadManifest:async()=>({schema:2})});
    expect(await invalid.ready).toBe(false);
    expect(host.dataset.chesscomSvenAtlas).toBe('fallback');
    invalid.destroy();
  });
});

describe('CHESSCOM V36 real walking-direction sprite facing',()=>{
  const cam={m:[1,0,0,0,0,1,0,0,0,-1,1,0,0,0,0,1]};
  const move=(sx,sz,tx,tz)=>({start:{x:sx,z:sz},target:{x:tx,z:tz}});
  it('projects actual movement to camera, regardless of fixed team yaw',()=>{
    expect(motionFacing(move(1,1,2,1),cam)).toBe('E');
    expect(motionFacing(move(1,1,0,1),cam)).toBe('W');
    expect(motionFacing(move(1,1,1,0),cam)).toBe('N');
    // With an orthographic view whose Z basis is diagonal, movement in Z
    // can produce an entirely different projected direction than movement X.
    const diag={m:[1,.5,0,0,0,1,0,0,-.5,1,1,0,0,0,0,1]};
    expect(motionFacing(move(0,0,0,1),diag)).toBe('NW');
    expect(motionFacing(move(0,0,0,-1),diag)).toBe('SE');
  });
  it('holds last walking orientation after arriving, rather than snapping to the team yaw',()=>{
    const west=effectiveFacing({motion:move(2,0,1,0),yaw:-.58,viewMatrix:cam,previous:'E'});
    expect(west).toBe('W');
    expect(effectiveFacing({motion:null,yaw:-.58,viewMatrix:cam,previous:west,hasMoved:true})).toBe('W');
    expect(effectiveFacing({motion:move(2,2,2,2),yaw:-.58,viewMatrix:cam,previous:'NW',hasMoved:true})).toBe('NW');
    expect(effectiveFacing({motion:null,yaw:0,viewMatrix:cam,hasMoved:false})).toBe('E');
  });
  it('rejects corrupt motion metadata instead of corrupting UV direction',()=>{
    expect(()=>motionFacing(move(0,0,Infinity,0),cam)).toThrow(RangeError);
    expect(()=>motionFacing(null,cam)).toThrow(RangeError);
    expect(()=>motionFacing(move(0,0,1,0),null)).toThrow(RangeError);
    expect(()=>motionFacing(move(0,0,1,0),cam,'SIDE')).toThrow(RangeError);
  });
});

describe('CHESSCOM V37 atlas feet remain on the tactical tile',()=>{
  const cell={width:128,height:192};
  const height=1.72;
  it('places the authored foot pivot exactly at local unit ground for every valid padding',()=>{
    for(const pivot of [
      {x:64,y:180},
      {x:64,y:150},
      {x:46,y:175},
      {x:90,y:183},
    ]){
      const center=groundPivot(cell,pivot,height);
      // Pixel coordinates are top-left authored, while the Babylon quad has a
      // centred local coordinate system with positive Y upward.
      const localFootX=(pivot.x-cell.width/2)/cell.height*height;
      const localFootY=(cell.height/2-pivot.y)/cell.height*height;
      expect(center.x+localFootX).toBeCloseTo(0,10);
      expect(center.y+localFootY).toBeCloseTo(0,10);
      expect(center.z).toBe(0);
      expect(Math.abs(center.x)).toBeLessThan(height);
      expect(Math.abs(center.y)).toBeLessThan(height);
    }
  });
  it('does not mistake blank pixels beneath the feet for additional character height',()=>{
    const highPivot=groundPivot(cell,{x:64,y:150},height);
    const lowPivot=groundPivot(cell,{x:64,y:180},height);
    expect(highPivot.y).toBeLessThan(lowPivot.y);
    expect(lowPivot.y).toBeLessThan(height*.5);
    expect(groundPivot(cell,{x:64,y:96},height).y).toBe(0);
  });
  it('rejects unusable or corrupt geometry before creating Babylon meshes',()=>{
    expect(()=>groundPivot(cell,{x:128,y:180})).toThrow(RangeError);
    expect(()=>groundPivot(cell,{x:64,y:192})).toThrow(RangeError);
    expect(()=>groundPivot(cell,{x:-1,y:180})).toThrow(RangeError);
    expect(()=>groundPivot(cell,{x:64,y:NaN})).toThrow(RangeError);
    expect(()=>groundPivot({width:0,height:192},{x:0,y:180})).toThrow(RangeError);
    expect(()=>groundPivot(cell,{x:64,y:180},Infinity)).toThrow(RangeError);
  });
});
