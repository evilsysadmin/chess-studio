import * as THREE from 'three';

export const WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION = 'hans-canonical-elder-butler-v1';

const HANS_NAME = 'war-room-hans-butler';
const CANE_NAME = 'war-room-hans-cane';
const TAILCOAT_NAME = 'war-room-hans-canonical-tailcoat';
const BASE_HUNCH_RADIANS = 0.055;
const HEAD_DROP = 0.035;
const HEAD_FORWARD = 0.045;

function makeMaterial(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.03,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.06,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
  });
}

function addMesh(parent, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

function installTailcoat(body, forward) {
  const torso = body?.torso;
  if (!torso) return null;
  const existing = torso.getObjectByName?.(TAILCOAT_NAME);
  if (existing) return existing;

  const wool = makeMaterial(0x0b0d10, { roughness: 0.73, clearcoat: 0.035 });
  const satin = makeMaterial(0x15181d, { roughness: 0.42, clearcoat: 0.18 });
  const waistcoat = makeMaterial(0x101317, { roughness: 0.58, clearcoat: 0.08 });
  const brass = makeMaterial(0xb88a43, { metalness: 0.74, roughness: 0.3, clearcoat: 0.28 });

  const tailcoat = new THREE.Group();
  tailcoat.name = TAILCOAT_NAME;

  for (const side of [-1, 1]) {
    addMesh(
      tailcoat,
      new THREE.BoxGeometry(0.22, 0.72, 0.075),
      wool,
      [side * 0.18, -0.38, -forward * 0.225],
      [forward * 0.115, 0, side * 0.035],
      side < 0 ? 'war-room-hans-tailcoat-left-tail' : 'war-room-hans-tailcoat-right-tail',
    );
    addMesh(
      tailcoat,
      new THREE.BoxGeometry(0.15, 0.48, 0.036),
      satin,
      [side * 0.12, 0.13, forward * 0.325],
      [0, 0, side * 0.2],
      side < 0 ? 'war-room-hans-tailcoat-left-lapel' : 'war-room-hans-tailcoat-right-lapel',
    );
  }

  addMesh(
    tailcoat,
    new THREE.BoxGeometry(0.2, 0.32, 0.04),
    waistcoat,
    [0, -0.12, forward * 0.34],
    [0, 0, 0],
    'war-room-hans-waistcoat-panel',
  );
  for (const y of [-0.04, -0.14, -0.24]) {
    addMesh(
      tailcoat,
      new THREE.SphereGeometry(0.026, 8, 6),
      brass,
      [0, y, forward * 0.365],
      [0, 0, 0],
      'war-room-hans-waistcoat-button',
    );
  }

  torso.add(tailcoat);
  return tailcoat;
}

function installCane(hans, forward) {
  const existing = hans.getObjectByName?.(CANE_NAME);
  if (existing) return existing;

  const wood = makeMaterial(0x4a2c1c, { roughness: 0.82, clearcoat: 0.12 });
  const brass = makeMaterial(0xb58a45, { metalness: 0.78, roughness: 0.28, clearcoat: 0.34 });
  const ferrule = makeMaterial(0x27282a, { metalness: 0.48, roughness: 0.5, clearcoat: 0.08 });

  const cane = new THREE.Group();
  cane.name = CANE_NAME;
  cane.position.set(0.49, 0.55, forward * 0.07);
  cane.rotation.x = forward * 0.055;
  cane.rotation.z = -0.03;

  addMesh(
    cane,
    new THREE.CylinderGeometry(0.02, 0.023, 0.95, 10),
    wood,
    [0, 0, 0],
    [0, 0, 0],
    'war-room-hans-cane-shaft',
  );
  addMesh(
    cane,
    new THREE.SphereGeometry(0.058, 12, 8),
    brass,
    [0, 0.49, 0],
    [0, 0, 0],
    'war-room-hans-cane-knob',
  );
  addMesh(
    cane,
    new THREE.CylinderGeometry(0.025, 0.018, 0.08, 8),
    ferrule,
    [0, -0.505, 0],
    [0, 0, 0],
    'war-room-hans-cane-ferrule',
  );

  hans.add(cane);
  return cane;
}

function applyCanonicalPosture(body, forward) {
  if (body?.torso) {
    body.torso.position.y -= 0.012;
    body.torso.rotation.x += forward * BASE_HUNCH_RADIANS;
  }
  if (body?.head) {
    body.head.position.y -= HEAD_DROP;
    body.head.position.z += forward * HEAD_FORWARD;
    body.head.rotation.x += forward * 0.018;
  }
  if (body?.leftArm) body.leftArm.rotation.z -= 0.018;
  if (body?.rightArm) body.rightArm.rotation.z += 0.024;
}

export function installWarRoomHansCanonicalButler(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !body?.torso || !body?.head) return 0;
  if (hans.userData?.warRoomHansCanonicalButler === WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION) return 0;

  const forward = inferForward(body);
  applyCanonicalPosture(body, forward);
  const tailcoat = installTailcoat(body, forward);
  const cane = installCane(hans, forward);

  if (tailcoat) body.tailcoat = tailcoat;
  if (cane) body.cane = cane;

  hans.userData.warRoomHansCanonicalButler = WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION;
  hans.userData.warRoomHansCanonicalLook = 'black-tailcoat-cane-elder-v1';
  hans.userData.warRoomHansCanonicalPosture = 'slow-hunched-butler-v1';
  hans.userData.warRoomHansBaseHunchRadians = BASE_HUNCH_RADIANS;
  hans.userData.warRoomHansCane = cane?.name || null;
  return 1;
}
