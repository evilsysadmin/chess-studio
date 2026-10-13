import { describe, it, expect, vi } from 'vitest';
import {
  CHESSCOM_SVEN_AUTHORED_V49,
  chesscomSvenAuthoredEnabledV49,
  chesscomSvenAuthoredManifestV49,
  chesscomSvenAuthoredClipV49,
  chesscomVerifySvenGlbV49,
  chesscomValidateAuthoredContainerV49,
  installChesscomSvenAuthoredV49,
} from './chesscomSvenAuthoredV49.js';

const asset=()=>({
  src:'/chesscom/actors/sven/sven-v1.glb',
  sha256:'0'.repeat(64),
  bytes:20,
});
const manifest=()=>({schema:1,actor:'sven',review_only:true,asset:asset()});
const emptyHash={digest:vi.fn(async()=>new Uint8Array(32).buffer)};

function fixture(){
  const old={name:'character-v4-sven-body',visibility:1,metadata:{type:'unit',id:'sven'},isDisposed:()=>false};
  const imported={name:'SvenSkin',skeleton:{},metadata:{},isDisposed:()=>false};
  const socket={name:'MuzzleSocket',parent:{name:'SvenCarbine'},getAbsolutePosition:()=>({x:.5,y:1,z:0,clone(){return this;}})};
  const groups=['Idle','Walk','Fire','Damage','Death'].map(name=>({
    name,start:vi.fn(),stop:vi.fn(),
  }));
  const container={
    meshes:[imported],skeletons:[{}],rootNodes:[{name:'__root__',parent:null}],
    transformNodes:[socket],animationGroups:groups,
    addAllToScene:vi.fn(),dispose:vi.fn(),
  };
  const root={metadata:{},getChildMeshes:()=>[old,imported]};
  let render=null;
  const scene={
    getTransformNodeByName:vi.fn(name=>name==='unit-sven'?root:null),
    onBeforeRenderObservable:{add:vi.fn(fn=>{render=fn;return fn;}),remove:vi.fn()},
  };
  const host={dataset:{}};
  return {old,imported,socket,groups,container,root,scene,host,render:()=>render?.()};
}

describe('CHESSCOM authored Sven GLB V49 safety contract',()=>{
  it('defaults off and never makes network or loader calls without explicit flag',async()=>{
    const f=fixture(),fetchManifest=vi.fn(),loadContainer=vi.fn();
    const renderer=installChesscomSvenAuthoredV49({},f.scene,{
      host:f.host,search:'',fetchManifest,loadContainer,
    });
    expect(await renderer.ready).toBe(false);
    expect(f.host.dataset.chesscomSvenAuthored).toBe('off');
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(loadContainer).not.toHaveBeenCalled();
    renderer.destroy();
    expect(f.host.dataset.chesscomSvenAuthored).toBeUndefined();
  });

  it('never treats a concept sheet or unverified URL as a renderable GLB',()=>{
    expect(chesscomSvenAuthoredEnabledV49('?chesscomSven=authored')).toBe(true);
    expect(chesscomSvenAuthoredEnabledV49('?chesscomSven=v45')).toBe(false);
    expect(chesscomSvenAuthoredManifestV49(manifest())).toBe(true);
    for(const source of [
      '/chesscom/actors/../bad.glb','https://example.com/model.glb',
      '//example.com/model.glb','/chesscom/actors/sven/sven%2e%2e.glb',
      '/chesscom/sven-v45-front.webp',
    ]){
      expect(chesscomSvenAuthoredManifestV49({...manifest(),asset:{...asset(),src:source}})).toBe(false);
    }
    expect(chesscomSvenAuthoredManifestV49({...manifest(),review_only:false})).toBe(false);
    expect(chesscomSvenAuthoredManifestV49({...manifest(),actor:'matthias'})).toBe(false);
    expect(chesscomSvenAuthoredManifestV49({...manifest(),asset:{...asset(),bytes:CHESSCOM_SVEN_AUTHORED_V49.maxAssetBytes+1}})).toBe(false);
  });

  it('requires exact byte size and SHA-256 before any Babylon import',async()=>{
    const buffer=new Uint8Array(20).buffer;
    expect(await chesscomVerifySvenGlbV49(buffer,asset(),emptyHash)).toBe(true);
    expect(await chesscomVerifySvenGlbV49(new Uint8Array(21).buffer,asset(),emptyHash)).toBe(false);
    expect(await chesscomVerifySvenGlbV49(buffer,{...asset(),sha256:'f'.repeat(64)},emptyHash)).toBe(false);
  });

  it('rejects static, incomplete or detached authored rigs',()=>{
    const f=fixture();
    expect(chesscomValidateAuthoredContainerV49(f.container)?.socket).toBe(f.socket);
    expect(chesscomValidateAuthoredContainerV49({...f.container,skeletons:[]})).toBeNull();
    expect(chesscomValidateAuthoredContainerV49({...f.container,animationGroups:f.groups.slice(1)})).toBeNull();
    expect(chesscomValidateAuthoredContainerV49({...f.container,transformNodes:[]})).toBeNull();
    f.socket.parent={name:'UnrelatedGroup'};
    expect(chesscomValidateAuthoredContainerV49(f.container)).toBeNull();
  });

  it('maps movement, firing, hits and death to authored animation clips',()=>{
    expect(chesscomSvenAuthoredClipV49({moving:true})).toBe('walk');
    expect(chesscomSvenAuthoredClipV49({firing:true})).toBe('fire');
    expect(chesscomSvenAuthoredClipV49({hit:true,firing:true})).toBe('damage');
    expect(chesscomSvenAuthoredClipV49({alive:false,hit:true})).toBe('death');
    expect(chesscomSvenAuthoredClipV49()).toBe('idle');
  });

  it('switches only Sven visuals after a verified rig and restores V4 on cleanup',async()=>{
    const f=fixture();
    const blob=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test-sven');
    const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    try{
      const loadContainer=vi.fn(async()=>f.container);
      const renderer=installChesscomSvenAuthoredV49({SceneLoader:{}},f.scene,{
        host:f.host,search:'?chesscomSven=authored',
        fetchManifest:async()=>manifest(),
        fetchBytes:async()=>new Uint8Array(20).buffer,
        loadContainer,subtle:emptyHash,
      });
      expect(await renderer.ready).toBe(true);
      expect(loadContainer).toHaveBeenCalledOnce();
      expect(f.host.dataset.chesscomSvenAuthored).toBe('ready');
      expect(f.old.visibility).toBe(0);
      expect(f.root.metadata.authoredMuzzleSocket).toBe(f.socket);
      expect(f.imported.metadata).toMatchObject({type:'unit',id:'sven',friendly:true});
      renderer.update({friendlies:[{id:'sven',hp:7}]});
      f.render();
      expect(f.groups[0].start).toHaveBeenCalledWith(true);
      f.root.metadata.motion={start:{},target:{}};
      f.render();
      expect(f.groups[1].start).toHaveBeenCalledWith(true);
      renderer.destroy();
      expect(f.old.visibility).toBe(1);
      expect(f.root.metadata.authoredMuzzleSocket).toBeUndefined();
      expect(f.container.dispose).toHaveBeenCalledOnce();
      expect(f.scene.onBeforeRenderObservable.remove).toHaveBeenCalledOnce();
      expect(f.host.dataset.chesscomSvenAuthored).toBeUndefined();
    }finally{blob.mockRestore();revoke.mockRestore();}
  });

  it('fails closed when manifest is missing or invalid without touching V4',async()=>{
    const f=fixture(),loadContainer=vi.fn();
    const renderer=installChesscomSvenAuthoredV49({SceneLoader:{}},f.scene,{
      host:f.host,search:'?chesscomSven=authored',
      fetchManifest:async()=>({...manifest(),asset:{...asset(),sha256:'bad'}}),
      fetchBytes:vi.fn(),loadContainer,
    });
    expect(await renderer.ready).toBe(false);
    expect(f.host.dataset.chesscomSvenAuthored).toBe('fallback');
    expect(loadContainer).not.toHaveBeenCalled();
    expect(f.old.visibility).toBe(1);
    renderer.destroy();
  });
});
