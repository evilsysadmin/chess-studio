import * as THREE from 'three';

export const WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION = 'hans-canonical-elder-butler-v2';

const HANS_NAME = 'war-room-hans-butler';
const LEGACY_CANE_NAME = 'war-room-hans-cane';
const TAILCOAT_NAME = 'war-room-hans-canonical-tailcoat';
const BASE_HUNCH_RADIANS = 0.055;
const HEAD_DROP = 0.035;
const HEAD_FORWARD = 0.045;
const MIN_SHOE_FORWARD_OFFSET = 0.07;

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

function findShoe(leg) {
  if (!leg?.children) return null;
  return leg.children.find((child) => {
    if (!child?.isMesh || child.geometry?.type !== 'BoxGeometry') return false;
    const params = child.geometry?.parameters || {};
    const depth = Number(params.depth || 0);
    const width = Number(params.width || 0);
    const height = Number(params.height || 0);
    return depth > width * 1.25 && depth > height * 1.8;
  }) || null;
}

function orientShoeForward(leg, forward, name) {
  const shoe = findShoe(leg);
  if (!shoe) return null;
  const currentOffset = Math.abs(Number(shoe.position?.z || 0));
  shoe.position.z = forward * Math.max(currentOffset, MIN_SHOE_FORWARD_OFFSET);
  shoe.name = name;
  shoe.userData.warRoomHansToeDirection = forward;
  shoe.userData.warRoomHansFootContract = 'toe-forward-v1';
  return shoe;
}

function orientFeetForward(body, forward) {
  const leftShoe = orientShoeForward(body?.leftLeg, forward, 'war-room-hans-left-shoe');
  const rightShoe = orientShoeForward(body?.rightLeg, forward, 'war-room-hans-right-shoe');
  if (leftShoe) body.leftShoe = leftShoe;
  if (rightShoe) body.rightShoe = rightShoe;
  return { leftShoe, rightShoe };
}

function removeLegacyCane(hans, body) {
  const cane = hans?.getObjectByName?.(LEGACY_CANE_NAME) || body?.cane || null;
  if (cane?.parent) cane.parent.remove(cane);
  if (body && Object.prototype.hasOwnProperty.call(body, 'cane')) delete body.cane;
  if (hans?.userData) hans.userData.warRoomHansCane = null;
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
  removeLegacyCane(hans, body);
  applyCanonicalPosture(body, forward);
  const tailcoat = installTailcoat(body, forward);
  const { leftShoe, rightShoe } = orientFeetForward(body, forward);

  if (tailcoat) body.tailcoat = tailcoat;

  hans.userData.warRoomHansCanonicalButler = WAR_ROOM_HANS_CANONICAL_BUTLER_VERSION;
  hans.userData.warRoomHansCanonicalLook = 'black-tailcoat-elder-v2';
  hans.userData.warRoomHansCanonicalPosture = 'slow-hunched-butler-v1';
  hans.userData.warRoomHansBaseHunchRadians = BASE_HUNCH_RADIANS;
  hans.userData.warRoomHansFootDirection = leftShoe && rightShoe ? 'toe-forward-v1' : 'legacy-foot-geometry';
  hans.userData.warRoomHansCane = null;
  return 1;
}
