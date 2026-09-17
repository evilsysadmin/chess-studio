import * as THREE from 'three';

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
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    alphaTest: HOME_CASTLE_FOREGROUND_ALPHA_TEST,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
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
    },
  };
}
