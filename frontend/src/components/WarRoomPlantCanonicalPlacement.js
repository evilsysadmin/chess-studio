export const WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION = 'war-room-plant-window-corner-v1';

export function lockWarRoomCanonicalPlantPlacement(root) {
  if (!root?.getObjectByName) return 0;

  const plant = root.getObjectByName('war-room-hans-plant');
  const weatherWindow = root.getObjectByName('war-room-weather-window');
  const anchor = weatherWindow?.userData?.warRoomPlantAnchor;
  const x = Number(anchor?.x);
  const z = Number(anchor?.z);
  if (!plant?.position || !Number.isFinite(x) || !Number.isFinite(z)) return 0;

  plant.position.x = x;
  plant.position.z = z;
  plant.userData.warRoomPlantPlacement = 'canonical-weather-window-corner-v15';
  plant.userData.warRoomPlantOcclusionFix = 'stable-wall-corner-board-clearance-v15';
  plant.userData.warRoomPlantBoardClearance = 'outside-table-footprint';
  plant.userData.warRoomCanonicalPlacement = WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION;

  if (root.userData) {
    root.userData.warRoomCanonicalPlantPlacement = WAR_ROOM_CANONICAL_PLANT_PLACEMENT_VERSION;
  }
  return 1;
}
