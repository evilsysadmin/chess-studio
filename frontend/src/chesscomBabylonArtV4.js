import {
  BABYLON_VERSION,
  createChesscomBabylon as createCanonicalChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonCanonical.js';
import { installChesscomCharacterArtV4 } from './chesscomCharacterArtV4.js';
import { installChesscomEnvironmentArtV4 } from './chesscomEnvironmentArtV4.js';
import { installChesscomOverlayArtV6 } from './chesscomOverlayArtV6.js';
import { installChesscomMaterialArtV7 } from './chesscomMaterialArtV7.js';
import { installChesscomRenderQualityV9 } from './chesscomRenderQualityV9.js';
import { installChesscomDepthToneV10 } from './chesscomDepthToneV10.js';
import { installChesscomWeaponArtV11 } from './chesscomWeaponArtV11.js';
import { CHESSCOM_CAMERA_V18, installChesscomCameraV18 } from './chesscomCameraV18.js';

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
  const environmentV4 = installChesscomEnvironmentArtV4(B,scene,{ tier });
  const overlayV6 = installChesscomOverlayArtV6(B,scene,{ tier });
  const materialV7 = installChesscomMaterialArtV7(B,scene,{ tier });
  const depthToneV10 = installChesscomDepthToneV10(B,scene,{ tier,host });
  const weaponArtV11 = installChesscomWeaponArtV11(host);
  const cameraV18 = installChesscomCameraV18(scene);
  const v3Visibility = new Map();
  host.dataset.chesscomOperator = 'character-art-v4';
  host.dataset.chesscomCharacterMesh = 'custom-lowpoly-v4';
  host.dataset.chesscomCharacterMaterials = 'procedural-pbr-v4';
  host.dataset.chesscomEnvironment = 'environment-art-v4';
  host.dataset.chesscomOverlay = 'tactical-overlay-v6';
  host.dataset.chesscomMaterials = 'material-art-v7';
  host.dataset.chesscomWeaponArt = 'weapon-art-v11';
  host.dataset.chesscomCamera = CHESSCOM_CAMERA_V18.identity;
  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4 · OVERLAY V6 · MATERIAL V7 · HIDPI V9 · DEPTH V10 · WEAPON ART V11 · CAMERA V18`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state,ui);
      hideOperatorV3(scene,v3Visibility);
      artV4.update(state);
    },
    destroy() {
      cameraV18.destroy();
      weaponArtV11.destroy();
      depthToneV10.destroy();
      materialV7.destroy();
      overlayV6.destroy();
      artV4.destroy();
      environmentV4.destroy();
      renderQualityV9.destroy();
      for (const [mesh,old] of v3Visibility) {
        try { if (!mesh?.isDisposed?.()) mesh.isVisible = old; } catch {}
      }
      v3Visibility.clear();
      delete host.dataset.chesscomCharacterMesh;
      delete host.dataset.chesscomCharacterMaterials;
      delete host.dataset.chesscomEnvironment;
      delete host.dataset.chesscomOverlay;
      delete host.dataset.chesscomMaterials;
      delete host.dataset.chesscomWeaponArt;
      delete host.dataset.chesscomCamera;
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
