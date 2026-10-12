import {
  BABYLON_VERSION,
  createChesscomBabylon as createCanonicalChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonCanonical.js';
import { installChesscomCharacterArtV4 } from './chesscomCharacterArtV4.js';
import { installChesscomEnvironmentArtV4 } from './chesscomEnvironmentArtV4.js';
import { CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19, installChesscomIndustrialArchitectureV19 } from './chesscomIndustrialArchitectureV19.js';
import { CHESSCOM_KHARIF_LOADING_BAYS_V27, installChesscomKharifLoadingBaysV27 } from './chesscomKharifLoadingBaysV27.js';
import { installChesscomOverlayArtV6 } from './chesscomOverlayArtV6.js';
import { installChesscomMaterialArtV7 } from './chesscomMaterialArtV7.js';
import { installChesscomRenderQualityV9 } from './chesscomRenderQualityV9.js';
import { installChesscomDepthToneV10 } from './chesscomDepthToneV10.js';
import { installChesscomWeaponArtV11 } from './chesscomWeaponArtV11.js';
import { CHESSCOM_CAMERA_V25, installChesscomCameraV25 } from './chesscomCameraV25.js';
import { CHESSCOM_OPERATOR_MOMENTS_V26, installChesscomOperatorMomentsV26 } from './chesscomOperatorMomentsV26.js';
import { installChesscomSvenSpritePocV33 } from './chesscomSvenSpritePocV33.js';

function sceneFromBabylon(B) {
  return B.EngineStore?.LastCreatedScene
    || B.EngineStore?.Instances?.at?.(-1)?.scenes?.at?.(-1)
    || null;
}

function hideOperatorV3(scene, visibility) {
  for (const mesh of scene.meshes || []) {
    if (!String(mesh?.name || '').startsWith('operator-v3-')) continue;
    if (mesh.name === 'operator-v3-invisible') continue;
    if (!visibility.has(mesh)) visibility.set(mesh,mesh.isVisible);
    mesh.isVisible = false;
  }
}

export async function createChesscomBabylon(host, options = {}) {
  const { onReady, ...rest } = options;
  const base = await createCanonicalChesscomBabylon(host,{ ...rest,onReady:() => {} });
  const B = await loadChesscomBabylon();
  const scene = sceneFromBabylon(B);
  if (!scene) {
    onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS`);
    return base;
  }

  const tier=host.dataset.chesscomSceneTier || 'ultra';
  const renderQualityV9 = installChesscomRenderQualityV9(B,scene,{ host,tier });
  const artV4 = installChesscomCharacterArtV4(B,scene);
  const svenPoc=installChesscomSvenSpritePocV33(B,scene,{host,search:window.location.search});
  const environmentV4 = installChesscomEnvironmentArtV4(B,scene,{ tier });
  const architectureV19 = installChesscomIndustrialArchitectureV19(B,scene,{ tier,host });
  const loadingV27 = installChesscomKharifLoadingBaysV27(B,scene,{ tier,host });
  const overlayV6 = installChesscomOverlayArtV6(B,scene,{ tier });
  const materialV7 = installChesscomMaterialArtV7(B,scene,{ tier });
  const depthToneV10 = installChesscomDepthToneV10(B,scene,{ tier,host });
  const weaponArtV11 = installChesscomWeaponArtV11(host);
  const cameraV25 = installChesscomCameraV25(scene,{host});
  const momentsV26 = installChesscomOperatorMomentsV26(B,scene,{tier,host,reducedMotion:Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)});
  const v3Visibility = new Map();
  host.dataset.chesscomOperator = 'character-art-v4';
  host.dataset.chesscomCharacterMesh = 'custom-lowpoly-v4';
  host.dataset.chesscomCharacterMaterials = 'procedural-pbr-v4';
  host.dataset.chesscomEnvironment = 'environment-art-v4';
  host.dataset.chesscomArchitecture = CHESSCOM_INDUSTRIAL_ARCHITECTURE_V19.identity;
  host.dataset.chesscomLoadingBays = CHESSCOM_KHARIF_LOADING_BAYS_V27.identity;
  host.dataset.chesscomVehicle = 'military-truck-v21';
  host.dataset.chesscomOverlay = 'tactical-overlay-v6';
  host.dataset.chesscomMaterials = 'material-art-v7';
  host.dataset.chesscomWeaponArt = 'weapon-art-v11';
  host.dataset.chesscomCamera = CHESSCOM_CAMERA_V25.identity;
  host.dataset.chesscomOperatorMoments = CHESSCOM_OPERATOR_MOMENTS_V26.identity;
  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4 · OVERLAY V6 · MATERIAL V7 · HIDPI V9 · DEPTH V10 · WEAPON ART V11 · CAMERA V25 · OPERATOR MOMENTS V26 · INDUSTRIAL ARCHITECTURE V19 · LOADING BAYS V27 · FIELD KIT V20 · SILHOUETTE V23 · MILITARY TRUCK V21`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state,ui);
      hideOperatorV3(scene,v3Visibility);
      artV4.update(state);
      svenPoc.update(state);
      momentsV26.update(state,ui);
    },
    destroy() {
      momentsV26.destroy();
      cameraV25.destroy();
      weaponArtV11.destroy();
      depthToneV10.destroy();
      materialV7.destroy();
      overlayV6.destroy();
      svenPoc.destroy();
      artV4.destroy();
      loadingV27.destroy();
      architectureV19.destroy();
      environmentV4.destroy();
      renderQualityV9.destroy();
      for (const [mesh,old] of v3Visibility) {
        try { if (!mesh?.isDisposed?.()) mesh.isVisible = old; } catch {}
      }
      v3Visibility.clear();
      delete host.dataset.chesscomCharacterMesh;
      delete host.dataset.chesscomCharacterMaterials;
      delete host.dataset.chesscomEnvironment;
      delete host.dataset.chesscomArchitecture;
      delete host.dataset.chesscomLoadingBays;
      delete host.dataset.chesscomVehicle;
      delete host.dataset.chesscomOverlay;
      delete host.dataset.chesscomMaterials;
      delete host.dataset.chesscomWeaponArt;
      delete host.dataset.chesscomOperatorMoments;
      delete host.dataset.chesscomFocusUnit;
      delete host.dataset.chesscomMoment;
      delete host.dataset.chesscomCamera;
      delete host.dataset.chesscomCameraFraming;
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
