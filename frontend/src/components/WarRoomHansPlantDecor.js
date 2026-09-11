import * as THREE from 'three';
import { getEffectiveReducedMotion } from '../userPreferences.js';
import { applyWarRoomLocalAtmosphere } from './WarRoomLocalAtmosphere.js';

export const WAR_ROOM_HANS_PLANT_VERSION = 'hans-war-room-plant-v12-dust-motes';
export const WAR_ROOM_WINDOW_CORNER_POSE_VERSION = 'weather-window-side-wall-pose-v2-after-armor';
export const WAR_ROOM_DUST_MOTES_VERSION = 'war-room-dust-motes-v1';

const WINDOW_SIDE_WALL_ANGLE = THREE.MathUtils.degToRad(90);
const WINDOW_SIDE_WALL_SCALE_X = 1.55;
const WINDOW_SIDE_WALL_SCALE_Y = 1.12;
const WINDOW_SIDE_WALL_X = 7.45;
const WINDOW_SIDE_WALL_Z = 1.85;
const WINDOW_PLANT_X = 7.05;
const WINDOW_PLANT_Z = 2.85;

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

function hashUnit(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function warRoomDustMoteBudget({ coarsePointer = false, reducedMotion = false } = {}) {
  if (reducedMotion) return 0;
  return coarsePointer ? 6 : 18;
}

export function ensureWarRoomDustMotes(root, {
  coarsePointer = Boolean(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches),
  reducedMotion = getEffectiveReducedMotion(),
} = {}) {
  if (!root) return null;
  const existing = root.getObjectByName?.('war-room-dust-motes');
  if (existing) return existing;

  const count = warRoomDustMoteBudget({ coarsePointer, reducedMotion: false });
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const x = -5.6 + hashUnit(index, 1) * 11.2;
    const y = 0.55 + hashUnit(index, 2) * 3.4;
    const z = -3.8 + hashUnit(index, 3) * 7.1;
    positions[offset] = base[offset] = x;
    positions[offset + 1] = base[offset + 1] = y;
    positions[offset + 2] = base[offset + 2] = z;
    phases[index] = hashUnit(index, 4) * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffd7a0,
    size: coarsePointer ? 0.026 : 0.022,
    transparent: true,
    opacity: coarsePointer ? 0.11 : 0.16,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const motes = new THREE.Points(geometry, material);
  motes.name = 'war-room-dust-motes';
  motes.frustumCulled = false;
  motes.visible = !reducedMotion;
  motes.userData.warRoomDustMotes = WAR_ROOM_DUST_MOTES_VERSION;
  motes.userData.warRoomDustMoteBudget = count;
  motes.userData.warRoomDustMoteProfile = coarsePointer ? 'mobile-lite' : 'desktop-restrained';

  motes.onBeforeRender = () => {
    const motionReduced = getEffectiveReducedMotion();
    motes.visible = !motionReduced;
    if (motionReduced) return;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) * 0.001;
    const attribute = geometry.getAttribute('position');
    const array = attribute.array;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const phase = phases[index];
      array[offset] = base[offset] + Math.sin(now * 0.19 + phase) * 0.035;
      array[offset + 1] = base[offset + 1] + Math.sin(now * 0.27 + phase * 1.3) * 0.055;
      array[offset + 2] = base[offset + 2] + Math.cos(now * 0.15 + phase * 0.7) * 0.025;
    }
    attribute.needsUpdate = true;
  };

  root.add(motes);
  if (root.userData) {
    root.userData.warRoomDustMotes = WAR_ROOM_DUST_MOTES_VERSION;
    root.userData.warRoomDustMoteBudget = count;
  }
  return motes;
}

export function applyWarRoomWeatherWindowCornerPose(root) {
  const weatherWindow = root?.getObjectByName?.('war-room-weather-window');
  const parent = weatherWindow?.parent;
  if (!root || !weatherWindow || !parent) return 0;
  if (weatherWindow.userData.warRoomCornerPose === WAR_ROOM_WINDOW_CORNER_POSE_VERSION) {
    applyWarRoomLocalAtmosphere(root);
    return 0;
  }

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

  // Canonical side-wall composition: keep the rear gallery intact, but place the
  // weather opening beyond the armor toward the player so the outside conditions
  // read clearly instead of disappearing into the rear-wall perspective.
  desiredRootPivot.x = side * WINDOW_SIDE_WALL_X;
  desiredRootPivot.z = side * WINDOW_SIDE_WALL_Z;

  weatherWindow.rotation.y = -side * WINDOW_SIDE_WALL_ANGLE;
  weatherWindow.scale.x = WINDOW_SIDE_WALL_SCALE_X;
  weatherWindow.scale.y = WINDOW_SIDE_WALL_SCALE_Y;
  weatherWindow.updateMatrixWorld?.(true);

  const movedPivotWorld = weatherWindow.localToWorld(pivotLocal.clone());
  const desiredPivotWorld = root.localToWorld(desiredRootPivot.clone());
  const desiredParentPivot = parent.worldToLocal(desiredPivotWorld.clone());
  const movedParentPivot = parent.worldToLocal(movedPivotWorld.clone());
  weatherWindow.position.add(desiredParentPivot.sub(movedParentPivot));
  weatherWindow.updateMatrixWorld?.(true);

  weatherWindow.userData.warRoomCornerPose = WAR_ROOM_WINDOW_CORNER_POSE_VERSION;
  weatherWindow.userData.warRoomCornerAngleDegrees = 90;
  weatherWindow.userData.warRoomCornerScaleX = WINDOW_SIDE_WALL_SCALE_X;
  weatherWindow.userData.warRoomCornerScaleY = WINDOW_SIDE_WALL_SCALE_Y;
  weatherWindow.userData.warRoomCornerTargetX = WINDOW_SIDE_WALL_X;
  weatherWindow.userData.warRoomCornerTargetZ = WINDOW_SIDE_WALL_Z;
  weatherWindow.userData.warRoomCornerForwardShift = WINDOW_SIDE_WALL_Z;
  weatherWindow.userData.warRoomWindowWall = 'side';
  weatherWindow.userData.warRoomWindowFaces = 'service-door';
  weatherWindow.userData.warRoomWindowRelation = 'past-armor-toward-player';
  weatherWindow.userData.warRoomPlantAnchor = {
    x: side * WINDOW_PLANT_X,
    z: side * WINDOW_PLANT_Z,
  };
  weatherWindow.userData.warRoomCanonicalComposition = 'hearth-left-gallery-intact-right-wall-window-after-armor-plant-v10';
  if (root.userData) {
    root.userData.warRoomCanonicalComposition = 'hearth-left-gallery-intact-right-wall-window-after-armor-plant-v10';
  }

  applyWarRoomLocalAtmosphere(root);
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
    group.userData.warRoomPlantPlacement = `beneath-${sideName}-wall-weather-window-v10`;
    group.userData.warRoomPlantLightRelation = 'window-local-atmosphere';
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

  // Lock the approved side-wall pose before deriving the plant anchor, then add
  // only a tiny capped mote field to make the warm air readable at rest.
  applyWarRoomWeatherWindowCornerPose(root);
  ensureWarRoomDustMotes(root);

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
