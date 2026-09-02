import * as THREE from 'three';

export const WAR_ROOM_APPROVED_MOCK_VERSION = 'approved-mock-v25';

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function placeFurniture(root, { wallZ, towardBoard }) {
  const tableOffset = 3.30;
  const armorOffset = 8.35;
  let changed = 0;

  for (const [name, side] of [
    ['war-room-side-console-left', -1],
    ['war-room-side-console-right', 1],
  ]) {
    const table = root.getObjectByName?.(name);
    if (!table) continue;
    table.position.x = side * 6.58;
    table.position.z = wallZ + towardBoard * tableOffset;
    table.userData.warRoomOffsetFromWall = tableOffset;
    table.userData.warRoomFurniturePlacement = 'approved-mock-rear-table-v25';
    changed += 1;
  }

  for (const [name, side] of [
    ['war-room-teutonic-armor-left', -1],
    ['war-room-teutonic-armor-right', 1],
  ]) {
    const armor = root.getObjectByName?.(name);
    if (!armor) continue;
    armor.position.set(side * 6.05, 0, wallZ + towardBoard * armorOffset);
    armor.rotation.y = -side * towardBoard * 0.78;
    armor.userData.warRoomOffsetFromWall = armorOffset;
    armor.userData.warRoomArmorPlacement = 'approved-mock-lower-sentry-v25';
    armor.userData.facesWarTable = true;
    changed += 1;
  }

  root.userData.warRoomApprovedMockFurnitureOrder = 'tables-rear-armors-lower-sofas-front-v25';
  root.userData.warRoomApprovedMockTableOffset = tableOffset;
  root.userData.warRoomApprovedMockArmorOffset = armorOffset;
  return changed;
}

const WALL_CLUTTER_NAMES = new Set([
  'war-room-armor-alcove-left',
  'war-room-armor-alcove-right',
  'war-room-gallery-picture-rail',
  'war-room-gallery-picture-rail-brass-line',
  'war-room-hammerbeam-side-tie',
  'war-room-hammerbeam-corbel',
  'war-room-hammerbeam-brace',
  'war-room-armor-alcove-pointed-arch',
]);

function retireWallClutter(root) {
  let retired = 0;
  root.traverse?.((object) => {
    if (!WALL_CLUTTER_NAMES.has(object?.name)) return;
    if (object.visible !== false) retired += 1;
    object.visible = false;
    object.userData.warRoomApprovedMockWall = 'clean-panel-v25';
  });
  root.userData.warRoomApprovedMockWallClutterRetired = retired;
  root.userData.warRoomApprovedMockWallStyle = 'plain-dark-castle-panel-v25';
  return retired;
}

function isCurtainPelmet(object) {
  if (!object?.isMesh || object.geometry?.type !== 'SphereGeometry') return false;
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  const velvetLike = (material?.roughness ?? 0) >= 0.75 && (material?.sheen ?? 0) >= 0.3;
  return velvetLike
    && object.scale.x >= 1.25
    && object.scale.y <= 0.5
    && object.scale.z <= 0.5;
}

function straightenCurtains(root) {
  let folds = 0;
  let pelmets = 0;
  root.traverse?.((object) => {
    if (object?.name?.includes?.('war-room-velvet-curtain-fold')) {
      object.rotation.z = 0;
      object.userData.warRoomCurtainProfile = 'straight-drop-v25';
      folds += 1;
      return;
    }
    if (!isCurtainPelmet(object)) return;
    object.visible = false;
    object.userData.warRoomCurtainPelmet = 'retired-v25';
    pelmets += 1;
  });
  root.userData.warRoomApprovedMockCurtainFolds = folds;
  root.userData.warRoomApprovedMockCurtainPelmetsRetired = pelmets;
  root.userData.warRoomApprovedMockCurtainStyle = 'straight-no-upper-doubling-v25';
  return folds + pelmets;
}

export function applyWarRoomApprovedMockContract(root, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!root || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  const furniture = placeFurniture(root, { wallZ, towardBoard });
  const walls = retireWallClutter(root);
  const curtains = straightenCurtains(root);
  root.userData.warRoomApprovedMockVersion = WAR_ROOM_APPROVED_MOCK_VERSION;
  return furniture + walls + curtains;
}

export function installWarRoomApprovedMockContract(group, options = {}) {
  if (!group || options.coarsePointer) return 0;
  applyWarRoomApprovedMockContract(group, options);

  const driver = group.getObjectByName?.('war-room-castle-wall-left')
    || group.getObjectByName?.('war-room-velvet-curtain-fold')
    || group.getObjectByName?.('war-room-castle-floor-slab');
  if (!driver || driver.userData.warRoomApprovedMockDriver === WAR_ROOM_APPROVED_MOCK_VERSION) return 0;

  driver.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    applyWarRoomApprovedMockContract(sceneRoot(driver) || group, options);
  };
  group.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  return 1;
}
