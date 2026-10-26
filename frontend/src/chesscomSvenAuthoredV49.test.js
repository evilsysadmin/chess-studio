import { describe, it, expect, vi } from 'vitest';
import {
  CHESSCOM_SVEN_AUTHORED_V49,
  chesscomSvenAuthoredEnabledV49,
  chesscomSvenAuthoredManifestV49,
  chesscomSvenAuthoredClipV49,
  chesscomVerifySvenGlbV49,
  chesscomValidateAuthoredContainerV49,
  chesscomShouldHideSvenLegacyV50,
  chesscomEnsureGlbLoaderV51,
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
  const oldKit={name:'canonical-unit-sven-rounded-chest',visibility:.7,isDisposed:()=>false};
  const marker={name:'marker-sven',visibility:1,metadata:{selectionStyle:'ground-brackets-v28'},isDisposed:()=>false};
  const socket={name:'MuzzleSocket',parent:{name:'SvenCarbine'},getAbsolutePosition:()=>({x:.5,y:1,z:0,clone(){return this;}})};
  const groups=['Idle','Walk','Fire','Damage','Death'].map(name=>({
    name,start:vi.fn(),stop:vi.fn(),
  }));
  const container={
    meshes:[imported],skeletons:[{}],rootNodes:[{name:'__root__',parent:null}],
    transformNodes:[socket],animationGroups:groups,
    addAllToScene:vi.fn(),dispose:vi.fn(),
  };
  const root={metadata:{},getChildMeshes:()=>[old,oldKit,marker,imported]};
  let render=null;
  const scene={
    getTransformNodeByName:vi.fn(name=>name==='unit-sven'?root:null),
    onBeforeRenderObservable:{add:vi.fn(fn=>{render=fn;return fn;}),remove:vi.fn()},
  };
  const host={dataset:{}};
  return {old,oldKit,marker,imported,socket,groups,container,root,scene,host,render:()=>render?.()};
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
      expect(f.oldKit.visibility).toBe(0);
      expect(f.marker.visibility).toBe(1);
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
      expect(f.oldKit.visibility).toBe(.7);
      expect(f.marker.visibility).toBe(1);
      expect(f.root.metadata.authoredMuzzleSocket).toBeUndefined();
      expect(f.container.dispose).toHaveBeenCalledOnce();
      expect(f.scene.onBeforeRenderObservable.remove).toHaveBeenCalledOnce();
      expect(f.host.dataset.chesscomSvenAuthored).toBeUndefined();
    }finally{blob.mockRestore();revoke.mockRestore();}
  });

  it('recognizes untagged canonical visual kit but preserves tactical overlay and imported GLB',()=>{
    const f=fixture(),imported=new Set([f.imported]);
    expect(chesscomShouldHideSvenLegacyV50(f.old,imported)).toBe(true);
    expect(chesscomShouldHideSvenLegacyV50(f.oldKit,imported)).toBe(true);
    expect(chesscomShouldHideSvenLegacyV50(f.imported,imported)).toBe(false);
    expect(chesscomShouldHideSvenLegacyV50(f.marker,imported)).toBe(false);
    expect(chesscomShouldHideSvenLegacyV50({name:'canonical-unit-dieter-rounded-chest'},imported)).toBe(false);
    expect(chesscomShouldHideSvenLegacyV50({name:'canonical-unit-sven-fallen',isDisposed:()=>true},imported)).toBe(false);
  });

  it('registers pinned Babylon glTF loader once, not eagerly at boot',async()=>{
    const loader={SceneLoader:{
      IsPluginForExtensionAvailable:vi.fn(()=>false),
    }};
    const register=vi.fn(async()=>{
      loader.SceneLoader.IsPluginForExtensionAvailable=vi.fn(()=>true);
    });
    expect(await chesscomEnsureGlbLoaderV51(loader,register)).toBe(true);
    expect(register).toHaveBeenCalledOnce();
    expect(await chesscomEnsureGlbLoaderV51(loader,register)).toBe(true);
    expect(register).toHaveBeenCalledOnce();
  });

  it('does not call app fetch if dynamic loader installation fails',async()=>{
    const f=fixture(),fetchManifest=vi.fn();
    const renderer=installChesscomSvenAuthoredV49({
      SceneLoader:{IsPluginForExtensionAvailable:()=>false}
    },f.scene,{
      host:f.host,search:'?chesscomSven=authored',
      fetchManifest,registerGlbLoader:async()=>{throw Error('loader bundle missing');}
    });
    expect(await renderer.ready).toBe(false);
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(f.host.dataset.chesscomSvenAuthoredReason).toBe('missing-glb-loader');
    renderer.destroy();
  });

  it('fails closed before downloading anything when Babylon has no GLB importer',async()=>{
    const f=fixture(),fetchManifest=vi.fn(),fetchBytes=vi.fn();
    const renderer=installChesscomSvenAuthoredV49({SceneLoader:{
      IsPluginForExtensionAvailable:()=>false,
    }},f.scene,{host:f.host,search:'?chesscomSven=authored',fetchManifest,fetchBytes,
      registerGlbLoader:async()=>{},
    });
    expect(await renderer.ready).toBe(false);
    expect(f.host.dataset.chesscomSvenAuthored).toBe('fallback');
    expect(f.host.dataset.chesscomSvenAuthoredReason).toBe('missing-glb-loader');
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(fetchBytes).not.toHaveBeenCalled();
    renderer.destroy();
    expect(f.host.dataset.chesscomSvenAuthoredReason).toBeUndefined();
  });

  it('does not report success if a valid imported container fails during attachment',async()=>{
    const f=fixture();
    const blob=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test-sven-failing');
    const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    f.container.addAllToScene.mockImplementation(()=>{throw Error('GPU attach failed');});
    try{
      const renderer=installChesscomSvenAuthoredV49({},f.scene,{
        host:f.host,search:'?chesscomSven=authored',
        fetchManifest:async()=>manifest(),fetchBytes:async()=>new Uint8Array(20).buffer,
        loadContainer:async()=>f.container,subtle:emptyHash,
      });
      expect(await renderer.ready).toBe(false);
      expect(f.host.dataset.chesscomSvenAuthored).toBe('fallback');
      expect(f.old.visibility).toBe(1);
      expect(f.oldKit.visibility).toBe(.7);
      expect(f.container.dispose).toHaveBeenCalledOnce();
      renderer.destroy();
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
