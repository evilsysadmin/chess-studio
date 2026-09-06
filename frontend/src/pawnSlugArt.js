import * as THREE from 'three';
import {
  animateMatthiasSlugSprite,
  animatePanzerRookSprite,
  animateSlugEnemySprite,
  createMatthiasSlugSprite,
  createPanzerRookSprite,
  createSlugEnemySprite,
} from './pawnSlugSprites.js';
import {
  PAWN_SLUG_STATIC_INSTANCE_VERSION,
  createPawnSlugStaticInstanceBatch,
} from './pawnSlugStaticInstances.js';

const MAT = Object.freeze({
  brass: 0xc9a24a,
  brass2: 0x8b6b2f,
  steel: 0x66717e,
  steel2: 0x3f4852,
  muzzle: 0xffd26c,
  smoke: 0x7f8790,
});

export const PAWN_SLUG_FX_RESOURCE_VERSION = 'shared-fx-resources-v1';
const sharedFxResources = new Map();

function markSharedFxResource(resource) {
  if (!resource) return resource;
  resource.userData ||= {};
  resource.userData.pawnSlugSharedFx = PAWN_SLUG_FX_RESOURCE_VERSION;
  return resource;
}

function sharedFxResource(key, factory) {
  let resource = sharedFxResources.get(key);
  if (!resource) {
    resource = markSharedFxResource(factory());
    sharedFxResources.set(key, resource);
  }
  return resource;
}

function isSharedFxResource(resource) {
  return resource?.userData?.pawnSlugSharedFx === PAWN_SLUG_FX_RESOURCE_VERSION;
}

export const PAWN_SLUG_ENVIRONMENT_META = Object.freeze({
  theme: 'fortified-industrial-battlefield',
  parallaxLayers: 3,
  landmarkSpacing: 18,
  staticBatching: PAWN_SLUG_STATIC_INSTANCE_VERSION,
  staticBatchedInstances: 245,
  staticBatchDrawMeshes: 4,
  props: Object.freeze([
    'fortress-wall',
    'battlements',
    'searchlights',
    'sandbags',
    'anti-tank-hedgehogs',
    'shell-craters',
    'track-ruts',
    'smoke-plumes',
  ]),
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

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function addGroundDecal(parent, geometry, color, { x, z, y = 0.018, opacity = 1 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
  const node = mesh(geometry, material, { x, y, z, rx: -Math.PI / 2 });
  node.castShadow = false;
  parent.add(node);
  return node;
}

function addCrater(parent, rockInstances, x, z, scale = 1) {
  addGroundDecal(parent, new THREE.CircleGeometry(0.58 * scale, 18), 0x171819, { x, z, opacity: 0.9 });
  addGroundDecal(parent, new THREE.RingGeometry(0.5 * scale, 0.82 * scale, 18), 0x50463a, { x, z, y: 0.021, opacity: 0.72 });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + seededUnit(x * 10 + i) * 0.45;
    const radius = (0.1 + seededUnit(x + i) * 0.07) * scale;
    rockInstances.push({
      x: x + Math.cos(angle) * 0.68 * scale,
      y: 0.06,
      z: z + Math.sin(angle) * 0.68 * scale,
      ry: angle,
      scale: radius,
    });
  }
}

function addSandbagNest(parent, x, z = 1.65, width = 4) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-sandbag-nest';
  root.position.set(x, 0, z);
  const bagMat = std(0x655742, 0.98);
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < width - row; i += 1) {
      const bag = mesh(new THREE.SphereGeometry(0.23, 9, 6), bagMat.clone(), {
        x: (i - ((width - row - 1) / 2)) * 0.39 + (row ? 0.08 : 0),
        y: 0.14 + row * 0.22,
        z: (i % 2) * 0.03,
        rz: (i % 2 ? 1 : -1) * 0.05,
      });
      bag.scale.set(1.18, 0.58, 0.82);
      root.add(bag);
    }
  }
  parent.add(root);
  return root;
}

function addHedgehog(parent, x, z = 1.42) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-anti-tank-hedgehog';
  root.position.set(x, 0.42, z);
  const iron = std(0x30363c, 0.62, 0.48);
  const beamA = mesh(new THREE.BoxGeometry(1.15, 0.13, 0.13), iron.clone(), { rz: Math.PI / 4 });
  const beamB = mesh(new THREE.BoxGeometry(1.15, 0.13, 0.13), iron.clone(), { rz: -Math.PI / 4 });
  const beamC = mesh(new THREE.BoxGeometry(0.13, 1.08, 0.13), iron.clone(), { ry: Math.PI / 5, rz: 0.08 });
  root.add(beamA, beamB, beamC);
  parent.add(root);
  return root;
}

function addBrokenBarrier(parent, x, z = 1.78, lean = 0) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-broken-barrier';
  root.position.set(x, 0, z);
  const wood = std(0x44392f, 0.94, 0.01);
  const iron = std(0x2c3238, 0.7, 0.32);
  const beam = mesh(new THREE.BoxGeometry(2.1, 0.16, 0.17), wood, { y: 0.66, rz: lean });
  const postA = mesh(new THREE.BoxGeometry(0.15, 0.88, 0.17), iron.clone(), { x: -0.82, y: 0.42, rz: -0.03 });
  const postB = mesh(new THREE.BoxGeometry(0.15, 0.65, 0.17), iron.clone(), { x: 0.82, y: 0.31, rz: 0.07 });
  root.add(beam, postA, postB);
  parent.add(root);
  return root;
}

function addBattlements(tower, width, height, depth = 2.3) {
  const stone = std(0x252a31, 0.94);
  for (let x = -width / 2 + 0.28; x <= width / 2 - 0.28; x += 0.58) {
    tower.add(mesh(new THREE.BoxGeometry(0.32, 0.46, depth), stone.clone(), { x, y: height + 0.23 }));
  }
}

function addSearchlight(tower, { x = 0, y = 5, z = 1.35, angle = -0.28 } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.z = angle;
  const housing = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.26, 12), std(0x4b535c, 0.48, 0.46), { rz: Math.PI / 2 });
  const lens = mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: 0xffd99a }), { x: 0.14, ry: Math.PI / 2 });
  lens.castShadow = false;
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd99a,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = mesh(new THREE.ConeGeometry(0.85, 5.2, 14, 1, true), beamMaterial, { x: 2.7, rz: -Math.PI / 2 });
  beam.castShadow = false;
  beam.receiveShadow = false;
  pivot.add(housing, lens, beam);
  tower.add(pivot);
}

function addFortressTower(parent, x, height, variant = 0) {
  const tower = new THREE.Group();
  tower.name = 'pawn-slug-fortress-tower';
  tower.position.set(x, 0, -4.25);
  const fortressMat = std(variant % 2 ? 0x30353d : 0x2b3038, 0.94);
  const shaft = mesh(new THREE.BoxGeometry(2.35, height, 2.25), fortressMat, { y: height / 2 });
  tower.add(shaft);

  const buttressMat = std(0x242930, 0.96);
  tower.add(
    mesh(new THREE.BoxGeometry(0.42, Math.max(1.8, height * 0.62), 2.45), buttressMat.clone(), { x: -1.16, y: height * 0.31 }),
    mesh(new THREE.BoxGeometry(0.42, Math.max(1.8, height * 0.62), 2.45), buttressMat.clone(), { x: 1.16, y: height * 0.31 }),
  );

  const crown = mesh(new THREE.BoxGeometry(2.75, 0.42, 2.55), std(0x22272e, 0.92), { y: height });
  tower.add(crown);
  addBattlements(tower, 2.75, height + 0.2, 2.45);

  for (let row = 0; row < 2; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const slit = mesh(
        new THREE.BoxGeometry(0.13, 0.58, 0.035),
        new THREE.MeshBasicMaterial({ color: row ? 0x6d3429 : 0xa94831 }),
        { x: column * 0.57, y: Math.min(height - 0.9, 2.55 + row * 1.25), z: 1.14 },
      );
      slit.castShadow = false;
      tower.add(slit);
    }
  }

  if (variant % 3 === 0) addSearchlight(tower, { y: height + 0.85, angle: variant % 2 ? 0.22 : -0.3 });
  parent.add(tower);
  return tower;
}

function addSmokePlume(parent, x, y, z, scale = 1) {
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x323941,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  for (let i = 0; i < 5; i += 1) {
    const puff = mesh(
      new THREE.SphereGeometry((0.42 + i * 0.09) * scale, 9, 7),
      smokeMaterial.clone(),
      {
        x: x + Math.sin(i * 1.7) * 0.24 * scale,
        y: y + i * 0.48 * scale,
        z: z - i * 0.12,
      },
    );
    puff.scale.x = 1.25;
    puff.castShadow = false;
    puff.receiveShadow = false;
    parent.add(puff);
  }
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
    const body = mesh(
      sharedFxResource('rocket-body-geometry', () => new THREE.CylinderGeometry(0.07, 0.09, 0.34, 10)),
      sharedFxResource(
        enemy ? 'rocket-enemy-body-material' : 'rocket-friendly-body-material',
        () => std(enemy ? 0xa14739 : MAT.steel, 0.4, 0.5),
      ),
      { rz: -Math.PI / 2 },
    );
    const tip = mesh(
      sharedFxResource('rocket-tip-geometry', () => new THREE.ConeGeometry(0.1, 0.18, 10)),
      sharedFxResource(
        enemy ? 'rocket-enemy-tip-material' : 'rocket-friendly-tip-material',
        () => std(enemy ? 0xd45c45 : MAT.brass, 0.35, 0.45),
      ),
      { x: 0.24, rz: -Math.PI / 2 },
    );
    group.add(body, tip);
    group.userData.pawnSlugFxResources = PAWN_SLUG_FX_RESOURCE_VERSION;
    return group;
  }
  const kind = enemy ? 'enemy' : 'friendly';
  const bullet = mesh(
    sharedFxResource(`bullet-${kind}-geometry`, () => new THREE.SphereGeometry(enemy ? 0.055 : 0.045, 8, 6)),
    sharedFxResource(`bullet-${kind}-material`, () => new THREE.MeshBasicMaterial({ color: enemy ? 0xff684f : 0xffe08a })),
  );
  bullet.userData.pawnSlugFxResources = PAWN_SLUG_FX_RESOURCE_VERSION;
  return bullet;
}

export function createGrenadeModel() {
  const root = new THREE.Group();
  root.add(mesh(
    sharedFxResource('grenade-body-geometry', () => new THREE.SphereGeometry(0.12, 10, 8)),
    sharedFxResource('grenade-body-material', () => std(0x4b5941, 0.7, 0.25)),
  ));
  root.add(mesh(
    sharedFxResource('grenade-cap-geometry', () => new THREE.BoxGeometry(0.06, 0.11, 0.08)),
    sharedFxResource('grenade-cap-material', () => std(MAT.brass2, 0.5, 0.35)),
    { y: 0.13 },
  ));
  root.userData.pawnSlugFxResources = PAWN_SLUG_FX_RESOURCE_VERSION;
  return root;
}

export function createMuzzleFlash() {
  const flash = new THREE.Group();
  const core = mesh(
    sharedFxResource('muzzle-core-geometry', () => new THREE.SphereGeometry(0.1, 8, 6)),
    sharedFxResource('muzzle-core-material', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })),
  );
  const cone = mesh(
    sharedFxResource('muzzle-cone-geometry', () => new THREE.ConeGeometry(0.12, 0.38, 7)),
    sharedFxResource('muzzle-cone-material', () => new THREE.MeshBasicMaterial({ color: MAT.muzzle, transparent: true, opacity: 0.88 })),
    { x: 0.22, rz: -Math.PI / 2 },
  );
  flash.add(core, cone);
  flash.userData.life = 0.07;
  flash.userData.pawnSlugFxResources = PAWN_SLUG_FX_RESOURCE_VERSION;
  return flash;
}

export function createExplosionParticle(color = 0xffa43c, size = 0.1) {
  const particle = mesh(
    sharedFxResource('explosion-particle-unit-geometry', () => new THREE.SphereGeometry(1, 7, 5)),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
  particle.scale.setScalar(size);
  particle.userData.pawnSlugFxGeometry = PAWN_SLUG_FX_RESOURCE_VERSION;
  return particle;
}

export function createSlugEnvironment(scene) {
  const env = new THREE.Group();
  env.name = 'pawn-slug-environment';
  env.userData.pawnSlugStaticInstances = PAWN_SLUG_STATIC_INSTANCE_VERSION;
  scene.add(env);

  const ground = mesh(new THREE.BoxGeometry(150, 0.62, 7.6), std(0x272622, 0.99), { x: 72, y: -0.31 });
  ground.receiveShadow = true;
  env.add(ground);

  const lane = mesh(
    new THREE.PlaneGeometry(150, 4.95),
    new THREE.MeshStandardMaterial({ color: 0x3a352e, roughness: 1, metalness: 0 }),
    { x: 72, y: 0.012, rx: -Math.PI / 2 },
  );
  lane.receiveShadow = true;
  lane.castShadow = false;
  env.add(lane);

  const shoulderA = mesh(new THREE.BoxGeometry(150, 0.09, 0.24), std(0x1f2223, 0.93, 0.08), { x: 72, y: 0.02, z: 2.39 });
  const shoulderB = shoulderA.clone(); shoulderB.position.z = -2.39;
  env.add(shoulderA, shoulderB);

  const rutMaterial = new THREE.MeshStandardMaterial({ color: 0x211f1c, roughness: 1 });
  for (const z of [-0.66, -0.46, 0.48, 0.68]) {
    const rut = mesh(new THREE.PlaneGeometry(150, 0.085), rutMaterial.clone(), { x: 72, y: 0.024, z, rx: -Math.PI / 2 });
    rut.castShadow = false;
    env.add(rut);
  }

  const craterRockInstances = [];
  for (let x = 8; x < 145; x += 13.5) {
    const z = seededUnit(x) > 0.5 ? 1.18 : -1.32;
    addCrater(
      env,
      craterRockInstances,
      x + seededUnit(x + 1) * 2.1,
      z,
      0.7 + seededUnit(x + 2) * 0.55,
    );
  }
  const craterRocks = createPawnSlugStaticInstanceBatch({
    name: 'pawn-slug-crater-rocks-instanced',
    geometry: new THREE.DodecahedronGeometry(1, 0),
    material: std(0x5b5043, 0.98),
    instances: craterRockInstances,
  });
  if (craterRocks) env.add(craterRocks);

  for (let x = 5; x < 145; x += 10.5) {
    const variant = Math.floor(x / 10.5) % 3;
    if (variant === 0) addBrokenBarrier(env, x, 1.78, seededUnit(x) * 0.18 - 0.09);
    else if (variant === 1) addSandbagNest(env, x, 1.68, 4 + (Math.floor(x) % 2));
    else addHedgehog(env, x, 1.48);
  }

  const rubbleDarkInstances = [];
  const rubbleLightInstances = [];
  for (let x = 3.2; x < 145; x += 6.8) {
    const count = 2 + (Math.floor(x) % 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 0.1 + seededUnit(x * 4 + i) * 0.11;
      const instances = i % 2 ? rubbleDarkInstances : rubbleLightInstances;
      instances.push({
        x: x + i * 0.24,
        y: 0.07,
        z: 1.02 + seededUnit(i * 17 + x) * 0.78,
        ry: i * 0.7,
        scale: radius,
      });
    }
  }
  const rubbleDark = createPawnSlugStaticInstanceBatch({
    name: 'pawn-slug-rubble-dark-instanced',
    geometry: new THREE.DodecahedronGeometry(1, 0),
    material: std(0x4f483f, 0.98),
    instances: rubbleDarkInstances,
  });
  const rubbleLight = createPawnSlugStaticInstanceBatch({
    name: 'pawn-slug-rubble-light-instanced',
    geometry: new THREE.DodecahedronGeometry(1, 0),
    material: std(0x595047, 0.98),
    instances: rubbleLightInstances,
  });
  if (rubbleDark) env.add(rubbleDark);
  if (rubbleLight) env.add(rubbleLight);

  const wall = new THREE.Group();
  wall.name = 'pawn-slug-fortress-wall';
  wall.position.z = -4.85;
  env.add(wall);
  const wallBattlementInstances = [];
  for (let x = 4; x < 146; x += 8.7) {
    const height = 2.65 + seededUnit(x) * 0.55;
    const segment = mesh(new THREE.BoxGeometry(7.9, height, 1.08), std(0x292e35, 0.96), { x, y: height / 2 });
    wall.add(segment);
    for (let b = -3.45; b <= 3.45; b += 0.86) {
      if (seededUnit(x + b * 10) < 0.16) continue;
      wallBattlementInstances.push({ x: x + b, y: height + 0.2 });
    }
  }
  const wallBattlements = createPawnSlugStaticInstanceBatch({
    name: 'pawn-slug-wall-battlements-instanced',
    geometry: new THREE.BoxGeometry(0.42, 0.4, 1.18),
    material: std(0x22272d, 0.95),
    instances: wallBattlementInstances,
  });
  if (wallBattlements) wall.add(wallBattlements);

  env.userData.pawnSlugStaticBatchedInstances = craterRockInstances.length
    + rubbleDarkInstances.length
    + rubbleLightInstances.length
    + wallBattlementInstances.length;
  env.userData.pawnSlugStaticBatchDrawMeshes = 4;

  for (let x = 12, variant = 0; x < 145; x += PAWN_SLUG_ENVIRONMENT_META.landmarkSpacing, variant += 1) {
    const height = 5.15 + seededUnit(x) * 1.65;
    addFortressTower(env, x, height, variant);
  }

  const far = new THREE.Group();
  far.name = 'pawn-slug-far-parallax';
  far.position.z = -8;
  env.add(far);

  const farWall = mesh(new THREE.BoxGeometry(170, 2.2, 1.2), new THREE.MeshLambertMaterial({ color: 0x181d23 }), { x: 72, y: 1.1, z: -1.3 });
  farWall.castShadow = false;
  far.add(farWall);

  for (let x = -8; x < 162; x += 11.5) {
    const height = 5.8 + seededUnit(x + 30) * 2.6;
    const hill = mesh(
      new THREE.ConeGeometry(4.2 + seededUnit(x) * 2.9, height, 7),
      new THREE.MeshLambertMaterial({ color: x % 23 < 11 ? 0x1b2027 : 0x20252b }),
      { x, y: 1.8 + height * 0.1, z: -2.2, ry: Math.PI / 6 },
    );
    hill.scale.z = 0.34;
    hill.castShadow = false;
    far.add(hill);
  }

  for (const x of [22, 58, 94, 132]) addSmokePlume(far, x, 2.4, -1.1, 0.9 + seededUnit(x) * 0.45);

  return { root: env, far };
}

export function disposePawnSlugObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    if (child.geometry && !isSharedFxResource(child.geometry)) child.geometry.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || isSharedFxResource(material)) continue;
      if (material.map && !isSharedFxResource(material.map)) material.map.dispose?.();
      material.dispose?.();
    }
  });
}
