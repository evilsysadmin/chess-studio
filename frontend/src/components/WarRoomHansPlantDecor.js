import * as THREE from 'three';

export const WAR_ROOM_HANS_PLANT_VERSION = 'hans-war-room-plant-v6-corner-window';
export const WAR_ROOM_WINDOW_CORNER_POSE_VERSION = 'weather-window-corner-pose-v1';

const WINDOW_CORNER_ANGLE = THREE.MathUtils.degToRad(26);
const WINDOW_CORNER_SCALE_X = 1.28;
const WINDOW_CORNER_INSET = 0.08;

function rootLocalBounds(root, object) {
  object.updateMatrixWorld?.(true);
  root.updateMatrixWorld?.(true);
  const worldBox = new THREE.Box3().setFromObject(object);
  if (worldBox.isEmpty()) return worldBox;

  const localBox = new THREE.Box3().makeEmpty();
  for (const x of [worldBox.min.x, worldBox.max.x]) {
    for (const y of [worldBox.min.y, worldBox.max.y]) {
      for (const z of [worldBox.min.z, worldBox.max.z]) {
        localBox.expandByPoint(root.worldToLocal(new THREE.Vector3(x, y, z)));
      }
    }
  }
  return localBox;
}

function plantSideOppositeHearth(root) {
  const fireplace = root.getObjectByName?.('war-room-fireplace');
  const hearthX = Number(fireplace?.position?.x);
  if (Number.isFinite(hearthX) && Math.abs(hearthX) > 1e-6) {
    return -Math.sign(hearthX);
  }
  return 1;
}

export function applyWarRoomWeatherWindowCornerPose(root) {
  const weatherWindow = root?.getObjectByName?.('war-room-weather-window');
  const parent = weatherWindow?.parent;
  if (!root || !weatherWindow || !parent) return 0;
  if (weatherWindow.userData.warRoomCornerPose === WAR_ROOM_WINDOW_CORNER_POSE_VERSION) return 0;

  root.updateMatrixWorld?.(true);
  parent.updateMatrixWorld?.(true);
  weatherWindow.updateMatrixWorld?.(true);

  const worldBox = new THREE.Box3().setFromObject(weatherWindow);
  if (worldBox.isEmpty()) return 0;

  const side = weatherWindow.userData.side === 'left'
    ? -1
    : weatherWindow.userData.side === 'right'
      ? 1
      : Math.sign(weatherWindow.position.x || 1) || 1;
  const pivotWorld = worldBox.getCenter(new THREE.Vector3());
  const pivotLocal = weatherWindow.worldToLocal(pivotWorld.clone());
  const desiredRootPivot = root.worldToLocal(pivotWorld.clone());
  desiredRootPivot.x -= side * WINDOW_CORNER_INSET;
  const desiredPivotWorld = root.localToWorld(desiredRootPivot.clone());

  // The approved mock places the whole opening on the corner/chamfer rather
  // than shrinking it against the rear wall. Rotate around the visual centre
  // so sky, rain, glazing and frame remain a single architectural object.
  weatherWindow.rotation.y = -side * WINDOW_CORNER_ANGLE;
  weatherWindow.scale.x = WINDOW_CORNER_SCALE_X;
  weatherWindow.updateMatrixWorld?.(true);

  const movedPivotWorld = weatherWindow.localToWorld(pivotLocal.clone());
  const desiredParentPivot = parent.worldToLocal(desiredPivotWorld.clone());
  const movedParentPivot = parent.worldToLocal(movedPivotWorld.clone());
  weatherWindow.position.add(desiredParentPivot.sub(movedParentPivot));
  weatherWindow.updateMatrixWorld?.(true);

  weatherWindow.userData.warRoomCornerPose = WAR_ROOM_WINDOW_CORNER_POSE_VERSION;
  weatherWindow.userData.warRoomCornerAngleDegrees = 26;
  weatherWindow.userData.warRoomCornerScaleX = WINDOW_CORNER_SCALE_X;
  weatherWindow.userData.warRoomCanonicalComposition = 'hearth-left-gallery-right-corner-window-plant-v6';
  if (root.userData) {
    root.userData.warRoomCanonicalComposition = 'hearth-left-gallery-right-corner-window-plant-v6';
  }
  return 1;
}

function weatherWindowAnchor(root, box) {
  const weatherWindow = root.getObjectByName?.('war-room-weather-window');
  const anchor = weatherWindow?.userData?.warRoomPlantAnchor;
  const x = Number(anchor?.x);
  const z = Number(anchor?.z);
  if (![x, z].every(Number.isFinite) || box.isEmpty()) return null;

  const margin = 0.42;
  return {
    x: THREE.MathUtils.clamp(x, box.min.x + margin, box.max.x - margin),
    z: THREE.MathUtils.clamp(z, box.min.z + margin, box.max.z - margin),
  };
}

function placeWarRoomHansPlant(root, group, floor) {
  const box = rootLocalBounds(root, floor);
  if (box.isEmpty()) return group;

  const canonicalAnchor = weatherWindowAnchor(root, box);
  if (canonicalAnchor) {
    const sideName = canonicalAnchor.x < 0 ? 'left' : 'right';
    group.userData.warRoomPlantSide = sideName;
    group.userData.warRoomPlantHearthRelation = 'opposite';
    group.userData.warRoomPlantPlacement = `beside-${sideName}-weather-window-v6`;
    group.userData.warRoomPlantLightRelation = 'window-daylight';
    group.position.set(canonicalAnchor.x, -0.255, canonicalAnchor.z);
    return group;
  }

  const side = plantSideOppositeHearth(root);
  const inset = Math.min(1.45, (box.max.x - box.min.x) * 0.09);
  const x = side < 0 ? box.min.x + inset : box.max.x - inset;
  const fallbackZ = box.min.z + (box.max.z - box.min.z) * 0.30;
  const sideName = side < 0 ? 'left' : 'right';
  const painting = root.getObjectByName?.(`war-room-campaign-painting-${sideName}`);
  let z = fallbackZ;

  group.userData.warRoomPlantSide = sideName;
  group.userData.warRoomPlantHearthRelation = 'opposite';
  delete group.userData.warRoomPlantLightRelation;

  if (painting?.getWorldPosition && root.worldToLocal) {
    painting.updateMatrixWorld?.(true);
    root.updateMatrixWorld?.(true);
    const paintingWorld = new THREE.Vector3();
    painting.getWorldPosition(paintingWorld);
    z = root.worldToLocal(paintingWorld.clone()).z;
    group.userData.warRoomPlantPlacement = `under-${sideName}-gallery-painting-v3-opposite-hearth`;
  } else {
    group.userData.warRoomPlantPlacement = `gallery-aligned-${sideName}-fallback-v3-opposite-hearth`;
  }

  group.position.set(x, -0.255, z);
  return group;
}

export function ensureWarRoomHansPlant(root) {
  if (!root) return null;

  // The window is already built when permanent room dressing is finalized.
  // Lock its approved corner pose before deriving the plant anchor from it.
  applyWarRoomWeatherWindowCornerPose(root);

  const existing = root.getObjectByName?.('war-room-hans-plant');
  const floor = root.getObjectByName?.('war-room-castle-floor-slab');
  if (!floor) return existing || null;

  if (existing) {
    return placeWarRoomHansPlant(root, existing, floor);
  }

  const group = new THREE.Group();
  group.name = 'war-room-hans-plant';
  group.userData.warRoomDecor = WAR_ROOM_HANS_PLANT_VERSION;

  const potMat = new THREE.MeshPhysicalMaterial({ color: 0x6d3f2b, roughness: 0.82, clearcoat: 0.05 });
  const soilMat = new THREE.MeshPhysicalMaterial({ color: 0x24170f, roughness: 1 });
  const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x315b33, roughness: 0.88 });
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x476f42, roughness: 0.84, clearcoat: 0.03 });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.48, 16), potMat);
  pot.position.y = -0.02;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.035, 16), soilMat);
  soil.position.y = 0.23;
  group.add(soil);

  for (const [x, z, h, lean] of [[0,0,1.05,0.02],[-0.13,0.04,0.86,-0.18],[0.14,-0.02,0.91,0.17]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, h, 7), stemMat);
    stem.position.set(x, 0.25 + h / 2, z);
    stem.rotation.z = lean;
    stem.castShadow = true;
    group.add(stem);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 7), leafMat);
      leaf.scale.set(1.65, 0.38, 0.72);
      leaf.position.set(x + side * 0.16, 0.48 + h * (side > 0 ? 0.52 : 0.72), z + side * 0.04);
      leaf.rotation.z = side * 0.48 + lean;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  root.add(group);
  return placeWarRoomHansPlant(root, group, floor);
}
