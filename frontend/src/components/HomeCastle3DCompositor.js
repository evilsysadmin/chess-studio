import * as THREE from 'three';
import {
  HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE,
  restoreHomeCastleOriginalUvs,
} from './HomeCastle3DCleanPatches.js';

export const HOME_CASTLE_FOREGROUND_RENDER_ORDER = 3;
export const HOME_CASTLE_FOREGROUND_ALPHA_TEST = 0.01;

export function homeCastleCompositionReady({
  backgroundReady = false,
  foregroundRequired = false,
  foregroundReady = false,
} = {}) {
  return Boolean(backgroundReady && (!foregroundRequired || foregroundReady));
}

export function prepareHomeCastleSceneTexture(texture) {
  if (!texture) return texture;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function createHomeCastleForegroundLayer(geometry) {
  const hasBackgroundUvPatch = Boolean(
    geometry?.getAttribute?.(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE),
  );
  const foregroundGeometry = hasBackgroundUvPatch ? geometry.clone() : geometry;
  if (hasBackgroundUvPatch) restoreHomeCastleOriginalUvs(foregroundGeometry);

  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    alphaTest: HOME_CASTLE_FOREGROUND_ALPHA_TEST,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(foregroundGeometry, material);
  mesh.name = 'home-castle-foreground-matte';
  mesh.scale.setScalar(1.018);
  mesh.renderOrder = HOME_CASTLE_FOREGROUND_RENDER_ORDER;
  mesh.visible = false;

  return {
    mesh,
    material,
    setTexture(texture) {
      prepareHomeCastleSceneTexture(texture);
      material.map = texture;
      material.needsUpdate = true;
      mesh.visible = Boolean(texture);
    },
    dispose() {
      material.map?.dispose();
      material.map = null;
      material.dispose();
      if (hasBackgroundUvPatch) foregroundGeometry.dispose();
    },
  };
}
