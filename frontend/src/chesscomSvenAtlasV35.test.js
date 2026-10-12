import {describe,it,expect} from 'vitest';
import {
  CHESSCOM_SVEN_ATLAS_V35 as C,
  chesscomSvenAtlasEnabledV35 as enabled,
  chesscomSvenClipV35 as clip,
  chesscomSvenFacingV35 as facing,
  chesscomSvenAtlasFrameV35 as frame,
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
