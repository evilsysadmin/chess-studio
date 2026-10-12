import { request } from './http.js';
import {
  CHESSCOM_SPRITE_BANK_V34,
  chesscomScreenFacingV34,
  chesscomValidateSpriteBankV34,
  chesscomSpriteFrameUvV34,
} from './chesscomSpriteBankV34.js';

// Renderer for real, SHA-verified directional banks. No art is fabricated here.
// With no approved bank on disk, this opt-in mode fails back to the 3D model.
export const CHESSCOM_SVEN_ATLAS_V35=Object.freeze({
  identity:'sven-directional-atlas-v35',
  queryKey:'chesscomSven',
  queryValue:'atlas',
  manifest:'/chesscom/sven-bank-v1.json',
  height:1.72,
  maxAtlasBytes:8*1024*1024,
  fallback:'character-art-v4',
  maxSpritePlanes:1,
});

export function chesscomSvenAtlasEnabledV35(search=''){
  return new URLSearchParams(String(search)).get(CHESSCOM_SVEN_ATLAS_V35.queryKey)
    ===CHESSCOM_SVEN_ATLAS_V35.queryValue;
}

export function chesscomSvenClipV35({alive=true,moving=false,recoil=false,hit=false}={}){
  if(!alive)return 'die';
  if(hit)return 'hit';
  if(recoil)return 'shoot';
  if(moving)return 'walk';
  return 'idle';
}

// CHESSCOM rifles point along unit local +X; project that actual world vector
// onto the camera's screen basis. Never infer facing from an animation label.
export function chesscomSvenFacingV35(yaw,viewMatrix,previous='S'){
  const m=viewMatrix?.m;
  if(!Number.isFinite(yaw)||!m||m.length<16)throw new RangeError('Missing camera basis');
  const dx=Math.cos(yaw),dz=-Math.sin(yaw);
  const x=dx*m[0]+dz*m[8],y=-(dx*m[1]+dz*m[9]);
  return chesscomScreenFacingV34(x,y,previous);
}


/**
 * A V35 regression: canonical CHESSCOM unit yaw is fixed by team, even while
 * the unit walks between tiles. During movement select the view from the
 * *actual world-space displacement*, projected through Babylon's camera.
 *
 * Preserve the last walking direction on arrival; snapping back to the
 * team's default yaw would cause an artificial sprite orientation pop.
 */
export function chesscomSvenMovementFacingV36(motion,viewMatrix,previous='S'){
  const start=motion?.start,target=motion?.target,m=viewMatrix?.m;
  if(!CHESSCOM_SPRITE_BANK_V34.directions.includes(previous)
    ||!m||m.length<16||!start||!target
    ||![start.x,start.z,target.x,target.z,m[0],m[1],m[8],m[9]].every(Number.isFinite))
    throw new RangeError('Invalid unit motion or camera projection');
  const worldX=target.x-start.x,worldZ=target.z-start.z;
  if(Math.hypot(worldX,worldZ)<1e-5)return previous;
  const screenX=worldX*m[0]+worldZ*m[8];
  const screenY=-(worldX*m[1]+worldZ*m[9]);
  return chesscomScreenFacingV34(screenX,screenY,previous);
}

export function chesscomSvenEffectiveFacingV36({
  motion=null,yaw=0,viewMatrix,previous='S',hasMoved=false,
}={}){
  if(motion)return chesscomSvenMovementFacingV36(motion,viewMatrix,previous);
  if(hasMoved)return previous;
  return chesscomSvenFacingV35(yaw,viewMatrix,previous);
}

export function chesscomSvenAtlasFrameV35(bank,clip,direction,elapsedSeconds=0){
  if(!Number.isFinite(elapsedSeconds)||elapsedSeconds<0)throw new RangeError('Invalid frame elapsed');
  if(!CHESSCOM_SPRITE_BANK_V34.directions.includes(direction))throw new RangeError('Invalid direction');
  const spec=bank?.clips?.[clip],seq=spec?.directions?.[direction];
  if(!spec||!Array.isArray(seq)||!seq.length||!(spec.fps>0))throw new RangeError('Missing authored animation');
  const index=clip==='die'?Math.min(seq.length-1,Math.floor(elapsedSeconds*spec.fps))
    :Math.floor(elapsedSeconds*spec.fps)%seq.length;
  return Object.freeze({frame:seq[index],index,clip,direction});
}

export async function chesscomVerifySvenAtlasBytesV35(buffer,expected,subtle=globalThis.crypto?.subtle){
  if(!buffer||!Number.isSafeInteger(buffer.byteLength)||buffer.byteLength<1
    ||buffer.byteLength>CHESSCOM_SVEN_ATLAS_V35.maxAtlasBytes
    ||!subtle?.digest||!/^[a-f0-9]{64}$/i.test(expected||''))return false;
  const digest=await subtle.digest('SHA-256',buffer);
  const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  return hex===expected.toLowerCase();
}

/**
 * The pixel at pivot{x,y} is the character's ground anchor, not the sprite's
 * canvas bottom. Convert authored top-left pixel coordinates into the centre
 * of a Babylon quad. This keeps the feet on the unit tile regardless of how
 * much transparent padding is below the authored pivot.
 */
export function chesscomSvenAtlasGroundPivotV37(cell,pivot,height=CHESSCOM_SVEN_ATLAS_V35.height){
  if(!Number.isFinite(height)||height<=0
    ||!Number.isSafeInteger(cell?.width)||cell.width<=0
    ||!Number.isSafeInteger(cell?.height)||cell.height<=0
    ||!Number.isSafeInteger(pivot?.x)||pivot.x<0||pivot.x>=cell.width
    ||!Number.isSafeInteger(pivot?.y)||pivot.y<0||pivot.y>=cell.height)
    throw new RangeError('Invalid authored sprite foot pivot');
  return Object.freeze({
    x:(cell.width/2-pivot.x)/cell.height*height,
    y:(pivot.y-cell.height/2)/cell.height*height,
    z:0,
  });
}

export function installChesscomSvenAtlasV35(B,scene,{host,search='',loadManifest,loadAtlasBytes}={}){
  if(!chesscomSvenAtlasEnabledV35(search)){
    return {update(){},destroy(){},ready:Promise.resolve(false)};
  }
  let disposed=false,bank=null,plane=null,material=null,texture=null,objectUrl=null;
  let alive=true,previousFacing='S',previousClip='',previousDirection='',elapsed=0;
  let hasMoved=false;
  const visibility=new Map();
  const controller=new AbortController();
  if(host)host.dataset.chesscomSvenAtlas='loading';
  const fallback=()=>{
    if(disposed)return false;
    if(host)host.dataset.chesscomSvenAtlas='fallback';
    return false;
  };
  const capture=()=>{
    const root=scene.getTransformNodeByName?.('unit-sven');
    if(!root||plane||disposed)return;
    material=new B.StandardMaterial('chesscom-sven-atlas-v35-mat',scene);
    material.diffuseTexture=texture;
    material.emissiveTexture=texture;
    material.emissiveColor=new B.Color3(1,1,1);
    material.useAlphaFromDiffuseTexture=true;
    material.transparencyMode=B.Material.MATERIAL_ALPHATEST;
    material.alphaCutOff=.28;
    material.disableLighting=true;
    material.backFaceCulling=false;
    plane=B.MeshBuilder.CreatePlane('chesscom-sven-atlas-v35',{
      width:CHESSCOM_SVEN_ATLAS_V35.height*bank.cell.width/bank.cell.height,
      height:CHESSCOM_SVEN_ATLAS_V35.height,
      sideOrientation:B.Mesh.DOUBLESIDE,
    },scene);
    plane.parent=root;
    // Adjust the quad to the real bank's foot pivot, not canvas bottom.
    const ground=chesscomSvenAtlasGroundPivotV37(bank.cell,bank.pivot);
    plane.position.set(ground.x,ground.y,ground.z);
    plane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    plane.material=material;
    plane.metadata={type:'unit',id:'sven',friendly:true,spriteBank:CHESSCOM_SVEN_ATLAS_V35.identity};
    plane.isPickable=true;
    for(const child of root.getChildMeshes()){
      if(child===plane)continue;
      visibility.set(child,child.visibility);
      child.visibility=0;
    }
    if(host)host.dataset.chesscomSvenAtlas='ready';
    plane.setEnabled(alive);
  };

  const fetchJson=loadManifest||((url,signal)=>request(url,{signal,cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('Missing sprite bank manifest');
    return r.json();
  }));
  const fetchBytes=loadAtlasBytes||((url,signal)=>request(url,{signal,cache:'no-store'}).then(r=>{
    if(!r.ok)throw new Error('Missing sprite bank atlas');
    return r.arrayBuffer();
  }));
  const ready=(async()=>{
    try{
      const manifest=await fetchJson(CHESSCOM_SVEN_ATLAS_V35.manifest,controller.signal);
      if(disposed||!chesscomValidateSpriteBankV34(manifest).ok
        ||manifest.actor!=='sven')return fallback();
      const data=await fetchBytes(manifest.atlas.src,controller.signal);
      if(disposed||!await chesscomVerifySvenAtlasBytesV35(data,manifest.atlas.sha256))return fallback();
      // A verified blob avoids a second fetch of a different unverified asset.
      objectUrl=URL.createObjectURL(new Blob([data],{type:'image/webp'}));
      bank=manifest;
      const loaded=await new Promise(resolve=>{
        texture=new B.Texture(objectUrl,scene,false,true,B.Texture.TRILINEAR_SAMPLINGMODE,
          ()=>resolve(true),()=>resolve(false));
      });
      if(disposed||!loaded)return fallback();
      texture.hasAlpha=true;
      capture();
      return true;
    }catch{
      return fallback();
    }
  })();

  const tick=()=>{
    if(disposed||!bank||!texture)return;
    capture();
    if(!plane)return;
    const root=plane.parent,camera=scene.activeCamera;
    if(!root||!camera)return;
    const moving=Boolean(root.metadata?.motion);
    const now=performance.now();
    const clip=chesscomSvenClipV35({alive,moving,recoil:Number(root.metadata?.recoilUntil||0)>now});
    const direction=chesscomSvenEffectiveFacingV36({
      motion:root.metadata?.motion,
      yaw:Number(root.rotation.y)||0,
      viewMatrix:camera.getViewMatrix(),
      previous:previousFacing,
      hasMoved,
    });
    if(moving)hasMoved=true;
    previousFacing=direction;
    if(clip!==previousClip||direction!==previousDirection){
      previousClip=clip;
      previousDirection=direction;
      elapsed=0;
    }else{
      elapsed+=Math.min(.05,Math.max(0,Number(scene.getEngine()?.getDeltaTime?.()||0)/1000));
    }
    const selected=chesscomSvenAtlasFrameV35(bank,clip,direction,elapsed);
    const uv=chesscomSpriteFrameUvV34(selected.frame,bank.atlas);
    if(texture.uOffset!==uv.u0||texture.vOffset!==uv.v0){
      texture.uOffset=uv.u0;
      texture.vOffset=uv.v0;
      texture.uScale=uv.u1-uv.u0;
      texture.vScale=uv.v1-uv.v0;
    }
    plane.setEnabled(alive);
  };
  const observer=scene.onBeforeRenderObservable?.add(tick);
  return {
    ready,
    update(state){
      alive=Boolean(state?.friendlies?.some?.(u=>u.id==='sven'&&u.hp>0));
      if(plane)plane.setEnabled(alive);
    },
    destroy(){
      if(disposed)return;
      disposed=true;
      controller.abort();
      scene.onBeforeRenderObservable?.remove(observer);
      for(const [mesh,value] of visibility)try{if(!mesh.isDisposed?.())mesh.visibility=value;}catch{}
      visibility.clear();
      plane?.dispose();
      material?.dispose();
      texture?.dispose();
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      if(host)delete host.dataset.chesscomSvenAtlas;
    },
  };
}
