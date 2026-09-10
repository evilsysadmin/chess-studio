import * as THREE from 'three';
import {
  createPawnSlugCastleDungeon,
  createPawnSlugFallenForest,
  createPawnSlugGambitRuins,
} from './pawnSlugScenarioRenderer.js';
import { attachPawnSlugScenarioAmbience } from './pawnSlugScenarioAmbience.js';
import {
  PAWN_SLUG_STATIC_INSTANCE_VERSION,
  createPawnSlugStaticInstanceBatch,
} from './pawnSlugStaticInstances.js';

export const PAWN_SLUG_LANDMARK_META = Object.freeze({
  landmarks: Object.freeze([
    Object.freeze({ id: 'fallen-forest', x: 10.5, label: 'Bosque de las piezas caídas' }),
    Object.freeze({ id: 'command-post', x: 29.5, label: 'Puesto de mando bombardeado' }),
    Object.freeze({ id: 'gambit-ruins', x: 30.5, label: 'Ruinas del Gambito' }),
    Object.freeze({ id: 'dungeon-gate', x: 44.5, label: 'Dungeon bajo el castillo' }),
    Object.freeze({ id: 'wrecked-searchlight', x: 66.5, label: 'Reflector derribado' }),
    Object.freeze({ id: 'hero-barricade', x: 104.5, label: 'Barricada de última línea' }),
    Object.freeze({ id: 'boss-fortress', x: 114.5, label: 'Fortaleza incendiada del Panzer-Rook' }),
  ]),
  desktopDetailBudget: 7,
  coarseDetailBudget: 5,
  desktopLocalLightBudget: 4,
  coarseLocalLightBudget: 0,
  staticBatching: PAWN_SLUG_STATIC_INSTANCE_VERSION,
});

function material(color, roughness = 0.8, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function mesh(geometry, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function localPointLight(name, color, intensity, distance, { x = 0, y = 0, z = 0 } = {}) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.name = name;
  light.position.set(x, y, z);
  light.castShadow = false;
  return light;
}

function addInstances(parent, name, geometry, mat, instances) {
  const batch = createPawnSlugStaticInstanceBatch({ name, geometry, material: mat, instances });
  if (batch) parent.add(batch);
  return batch;
}

function scenarioRoot(factory, x, coarse, { name, id }) {
  const root = factory({ coarse });
  root.name = name;
  root.position.set(x, 0, -2.55);
  root.userData.premiumScenario = id;
  root.userData.scenarioSource = 'tile-map';
  return root;
}

function forestScenario(x, coarse) {
  return scenarioRoot(createPawnSlugFallenForest, x, coarse, {
    name: 'pawn-slug-landmark-fallen-forest',
    id: 'fallen-forest',
  });
}

function commandPost(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-command-post';
  root.position.set(x, 0, 1.72);
  root.add(
    mesh(new THREE.BoxGeometry(3.45, 0.95, 1.55), material(0x34363a, 0.94, 0.06), { y: 0.48 }),
    mesh(new THREE.BoxGeometry(3.85, 0.2, 1.82), material(0x25282b, 0.9, 0.12), { y: 1.05, rz: -0.025 }),
    mesh(new THREE.BoxGeometry(1.15, 0.58, 0.12), material(0x111315, 0.98), { x: 0.55, y: 0.62, z: 0.82 }),
  );
  if (!coarse) {
    root.add(
      localPointLight('pawn-slug-command-post-light', 0xffb45f, 0.95, 5.2, { x: 1.2, y: 1.02, z: 1.05 }),
      mesh(new THREE.SphereGeometry(0.09, 8, 6), material(0xe7b86a, 0.34, 0.08, 0xffb34f, 2.1), { x: 1.26, y: 0.82, z: 0.87 }),
    );
    addInstances(root, 'pawn-slug-command-post-sandbags-instanced', new THREE.SphereGeometry(0.18, 8, 6), material(0x625746, 1), Array.from({ length: 5 }, (_, i) => ({ x: -1.35 + i * 0.46, y: 0.16, z: 0.93 })));
  }
  return root;
}

function ruinsScenario(x, coarse) {
  return scenarioRoot(createPawnSlugGambitRuins, x, coarse, {
    name: 'pawn-slug-landmark-gambit-ruins',
    id: 'gambit-ruins',
  });
}

function dungeonScenario(x, coarse) {
  return scenarioRoot(createPawnSlugCastleDungeon, x, coarse, {
    name: 'pawn-slug-landmark-dungeon-gate',
    id: 'castle-dungeon',
  });
}

function wreckedSearchlight(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-wrecked-searchlight';
  root.position.set(x, 0, 1.55);
  addInstances(root, 'pawn-slug-searchlight-legs-instanced', new THREE.CylinderGeometry(0.055, 0.07, 1, 8), material(0x454b50, 0.62, 0.48), [
    { x: -0.38, y: 0.72, rz: 0.46, sy: 1.65 },
    { x: 0.38, y: 0.7, rz: -0.56, sy: 1.55 },
    { x: 0.12, y: 0.68, rx: 0.32, rz: 0.12, sy: 1.55 },
  ]);
  const pivot = new THREE.Group();
  pivot.position.set(0.18, 1.42, 0);
  pivot.rotation.z = -0.63;
  pivot.add(
    mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, coarse ? 10 : 16), material(0x4c5359, 0.48, 0.52), { rz: Math.PI / 2 }),
    mesh(new THREE.CircleGeometry(0.31, coarse ? 10 : 18), material(0x9a8053, 0.3, 0.12, 0xf0a94f, coarse ? 0.18 : 1.25), { x: 0.27, ry: Math.PI / 2 }),
  );
  root.add(pivot);
  if (!coarse) root.add(localPointLight('pawn-slug-searchlight-glow', 0xf1ac5d, 0.65, 4.4, { x: 0.42, y: 1.42, z: 0.15 }));
  return root;
}

function heroBarricade(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-hero-barricade';
  root.position.set(x, 0, 1.62);
  const bagInstances = [];
  const rows = coarse ? 2 : 3;
  for (let row = 0; row < rows; row += 1) {
    const count = 7 - row;
    for (let i = 0; i < count; i += 1) {
      bagInstances.push({ x: (i - (count - 1) / 2) * 0.42 + row * 0.08, y: 0.13 + row * 0.2, z: (i % 2) * 0.035, sx: 1.18, sy: 0.56, sz: 0.82 });
    }
  }
  addInstances(root, 'pawn-slug-hero-barricade-sandbags-instanced', new THREE.SphereGeometry(0.25, 8, 6), material(0x655946, 0.98, 0.01), bagInstances);
  root.add(mesh(new THREE.BoxGeometry(1.6, 0.54, 0.09), material(0x303438, 0.66, 0.45), { y: 0.94, z: 0.02 }));
  if (!coarse) {
    const obstacle = new THREE.Group();
    obstacle.name = 'pawn-slug-barricade-hedgehog';
    obstacle.position.set(1.85, 0.38, 0.18);
    addInstances(obstacle, 'pawn-slug-barricade-hedgehog-beams-instanced', new THREE.BoxGeometry(1.15, 0.11, 0.11), material(0x343a3f, 0.62, 0.5), [-Math.PI / 3, 0, Math.PI / 3].map((rz) => ({ rz })));
    root.add(obstacle);
  }
  return root;
}

function bossFortress(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-boss-fortress';
  root.position.set(x, 0, -2.35);
  const stone = material(0x2a3035, 0.96, 0.03);
  const dark = material(0x171b1f, 1, 0.01);
  const fire = material(0xff8c28, 0.4, 0.02, 0xff641f, coarse ? 1.4 : 3.4);
  root.add(
    mesh(new THREE.BoxGeometry(13.2, 4.6, 1.15), stone, { y: 2.3 }),
    mesh(new THREE.BoxGeometry(2.55, 7.5, 1.55), dark, { x: -5.55, y: 3.72, z: 0.08 }),
    mesh(new THREE.BoxGeometry(2.55, 7.5, 1.55), dark, { x: 5.55, y: 3.72, z: 0.08 }),
    mesh(new THREE.BoxGeometry(4.15, 4.05, 0.34), material(0x080a0c, 1), { y: 1.85, z: 0.72 }),
  );
  const arch = mesh(new THREE.TorusGeometry(2.08, 0.43, coarse ? 7 : 10, coarse ? 18 : 28, Math.PI), stone, { y: 3.72, z: 0.83, rz: Math.PI });
  arch.name = 'pawn-slug-boss-fortress-arch';
  root.add(arch);
  for (const bx of (coarse ? [-4.1, 4.1] : [-4.1, -2.9, 2.9, 4.1])) {
    root.add(
      mesh(new THREE.CylinderGeometry(0.34, 0.43, 0.52, 8), material(0x30373c, 0.58, 0.52), { x: bx, y: 0.26, z: 1.02 }),
      mesh(new THREE.ConeGeometry(0.31, 0.88, coarse ? 7 : 10), fire, { x: bx, y: 0.95, z: 1.02 }),
    );
  }
  if (!coarse) {
    root.add(
      localPointLight('pawn-slug-boss-fortress-left-fire', 0xff7027, 1.55, 7.5, { x: -4.45, y: 3.4, z: 1.5 }),
      localPointLight('pawn-slug-boss-fortress-right-fire', 0xff8f35, 1.45, 7.5, { x: 4.25, y: 3.55, z: 1.5 }),
    );
  }
  root.userData.bossArena = true;
  root.userData.bossWorldX = x;
  return root;
}

export function createPawnSlugPremiumLandmarks(parent, { coarse = false } = {}) {
  if (!parent) throw new Error('Pawn Slug landmarks require a parent group');
  const root = new THREE.Group();
  root.name = 'pawn-slug-premium-landmarks';
  root.userData.pawnSlugStaticInstances = PAWN_SLUG_STATIC_INSTANCE_VERSION;
  root.add(
    forestScenario(PAWN_SLUG_LANDMARK_META.landmarks[0].x, coarse),
    commandPost(PAWN_SLUG_LANDMARK_META.landmarks[1].x, coarse),
    ruinsScenario(PAWN_SLUG_LANDMARK_META.landmarks[2].x, coarse),
    dungeonScenario(PAWN_SLUG_LANDMARK_META.landmarks[3].x, coarse),
    wreckedSearchlight(PAWN_SLUG_LANDMARK_META.landmarks[4].x, coarse),
    heroBarricade(PAWN_SLUG_LANDMARK_META.landmarks[5].x, coarse),
    bossFortress(PAWN_SLUG_LANDMARK_META.landmarks[6].x, coarse),
  );
  attachPawnSlugScenarioAmbience(root);
  parent.add(root);
  return root;
}
