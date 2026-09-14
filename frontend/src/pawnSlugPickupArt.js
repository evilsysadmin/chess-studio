import * as THREE from 'three';

const PICKUP_TYPES = Object.freeze(['machinegun', 'shotgun', 'panzerfaust', 'grenade', 'medkit']);

function material(color, roughness = 0.72, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function addContactShadow(root, sx = 0.9, sy = 0.58) {
  const shadow = mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x070809, transparent: true, opacity: 0.28, depthWrite: false }),
    { y: 0.008, rx: -Math.PI / 2 },
  );
  shadow.name = 'pawn-slug-pickup-contact-shadow';
  shadow.scale.set(sx, sy, 1);
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  root.add(shadow);
}

function addFieldCase(root, color, { width = 0.68, height = 0.42, depth = 0.52 } = {}) {
  const body = mesh(new THREE.BoxGeometry(width, height, depth), material(color, 0.82, 0.12), { y: height / 2 + 0.05 });
  body.name = 'pawn-slug-pickup-case';
  root.add(body);

  const lid = mesh(new THREE.BoxGeometry(width + 0.035, 0.07, depth + 0.035), material(0x2f342f, 0.62, 0.28), { y: height + 0.08 });
  root.add(lid);

  const latchMat = material(0x9c7a39, 0.45, 0.55);
  for (const x of [-0.19, 0.19]) {
    root.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.035), latchMat, { x, y: height * 0.62, z: depth / 2 + 0.02 }));
  }
  return { width, height, depth };
}

function addMachinegun(root) {
  const dims = addFieldCase(root, 0x4f513e, { width: 0.72, height: 0.44, depth: 0.5 });
  const steel = material(0x3d464d, 0.42, 0.68);
  const brass = material(0xb99345, 0.38, 0.64);

  const handle = mesh(new THREE.TorusGeometry(0.17, 0.027, 6, 12, Math.PI), steel, { y: 0.59, z: -0.02, rz: Math.PI });
  handle.name = 'pawn-slug-pickup-machinegun-handle';
  root.add(handle);

  const belt = new THREE.Group();
  belt.name = 'pawn-slug-pickup-machinegun-belt';
  for (let i = 0; i < 5; i += 1) {
    belt.add(mesh(new THREE.CylinderGeometry(0.027, 0.035, 0.17, 7), brass, {
      x: -0.17 + i * 0.085,
      y: 0.57 - Math.abs(i - 2) * 0.018,
      z: dims.depth / 2 + 0.045,
      rz: 0.09 * (i - 2),
    }));
  }
  root.add(belt);
}

function addShotgun(root) {
  const dims = addFieldCase(root, 0x67462b, { width: 0.72, height: 0.4, depth: 0.5 });
  const shellBody = material(0xa33d2d, 0.62, 0.18);
  const brass = material(0xc49a4c, 0.4, 0.62);
  const shells = new THREE.Group();
  shells.name = 'pawn-slug-pickup-shotgun-shells';

  for (let i = 0; i < 4; i += 1) {
    const x = -0.19 + i * 0.125;
    shells.add(
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8), shellBody, { x, y: 0.57, z: dims.depth / 2 + 0.045, rz: Math.PI / 2 }),
      mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.045, 8), brass, { x: x - 0.105, y: 0.57, z: dims.depth / 2 + 0.045, rz: Math.PI / 2 }),
    );
  }
  root.add(shells);
}

function addPanzerfaust(root) {
  const cradle = mesh(new THREE.BoxGeometry(0.72, 0.16, 0.44), material(0x454b42, 0.86, 0.12), { y: 0.12 });
  cradle.name = 'pawn-slug-pickup-panzerfaust-cradle';
  root.add(cradle);

  const steel = material(0x4c555d, 0.42, 0.62);
  const warhead = material(0x59634f, 0.7, 0.2);
  root.add(
    mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.68, 10), steel, { y: 0.43, rz: -Math.PI / 2 }),
    mesh(new THREE.ConeGeometry(0.14, 0.28, 10), warhead, { x: 0.43, y: 0.43, rz: -Math.PI / 2 }),
    mesh(new THREE.CylinderGeometry(0.095, 0.07, 0.13, 10), steel, { x: -0.39, y: 0.43, rz: -Math.PI / 2 }),
  );

  const supportMat = material(0x292e2a, 0.68, 0.34);
  root.add(
    mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), supportMat, { x: -0.24, y: 0.27, rz: -0.32 }),
    mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), supportMat, { x: 0.24, y: 0.27, rz: 0.32 }),
  );
}

function addGrenades(root) {
  const tray = mesh(new THREE.BoxGeometry(0.68, 0.16, 0.5), material(0x444b3e, 0.86, 0.12), { y: 0.12 });
  tray.name = 'pawn-slug-pickup-grenade-tray';
  root.add(tray);

  const bodyMat = material(0x526048, 0.72, 0.2);
  const capMat = material(0x343b35, 0.5, 0.46);
  const group = new THREE.Group();
  group.name = 'pawn-slug-pickup-grenades';
  for (const [x, z] of [[-0.2, 0], [0, 0.04], [0.2, -0.02]]) {
    group.add(
      mesh(new THREE.SphereGeometry(0.11, 10, 7), bodyMat, { x, y: 0.32, z }),
      mesh(new THREE.BoxGeometry(0.06, 0.08, 0.07), capMat, { x, y: 0.44, z }),
    );
  }
  root.add(group);
}

function addMedkit(root) {
  const olive = material(0x5c694f, 0.9, 0.04);
  const leather = material(0x332a22, 0.92, 0.02);
  const cloth = mesh(new THREE.BoxGeometry(0.68, 0.47, 0.5), olive, { y: 0.29 });
  cloth.name = 'pawn-slug-pickup-medkit-satchel';
  root.add(cloth);

  root.add(
    mesh(new THREE.BoxGeometry(0.7, 0.15, 0.52), material(0x68765a, 0.86, 0.04), { y: 0.5 }),
    mesh(new THREE.TorusGeometry(0.17, 0.026, 6, 12, Math.PI), leather, { y: 0.64, rz: Math.PI }),
  );

  const crossMat = material(0xe4e8d7, 0.7, 0.03);
  root.add(
    mesh(new THREE.BoxGeometry(0.09, 0.3, 0.035), crossMat, { y: 0.3, z: 0.27 }),
    mesh(new THREE.BoxGeometry(0.3, 0.09, 0.035), crossMat, { y: 0.3, z: 0.27 }),
  );
}

export function createPickupModel(type = 'machinegun') {
  const safeType = PICKUP_TYPES.includes(type) ? type : 'machinegun';
  const root = new THREE.Group();
  root.name = `pawn-slug-pickup-${safeType}`;
  root.userData.pawnSlugPickup = true;
  root.userData.pickupType = safeType;
  root.userData.premiumArt = 'field-kit-v2';
  root.userData.dynamicLights = 0;

  addContactShadow(root);
  if (safeType === 'machinegun') addMachinegun(root);
  else if (safeType === 'shotgun') addShotgun(root);
  else if (safeType === 'panzerfaust') addPanzerfaust(root);
  else if (safeType === 'grenade') addGrenades(root);
  else addMedkit(root);

  return root;
}

export const PAWN_SLUG_PICKUP_ART_META = Object.freeze({
  artVersion: 'field-kit-v2',
  types: PICKUP_TYPES,
  silhouettes: Object.freeze({
    machinegun: 'ammo-can-belt',
    shotgun: 'shell-case',
    panzerfaust: 'launcher-cradle',
    grenade: 'grenade-tray',
    medkit: 'medical-satchel',
  }),
  genericRuntimeHitbox: Object.freeze({ width: 0.9, height: 0.9 }),
  contactShadow: true,
  dynamicLights: 0,
});
