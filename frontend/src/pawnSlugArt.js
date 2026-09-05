import * as THREE from 'three';
import {
  animateMatthiasSlugSprite,
  animatePanzerRookSprite,
  animateSlugEnemySprite,
  createMatthiasSlugSprite,
  createPanzerRookSprite,
  createSlugEnemySprite,
} from './pawnSlugSprites.js';

const MAT = Object.freeze({
  brass: 0xc9a24a,
  brass2: 0x8b6b2f,
  steel: 0x66717e,
  steel2: 0x3f4852,
  muzzle: 0xffd26c,
  smoke: 0x7f8790,
});

function std(color, roughness = 0.72, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function roundedBox(w, h, d, color) {
  const geometry = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  geometry.translate(0, h / 2, 0);
  return mesh(geometry, std(color, 0.82, 0.08));
}

export function createMatthiasSlugModel() {
  const sprite = createMatthiasSlugSprite();
  sprite.userData.baseScale = sprite.scale.x;
  return sprite;
}

export function animateMatthiasSlug(model, { time = 0, running = false, crouch = false, firing = false, dir = 1, hurt = false } = {}) {
  const base = Math.abs(model.userData.baseScale || model.scale.x || 1);
  model.scale.x = base * (dir < 0 ? -1 : 1);
  animateMatthiasSlugSprite(model, { time, running, crouch, firing, hurt, dir });
}

export function createSlugEnemyModel(type = 'pawn') {
  const sprite = type === 'boss' ? createPanzerRookSprite() : createSlugEnemySprite(type);
  sprite.userData.baseScale = sprite.scale.x;
  sprite.userData.enemyType = type;
  return sprite;
}

export function animateSlugEnemy(model, type, time, state = {}) {
  if (type === 'boss') animatePanzerRookSprite(model, time, state);
  else animateSlugEnemySprite(model, type, time, state);
  const direction = model.scale.x < 0 ? -1 : 1;
  model.scale.x = Math.abs(model.userData.baseScale || model.scale.x || 1) * direction;
}

export function createPickupModel(type) {
  const root = new THREE.Group();
  const colors = {
    machinegun: 0x5a4025,
    shotgun: 0x62462b,
    panzerfaust: 0x4c4f43,
    grenade: 0x46513f,
    medkit: 0x4b5b49,
  };
  const accent = type === 'medkit' ? 0xcbd8b0 : MAT.brass;
  const crate = roundedBox(0.78, 0.56, 0.62, colors[type] || 0x5a4025);
  root.add(crate);
  const strapA = mesh(new THREE.BoxGeometry(0.09, 0.6, 0.67), std(0x241c16, 0.88), { x: -0.22, y: 0.29 });
  const strapB = strapA.clone(); strapB.position.x = 0.22;
  root.add(strapA, strapB);
  const badge = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.03), std(accent, 0.55, 0.16), { y: 0.35, z: 0.325 });
  root.add(badge);
  if (type === 'grenade') {
    root.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0x4d5b43, 0.7, 0.2), { y: 0.64 }));
  }
  if (type === 'panzerfaust') {
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.68, 10), std(MAT.steel2, 0.42, 0.55), { y: 0.73, rz: -Math.PI / 2 }));
  }
  if (type === 'machinegun' || type === 'shotgun') {
    root.add(mesh(new THREE.BoxGeometry(0.72, 0.09, 0.08), std(MAT.steel, 0.42, 0.52), { y: 0.72 }));
  }
  if (type === 'medkit') {
    root.add(mesh(new THREE.BoxGeometry(0.08, 0.34, 0.04), std(0xe2e7cf, 0.72), { y: 0.36, z: 0.35 }));
    root.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 0.04), std(0xe2e7cf, 0.72), { y: 0.36, z: 0.35 }));
  }
  return root;
}

export function createBulletModel({ enemy = false, explosive = false } = {}) {
  if (explosive) {
    const group = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.34, 10), std(enemy ? 0xa14739 : MAT.steel, 0.4, 0.5), { rz: -Math.PI / 2 });
    const tip = mesh(new THREE.ConeGeometry(0.1, 0.18, 10), std(enemy ? 0xd45c45 : MAT.brass, 0.35, 0.45), { x: 0.24, rz: -Math.PI / 2 });
    group.add(body, tip);
    return group;
  }
  return mesh(
    new THREE.SphereGeometry(enemy ? 0.055 : 0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: enemy ? 0xff684f : 0xffe08a }),
  );
}

export function createGrenadeModel() {
  const root = new THREE.Group();
  root.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0x4b5941, 0.7, 0.25)));
  root.add(mesh(new THREE.BoxGeometry(0.06, 0.11, 0.08), std(MAT.brass2, 0.5, 0.35), { y: 0.13 }));
  return root;
}

export function createMuzzleFlash() {
  const flash = new THREE.Group();
  const core = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  const cone = mesh(new THREE.ConeGeometry(0.12, 0.38, 7), new THREE.MeshBasicMaterial({ color: MAT.muzzle, transparent: true, opacity: 0.88 }), { x: 0.22, rz: -Math.PI / 2 });
  flash.add(core, cone);
  flash.userData.life = 0.07;
  return flash;
}

export function createExplosionParticle(color = 0xffa43c, size = 0.1) {
  return mesh(new THREE.SphereGeometry(size, 7, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
}

export function createSlugEnvironment(scene) {
  const env = new THREE.Group();
  env.name = 'pawn-slug-environment';
  scene.add(env);

  const ground = mesh(new THREE.BoxGeometry(150, 0.55, 7), std(0x2b2925, 0.98), { x: 72, y: -0.28 });
  ground.receiveShadow = true;
  env.add(ground);

  const lane = mesh(new THREE.PlaneGeometry(150, 4.8), new THREE.MeshStandardMaterial({ color: 0x39352f, roughness: 1, metalness: 0 }), { x: 72, y: 0.012, rx: -Math.PI / 2 });
  lane.receiveShadow = true;
  env.add(lane);

  const railMat = std(0x2b3137, 0.68, 0.28);
  for (let x = 4; x < 146; x += 8) {
    const barricade = new THREE.Group();
    barricade.position.set(x, 0, 1.72);
    const beam = mesh(new THREE.BoxGeometry(2.2, 0.16, 0.18), railMat.clone(), { y: 0.65, rz: x % 16 ? 0.04 : -0.05 });
    const postA = mesh(new THREE.BoxGeometry(0.16, 0.82, 0.18), railMat.clone(), { x: -0.85, y: 0.39 });
    const postB = postA.clone(); postB.position.x = 0.85;
    barricade.add(beam, postA, postB);
    env.add(barricade);
  }

  for (let x = 3; x < 145; x += 6.5) {
    const rubble = new THREE.Group();
    const count = 2 + (Math.floor(x) % 3);
    for (let i = 0; i < count; i += 1) {
      const rock = mesh(
        new THREE.DodecahedronGeometry(0.12 + ((i + x) % 3) * 0.05, 0),
        std(0x49443d, 0.95),
        { x: x + i * 0.23, y: 0.08, z: 1.1 + ((i * 7) % 4) * 0.27, ry: i * 0.7 },
      );
      rubble.add(rock);
    }
    env.add(rubble);
  }

  const fortressMat = std(0x2b3038, 0.92);
  for (let x = 12; x < 145; x += 18) {
    const tower = new THREE.Group();
    tower.position.set(x, 0, -4.2);
    const height = 5.2 + (x % 3);
    const shaft = mesh(new THREE.BoxGeometry(2.1, height, 2.1), fortressMat.clone(), { y: height / 2 });
    const crown = mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), std(0x24282f, 0.9), { y: height });
    tower.add(shaft, crown);
    for (let c = -1; c <= 1; c += 1) {
      const slit = mesh(new THREE.BoxGeometry(0.16, 0.65, 0.03), new THREE.MeshBasicMaterial({ color: 0xa44431 }), { x: c * 0.55, y: Math.min(height - 1, 3.1), z: 1.07 });
      tower.add(slit);
    }
    env.add(tower);
  }

  const far = new THREE.Group();
  far.position.z = -8;
  env.add(far);
  for (let x = 0; x < 150; x += 12) {
    const hill = mesh(new THREE.ConeGeometry(5 + (x % 4), 7 + (x % 3), 6), new THREE.MeshLambertMaterial({ color: 0x1b2027 }), { x, y: 2.2, ry: Math.PI / 6 });
    hill.scale.z = 0.35;
    far.add(hill);
  }

  return { root: env, far };
}

export function disposePawnSlugObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material?.map?.dispose?.();
        material?.dispose?.();
      });
    } else {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
  });
}
