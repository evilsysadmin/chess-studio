import * as THREE from 'three';
import './WarRoomUserPolish.css';

export const WAR_ROOM_USER_POLISH_VERSION = 'room-balance-v16';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function landscapeTexture(kind = 'rhine') {
  const width = 256;
  const height = 160;
  const data = new Uint8Array(width * height * 4);
  const alpine = kind === 'alpine';

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const grain = Math.sin(x * 0.31 + y * 0.17) * 3 + Math.cos(x * 0.07 - y * 0.23) * 2;
      let r;
      let g;
      let b;

      if (alpine) {
        const sky = Math.min(1, v / 0.62);
        r = 25 + sky * 72;
        g = 34 + sky * 75;
        b = 50 + sky * 74;
        const ridge = 0.54 + Math.sin(u * 8.4) * 0.055 + Math.sin(u * 19.2 + 1.1) * 0.025;
        const snow = ridge - 0.055;
        if (v > snow) { r = 156 + grain; g = 158 + grain; b = 153 + grain; }
        if (v > ridge) { r = 49 + grain; g = 58 + grain; b = 57 + grain; }
        if (v > 0.73) { r = 29 + grain; g = 43 + grain; b = 41 + grain; }
        if (v > 0.83) {
          const reflection = Math.sin((u * 18 + v * 31) * Math.PI) * 4;
          r = 35 + reflection; g = 49 + reflection; b = 52 + reflection;
        }
      } else {
        const sky = Math.min(1, v / 0.58);
        r = 35 + sky * 132;
        g = 43 + sky * 81;
        b = 58 + sky * 39;
        const farHill = 0.5 + Math.sin(u * 7.2 + 0.6) * 0.045 + Math.sin(u * 15.8) * 0.018;
        if (v > farHill) { r = 48 + grain; g = 58 + grain; b = 44 + grain; }
        if (v > 0.69) { r = 35 + grain; g = 48 + grain; b = 40 + grain; }
        if (v > 0.78) {
          const river = Math.abs(u - 0.48) < (v - 0.73) * 1.48 + 0.045;
          if (river) {
            const glint = Math.sin((x + y) * 0.22) * 5;
            r = 72 + glint; g = 70 + glint; b = 61 + glint;
          }
        }
      }

      const index = (y * width + x) * 4;
      data[index] = clampByte(r);
      data[index + 1] = clampByte(g);
      data[index + 2] = clampByte(b);
      data[index + 3] = 255;
    }
  }

  const castleX = alpine ? 158 : 169;
  const castleY = alpine ? 82 : 71;
  const castleW = alpine ? 42 : 48;
  for (let y = castleY; y < castleY + 25; y += 1) {
    for (let x = castleX; x < castleX + castleW; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const p = (y * width + x) * 4;
      const edge = x < castleX + 4 || x > castleX + castleW - 5 || y < castleY + 4;
      data[p] = edge ? 89 : 112;
      data[p + 1] = edge ? 82 : 101;
      data[p + 2] = edge ? 72 : 87;
    }
  }
  for (const towerX of [castleX + 4, castleX + castleW - 12]) {
    for (let y = castleY - 15; y < castleY + 23; y += 1) {
      for (let x = towerX; x < towerX + 8; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const p = (y * width + x) * 4;
        data[p] = 121; data[p + 1] = 109; data[p + 2] = 91;
      }
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = alpine ? 'war-room-gallery-alpine-landscape-v16' : 'war-room-gallery-rhine-landscape-v16';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.resolution = [width, height];
  texture.userData.warRoomLandscape = alpine ? 'alpine-lake-fortress-v16' : 'rhine-valley-castle-v16';
  return texture;
}

function improveGallery(group) {
  let changed = 0;
  for (const [index, kind] of [[0, 'rhine'], [1, 'alpine']]) {
    const frame = group.getObjectByName?.(`war-room-premium-painting-${index}`);
    const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
    if (!canvas?.material || frame.userData.warRoomLandscapeVersion === 'v16') continue;
    const previous = canvas.material.map;
    canvas.material.map = landscapeTexture(kind);
    canvas.material.color?.setHex?.(0xffffff);
    canvas.material.roughness = Math.max(canvas.material.roughness ?? 0.8, 0.86);
    canvas.material.needsUpdate = true;
    previous?.dispose?.();
    frame.userData.warRoomLandscapeVersion = 'v16';
    frame.userData.warRoomLandscapeSubject = canvas.material.map.userData.warRoomLandscape;
    changed += 1;
  }
  return changed;
}

function separateFurniture(group, { wallZ, towardBoard }) {
  const sofaOffset = 9.15;
  const consoleOffset = 0.82;

  for (const [name, side] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = group.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(side * 6.62, 0.02, wallZ + towardBoard * sofaOffset);
    sofa.userData.warRoomOffsetFromWall = sofaOffset;
    sofa.userData.warRoomFurniturePlacement = 'wide-club-separation-v16';
  }

  for (const name of ['war-room-side-console-left', 'war-room-side-console-right']) {
    const table = group.getObjectByName?.(name);
    if (!table) continue;
    table.position.z = wallZ + towardBoard * consoleOffset;
    table.userData.warRoomOffsetFromWall = consoleOffset;
    table.userData.warRoomFurniturePlacement = 'rear-campaign-table-v16';
  }

  group.userData.warRoomFurnitureGap = sofaOffset - consoleOffset;
}

function placeArmor(group, { wallZ, towardBoard }) {
  let count = 0;
  for (const [name, side] of [
    ['war-room-teutonic-armor-left', -1],
    ['war-room-teutonic-armor-right', 1],
  ]) {
    const armor = group.getObjectByName?.(name);
    if (!armor) continue;
    armor.position.set(side * 7.03, 0, wallZ + towardBoard * 3.45);
    armor.rotation.y = -side * towardBoard * 0.72;
    armor.userData.warRoomArmorPlacement = 'floor-sentry-facing-board-v16';
    armor.userData.facesWarTable = true;
    count += 1;
  }
  group.userData.warRoomArmorComposition = 'floor-sentries-facing-board-v16';
  return count;
}

function finishFireplace(group, towardBoard) {
  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (!fireplace || fireplace.userData.warRoomUserFireplaceFinish === 'v16') return 0;
  const back = fireplace.getObjectByName?.('war-room-fireplace-refractory-back');
  const hearth = fireplace.getObjectByName?.('war-room-fireplace-refractory-hearth');
  const left = fireplace.getObjectByName?.('war-room-fireplace-refractory-return-left');
  const right = fireplace.getObjectByName?.('war-room-fireplace-refractory-return-right');
  if (!back && !hearth && !left && !right) return 0;

  if (back) back.position.z = towardBoard * 0.018;
  if (hearth) hearth.position.z = towardBoard * 0.20;
  if (left) left.position.z = towardBoard * 0.18;
  if (right) right.position.z = towardBoard * 0.18;

  const seen = new Set();
  for (const mesh of [back, hearth, left, right]) {
    const material = mesh?.material;
    if (!material || seen.has(material)) continue;
    seen.add(material);
    material.color?.setHex?.(0x8f5548);
    material.emissive?.setHex?.(0x210604);
    material.emissiveIntensity = 0.065;
    material.roughness = 0.97;
    material.clearcoat = Math.min(material.clearcoat ?? 0.01, 0.008);
    material.needsUpdate = true;
  }

  fireplace.userData.warRoomUserFireplaceFinish = 'v16';
  fireplace.userData.warRoomFirebrickPalette = 'red-black-sooted-v16';
  fireplace.userData.warRoomFirebrickBackFlush = true;
  return 1;
}

function retireWallMonograms(group) {
  let changed = 0;
  group.traverse?.((object) => {
    if (object?.name !== 'war-room-hammerbeam-brace') return;
    object.rotation.z = 0;
    object.scale.x = Math.min(object.scale.x, 0.68);
    object.position.y = Math.max(object.position.y, 5.08);
    object.userData.warRoomBraceStyle = 'horizontal-hammerbeam-v16';
    changed += 1;
  });
  group.userData.warRoomDiagonalMonogramsRetired = changed;
  return changed;
}

function applyFinalPass(group, options) {
  separateFurniture(group, options);
  const armorCount = placeArmor(group, options);
  const fireplaceCount = finishFireplace(group, options.towardBoard);
  const landscapeCount = improveGallery(group);
  const braceCount = retireWallMonograms(group);
  group.userData.warRoomUserPolishVersion = WAR_ROOM_USER_POLISH_VERSION;
  return armorCount + fireplaceCount + landscapeCount + braceCount;
}

function attachFinalDriver(driver, owner, options, key) {
  if (!driver || driver.userData[key]) return false;
  driver.userData[key] = true;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    const root = sceneRoot(driver);
    applyFinalPass(root || owner, options);
  };
  return true;
}

function attachUserPolishDrivers(group, options) {
  const wallDriver = group.getObjectByName?.('war-room-castle-wall-left');
  const canvasDriver = group.getObjectByName?.('war-room-premium-painting-canvas');
  let attached = 0;
  if (attachFinalDriver(wallDriver, group, options, 'warRoomUserPolishWallDriver')) attached += 1;
  if (attachFinalDriver(canvasDriver, group, options, 'warRoomUserPolishCanvasDriver')) attached += 1;
  group.userData.warRoomUserPolishDriverCount = attached;
  return attached;
}

export function applyWarRoomUserPolish(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard) || coarsePointer) return 0;
  const options = { wallZ, towardBoard, coarsePointer: false };
  if (group.userData.warRoomUserPolishVersion === WAR_ROOM_USER_POLISH_VERSION) {
    attachUserPolishDrivers(group, options);
    return 0;
  }

  const changed = applyFinalPass(group, options);
  attachUserPolishDrivers(group, options);
  return changed;
}
