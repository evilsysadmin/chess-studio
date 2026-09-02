import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_TEXTILE_FINISH_VERSION = 'microfinish-v1';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hashNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 31.177) * 0.917) * 43758.5453;
  return value - Math.floor(value);
}

function createMicroTexture(kind) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const config = {
    leather: { seed: 11, repeat: [7, 7] },
    velvet: { seed: 23, repeat: [8, 13] },
    wool: { seed: 37, repeat: [10, 10] },
  }[kind];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = hashNoise(x, y, config.seed);
      let value;

      if (kind === 'leather') {
        const pore = Math.sin(x * 1.71 + y * 0.83) * 5.5 + Math.cos(y * 1.29 - x * 0.41) * 3.2;
        const broad = Math.sin((x + y) * 0.19) * 4.0;
        value = 232 + pore + broad + (noise - 0.5) * 14;
      } else if (kind === 'velvet') {
        const nap = Math.abs(Math.sin(x * Math.PI / 3.7)) * 13;
        const foldGrain = Math.sin(y * 0.57 + x * 0.09) * 3.5;
        value = 226 + nap + foldGrain + (noise - 0.5) * 8;
      } else {
        const warp = (x % 4 < 2 ? 1 : -1) * 5.5;
        const weft = (y % 4 < 2 ? 1 : -1) * 5.5;
        const diagonal = Math.sin((x + y) * 1.06) * 2.5;
        value = 239 + warp + weft + diagonal + (noise - 0.5) * 7;
      }

      const byte = clampByte(value);
      const index = (y * size + x) * 4;
      data[index] = byte;
      data[index + 1] = byte;
      data[index + 2] = byte;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `war-room-${kind}-microtexture`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...config.repeat);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomTextileKind = kind;
  texture.userData.warRoomTextileResolution = [size, size];
  texture.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  return texture;
}

function tuneMaterial(material, texture, kind, { bumpScale, roughnessFloor }) {
  if (!material || material.userData?.warRoomTextileFinish === WAR_ROOM_TEXTILE_FINISH_VERSION) return false;
  material.roughnessMap = texture;
  material.bumpMap = texture;
  material.bumpScale = bumpScale;
  if (typeof material.roughness === 'number') material.roughness = Math.max(material.roughness, roughnessFloor);
  material.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  material.userData.warRoomTextileKind = kind;
  material.needsUpdate = true;
  return true;
}

export function applyWarRoomTextileFinish(root) {
  if (!root || root.userData?.warRoomTextileFinish === WAR_ROOM_TEXTILE_FINISH_VERSION) return 0;

  const leatherTexture = createMicroTexture('leather');
  const velvetTexture = createMicroTexture('velvet');
  const woolTexture = createMicroTexture('wool');
  let leatherMaterials = 0;
  let velvetMaterials = 0;
  let woolMaterials = 0;

  for (const sofaName of ['war-room-sofa-left', 'war-room-sofa-right']) {
    const sofa = root.getObjectByName?.(sofaName);
    if (!sofa) continue;
    const seen = new Set();
    sofa.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        const leatherLike = (material.metalness ?? 0) < 0.25 && (material.sheen ?? 0) >= 0.3;
        if (!leatherLike) continue;
        if (tuneMaterial(material, leatherTexture, 'leather', { bumpScale: 0.008, roughnessFloor: 0.46 })) leatherMaterials += 1;
      }
    });
  }

  const curtainMaterials = new Set();
  root.traverse?.((child) => {
    if (!child?.name?.includes?.('war-room-velvet-curtain-fold')) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || curtainMaterials.has(material)) continue;
      curtainMaterials.add(material);
      if (tuneMaterial(material, velvetTexture, 'velvet', { bumpScale: 0.006, roughnessFloor: 0.9 })) velvetMaterials += 1;
    }
  });

  for (const carpetName of ['war-room-command-carpet-bed', 'war-room-command-carpet-inner-field']) {
    const carpet = root.getObjectByName?.(carpetName);
    const materials = Array.isArray(carpet?.material) ? carpet.material : [carpet?.material];
    for (const material of materials) {
      if (!material) continue;
      if (tuneMaterial(material, woolTexture, 'wool', { bumpScale: 0.009, roughnessFloor: 0.94 })) woolMaterials += 1;
    }
  }

  const tuned = leatherMaterials + velvetMaterials + woolMaterials;
  if (!root.userData) root.userData = {};
  root.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  root.userData.warRoomTextileFinishStats = {
    tuned,
    leatherMaterials,
    velvetMaterials,
    woolMaterials,
    textureCount: 3,
    textureResolution: 64,
  };
  return tuned;
}

export function installWarRoomTextileFinish(group, { coarsePointer = false } = {}) {
  if (!group || coarsePointer) return 0;
  const markerDriver = group.getObjectByName?.('war-room-castle-wall-left')
    || group.getObjectByName?.('war-room-castle-floor-slab');
  if (!markerDriver || markerDriver.userData.warRoomTextileFinishDriver) return 0;

  const registered = registerWarRoomDeferredFinalizer(group, {
    key: 'textile-finish-v1',
    coarsePointer,
    run: (root) => applyWarRoomTextileFinish(root),
  });
  if (!registered) return 0;

  markerDriver.userData.warRoomTextileFinishDriver = WAR_ROOM_TEXTILE_FINISH_VERSION;
  group.userData.warRoomTextileFinishDriver = WAR_ROOM_TEXTILE_FINISH_VERSION;
  return 1;
}
