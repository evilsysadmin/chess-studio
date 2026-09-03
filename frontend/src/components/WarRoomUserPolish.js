import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';
import './WarRoomUserPolish.css';

export const WAR_ROOM_USER_POLISH_VERSION = 'room-balance-v24';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function softNoise(x, y) {
  return (
    Math.sin(x * 0.173 + y * 0.117)
    + Math.sin(x * 0.057 - y * 0.231 + 1.7)
    + Math.cos(x * 0.319 + y * 0.041 + 0.8)
  ) / 3;
}

function applyCanvasFinish(rgb, x, y, width, height) {
  const u = x / Math.max(1, width - 1);
  const v = y / Math.max(1, height - 1);
  const edge = Math.max(Math.abs(u - 0.5) * 2, Math.abs(v - 0.5) * 2);
  const vignette = Math.max(0.78, 1 - Math.max(0, edge - 0.55) * 0.22);
  const weave = ((x % 3 === 0 ? 1 : -0.25) + (y % 3 === 0 ? 1 : -0.25)) * 0.9;
  const grain = softNoise(x * 1.7, y * 1.55) * 3.4;
  return rgb.map((channel) => clampByte(channel * vignette + weave + grain));
}

function blackForestPixel(u, v, x, y) {
  const skyT = Math.min(1, v / 0.56);
  let r = 33 + skyT * 72;
  let g = 43 + skyT * 69;
  let b = 55 + skyT * 58;

  const cloud = Math.max(0, softNoise(x * 0.19, y * 0.12) - 0.18);
  r += cloud * 22;
  g += cloud * 20;
  b += cloud * 18;

  const farRidge = 0.43 + Math.sin(u * 8.6 + 0.4) * 0.035 + Math.sin(u * 21.5) * 0.016;
  const nearRidge = 0.52 + Math.sin(u * 10.2 + 1.1) * 0.045 + Math.sin(u * 31.4) * 0.018;
  if (v > farRidge) {
    const haze = Math.min(1, (v - farRidge) / 0.12);
    r = 58 - haze * 13;
    g = 70 - haze * 12;
    b = 67 - haze * 18;
  }
  if (v > nearRidge) {
    r = 29;
    g = 48;
    b = 39;
  }

  const treeWave = Math.abs(Math.sin(u * 96 + Math.sin(u * 17) * 2.2));
  const treeLine = 0.56 - treeWave * 0.055 - Math.abs(Math.sin(u * 43)) * 0.025;
  if (v > treeLine && v < 0.72) {
    const depth = Math.min(1, (v - treeLine) / 0.15);
    r = 22 + depth * 8;
    g = 42 + depth * 10;
    b = 32 + depth * 7;
  }

  if (v >= 0.70) {
    const waterT = Math.min(1, (v - 0.70) / 0.30);
    const ripple = Math.sin(y * 1.9 + x * 0.18) * 4.5 + Math.sin(y * 0.71 - x * 0.09) * 2.6;
    r = 32 + waterT * 8 + ripple;
    g = 49 + waterT * 7 + ripple;
    b = 52 + waterT * 9 + ripple * 0.75;
    const reflectedForest = Math.sin(x * 0.62 + y * 0.11) > 0.67 && v < 0.84;
    if (reflectedForest) { r -= 9; g -= 7; b -= 8; }
  }

  const dx = u - 0.57;
  const dy = v - 0.61;
  const clearing = Math.max(0, 1 - Math.sqrt(dx * dx * 8 + dy * dy * 20) * 7);
  r += clearing * 48;
  g += clearing * 32;
  b += clearing * 12;
  return [r, g, b];
}

function northSeaPixel(u, v, x, y) {
  const horizon = 0.55;
  const skyT = Math.min(1, v / horizon);
  let r = 34 + skyT * 73;
  let g = 43 + skyT * 75;
  let b = 57 + skyT * 80;

  const cloudBand = softNoise(x * 0.14, y * 0.09) + Math.sin(u * 13 + v * 4) * 0.2;
  if (v < horizon && cloudBand > 0.15) {
    const cloud = (cloudBand - 0.15) * 28;
    r += cloud;
    g += cloud;
    b += cloud * 0.9;
  }

  if (v >= horizon) {
    const seaT = (v - horizon) / (1 - horizon);
    const wave = Math.sin(y * 2.25 + x * 0.16) * 5.2 + Math.sin(y * 0.91 - x * 0.23) * 3.1;
    r = 28 + seaT * 8 + wave * 0.55;
    g = 49 + seaT * 10 + wave * 0.72;
    b = 62 + seaT * 12 + wave;
    const foam = Math.sin(y * 3.7 + x * 0.41) > 0.91 && seaT > 0.15;
    if (foam) { r += 38; g += 40; b += 37; }
  }

  const leftCliffEdge = 0.11 + Math.max(0, v - 0.47) * 0.62 + Math.sin(v * 31) * 0.012;
  const rightCliffEdge = 0.91 - Math.max(0, v - 0.58) * 0.28;
  if ((u < leftCliffEdge && v > 0.43) || (u > rightCliffEdge && v > 0.6)) {
    const rock = softNoise(x * 0.55, y * 0.47) * 13;
    r = 55 + rock;
    g = 54 + rock * 0.72;
    b = 50 + rock * 0.58;
    if (v > 0.73) { r -= 9; g -= 7; b -= 4; }
  }

  const dx = u - 0.69;
  const dy = v - 0.34;
  const glow = Math.max(0, 1 - Math.sqrt(dx * dx * 4.2 + dy * dy * 12) * 7.5);
  r += glow * 55;
  g += glow * 35;
  b += glow * 10;
  return [r, g, b];
}

function landscapeTexture(kind = 'forest') {
  const width = 384;
  const height = 240;
  const data = new Uint8Array(width * height * 4);
  const sea = kind === 'sea';

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      const raw = sea ? northSeaPixel(u, v, x, y) : blackForestPixel(u, v, x, y);
      const [r, g, b] = applyCanvasFinish(raw, x, y, width, height);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = sea ? 'war-room-gallery-north-sea-v20' : 'war-room-gallery-black-forest-v20';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.userData.resolution = [width, height];
  texture.userData.warRoomLandscape = sea ? 'north-sea-cliffs-v20' : 'black-forest-lake-dusk-v20';
  texture.userData.warRoomGalleryFinish = 'layered-canvas-v20';
  return texture;
}

function improveGallery(group) {
  let changed = 0;
  for (const [index, kind] of [[0, 'forest'], [1, 'sea']]) {
    const frame = group.getObjectByName?.(`war-room-premium-painting-${index}`);
    const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
    if (!canvas?.material || frame.userData.warRoomLandscapeVersion === 'v20') continue;
    const previous = canvas.material.map;
    canvas.material.map = landscapeTexture(kind);
    canvas.material.color?.setHex?.(0xffffff);
    canvas.material.roughness = 0.62;
    canvas.material.clearcoat = Math.max(canvas.material.clearcoat ?? 0, 0.14);
    canvas.material.clearcoatRoughness = 0.48;
    canvas.material.specularIntensity = Math.max(canvas.material.specularIntensity ?? 0.18, 0.28);
    canvas.material.envMapIntensity = Math.max(canvas.material.envMapIntensity ?? 0.2, 0.36);
    canvas.material.needsUpdate = true;
    previous?.dispose?.();
    frame.userData.warRoomLandscapeVersion = 'v20';
    frame.userData.warRoomLandscapeSubject = canvas.material.map.userData.warRoomLandscape;
    frame.userData.warRoomGalleryFinish = 'varnished-canvas-v20';
    changed += 1;
  }
  return changed;
}

function finishFireplace(group, towardBoard) {
  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (!fireplace || fireplace.userData.warRoomUserFireplaceFinish === 'v20') return 0;
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

  fireplace.userData.warRoomUserFireplaceFinish = 'v20';
  fireplace.userData.warRoomFirebrickPalette = 'red-black-sooted-v20';
  fireplace.userData.warRoomFirebrickBackFlush = true;
  return 1;
}

function retireWallMonograms(group) {
  let changed = 0;
  const retiredNames = new Set([
    'war-room-hammerbeam-brace',
    'war-room-armor-alcove-pointed-arch',
  ]);
  group.traverse?.((object) => {
    if (!retiredNames.has(object?.name)) return;
    object.visible = false;
    object.userData.warRoomBraceStyle = 'retired-no-monogram-v24';
    changed += 1;
  });
  group.userData.warRoomDiagonalMonogramsRetired = changed;
  group.userData.warRoomMonogramFree = true;
  return changed;
}

function applyFinalPass(group, options) {
  const fireplaceCount = finishFireplace(group, options.towardBoard);
  const landscapeCount = improveGallery(group);
  const braceCount = retireWallMonograms(group);
  group.userData.warRoomUserPolishVersion = WAR_ROOM_USER_POLISH_VERSION;
  group.userData.warRoomUserPolishLayoutWritesRetired = true;
  return fireplaceCount + landscapeCount + braceCount;
}

function registerUserPolishFinalizer(group, options) {
  const wallDriver = group.getObjectByName?.('war-room-castle-wall-left');
  const canvasDriver = group.getObjectByName?.('war-room-premium-painting-canvas');
  const registered = registerWarRoomDeferredFinalizer(group, {
    key: 'user-polish-v24',
    coarsePointer: options.coarsePointer,
    run: (root) => applyFinalPass(root || group, options),
  });
  if (!registered) return 0;

  if (wallDriver) wallDriver.userData.warRoomUserPolishWallDriver = true;
  if (canvasDriver) canvasDriver.userData.warRoomUserPolishCanvasDriver = true;
  group.userData.warRoomUserPolishDriverCount = Number(Boolean(wallDriver)) + Number(Boolean(canvasDriver));
  group.userData.warRoomUserPolishExecution = 'shared-deferred-finalizer-v2';
  return 1;
}

export function applyWarRoomUserPolish(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard) || coarsePointer) return 0;
  const options = { wallZ, towardBoard, coarsePointer: false };
  if (group.userData.warRoomUserPolishVersion === WAR_ROOM_USER_POLISH_VERSION) {
    registerUserPolishFinalizer(group, options);
    return 0;
  }

  const changed = applyFinalPass(group, options);
  registerUserPolishFinalizer(group, options);
  return changed;
}