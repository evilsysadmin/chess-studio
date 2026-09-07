import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';
import './WarRoomUserPolish.css';

export const WAR_ROOM_USER_POLISH_VERSION = 'room-balance-v24';

function finishGalleryCanvases(group) {
  let changed = 0;
  for (const index of [0, 1]) {
    const frame = group.getObjectByName?.(`war-room-premium-painting-${index}`);
    const canvas = frame?.getObjectByName?.('war-room-premium-painting-canvas');
    if (!canvas?.material) continue;

    canvas.material.color?.setHex?.(0xffffff);
    canvas.material.roughness = 0.62;
    canvas.material.clearcoat = Math.max(canvas.material.clearcoat ?? 0, 0.14);
    canvas.material.clearcoatRoughness = 0.48;
    canvas.material.specularIntensity = Math.max(canvas.material.specularIntensity ?? 0.18, 0.28);
    canvas.material.envMapIntensity = Math.max(canvas.material.envMapIntensity ?? 0.2, 0.36);
    canvas.material.needsUpdate = true;

    frame.userData.warRoomGalleryFinish = 'varnished-canvas-v20';
    changed += 1;
  }

  group.userData.warRoomLegacyLandscapeGeneratorRetired = true;
  group.userData.warRoomGalleryArtOwner = 'military-gallery';
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
  const galleryCount = finishGalleryCanvases(group);
  const braceCount = retireWallMonograms(group);
  group.userData.warRoomUserPolishVersion = WAR_ROOM_USER_POLISH_VERSION;
  group.userData.warRoomUserPolishLayoutWritesRetired = true;
  return fireplaceCount + galleryCount + braceCount;
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
