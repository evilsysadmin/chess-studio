export const CHESSCOM_RENDER_QUALITY_V9 = Object.freeze({
  identity:'render-quality-v9',
  backend:'gpu-webgl',
  scaling:'adaptive-hidpi',
  maxDesktopDpr:2,
  maxCoarseDpr:1.25,
});

function safeDpr(){
  const dpr=Number(globalThis.devicePixelRatio)||1;
  return Math.max(1,Math.min(3,dpr));
}

function renderScaleFor({coarse=false,tier='ultra',width=0,height=0}={}){
  const dpr=safeDpr();
  if(coarse || tier==='balanced') return Math.min(dpr,1.25);
  const pixels=Math.max(1,Number(width)||0)*Math.max(1,Number(height)||0);
  if(pixels>1_600_000) return Math.min(dpr,1.5);
  if(tier==='high') return Math.min(dpr,1.75);
  return Math.min(dpr,2);
}

export function installChesscomRenderQualityV9(B,scene,{host,tier='ultra'}={}){
  const engine=scene?.getEngine?.();
  const canvas=engine?.getRenderingCanvas?.();
  if(!engine||!canvas) return {destroy(){}};

  const coarse=Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
  const oldLevel=engine.getHardwareScalingLevel?.() ?? 1;
  const oldImageRendering=canvas.style.imageRendering;
  const oldContrast=scene.imageProcessingConfiguration?.contrast;
  const oldVignetteWeight=scene.imageProcessingConfiguration?.vignetteWeight;

  const rect=canvas.getBoundingClientRect?.() || {width:canvas.clientWidth||0,height:canvas.clientHeight||0};
  const scale=renderScaleFor({coarse,tier,width:rect.width,height:rect.height});
  const level=1/scale;

  // Babylon defines hardwareScalingLevel inversely: values >1 reduce the
  // internal render size, values <1 supersample it. The old Chesscom setup
  // overwrote adaptToDeviceRatio with a >=1 value on HiDPI displays, which
  // made the 3D scene render below CSS-pixel resolution and then get enlarged.
  engine.setHardwareScalingLevel?.(level);
  engine.resize?.();
  canvas.style.imageRendering='auto';

  if(scene.imageProcessingConfiguration){
    scene.imageProcessingConfiguration.contrast=Math.min(Number(oldContrast)||1.1,1.12);
    if(Number.isFinite(oldVignetteWeight)) scene.imageProcessingConfiguration.vignetteWeight=Math.min(oldVignetteWeight,.92);
  }

  if(host){
    host.dataset.chesscomRenderQuality='adaptive-hidpi-v9';
    host.dataset.chesscomRenderScale=scale.toFixed(2);
    host.dataset.chesscomGpuBackend='webgl';
    host.dataset.chesscomWebgpuAvailable=globalThis.navigator?.gpu?'true':'false';
  }

  return {
    destroy(){
      try{engine.setHardwareScalingLevel?.(oldLevel);engine.resize?.();}catch{}
      try{canvas.style.imageRendering=oldImageRendering;}catch{}
      if(scene.imageProcessingConfiguration){
        try{
          if(Number.isFinite(oldContrast)) scene.imageProcessingConfiguration.contrast=oldContrast;
          if(Number.isFinite(oldVignetteWeight)) scene.imageProcessingConfiguration.vignetteWeight=oldVignetteWeight;
        }catch{}
      }
      if(host){
        delete host.dataset.chesscomRenderQuality;
        delete host.dataset.chesscomRenderScale;
        delete host.dataset.chesscomGpuBackend;
        delete host.dataset.chesscomWebgpuAvailable;
      }
    },
  };
}

export { renderScaleFor as chesscomRenderScaleFor };
