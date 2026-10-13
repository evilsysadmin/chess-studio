import { request } from './http.js';

// Isolated opt-in GLB path: no artist-approved rig is shipped yet.
// Only a verified first-party authored GLB may ever replace Sven's V4 visuals.
export const CHESSCOM_SVEN_AUTHORED_V49 = Object.freeze({
  identity:'sven-authored-glb-ab-v49',
  queryKey:'chesscomSven',
  queryValue:'authored',
  manifest:'/chesscom/sven-authored-v1.json',
  maxAssetBytes:14*1024*1024,
  fallback:'character-art-v4',
});

const REQUIRED_CLIPS = Object.freeze(['idle','walk','fire','damage','death']);
const normalizeName = (value) => String(value || '').replace(/[^a-z0-9]/gi,'').toLowerCase();

export function chesscomSvenAuthoredEnabledV49(search='') {
  return new URLSearchParams(String(search)).get(CHESSCOM_SVEN_AUTHORED_V49.queryKey)
    === CHESSCOM_SVEN_AUTHORED_V49.queryValue;
}

export function chesscomSvenAuthoredManifestV49(manifest) {
  const asset=manifest?.asset;
  if(manifest?.schema!==1||manifest?.actor!=='sven'||manifest?.review_only!==true
    ||!asset||typeof asset.src!=='string'
    ||!/^\/chesscom\/actors\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.glb$/.test(asset.src)
    ||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(asset.sha256)
    ||!Number.isSafeInteger(asset.bytes)||asset.bytes<20
    ||asset.bytes>CHESSCOM_SVEN_AUTHORED_V49.maxAssetBytes) return false;
  return true;
}

export async function chesscomVerifySvenGlbV49(bytes,asset,subtle=globalThis.crypto?.subtle) {
  if(!(bytes instanceof ArrayBuffer)||!asset||bytes.byteLength!==asset.bytes
    ||bytes.byteLength>CHESSCOM_SVEN_AUTHORED_V49.maxAssetBytes||!subtle?.digest) return false;
  const hash=await subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  return actual===asset.sha256;
}

export function chesscomSvenAuthoredClipV49({alive=true,moving=false,firing=false,hit=false}={}) {
  if(!alive)return 'death';
  if(hit)return 'damage';
  if(firing)return 'fire';
  if(moving)return 'walk';
  return 'idle';
}

export function chesscomValidateAuthoredContainerV49(container) {
  const meshes=container?.meshes;
  const groups=container?.animationGroups;
  const nodes=[...(container?.transformNodes||[]),...(meshes||[])];
  if(!Array.isArray(meshes)||!meshes.some(m=>Boolean(m?.skeleton))
    ||!Array.isArray(container?.skeletons)||!container.skeletons.length
    ||!Array.isArray(groups)||!Array.isArray(container?.rootNodes)||!container.rootNodes.length) return null;
  const clips=new Map();
  for(const group of groups){
    const name=normalizeName(group?.name);
    if(!name||clips.has(name))return null;
    clips.set(name,group);
  }
  if(REQUIRED_CLIPS.some(name=>!clips.get(name)?.start||!clips.get(name)?.stop))return null;
  const sockets=nodes.filter(node=>normalizeName(node?.name)==='muzzlesocket');
  if(sockets.length!==1)return null;
  const socket=sockets[0];
  let weaponParent=socket.parent,depth=0,attachedToWeapon=false;
  while(weaponParent&&depth++<32){
    if(/(carbine|rifle|weapon|gun|hk416|mp5)/i.test(String(weaponParent.name||''))){
      attachedToWeapon=true;break;
    }
    weaponParent=weaponParent.parent;
  }
  if(!attachedToWeapon)return null;
  return {clips,socket};
}

export function installChesscomSvenAuthoredV49(B,scene,{
  host,search='',fetchManifest,fetchBytes,loadContainer,subtle,
}={}){
  if(!chesscomSvenAuthoredEnabledV49(search)){
    if(host)host.dataset.chesscomSvenAuthored='off';
    return {ready:Promise.resolve(false),update(){},destroy(){if(host)delete host.dataset.chesscomSvenAuthored;}};
  }
  let destroyed=false,container=null,validated=null,root=null,clipName=null;
  let alive=true,hitUntil=0,previousHp=null,attached=false;
  let objectUrl=null;
  const originalVisibility=new Map();
  const controller=new AbortController();
  if(host)host.dataset.chesscomSvenAuthored='loading';
  const fallback=()=>{
    if(!destroyed&&host)host.dataset.chesscomSvenAuthored='fallback';
    return false;
  };
  const getManifest=fetchManifest||((url,signal)=>request(url,{signal,cache:'no-store'})
    .then(response=>{if(!response.ok)throw Error('No authored Sven manifest');return response.json();}));
  const getBytes=fetchBytes||((url,signal)=>request(url,{signal,cache:'no-store'})
    .then(response=>{if(!response.ok)throw Error('No authored Sven GLB');return response.arrayBuffer();}));
  const importGlb=loadContainer||((url)=>B.SceneLoader.LoadAssetContainerAsync('',url,scene,undefined,'.glb'));

  function hideLegacy(){
    if(!root||!container)return;
    const imported=new Set(container.meshes);
    for(const mesh of root.getChildMeshes?.()||[]){
      if(imported.has(mesh)||mesh.isDisposed?.()||mesh?.metadata?.type!=='unit')continue;
      if(!originalVisibility.has(mesh))originalVisibility.set(mesh,mesh.visibility);
      mesh.visibility=0;
    }
  }
  function attach(){
    if(destroyed||attached||!container||!validated)return false;
    const target=scene.getTransformNodeByName?.('unit-sven');
    if(!target)return false;
    root=target;
    try{
      for(const child of container.rootNodes)child.parent=root;
      container.addAllToScene();
      for(const mesh of container.meshes){
        if(!mesh?.skeleton)continue;
        mesh.isPickable=true;
        mesh.receiveShadows=true;
        mesh.metadata={...(mesh.metadata||{}),type:'unit',id:'sven',friendly:true,authored:CHESSCOM_SVEN_AUTHORED_V49.identity};
      }
      root.metadata={...(root.metadata||{}),authoredMuzzleSocket:validated.socket};
      attached=true;
      hideLegacy();
      if(host)host.dataset.chesscomSvenAuthored='ready';
      return true;
    }catch{
      // A failed attach is not allowed to hide the entire unit.
      for(const [mesh,visibility] of originalVisibility){
        if(!mesh.isDisposed?.())mesh.visibility=visibility;
      }
      originalVisibility.clear();
      if(root?.metadata && validated?.socket && root.metadata.authoredMuzzleSocket===validated.socket)delete root.metadata.authoredMuzzleSocket;
      try{container?.dispose?.();}catch{}
      container=null;
      validated=null;
      attached=false;
      return fallback();
    }
  }
  const ready=(async()=>{
    try{
      const manifest=await getManifest(CHESSCOM_SVEN_AUTHORED_V49.manifest,controller.signal);
      if(destroyed||!chesscomSvenAuthoredManifestV49(manifest))return fallback();
      const bytes=await getBytes(manifest.asset.src,controller.signal);
      if(destroyed||!await chesscomVerifySvenGlbV49(bytes,manifest.asset,subtle))return fallback();
      if(destroyed||!B.SceneLoader?.LoadAssetContainerAsync&&!loadContainer)return fallback();
      objectUrl=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
      const imported=await importGlb(objectUrl);
      if(destroyed){imported?.dispose?.();return false;}
      validated=chesscomValidateAuthoredContainerV49(imported);
      if(!validated){imported?.dispose?.();return fallback();}
      container=imported;
      attach();
      return true;
    }catch{return fallback();}
    finally{
      if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    }
  })();
  const observer=scene.onBeforeRenderObservable?.add(()=>{
    if(!attached||!validated||destroyed)return;
    const now=performance.now();
    const next=chesscomSvenAuthoredClipV49({
      alive,moving:Boolean(root?.metadata?.motion),
      firing:Number(root?.metadata?.recoilUntil||0)>now,
      hit:now<hitUntil,
    });
    if(next===clipName)return;
    for(const group of validated.clips.values())group.stop();
    clipName=next;
    validated.clips.get(next).start(next==='idle'||next==='walk');
  });
  return {
    ready,
    update(state){
      const unit=state?.friendlies?.find?.(item=>item.id==='sven');
      alive=Boolean(unit&&unit.hp>0);
      if(Number.isFinite(unit?.hp)&&previousHp!==null&&unit.hp<previousHp&&alive)hitUntil=performance.now()+310;
      if(Number.isFinite(unit?.hp))previousHp=unit.hp;
      if(container){attach();if(attached)hideLegacy();}
    },
    destroy(){
      if(destroyed)return;
      destroyed=true;controller.abort();
      scene.onBeforeRenderObservable?.remove(observer);
      if(root?.metadata && validated?.socket && root.metadata.authoredMuzzleSocket===validated.socket)delete root.metadata.authoredMuzzleSocket;
      for(const [mesh,visibility] of originalVisibility){
        try{if(!mesh.isDisposed?.())mesh.visibility=visibility;}catch{}
      }
      originalVisibility.clear();
      try{container?.dispose?.();}catch{}
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      if(host)delete host.dataset.chesscomSvenAuthored;
    },
  };
}
