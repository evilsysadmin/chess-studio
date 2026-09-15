import * as THREE from 'three';
import { getEffectiveReducedMotion } from '../userPreferences.js';

export const WAR_ROOM_CAT_VERSION = 'war-room-cat-v1-sofa-sleeper';

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

function preferredSofa(root) {
  const plantSide = root.getObjectByName?.('war-room-hans-plant')?.userData?.warRoomPlantSide;
  const order = plantSide === 'right' ? ['left', 'right'] : ['right', 'left'];
  for (const side of order) {
    const sofa = root.getObjectByName?.(`war-room-sofa-${side}`);
    if (sofa) return { sofa, side };
  }
  return null;
}

function makeEar(material) {
  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 4), material);
  ear.rotation.z = Math.PI / 4;
  ear.castShadow = true;
  return ear;
}

function buildCat() {
  const group = new THREE.Group();
  group.name = 'war-room-cat';
  group.userData.warRoomDecor = WAR_ROOM_CAT_VERSION;
  group.userData.warRoomCatState = 'sleeping';

  const fur = new THREE.MeshPhysicalMaterial({
    color: 0x25282c,
    roughness: 0.82,
    metalness: 0.02,
    clearcoat: 0.04,
  });
  const darkFur = new THREE.MeshPhysicalMaterial({ color: 0x17191c, roughness: 0.9 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc89332 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), fur);
  body.name = 'war-room-cat-body';
  body.scale.set(1.55, 0.68, 0.92);
  body.position.set(0, 0.22, 0);
  body.rotation.z = -0.08;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), darkFur);
  chest.scale.set(1.0, 0.9, 1.12);
  chest.position.set(0, 0.28, 0.31);
  chest.castShadow = true;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12), fur);
  head.position.set(0, 0.39, 0.47);
  head.scale.set(1.02, 0.92, 0.95);
  head.castShadow = true;
  group.add(head);

  const leftEar = makeEar(fur);
  leftEar.position.set(-0.105, 0.57, 0.46);
  leftEar.rotation.y = 0.2;
  group.add(leftEar);
  const rightEar = makeEar(fur);
  rightEar.position.set(0.105, 0.57, 0.46);
  rightEar.rotation.y = -0.2;
  group.add(rightEar);

  for (const x of [-0.067, 0.067]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeMat);
    eye.position.set(x, 0.415, 0.635);
    eye.scale.y = 0.28;
    group.add(eye);
  }

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 7), darkFur);
  muzzle.position.set(0, 0.365, 0.65);
  muzzle.scale.set(1.15, 0.55, 0.55);
  group.add(muzzle);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.31, 0.25, -0.16),
    new THREE.Vector3(0.52, 0.22, -0.28),
    new THREE.Vector3(0.58, 0.28, -0.02),
    new THREE.Vector3(0.46, 0.31, 0.18),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, 0.04, 7, false), fur);
  tail.name = 'war-room-cat-tail';
  tail.castShadow = true;
  group.add(tail);

  group.userData.warRoomCatBody = body;
  group.userData.warRoomCatTail = tail;
  const baseBodyY = body.position.y;
  const baseTailZ = tail.rotation.z;
  body.onBeforeRender = () => {
    if (getEffectiveReducedMotion()) {
      body.position.y = baseBodyY;
      tail.rotation.z = baseTailZ;
      return;
    }
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) * 0.001;
    body.position.y = baseBodyY + Math.sin(now * 1.35) * 0.006;
    tail.rotation.z = baseTailZ + Math.sin(now * 0.24) * 0.025;
  };

  return group;
}

function placeCat(root, cat) {
  const preferred = preferredSofa(root);
  if (preferred) {
    const bounds = rootLocalBounds(root, preferred.sofa);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const side = preferred.side === 'left' ? -1 : 1;
      cat.position.set(
        center.x - side * Math.min(0.42, size.x * 0.08),
        bounds.max.y + 0.025,
        center.z + Math.min(0.28, size.z * 0.08),
      );
      cat.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      cat.scale.setScalar(0.82);
      cat.userData.warRoomCatPlacement = `${preferred.side}-sofa-sleeper-v1`;
      cat.userData.warRoomCatSofaSide = preferred.side;
      return cat;
    }
  }

  const floor = root.getObjectByName?.('war-room-castle-floor-slab');
  const floorBounds = floor ? rootLocalBounds(root, floor) : null;
  if (floorBounds && !floorBounds.isEmpty()) {
    cat.position.set(floorBounds.min.x + 1.25, floorBounds.max.y + 0.02, floorBounds.max.z - 1.15);
    cat.rotation.y = Math.PI / 3;
    cat.scale.setScalar(0.88);
    cat.userData.warRoomCatPlacement = 'floor-corner-fallback-v1';
  }
  return cat;
}

export function ensureWarRoomCat(root) {
  if (!root) return null;
  const existing = root.getObjectByName?.('war-room-cat');
  if (existing) return placeCat(root, existing);

  const cat = buildCat();
  root.add(cat);
  placeCat(root, cat);
  root.userData.warRoomCat = WAR_ROOM_CAT_VERSION;
  return cat;
}
