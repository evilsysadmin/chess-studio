import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_TEXTILE_FINISH_VERSION = 'surface-microfinish-v4';

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
    limestone: { seed: 41, repeat: [9, 7] },
    walnut: { seed: 53, repeat: [5, 12] },
    ashlar: { seed: 67, repeat: [16, 22] },
    'forged-metal': { seed: 79, repeat: [22, 9] },
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
      } else if (kind === 'wool') {
        const warp = (x % 4 < 2 ? 1 : -1) * 5.5;
        const weft = (y % 4 < 2 ? 1 : -1) * 5.5;
        const diagonal = Math.sin((x + y) * 1.06) * 2.5;
        value = 239 + warp + weft + diagonal + (noise - 0.5) * 7;
      } else if (kind === 'limestone') {
        const bed = Math.sin(y * 0.17 + Math.sin(x * 0.08) * 1.35) * 4.4;
        const mineral = Math.cos(x * 0.31 + y * 0.09) * 2.7;
        const pore = noise > 0.93 ? -17 : 0;
        value = 228 + bed + mineral + pore + (noise - 0.5) * 12;
      } else if (kind === 'walnut') {
        const grain = Math.sin(x * 0.39 + Math.sin(y * 0.115) * 1.7) * 7.8;
        const ribbon = Math.sin(x * 0.13 + y * 0.035) * 3.4;
        const pores = Math.cos(x * 1.47 - y * 0.21) * 1.8;
        value = 224 + grain + ribbon + pores + (noise - 0.5) * 7;
      } else if (kind === 'ashlar') {
        const mineral = Math.sin(x * 0.53 + y * 0.17) * 3.6 + Math.cos(y * 0.71 - x * 0.09) * 2.8;
        const fleck = noise > 0.955 ? -14 : (noise < 0.035 ? 9 : 0);
        value = 229 + mineral + fleck + (noise - 0.5) * 10;
      } else {
        const brushing = Math.sin(x * 1.84 + Math.sin(y * 0.11) * 0.9) * 5.2;
        const longScratch = Math.sin(x * 0.19 + y * 0.025) * 2.8;
        const nick = noise > 0.968 ? -20 : (noise < 0.022 ? 11 : 0);
        value = 225 + brushing + longScratch + nick + (noise - 0.5) * 8;
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
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.userData.warRoomTextileKind = kind;
  texture.userData.warRoomTextileResolution = [size, size];
  texture.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  texture.userData.warRoomSurfaceKind = kind;
  texture.userData.warRoomSurfaceResolution = [size, size];
  texture.userData.warRoomSurfaceFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  return texture;
}

function tuneMaterial(material, texture, kind, { bumpScale, roughnessFloor, preserveBump = false }) {
  if (!material || material.userData?.warRoomTextileFinish === WAR_ROOM_TEXTILE_FINISH_VERSION) return false;
  material.roughnessMap = texture;
  if (!preserveBump) {
    material.bumpMap = texture;
    material.bumpScale = bumpScale;
  }
  if (typeof material.roughness === 'number') material.roughness = Math.max(material.roughness, roughnessFloor);
  material.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  material.userData.warRoomTextileKind = kind;
  material.userData.warRoomSurfaceFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  material.userData.warRoomSurfaceKind = kind;
  material.needsUpdate = true;
  return true;
}

export function applyWarRoomTextileFinish(root) {
  if (!root || root.userData?.warRoomTextileFinish === WAR_ROOM_TEXTILE_FINISH_VERSION) return 0;

  const leatherTexture = createMicroTexture('leather');
  const velvetTexture = createMicroTexture('velvet');
  const woolTexture = createMicroTexture('wool');
  const limestoneTexture = createMicroTexture('limestone');
  const walnutTexture = createMicroTexture('walnut');
  const ashlarTexture = createMicroTexture('ashlar');
  const forgedMetalTexture = createMicroTexture('forged-metal');
  let leatherMaterials = 0;
  let velvetMaterials = 0;
  let woolMaterials = 0;
  let limestoneMaterials = 0;
  let walnutMaterials = 0;
  let ashlarMaterials = 0;
  let metalMaterials = 0;

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

  const floor = root.getObjectByName?.('war-room-castle-floor-slab');
  const floorMaterials = Array.isArray(floor?.material) ? floor.material : [floor?.material];
  for (const material of floorMaterials) {
    if (!material) continue;
    if (tuneMaterial(material, limestoneTexture, 'limestone', { bumpScale: 0.011, roughnessFloor: 0.62 })) limestoneMaterials += 1;
  }

  const walnutSeen = new Set();
  for (const consoleName of ['war-room-side-console-left', 'war-room-side-console-right']) {
    const consoleGroup = root.getObjectByName?.(consoleName);
    if (!consoleGroup) continue;
    for (const child of consoleGroup.children || []) {
      if (!child?.isMesh) continue;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || walnutSeen.has(material) || (material.metalness ?? 0) >= 0.25) continue;
        walnutSeen.add(material);
        if (tuneMaterial(material, walnutTexture, 'walnut', { bumpScale: 0.006, roughnessFloor: 0.58 })) walnutMaterials += 1;
      }
    }
  }

  const metalSeen = new Set();
  for (const consoleName of ['war-room-side-console-left', 'war-room-side-console-right']) {
    const consoleGroup = root.getObjectByName?.(consoleName);
    if (!consoleGroup) continue;
    for (const child of consoleGroup.children || []) {
      if (!child?.isMesh) continue;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || metalSeen.has(material) || (material.metalness ?? 0) < 0.55) continue;
        metalSeen.add(material);
        if (tuneMaterial(material, forgedMetalTexture, 'forged-metal', {
          bumpScale: 0,
          roughnessFloor: 0.3,
          preserveBump: true,
        })) metalMaterials += 1;
      }
    }
  }

  for (const armorName of [
    'war-room-armor-guard-left',
    'war-room-armor-guard-right',
    'war-room-teutonic-armor-left',
    'war-room-teutonic-armor-right',
  ]) {
    const armor = root.getObjectByName?.(armorName);
    if (!armor) continue;
    armor.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || metalSeen.has(material) || (material.metalness ?? 0) < 0.55) continue;
        metalSeen.add(material);
        if (tuneMaterial(material, forgedMetalTexture, 'forged-metal', {
          bumpScale: 0,
          roughnessFloor: 0.3,
          preserveBump: true,
        })) metalMaterials += 1;
      }
    });
  }

  const wallSeen = new Set();
  for (const wallName of ['war-room-castle-wall-left', 'war-room-castle-wall-right']) {
    const wall = root.getObjectByName?.(wallName);
    const materials = Array.isArray(wall?.material) ? wall.material : [wall?.material];
    for (const material of materials) {
      if (!material || wallSeen.has(material)) continue;
      wallSeen.add(material);
      const existingBumpMap = material.bumpMap;
      const existingBumpScale = material.bumpScale;
      if (tuneMaterial(material, ashlarTexture, 'ashlar', {
        bumpScale: 0,
        roughnessFloor: 0.84,
        preserveBump: true,
      })) {
        material.bumpMap = existingBumpMap;
        material.bumpScale = existingBumpScale;
        ashlarMaterials += 1;
      }
    }
  }

  const tuned = leatherMaterials + velvetMaterials + woolMaterials + limestoneMaterials + walnutMaterials + ashlarMaterials + metalMaterials;
  if (!root.userData) root.userData = {};
  root.userData.warRoomTextileFinish = WAR_ROOM_TEXTILE_FINISH_VERSION;
  root.userData.warRoomTextileFinishStats = {
    tuned,
    leatherMaterials,
    velvetMaterials,
    woolMaterials,
    limestoneMaterials,
    walnutMaterials,
    ashlarMaterials,
    metalMaterials,
    textureCount: 7,
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
    key: 'surface-microfinish-v4',
    coarsePointer,
    run: (root) => applyWarRoomTextileFinish(root),
  });
  if (!registered) return 0;

  markerDriver.userData.warRoomTextileFinishDriver = WAR_ROOM_TEXTILE_FINISH_VERSION;
  group.userData.warRoomTextileFinishDriver = WAR_ROOM_TEXTILE_FINISH_VERSION;
  return 1;
}
