export const WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION = 'war-room-plant-visible-sofa-corner-v2';

const WINDOW_ANCHOR_ROOM_INSET = 1.28;
const WINDOW_ANCHOR_SOFA_END_OFFSET = 0.52;

function visiblePlantAnchor(anchor) {
  const anchorX = Number(anchor?.x);
  const anchorZ = Number(anchor?.z);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorZ)) return null;

  const side = Math.sign(anchorX) || Math.sign(anchorZ) || 1;
  return {
    x: anchorX - side * WINDOW_ANCHOR_ROOM_INSET,
    z: anchorZ + side * WINDOW_ANCHOR_SOFA_END_OFFSET,
  };
}

export function lockWarRoomCanonicalPlantPlacement(root) {
  if (!root?.getObjectByName) return 0;

  const plant = root.getObjectByName('war-room-hans-plant');
  const weatherWindow = root.getObjectByName('war-room-weather-window');
  const anchor = visiblePlantAnchor(weatherWindow?.userData?.warRoomPlantAnchor);
  if (!plant?.position || !anchor) return 0;

  plant.position.x = anchor.x;
  plant.position.z = anchor.z;
  plant.userData.warRoomPlantPlacement = 'canonical-visible-sofa-corner-v16';
  plant.userData.warRoomPlantOcclusionFix = 'stable-room-side-sofa-clearance-v16';
  plant.userData.warRoomPlantBoardClearance = 'outside-table-footprint';
  plant.userData.warRoomCanonicalPlacement = WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION;

  if (root.userData) {
    root.userData.warRoomCanonicalPlantPlacement = WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION;
  }
  return 1;
}
