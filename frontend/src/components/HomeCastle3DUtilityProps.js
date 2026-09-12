import * as THREE from 'three';
import { homeCastleDestinationPropScale } from './HomeCastle3DProps.js';

const DESTINATION_PROP_REFERENCE_ASPECT = 1.6;

export const HOME_CASTLE_UTILITY_PROP_ANCHORS = Object.freeze({
  pawnslug: Object.freeze({ x: 0.92, y: -0.31, z: 0.32 }),
  dungeon: Object.freeze({ x: 1.02, y: -0.47, z: 0.33 }),
});

export function homeCastleUtilityPropPositionScale(aspect, visibleWidthRatio = 1) {
  const numericAspect = Number(aspect);
  const numericVisibleRatio = Number(visibleWidthRatio);
  const aspectScale = Number.isFinite(numericAspect) && numericAspect > 0
    ? numericAspect / DESTINATION_PROP_REFERENCE_ASPECT
    : 1;
  const visibleScale = Number.isFinite(numericVisibleRatio) && numericVisibleRatio > 0
    ? numericVisibleRatio
    : 1;
  return THREE.MathUtils.clamp(Math.min(aspectScale, visibleScale), 0.34, 1);
}

function attachResponsivePlacement(group, driverMesh, baseScale, anchorX) {
  group.userData.baseScale = baseScale;
  group.userData.anchorX = anchorX;
  group.scale.setScalar(baseScale);
  driverMesh.onBeforeRender = (renderer, _scene, camera) => {
    const cameraWidth = Math.abs((camera?.right ?? 0) - (camera?.left ?? 0));
    const cameraHeight = Math.abs((camera?.top ?? 0) - (camera?.bottom ?? 0));
    const cameraAspect = cameraHeight > 0 ? cameraWidth / cameraHeight : DESTINATION_PROP_REFERENCE_ASPECT;
    const canvas = renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const canvasWidth = Math.max(1, canvasRect?.width || canvas?.clientWidth || 1);
    const view = canvas?.ownerDocument?.defaultView
      || (typeof window !== 'undefined' ? window : null);
    const viewportWidth = Math.max(1, view?.innerWidth || canvasWidth);
    const viewportHeight = Math.max(1, view?.innerHeight || (canvasWidth / cameraAspect));
    const visibleWidthRatio = Math.min(1, viewportWidth / canvasWidth);
    const viewportAspect = viewportWidth / viewportHeight;
    group.position.x = anchorX * homeCastleUtilityPropPositionScale(
      cameraAspect,
      visibleWidthRatio,
    );
    group.scale.setScalar(
      baseScale * homeCastleDestinationPropScale(viewportAspect, visibleWidthRatio),
    );
  };
}

function createPawnSlugFieldCrate(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-pawnslug';
  group.userData.destination = 'pawnslug';
  group.position.set(
    HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.x,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.y,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.z,
  );
  group.rotation.z = -0.025;

  const paintedWood = new THREE.MeshStandardMaterial({
    color: 0x806a3d,
    roughness: 0.84,
    metalness: 0.03,
    emissive: 0x2a1d08,
    emissiveIntensity: 0.07,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x777066,
    roughness: 0.62,
    metalness: 0.42,
    emissive: 0x2a241b,
    emissiveIntensity: 0.065,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xc79b51,
    roughness: 0.52,
    metalness: 0.48,
    emissive: 0x5a3208,
    emissiveIntensity: 0.12,
  });
  resources.materials.push(paintedWood, darkMetal, brass);

  const crateGeometry = new THREE.BoxGeometry(0.15, 0.082, 0.092);
  const bandGeometry = new THREE.BoxGeometry(0.014, 0.088, 0.098);
  const slatGeometry = new THREE.BoxGeometry(0.124, 0.009, 0.099);
  const shellGeometry = new THREE.CylinderGeometry(0.0085, 0.0085, 0.056, 12);
  resources.geometries.push(crateGeometry, bandGeometry, slatGeometry, shellGeometry);

  const crate = new THREE.Mesh(crateGeometry, paintedWood);
  crate.name = 'home-castle-pawnslug-crate';
  crate.position.y = 0.041;

  for (const x of [-0.054, 0.054]) {
    const band = new THREE.Mesh(bandGeometry, darkMetal);
    band.position.set(x, 0.043, 0);
    group.add(band);
  }

  for (const y of [0.021, 0.051, 0.076]) {
    const slat = new THREE.Mesh(slatGeometry, darkMetal);
    slat.position.set(0, y, 0.049);
    group.add(slat);
  }

  for (const [index, z] of [-0.019, 0.019].entries()) {
    const shell = new THREE.Mesh(shellGeometry, brass);
    shell.name = `home-castle-pawnslug-shell-${index + 1}`;
    shell.position.set(0.025 + (index * 0.024), 0.098, z);
    shell.rotation.z = Math.PI / 2;
    shell.rotation.y = index ? -0.1 : 0.12;
    group.add(shell);
  }

  group.add(crate);
  attachResponsivePlacement(
    group,
    crate,
    0.84,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.pawnslug.x,
  );
  return group;
}

function createDungeonLanternAndKey(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-dungeon';
  group.userData.destination = 'dungeon';
  group.position.set(
    HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.x,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.y,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.z,
  );
  group.rotation.z = 0.02;

  const iron = new THREE.MeshStandardMaterial({
    color: 0x69635a,
    roughness: 0.66,
    metalness: 0.46,
    emissive: 0x251b12,
    emissiveIntensity: 0.07,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xb98948,
    roughness: 0.54,
    metalness: 0.42,
    emissive: 0x542d08,
    emissiveIntensity: 0.11,
  });
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0xf4bf68,
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    emissive: 0xff9638,
    emissiveIntensity: 0.28,
  });
  resources.materials.push(iron, bronze, warmGlass);

  const baseGeometry = new THREE.CylinderGeometry(0.034, 0.04, 0.015, 16);
  const glassGeometry = new THREE.CylinderGeometry(0.027, 0.03, 0.076, 14);
  const capGeometry = new THREE.CylinderGeometry(0.031, 0.028, 0.015, 14);
  const barGeometry = new THREE.BoxGeometry(0.005, 0.086, 0.005);
  const handleGeometry = new THREE.TorusGeometry(0.034, 0.0045, 8, 20, Math.PI);
  const keyRingGeometry = new THREE.TorusGeometry(0.019, 0.004, 7, 18);
  const keyShaftGeometry = new THREE.BoxGeometry(0.008, 0.068, 0.008);
  const keyToothGeometry = new THREE.BoxGeometry(0.023, 0.008, 0.008);
  resources.geometries.push(
    baseGeometry,
    glassGeometry,
    capGeometry,
    barGeometry,
    handleGeometry,
    keyRingGeometry,
    keyShaftGeometry,
    keyToothGeometry,
  );

  const base = new THREE.Mesh(baseGeometry, iron);
  base.name = 'home-castle-dungeon-lantern';
  base.position.y = 0.0075;
  const glass = new THREE.Mesh(glassGeometry, warmGlass);
  glass.position.y = 0.052;
  const cap = new THREE.Mesh(capGeometry, iron);
  cap.position.y = 0.098;
  group.add(base, glass, cap);

  for (const x of [-0.026, 0.026]) {
    const bar = new THREE.Mesh(barGeometry, iron);
    bar.position.set(x, 0.054, 0);
    group.add(bar);
  }

  const handle = new THREE.Mesh(handleGeometry, iron);
  handle.position.y = 0.12;
  handle.rotation.z = Math.PI;
  group.add(handle);

  const key = new THREE.Group();
  key.name = 'home-castle-dungeon-key';
  key.position.set(-0.066, 0.03, 0.012);
  key.rotation.z = -0.56;
  const ring = new THREE.Mesh(keyRingGeometry, bronze);
  ring.position.y = 0.034;
  const shaft = new THREE.Mesh(keyShaftGeometry, bronze);
  shaft.position.y = -0.012;
  const toothA = new THREE.Mesh(keyToothGeometry, bronze);
  toothA.position.set(0.008, -0.047, 0);
  const toothB = new THREE.Mesh(keyToothGeometry, bronze);
  toothB.position.set(0.013, -0.058, 0);
  toothB.scale.x = 0.65;
  key.add(ring, shaft, toothA, toothB);
  group.add(key);

  attachResponsivePlacement(
    group,
    base,
    0.88,
    HOME_CASTLE_UTILITY_PROP_ANCHORS.dungeon.x,
  );
  return group;
}

export function createHomeCastleUtilityDestinationProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-utility-destination-props';
  const resources = { geometries: [], materials: [] };
  const pawnslug = createPawnSlugFieldCrate(resources);
  const dungeon = createDungeonLanternAndKey(resources);
  group.add(pawnslug, dungeon);

  return {
    group,
    pawnslug,
    dungeon,
    dispose() {
      for (const geometry of resources.geometries) geometry.dispose();
      for (const material of resources.materials) material.dispose();
    },
  };
}
