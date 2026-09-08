export const CHESSCOM_DEPTH_TONE_V10 = Object.freeze({
  identity:'depth-tone-v10',
  shadows:'contact-weighted',
  highlights:'aces-preserved',
});

export function chesscomDepthToneProfile(tier='ultra') {
  if(tier==='balanced') return Object.freeze({
    warmScale:.90,
    bounceScale:.88,
    contrastMax:1.09,
    exposureMax:1.05,
    shadowMode:'blur',
    darkness:.22,
  });
  if(tier==='high') return Object.freeze({
    warmScale:.78,
    bounceScale:.84,
    contrastMax:1.075,
    exposureMax:1.035,
    shadowMode:'pcf',
    darkness:.25,
  });
  return Object.freeze({
    warmScale:.72,
    bounceScale:.82,
    contrastMax:1.065,
    exposureMax:1.025,
    shadowMode:'pcss',
    darkness:.27,
  });
}

function snapshotLight(light){
  return { intensity:light.intensity };
}

function snapshotShadow(shadow){
  return {
    bias:shadow.bias,
    normalBias:shadow.normalBias,
    blurKernel:shadow.blurKernel,
    useBlurExponentialShadowMap:shadow.useBlurExponentialShadowMap,
    usePercentageCloserFiltering:shadow.usePercentageCloserFiltering,
    useContactHardeningShadow:shadow.useContactHardeningShadow,
    filteringQuality:shadow.filteringQuality,
    contactHardeningLightSizeUVRatio:shadow.contactHardeningLightSizeUVRatio,
    darkness:shadow.getDarkness?.(),
  };
}

function restoreShadow(shadow,old){
  try{
    shadow.bias=old.bias;
    shadow.normalBias=old.normalBias;
    shadow.blurKernel=old.blurKernel;
    shadow.useBlurExponentialShadowMap=old.useBlurExponentialShadowMap;
    shadow.usePercentageCloserFiltering=old.usePercentageCloserFiltering;
    shadow.useContactHardeningShadow=old.useContactHardeningShadow;
    shadow.filteringQuality=old.filteringQuality;
    shadow.contactHardeningLightSizeUVRatio=old.contactHardeningLightSizeUVRatio;
    if(Number.isFinite(old.darkness)) shadow.setDarkness?.(old.darkness);
  }catch{}
}

export function installChesscomDepthToneV10(B,scene,{tier='ultra',host=null}={}){
  const profile=chesscomDepthToneProfile(tier);
  const lightSnapshots=new Map();
  const moon=scene.getLightByName?.('moon');
  const shadow=moon?.getShadowGenerator?.() || null;
  const shadowSnapshot=shadow?snapshotShadow(shadow):null;
  const image=scene.imageProcessingConfiguration || null;
  const imageSnapshot=image?{
    contrast:image.contrast,
    exposure:image.exposure,
    toneMappingEnabled:image.toneMappingEnabled,
    toneMappingType:image.toneMappingType,
  }:null;

  for(const light of scene.lights || []){
    const name=String(light?.name || '');
    const isMainWarm=name==='warm-a'||name==='warm-b';
    const isBounce=name.startsWith('environment-v4-bounce-warm-');
    if(!isMainWarm && !isBounce) continue;
    lightSnapshots.set(light,snapshotLight(light));
    light.intensity*=isMainWarm?profile.warmScale:profile.bounceScale;
  }

  if(shadow){
    shadow.bias=.00032;
    shadow.normalBias=.014;
    shadow.setDarkness?.(profile.darkness);
    if(profile.shadowMode==='pcss' && 'useContactHardeningShadow' in shadow){
      shadow.useBlurExponentialShadowMap=false;
      shadow.usePercentageCloserFiltering=false;
      shadow.useContactHardeningShadow=true;
      shadow.contactHardeningLightSizeUVRatio=.045;
      if(Number.isFinite(B.ShadowGenerator?.QUALITY_HIGH)) shadow.filteringQuality=B.ShadowGenerator.QUALITY_HIGH;
    }else if(profile.shadowMode==='pcf' && 'usePercentageCloserFiltering' in shadow){
      shadow.useBlurExponentialShadowMap=false;
      shadow.useContactHardeningShadow=false;
      shadow.usePercentageCloserFiltering=true;
      if(Number.isFinite(B.ShadowGenerator?.QUALITY_HIGH)) shadow.filteringQuality=B.ShadowGenerator.QUALITY_HIGH;
    }
  }

  if(image){
    image.contrast=Math.min(Number(image.contrast)||1,profile.contrastMax);
    image.exposure=Math.min(Number(image.exposure)||1,profile.exposureMax);
    image.toneMappingEnabled=true;
    if(typeof B.ImageProcessingConfiguration?.TONEMAPPING_ACES!=='undefined'){
      image.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    }
  }

  if(host){
    host.dataset.chesscomDepth='depth-tone-v10';
    host.dataset.chesscomShadowMode=profile.shadowMode;
  }

  return {
    destroy(){
      for(const [light,old] of lightSnapshots){try{light.intensity=old.intensity;}catch{}}
      lightSnapshots.clear();
      if(shadow&&shadowSnapshot) restoreShadow(shadow,shadowSnapshot);
      if(image&&imageSnapshot){
        try{
          image.contrast=imageSnapshot.contrast;
          image.exposure=imageSnapshot.exposure;
          image.toneMappingEnabled=imageSnapshot.toneMappingEnabled;
          image.toneMappingType=imageSnapshot.toneMappingType;
        }catch{}
      }
      if(host){delete host.dataset.chesscomDepth;delete host.dataset.chesscomShadowMode;}
    },
  };
}
