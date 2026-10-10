import { installChesscomCameraV18 } from './chesscomCameraV18.js';

// A closer framing for the 1600×900 battlefield without sacrificing the
// tactical overview in portrait/mobile. No camera animation: resize is atomic.
export const CHESSCOM_CAMERA_V25 = Object.freeze({
  identity:'camera-v25-cinematic-wide',
  minWideWidth:1480,
  minWideHeight:700,
  minWideAspect:1.55,
  cinematicScale:.94,
  cinematicBeta:.995,
});

export function chesscomCameraV25Profile({width=0,height=0}={}) {
  const wide=Number.isFinite(width)&&Number.isFinite(height)
    &&width>=CHESSCOM_CAMERA_V25.minWideWidth
    &&height>=CHESSCOM_CAMERA_V25.minWideHeight
    &&width/height>=CHESSCOM_CAMERA_V25.minWideAspect;
  return Object.freeze({
    mode:wide?'cinematic':'overview',
    scale:wide?CHESSCOM_CAMERA_V25.cinematicScale:1,
    beta:wide?CHESSCOM_CAMERA_V25.cinematicBeta:null,
  });
}

export function installChesscomCameraV25(scene,{host,viewport}={}) {
  const previous=installChesscomCameraV18(scene);
  const camera=scene?.getCameraByName?.('chesscom-camera')||scene?.activeCamera;
  if(!camera||typeof camera.beta!=='number') {
    return {destroy:()=>previous.destroy(),refresh(){}};
  }
  const origin={
    beta:camera.beta,
    orthoLeft:camera.orthoLeft,
    orthoRight:camera.orthoRight,
    orthoTop:camera.orthoTop,
    orthoBottom:camera.orthoBottom,
  };
  const browser=typeof window!=='undefined'?window:null;
  const getViewport=typeof viewport==='function'?viewport:()=>({
    width:browser?.innerWidth||0,
    height:browser?.innerHeight||0,
  });
  let mode=null;
  let disposed=false;
  const refresh=()=>{
    if(disposed)return;
    const next=chesscomCameraV25Profile(getViewport());
    if(next.mode===mode)return;
    mode=next.mode;
    camera.beta=next.beta??origin.beta;
    for(const key of ['orthoLeft','orthoRight','orthoTop','orthoBottom']){
      if(typeof origin[key]==='number')camera[key]=origin[key]*next.scale;
    }
    if(host) {
      host.dataset.chesscomCamera=CHESSCOM_CAMERA_V25.identity;
      host.dataset.chesscomCameraFraming=next.mode;
    }
  };
  refresh();
  browser?.addEventListener?.('resize',refresh);
  return {
    refresh,
    destroy(){
      if(disposed)return;
      disposed=true;
      browser?.removeEventListener?.('resize',refresh);
      // First undo cinematic delta; then restore the original Babylon camera
      // through the V18 contract, including the original target and alpha.
      camera.beta=origin.beta;
      for(const key of ['orthoLeft','orthoRight','orthoTop','orthoBottom']){
        if(typeof origin[key]==='number')camera[key]=origin[key];
      }
      previous.destroy();
      if(host){
        delete host.dataset.chesscomCamera;
        delete host.dataset.chesscomCameraFraming;
      }
    },
  };
}
