import { CHESSCOM_SPRITE_BANK_V34 } from './chesscomSpriteBankV34.js';

// The V45 image is an EXISTING user-approved candidate sheet, not a new 3D
// master or eight-way animation bank. Only the manually extracted FRONT view
// has genuine transparent silhouette pixels. Never synthesize missing frames.
export const CHESSCOM_SVEN_V45=Object.freeze({
  identity:'sven-v45-existing-sheet-front',
  asset:'/chesscom/sven-v45-front.webp',
  assetWidth:179,assetHeight:410,
  portrait:'/chesscom/sven-v45-portrait.webp',
  height:1.72,queryKey:'chesscomSven',queryValue:'v45',
  fallback:'character-art-v4',maxSpritePlanes:1,
  staticOnly:true,
});
// Opt-in 2.5D A/B pilot: Sven only. Single extracted NE concept pose, not an 8-way atlas.
export const CHESSCOM_SVEN_SPRITE_POC_V33=Object.freeze({
  identity:'sven-sprite-poc-v33',
  asset:'/chesscom/sven-probe-ne.webp',assetWidth:100,assetHeight:141,
  height:1.72,queryKey:'chesscomSven',queryValue:'sprite',
  fallback:'character-art-v4',maxSpritePlanes:1,
  futureBankContract:CHESSCOM_SPRITE_BANK_V34.identity,
});

export function chesscomSvenSpriteConfig(search=''){
  const requested=new URLSearchParams(String(search)).get('chesscomSven');
  if(requested==='sprite')return CHESSCOM_SVEN_SPRITE_POC_V33;
  if(requested==='v45')return CHESSCOM_SVEN_V45;
  return null;
}

export function chesscomSvenSpriteEnabled(search=''){
  return Boolean(chesscomSvenSpriteConfig(search));
}

export function chesscomSvenSpriteWidth(height=CHESSCOM_SVEN_SPRITE_POC_V33.height,
    config=CHESSCOM_SVEN_SPRITE_POC_V33){
  if(!Number.isFinite(height)||height<=0)throw new RangeError('Bad sprite height');
  return height*config.assetWidth/config.assetHeight;
}

export function installChesscomSvenSpritePocV33(B,scene,{host,search}={}){
  const config=chesscomSvenSpriteConfig(search);
  if(!config){
    if(host)host.dataset.chesscomSvenSprite='off';
    return {update(){},destroy(){if(host)delete host.dataset.chesscomSvenSprite;}};
  }
  let destroyed=false,loaded=false,failed=false,plane=null,material=null;
  const isV45=config===CHESSCOM_SVEN_V45;
  const outer=host?.closest?.('.chesscom');
  if(host)host.dataset.chesscomSvenSource=isV45?'v45':'v33';
  if(isV45&&outer)outer.dataset.chesscomSvenV45='loading';
  const markV45=(value)=>{if(isV45&&outer)outer.dataset.chesscomSvenV45=value;};
  const oldVisibility=new Map();
  if(host)host.dataset.chesscomSvenSprite='loading';
  function attach(){
    if(destroyed||!loaded||failed||plane)return;
    const root=scene.getTransformNodeByName?.('unit-sven');
    if(!root)return;
    material=new B.StandardMaterial('chesscom-sven-poc-'+config.queryValue+'-mat',scene);
    material.diffuseTexture=texture;
    material.emissiveTexture=texture;
    material.emissiveColor=new B.Color3(1,1,1);
    material.disableLighting=true; // Show baked sprite colours without direct 3D lights.
    material.useAlphaFromDiffuseTexture=true;
    material.transparencyMode=B.Material.MATERIAL_ALPHATEST;
    material.alphaCutOff=.28;
    material.backFaceCulling=false;
    plane=B.MeshBuilder.CreatePlane('chesscom-sven-sprite-'+config.queryValue,{
      width:chesscomSvenSpriteWidth(config.height,config),height:config.height,
      sideOrientation:B.Mesh.DOUBLESIDE,
    },scene);
    plane.parent=root;
    plane.position.set(0,config.height/2+.015,0);
    plane.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
    plane.material=material;
    plane.metadata={type:'unit',id:'sven',friendly:true,
      spritePoc:config.identity};
    plane.isPickable=true; // Unit selection semantics remain unchanged.
    for(const child of root.getChildMeshes()){
      if(child===plane)continue;
      oldVisibility.set(child,child.visibility);
      child.visibility=0; // Keep geometry and its original hitboxes for rollback.
    }
    root.metadata.svenSpritePoc=config.identity;
    if(host)host.dataset.chesscomSvenSprite='ready';
    markV45('ready');
  }
  // The authored WebP has its head at the top; flip upload Y for Babylon's plane UVs.
  const texture=new B.Texture(config.asset,scene,false,true,
    B.Texture.TRILINEAR_SAMPLINGMODE,
    ()=>{if(destroyed)return;loaded=true;texture.hasAlpha=true;attach();},
    ()=>{if(destroyed)return;failed=true;if(host)host.dataset.chesscomSvenSprite='fallback';markV45('fallback');});
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
      if(host){delete host.dataset.chesscomSvenSprite;delete host.dataset.chesscomSvenSource;}
      if(isV45&&outer)delete outer.dataset.chesscomSvenV45;
    },
  };
}
