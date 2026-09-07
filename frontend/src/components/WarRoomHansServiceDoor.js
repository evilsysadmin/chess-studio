import * as THREE from 'three';

const HANS_SERVICE_DOOR_VERSION = 'hans-service-door-v1';

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.03,
    roughness: options.roughness ?? 0.7,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.28,
  });
}

function addMesh(parent, geometry, mat, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function ensureWarRoomHansServiceDoor(root, {
  fireplace,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!root || !fireplace || !Number.isFinite(towardBoard)) return null;
  const existing = root.getObjectByName?.('war-room-hans-service-door');
  if (existing?.userData?.refs) return existing.userData.refs;

  const side = Math.sign(fireplace.position.x || -1) || -1;
  const doorZ = fireplace.position.z + towardBoard * 1.16;
  const innerWallX = side * 7.72;
  const doorWidth = coarsePointer ? 1.55 : 1.68;
  const doorHeight = coarsePointer ? 3.0 : 3.18;
  const frameWidth = doorWidth + 0.24;
  const thresholdY = -0.23;
  const centerY = thresholdY + doorHeight / 2;

  const walnut = material(0x29170f, { roughness: 0.58, clearcoat: 0.18, specularIntensity: 0.32 });
  const walnutWarm = material(0x4a2a19, { roughness: 0.52, clearcoat: 0.22, specularIntensity: 0.36 });
  const recess = material(0x100d0b, { roughness: 0.98, clearcoat: 0, specularIntensity: 0.04 });
  const brass = material(0x9d7130, { metalness: 0.78, roughness: 0.28, clearcoat: 0.26, specularIntensity: 0.72 });

  const group = new THREE.Group();
  group.name = 'war-room-hans-service-door';
  group.userData.warRoomArchitecture = 'service-door';
  group.userData.warRoomHansServiceDoor = HANS_SERVICE_DOOR_VERSION;
  group.userData.warRoomHansDoorSwing = 'into-service-corridor-v1';
  group.userData.side = side;

  // A dark inset just inside the side wall sells a real opening without adding
  // another expensive architectural boolean/cutout to the War Room mesh.
  addMesh(
    group,
    new THREE.BoxGeometry(0.045, doorHeight + 0.08, doorWidth + 0.06),
    recess,
    [innerWallX - side * 0.025, centerY, doorZ],
    [0, 0, 0],
    'war-room-hans-service-door-recess',
  ).castShadow = false;

  const frameX = innerWallX - side * 0.065;
  const postZ = doorWidth / 2 + 0.08;
  addMesh(group, new THREE.BoxGeometry(0.14, doorHeight + 0.18, 0.16), walnutWarm,
    [frameX, centerY, doorZ - postZ], [0, 0, 0], 'war-room-hans-service-door-frame');
  addMesh(group, new THREE.BoxGeometry(0.14, doorHeight + 0.18, 0.16), walnutWarm,
    [frameX, centerY, doorZ + postZ]);
  addMesh(group, new THREE.BoxGeometry(0.14, 0.18, frameWidth), walnutWarm,
    [frameX, thresholdY + doorHeight + 0.1, doorZ]);
  addMesh(group, new THREE.BoxGeometry(0.16, 0.08, frameWidth), brass,
    [frameX - side * 0.015, thresholdY + 0.02, doorZ], [0, 0, 0], 'war-room-hans-service-door-threshold');

  const hingeZ = doorZ - towardBoard * (doorWidth / 2);
  const pivot = new THREE.Group();
  pivot.name = 'war-room-hans-service-door-pivot';
  pivot.position.set(innerWallX - side * 0.12, thresholdY, hingeZ);

  const panel = new THREE.Group();
  panel.name = 'war-room-hans-service-door-panel';
  const panelCenterZ = towardBoard * (doorWidth / 2);
  addMesh(panel, new THREE.BoxGeometry(0.1, doorHeight, doorWidth), walnut,
    [0, doorHeight / 2, panelCenterZ]);

  if (!coarsePointer) {
    for (const y of [0.58, 1.56, 2.54]) {
      addMesh(panel, new THREE.BoxGeometry(0.035, 0.07, doorWidth * 0.82), walnutWarm,
        [-side * 0.055, y, panelCenterZ]);
    }
    addMesh(panel, new THREE.BoxGeometry(0.035, doorHeight * 0.74, 0.07), walnutWarm,
      [-side * 0.055, doorHeight * 0.51, panelCenterZ]);
  }

  const handleZ = panelCenterZ + towardBoard * (doorWidth * 0.31);
  addMesh(panel, new THREE.SphereGeometry(0.075, coarsePointer ? 10 : 16, coarsePointer ? 7 : 11), brass,
    [-side * 0.09, doorHeight * 0.5, handleZ], [0, 0, 0], 'war-room-hans-service-door-handle');
  for (const hingeY of [0.52, 2.56]) {
    addMesh(panel, new THREE.BoxGeometry(0.055, 0.18, 0.3), brass,
      [-side * 0.065, hingeY, towardBoard * 0.15]);
  }

  pivot.add(panel);
  group.add(pivot);
  root.add(group);

  const refs = {
    group,
    pivot,
    panel,
    side,
    doorZ,
    closedRotation: 0,
    // Swing away from the War Room centre and into the service corridor. This
    // keeps the leaf out of Hans' walking lane and out of the playable room.
    openRotation: side * towardBoard * 0.96,
  };
  group.userData.refs = refs;
  setWarRoomHansServiceDoorOpen(refs, 0);
  return refs;
}

export function setWarRoomHansServiceDoorOpen(refs, amount) {
  if (!refs?.pivot) return 0;
  const open = clamp01(amount);
  refs.pivot.rotation.y = refs.closedRotation + (refs.openRotation - refs.closedRotation) * open;
  refs.group.userData.warRoomHansDoorOpen = open;
  return open;
}
