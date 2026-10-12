// Opt-in 2.5D A/B pilot: Sven only. Single extracted NE concept pose, not an 8-way atlas.
export const CHESSCOM_SVEN_SPRITE_POC_V33=Object.freeze({
  identity:'sven-sprite-poc-v33',
  asset:'/chesscom/sven-probe-ne.webp',assetWidth:100,assetHeight:141,
  height:1.72,queryKey:'chesscomSven',queryValue:'sprite',
  fallback:'character-art-v4',maxSpritePlanes:1,
});

export function chesscomSvenSpriteEnabled(search=''){
  return new URLSearchParams(String(search)).get(CHESSCOM_SVEN_SPRITE_POC_V33.queryKey)
    ===CHESSCOM_SVEN_SPRITE_POC_V33.queryValue;
}

export function chesscomSvenSpriteWidth(height=CHESSCOM_SVEN_SPRITE_POC_V33.height){
  if(!Number.isFinite(height)||height<=0)throw new RangeError('Bad sprite height');
  return height*CHESSCOM_SVEN_SPRITE_POC_V33.assetWidth/CHESSCOM_SVEN_SPRITE_POC_V33.assetHeight;
}

export function installChesscomSvenSpritePocV33(B,scene,{host,search}={}){
  if(!chesscomSvenSpriteEnabled(search)){
    if(host)host.dataset.chesscomSvenSprite='off';
    return {update(){},destroy(){if(host)delete host.dataset.chesscomSvenSprite;}};
  }
  let destroyed=false,loaded=false,failed=false,plane=null,material=null;
  const oldVisibility=new Map();
  if(host)host.dataset.chesscomSvenSprite='loading';
  function attach(){
    if(destroyed||!loaded||failed||plane)return;
    const root=scene.getTransformNodeByName?.('unit-sven');
    if(!root)return;
    material=new B.StandardMaterial('chesscom-sven-poc-v33-mat',scene);
    material.diffuseTexture=texture;
    material.emissiveTexture=texture;
    material.emissiveColor=new B.Color3(1,1,1);
    material.disableLighting=true; // Show baked sprite colours without direct 3D lights.
    material.useAlphaFromDiffuseTexture=true;
    material.transparencyMode=B.Material.MATERIAL_ALPHATEST;
    material.alphaCutOff=.28;
    material.backFaceCulling=false;
    plane=B.MeshBuilder.CreatePlane('chesscom-sven-sprite-v33',{
      width:chesscomSvenSpriteWidth(),height:CHESSCOM_SVEN_SPRITE_POC_V33.height,
      sideOrientation:B.Mesh.DOUBLESIDE,
    },scene);
    plane.parent=root;
    plane.position.set(0,CHESSCOM_SVEN_SPRITE_POC_V33.height/2+.015,0);
    plane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    plane.material=material;
    plane.metadata={type:'unit',id:'sven',friendly:true,
      spritePoc:CHESSCOM_SVEN_SPRITE_POC_V33.identity};
    plane.isPickable=true; // Unit selection semantics remain unchanged.
    for(const child of root.getChildMeshes()){
      if(child===plane)continue;
      oldVisibility.set(child,child.visibility);
      child.visibility=0; // Keep geometry and its original hitboxes for rollback.
    }
    root.metadata.svenSpritePoc=CHESSCOM_SVEN_SPRITE_POC_V33.identity;
    if(host)host.dataset.chesscomSvenSprite='ready';
  }
  // The authored WebP has its head at the top; flip upload Y for Babylon's plane UVs.
  const texture=new B.Texture(CHESSCOM_SVEN_SPRITE_POC_V33.asset,scene,false,true,
    B.Texture.TRILINEAR_SAMPLINGMODE,
    ()=>{if(destroyed)return;loaded=true;texture.hasAlpha=true;attach();},
    ()=>{if(destroyed)return;failed=true;if(host)host.dataset.chesscomSvenSprite='fallback';});
  texture.hasAlpha=true;
  return {
    update(state){
      if(destroyed||failed)return;
      attach();
      if(plane){
        const unit=state?.friendlies?.find?.(u=>u.id==='sven');
        plane.setEnabled(Boolean(unit&&unit.hp>0));
      }
    },
    destroy(){
      if(destroyed)return;
      destroyed=true;
      for(const [mesh,value] of oldVisibility)try{if(!mesh.isDisposed?.())mesh.visibility=value;}catch{}
      oldVisibility.clear();
      const root=scene.getTransformNodeByName?.('unit-sven');
      if(root?.metadata)delete root.metadata.svenSpritePoc;
      plane?.dispose();material?.dispose();texture.dispose();
      if(host)delete host.dataset.chesscomSvenSprite;
    },
  };
}
