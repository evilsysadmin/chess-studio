import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_APPROVED_MOCK_VERSION = 'approved-mock-v27';
const NOOP_RENDER_HOOK = () => {};

function placeFurniture(root, { wallZ, towardBoard }) {
  const tableOffset = 3.30;
  const armorOffset = 8.35;
  const sofaOffset = 12.35;
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
    table.userData.warRoomFurniturePlacement = 'approved-mock-rear-table-v27';
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
    armor.userData.warRoomArmorPlacement = 'approved-mock-lower-sentry-v27';
    armor.userData.facesWarTable = true;
    changed += 1;
  }

  for (const [name, side] of [
    ['war-room-sofa-left', -1],
    ['war-room-sofa-right', 1],
  ]) {
    const sofa = root.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(side * 6.95, 0.02, wallZ + towardBoard * sofaOffset);
    sofa.rotation.y = -side * towardBoard * Math.PI / 2;
    sofa.userData.warRoomOffsetFromWall = sofaOffset;
    sofa.userData.warRoomFurniturePlacement = 'approved-mock-front-corner-sofa-v27';
    sofa.userData.facesWarTable = true;
    changed += 1;
  }

  root.userData.warRoomFurnitureLayoutOwner = WAR_ROOM_APPROVED_MOCK_VERSION;
  root.userData.warRoomApprovedMockFurnitureOrder = 'tables-rear-armors-lower-sofas-foreground-v27';
  root.userData.warRoomApprovedMockTableOffset = tableOffset;
  root.userData.warRoomApprovedMockArmorOffset = armorOffset;
  root.userData.warRoomApprovedMockSofaOffset = sofaOffset;
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
    object.userData.warRoomApprovedMockWall = 'clean-panel-v27';
  });
  root.userData.warRoomApprovedMockWallClutterRetired = retired;
  root.userData.warRoomApprovedMockWallStyle = 'plain-dark-castle-panel-v27';
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
      object.userData.warRoomCurtainProfile = 'straight-drop-v27';
      folds += 1;
      return;
    }
    if (!isCurtainPelmet(object)) return;
    object.visible = false;
    object.userData.warRoomCurtainPelmet = 'retired-v27';
    pelmets += 1;
  });
  root.userData.warRoomApprovedMockCurtainFolds = folds;
  root.userData.warRoomApprovedMockCurtainPelmetsRetired = pelmets;
  root.userData.warRoomApprovedMockCurtainStyle = 'straight-no-upper-doubling-v27';
  return folds + pelmets;
}

function retireLegacyLayoutDrivers(root) {
  let retired = 0;
  const retiredDrivers = [];
  root.traverse?.((object) => {
    if (object?.userData?.warRoomFinalRefinementDriver !== true) return;
    if (object.userData.warRoomApprovedMockLayoutDriverRetired === WAR_ROOM_APPROVED_MOCK_VERSION) return;

    object.onBeforeRender = NOOP_RENDER_HOOK;
    object.userData.warRoomApprovedMockLayoutDriverRetired = WAR_ROOM_APPROVED_MOCK_VERSION;
    object.userData.warRoomApprovedMockLayoutDriverRetirement = 'marker-owned-one-shot-v27';
    retiredDrivers.push(object.name || object.type || 'unnamed');
    retired += 1;
  });

  root.userData.warRoomLegacyLayoutDriversRetired = retiredDrivers;
  root.userData.warRoomLegacyLayoutDriverRetirementVersion = WAR_ROOM_APPROVED_MOCK_VERSION;
  return retired;
}

export function applyWarRoomApprovedMockContract(root, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!root || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  // Single desktop layout authority: this function runs once during premium
  // construction and again through the shared first-paint finalizer. The
  // castle creates its legacy refinement callback only after the premium pass,
  // so the construction call intentionally sees no driver. The first-paint
  // call sees the complete scene, retires every marker-owned static layout
  // callback, and only then writes the final furniture positions. Continuous
  // render hooks remain reserved for genuinely animated work such as fire and
  // ambient life.
  const retiredDrivers = retireLegacyLayoutDrivers(root);
  const furniture = placeFurniture(root, { wallZ, towardBoard });
  const walls = retireWallClutter(root);
  const curtains = straightenCurtains(root);
  root.userData.warRoomApprovedMockVersion = WAR_ROOM_APPROVED_MOCK_VERSION;
  return retiredDrivers + furniture + walls + curtains;
}

export function installWarRoomApprovedMockContract(group, options = {}) {
  if (!group || options.coarsePointer) return 0;
  applyWarRoomApprovedMockContract(group, options);

  const markerDriver = group.getObjectByName?.('war-room-castle-wall-left')
    || group.getObjectByName?.('war-room-velvet-curtain-fold')
    || group.getObjectByName?.('war-room-castle-floor-slab');
  if (!markerDriver || markerDriver.userData.warRoomApprovedMockDriver === WAR_ROOM_APPROVED_MOCK_VERSION) return 0;

  const registered = registerWarRoomDeferredFinalizer(group, {
    key: 'approved-mock-v27',
    coarsePointer: options.coarsePointer,
    run: (root) => applyWarRoomApprovedMockContract(root || group, options),
  });
  if (!registered) return 0;

  markerDriver.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  group.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  group.userData.warRoomApprovedMockExecution = 'shared-finalizer-marker-driver-retirement-v6';
  return 1;
}
