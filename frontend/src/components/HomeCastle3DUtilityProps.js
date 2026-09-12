import * as THREE from 'three';
import { homeCastleDestinationPropScale } from './HomeCastle3DProps.js';

export const HOME_CASTLE_UTILITY_PROP_ANCHORS = Object.freeze({
  pawnslug: Object.freeze({ x: 0.92, y: -0.36, z: 0.32 }),
  dungeon: Object.freeze({ x: 0.72, y: -0.56, z: 0.33 }),
});

function attachViewportScale(group, driverMesh, baseScale) {
  group.userData.baseScale = baseScale;
  group.scale.setScalar(baseScale);
  driverMesh.onBeforeRender = (renderer, _scene, camera) => {
    const cameraWidth = Math.abs((camera?.right ?? 0) - (camera?.left ?? 0));
    const cameraHeight = Math.abs((camera?.top ?? 0) - (camera?.bottom ?? 0));
    const cameraAspect = cameraHeight > 0 ? cameraWidth / cameraHeight : 1.6;
    const canvas = renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const canvasWidth = Math.max(1, canvasRect?.width || canvas?.clientWidth || 1);
    const view = canvas?.ownerDocument?.defaultView
      || (typeof window !== 'undefined' ? window : null);
    const viewportWidth = Math.max(1, view?.innerWidth || canvasWidth);
    const viewportHeight = Math.max(1, view?.innerHeight || (canvasWidth / cameraAspect));
    const visibleWidthRatio = Math.min(1, viewportWidth / canvasWidth);
    group.scale.setScalar(
      baseScale * homeCastleDestinationPropScale(viewportWidth / viewportHeight, visibleWidthRatio),
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
  group.rotation.z = -0.035;

  const paintedWood = new THREE.MeshStandardMaterial({
    color: 0x615532,
    roughness: 0.86,
    metalness: 0.03,
    emissive: 0x171205,
    emissiveIntensity: 0.035,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x55524a,
    roughness: 0.66,
    metalness: 0.44,
    emissive: 0x16130d,
    emissiveIntensity: 0.04,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb98b45,
    roughness: 0.55,
    metalness: 0.5,
    emissive: 0x3b2208,
    emissiveIntensity: 0.075,
  });
  resources.materials.push(paintedWood, darkMetal, brass);

  const crateGeometry = new THREE.BoxGeometry(0.145, 0.078, 0.09);
  const bandGeometry = new THREE.BoxGeometry(0.014, 0.084, 0.096);
  const slatGeometry = new THREE.BoxGeometry(0.12, 0.009, 0.097);
  const shellGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.052, 12);
  resources.geometries.push(crateGeometry, bandGeometry, slatGeometry, shellGeometry);

  const crate = new THREE.Mesh(crateGeometry, paintedWood);
  crate.name = 'home-castle-pawnslug-crate';
  crate.position.y = 0.039;

  for (const x of [-0.052, 0.052]) {
    const band = new THREE.Mesh(bandGeometry, darkMetal);
    band.position.set(x, 0.041, 0);
    group.add(band);
  }

  for (const y of [0.02, 0.049, 0.072]) {
    const slat = new THREE.Mesh(slatGeometry, darkMetal);
    slat.position.set(0, y, 0.047);
    group.add(slat);
  }

  for (const [index, z] of [-0.018, 0.018].entries()) {
    const shell = new THREE.Mesh(shellGeometry, brass);
    shell.name = `home-castle-pawnslug-shell-${index + 1}`;
    shell.position.set(0.025 + (index * 0.023), 0.092, z);
    shell.rotation.z = Math.PI / 2;
    shell.rotation.y = index ? -0.1 : 0.12;
    group.add(shell);
  }

  group.add(crate);
  attachViewportScale(group, crate, 0.7);
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
  group.rotation.z = 0.025;

  const iron = new THREE.MeshStandardMaterial({
    color: 0x4e4a42,
    roughness: 0.7,
    metalness: 0.48,
    emissive: 0x17120d,
    emissiveIntensity: 0.045,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xa8793f,
    roughness: 0.58,
    metalness: 0.44,
    emissive: 0x3a2108,
    emissiveIntensity: 0.07,
  });
  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0xf0b65e,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    emissive: 0xff8c32,
    emissiveIntensity: 0.18,
  });
  resources.materials.push(iron, bronze, warmGlass);

  const baseGeometry = new THREE.CylinderGeometry(0.032, 0.038, 0.014, 16);
  const glassGeometry = new THREE.CylinderGeometry(0.025, 0.028, 0.07, 14);
  const capGeometry = new THREE.CylinderGeometry(0.029, 0.026, 0.014, 14);
  const barGeometry = new THREE.BoxGeometry(0.005, 0.08, 0.005);
  const handleGeometry = new THREE.TorusGeometry(0.032, 0.004, 8, 20, Math.PI);
  const keyRingGeometry = new THREE.TorusGeometry(0.018, 0.004, 7, 18);
  const keyShaftGeometry = new THREE.BoxGeometry(0.008, 0.065, 0.008);
  const keyToothGeometry = new THREE.BoxGeometry(0.022, 0.008, 0.008);
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
  base.position.y = 0.007;
  const glass = new THREE.Mesh(glassGeometry, warmGlass);
  glass.position.y = 0.048;
  const cap = new THREE.Mesh(capGeometry, iron);
  cap.position.y = 0.09;
  group.add(base, glass, cap);

  for (const x of [-0.024, 0.024]) {
    const bar = new THREE.Mesh(barGeometry, iron);
    bar.position.set(x, 0.05, 0);
    group.add(bar);
  }

  const handle = new THREE.Mesh(handleGeometry, iron);
  handle.position.y = 0.11;
  handle.rotation.z = Math.PI;
  group.add(handle);

  const key = new THREE.Group();
  key.name = 'home-castle-dungeon-key';
  key.position.set(-0.062, 0.025, 0.01);
  key.rotation.z = -0.58;
  const ring = new THREE.Mesh(keyRingGeometry, bronze);
  ring.position.y = 0.032;
  const shaft = new THREE.Mesh(keyShaftGeometry, bronze);
  shaft.position.y = -0.012;
  const toothA = new THREE.Mesh(keyToothGeometry, bronze);
  toothA.position.set(0.008, -0.045, 0);
  const toothB = new THREE.Mesh(keyToothGeometry, bronze);
  toothB.position.set(0.013, -0.055, 0);
  toothB.scale.x = 0.65;
  key.add(ring, shaft, toothA, toothB);
  group.add(key);

  attachViewportScale(group, base, 0.72);
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
