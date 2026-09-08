export const CHESSCOM_OVERLAY_ART_V6 = Object.freeze({
  identity:'tactical-overlay-v6',
  palette:'muted-brass-teal-rust',
  glow:'restrained-local-signal',
});

const OVERLAY_PROFILE = Object.freeze({
  reachable:Object.freeze({ diffuse:'#24383a', emissive:'#3f7072', alpha:.43 }),
  selected:Object.freeze({ diffuse:'#274548', emissive:'#679da1', alpha:.70 }),
  target:Object.freeze({ diffuse:'#4b2924', emissive:'#a44d42', alpha:.64 }),
  intel:Object.freeze({ diffuse:'#5c4b2d', emissive:'#b58d47', alpha:.70 }),
  exfil:Object.freeze({ diffuse:'#284347', emissive:'#629399', alpha:.66 }),
  'move-near':Object.freeze({ diffuse:'#2a4344', emissive:'#5d8c8d', alpha:.54 }),
  'move-mid':Object.freeze({ diffuse:'#304247', emissive:'#69888d', alpha:.52 }),
  'move-far':Object.freeze({ diffuse:'#554629', emissive:'#a88448', alpha:.56 }),
});

function findMaterial(scene,name){
  return scene.getMaterialByName?.(name)
    || (scene.materials || []).find((material)=>String(material?.name || '')===name)
    || null;
}

function snapshotMaterial(material){
  return {
    diffuseColor:material.diffuseColor?.clone?.() || null,
    emissiveColor:material.emissiveColor?.clone?.() || null,
    specularColor:material.specularColor?.clone?.() || null,
    specularPower:material.specularPower,
    alpha:material.alpha,
  };
}

function restoreMaterial(material,snapshot){
  if(!material || !snapshot) return;
  if(snapshot.diffuseColor) material.diffuseColor=snapshot.diffuseColor;
  if(snapshot.emissiveColor) material.emissiveColor=snapshot.emissiveColor;
  if(snapshot.specularColor) material.specularColor=snapshot.specularColor;
  material.specularPower=snapshot.specularPower;
  material.alpha=snapshot.alpha;
}

export function installChesscomOverlayArtV6(B,scene,{tier='ultra'}={}){
  const restores=[];
  for(const [name,profile] of Object.entries(OVERLAY_PROFILE)){
    const material=findMaterial(scene,name);
    if(!material) continue;
    restores.push([material,snapshotMaterial(material)]);
    material.diffuseColor=B.Color3.FromHexString(profile.diffuse);
    material.emissiveColor=B.Color3.FromHexString(profile.emissive);
    material.specularColor=B.Color3.FromHexString('#242a29');
    material.specularPower=34;
    material.alpha=tier==='balanced' ? Math.max(.38,profile.alpha-.07) : profile.alpha;
  }

  const glow=(scene.effectLayers || []).find((layer)=>String(layer?.name || '')==='ops-glow') || null;
  const oldGlowIntensity=glow?.intensity;
  if(glow) glow.intensity=tier==='balanced' ? .34 : tier==='high' ? .39 : .42;

  return {
    destroy(){
      for(const [material,snapshot] of restores.reverse()){
        try{restoreMaterial(material,snapshot);}catch{}
      }
      if(glow && Number.isFinite(oldGlowIntensity)){
        try{glow.intensity=oldGlowIntensity;}catch{}
      }
    },
  };
}
