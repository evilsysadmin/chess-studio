import {
  BABYLON_VERSION,
  createChesscomBabylon as createCanonicalChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonCanonical.js';
import { installChesscomCharacterArtV4 } from './chesscomCharacterArtV4.js';

function sceneFromBabylon(B) {
  return B.EngineStore?.LastCreatedScene
    || B.EngineStore?.Instances?.at?.(-1)?.scenes?.at?.(-1)
    || null;
}

function hideOperatorV3(scene) {
  const hidden = [];
  for (const mesh of scene.meshes || []) {
    if (!String(mesh?.name || '').startsWith('operator-v3-')) continue;
    if (mesh.name === 'operator-v3-invisible') continue;
    const old = mesh.isVisible;
    mesh.isVisible = false;
    hidden.push([mesh,old]);
  }
  return () => {
    for (const [mesh,old] of hidden) {
      if (!mesh?.isDisposed?.()) mesh.isVisible = old;
    }
  };
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
  const v3Restorers = [];
  host.dataset.chesscomOperator = 'character-art-v4';
  host.dataset.chesscomCharacterMesh = 'custom-lowpoly-v4';
  host.dataset.chesscomCharacterMaterials = 'procedural-pbr-v4';
  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state,ui);
      const restoreV3 = hideOperatorV3(scene);
      v3Restorers.push(restoreV3);
      artV4.update(state);
    },
    destroy() {
      artV4.destroy();
      for (const restore of v3Restorers.reverse()) {
        try { restore(); } catch {}
      }
      delete host.dataset.chesscomCharacterMesh;
      delete host.dataset.chesscomCharacterMaterials;
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
