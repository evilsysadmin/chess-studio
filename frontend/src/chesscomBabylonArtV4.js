import {
  BABYLON_VERSION,
  createChesscomBabylon as createCanonicalChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonCanonical.js';
import { installChesscomCharacterArtV4 } from './chesscomCharacterArtV4.js';
import { installChesscomEnvironmentArtV4 } from './chesscomEnvironmentArtV4.js';

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

  const artV4 = installChesscomCharacterArtV4(B,scene);
  const environmentV4 = installChesscomEnvironmentArtV4(B,scene,{ tier:host.dataset.chesscomSceneTier || 'ultra' });
  const v3Visibility = new Map();
  host.dataset.chesscomOperator = 'character-art-v4';
  host.dataset.chesscomCharacterMesh = 'custom-lowpoly-v4';
  host.dataset.chesscomCharacterMaterials = 'procedural-pbr-v4';
  host.dataset.chesscomEnvironment = 'environment-art-v4';
  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state,ui);
      hideOperatorV3(scene,v3Visibility);
      artV4.update(state);
    },
    destroy() {
      artV4.destroy();
      environmentV4.destroy();
      for (const [mesh,old] of v3Visibility) {
        try { if (!mesh?.isDisposed?.()) mesh.isVisible = old; } catch {}
      }
      v3Visibility.clear();
      delete host.dataset.chesscomCharacterMesh;
      delete host.dataset.chesscomCharacterMaterials;
      delete host.dataset.chesscomEnvironment;
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
