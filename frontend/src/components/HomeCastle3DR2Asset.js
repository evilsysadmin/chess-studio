import { r2AssetUrl } from '../r2Assets.js';

export function homeCastleR2AssetUrl(logicalId, explicitUrl) {
  if (explicitUrl !== undefined) return typeof explicitUrl === 'string' ? explicitUrl : '';
  return r2AssetUrl(logicalId);
}

export async function loadHomeCastleR2Scene({ logicalId, loader, assetUrl } = {}) {
  const url = homeCastleR2AssetUrl(logicalId, assetUrl);
  if (!url || typeof loader?.load !== 'function') return null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      loader.load(
        url,
        (gltf) => {
          if (!gltf?.scene) {
            finish(null);
            return;
          }
          gltf.scene.updateMatrixWorld(true);
          finish(gltf.scene);
        },
        undefined,
        () => finish(null),
      );
    } catch {
      finish(null);
    }
  });
}
