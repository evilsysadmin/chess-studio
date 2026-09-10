import * as THREE from 'three';
import {
  PAWN_SLUG_STATIC_INSTANCE_VERSION,
  createPawnSlugStaticInstanceBatch,
} from './pawnSlugStaticInstances.js';

export const PAWN_SLUG_LANDMARK_META = Object.freeze({
  landmarks: Object.freeze([
    Object.freeze({ id: 'command-post', x: 29.5, label: 'Puesto de mando bombardeado' }),
    Object.freeze({ id: 'dungeon-gate', x: 48.5, label: 'Acceso al Dungeon bajo el castillo' }),
    Object.freeze({ id: 'wrecked-searchlight', x: 66.5, label: 'Reflector derribado' }),
    Object.freeze({ id: 'hero-barricade', x: 104.5, label: 'Barricada de última línea' }),
    Object.freeze({ id: 'boss-fortress', x: 114.5, label: 'Fortaleza incendiada del Panzer-Rook' }),
  ]),
  desktopDetailBudget: 5,
  coarseDetailBudget: 3,
  desktopLocalLightBudget: 4,
  coarseLocalLightBudget: 0,
  staticBatching: PAWN_SLUG_STATIC_INSTANCE_VERSION,
  desktopBatchedInstances: 35,
  coarseBatchedInstances: 16,
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

function addInstanceBatch(parent, options) {
  const batch = createPawnSlugStaticInstanceBatch(options);
  if (batch) parent.add(batch);
  return batch;
}

function localPointLight(name, color, intensity, distance, { x = 0, y = 0, z = 0 } = {}) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.name = name;
  light.position.set(x, y, z);
  light.castShadow = false;
  return light;
}

function commandPost(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-command-post';
  root.position.set(x, 0, 1.72);

  root.add(
    mesh(new THREE.BoxGeometry(3.45, 0.95, 1.55), material(0x34363a, 0.94, 0.06), { y: 0.48 }),
    mesh(new THREE.BoxGeometry(3.85, 0.2, 1.82), material(0x25282b, 0.9, 0.12), { y: 1.05, rz: -0.025 }),
    mesh(new THREE.BoxGeometry(1.15, 0.58, 0.12), material(0x111315, 0.98), { x: 0.55, y: 0.62, z: 0.82 }),
    mesh(new THREE.BoxGeometry(0.85, 0.48, 0.14), material(0x161719, 0.98), { x: -0.86, y: 0.58, z: 0.83 }),
  );

  const antennaMat = material(0x60666b, 0.48, 0.62);
  root.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 7), antennaMat, { x: -1.2, y: 2.02, rz: -0.08 }));
  if (!coarse) {
    const lampMaterial = material(0xe7b86a, 0.34, 0.08, 0xffb34f, 2.1);
    const lamp = mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMaterial, { x: 1.26, y: 0.82, z: 0.87 });
    lamp.name = 'pawn-slug-command-post-lamp';
    lamp.castShadow = false;
    root.add(
      lamp,
      localPointLight('pawn-slug-command-post-light', 0xffb45f, 0.95, 5.2, { x: 1.2, y: 1.02, z: 1.05 }),
    );

    addInstanceBatch(root, {
      name: 'pawn-slug-command-post-sandbags-instanced',
      geometry: new THREE.SphereGeometry(0.18, 8, 6),
      material: material(0x625746, 1),
      instances: Array.from({ length: 5 }, (_, i) => ({
        x: -1.35 + i * 0.46,
        y: 0.16,
        z: 0.93,
        rz: (i % 2 ? 1 : -1) * 0.06,
      })),
    });

    addInstanceBatch(root, {
      name: 'pawn-slug-command-post-debris-instanced',
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: material(0x55595c, 0.72, 0.34),
      instances: Array.from({ length: 4 }, (_, i) => ({
        x: -1.45 + i * 0.85,
        y: 0.07,
        z: 1.02 + (i % 2) * 0.08,
        rz: -0.22 + i * 0.14,
        sx: 0.18 + i * 0.03,
        sy: 0.055,
        sz: 0.09,
      })),
    });
  }
  return root;
}

function dungeonGate(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-dungeon-gate';
  root.position.set(x, 0, -2.55);
  root.userData.premiumScenario = 'castle-dungeon';

  const stone = material(0x24282d, 0.98, 0.02);
  const stoneEdge = material(0x353a40, 0.93, 0.03);
  const iron = material(0x23282c, 0.56, 0.58);
  const warm = material(0x8c5b2f, 0.58, 0.08, 0xff8f3f, coarse ? 0.7 : 2.2);

  root.add(
    mesh(new THREE.BoxGeometry(7.2, 4.7, 1.0), stone, { y: 2.35 }),
    mesh(new THREE.BoxGeometry(2.55, 3.9, 0.28), material(0x090b0d, 1), { y: 1.84, z: 0.58 }),
    mesh(new THREE.BoxGeometry(0.62, 5.25, 1.18), stoneEdge, { x: -3.1, y: 2.62, z: 0.04 }),
    mesh(new THREE.BoxGeometry(0.62, 5.25, 1.18), stoneEdge, { x: 3.1, y: 2.62, z: 0.04 }),
  );

  const arch = mesh(new THREE.TorusGeometry(1.48, 0.46, coarse ? 7 : 10, coarse ? 18 : 28, Math.PI), stoneEdge, {
    y: 3.7,
    z: 0.68,
    rz: Math.PI,
  });
  arch.name = 'pawn-slug-dungeon-arch';
  root.add(arch);

  const barCount = coarse ? 5 : 7;
  for (let i = 0; i < barCount; i += 1) {
    const offset = (i - (barCount - 1) / 2) * (2.05 / Math.max(1, barCount - 1));
    root.add(mesh(new THREE.BoxGeometry(0.07, 3.55, 0.09), iron, { x: offset, y: 1.82, z: 0.78 }));
  }
  root.add(mesh(new THREE.BoxGeometry(2.35, 0.1, 0.12), iron, { y: 2.55, z: 0.79 }));

  const torchXs = coarse ? [-2.2, 2.2] : [-2.28, 2.28];
  for (const tx of torchXs) {
    root.add(
      mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 7), iron, { x: tx, y: 2.15, z: 0.76, rz: tx < 0 ? -0.18 : 0.18 }),
      mesh(new THREE.ConeGeometry(0.18, 0.55, coarse ? 6 : 9), warm, { x: tx + (tx < 0 ? -0.06 : 0.06), y: 2.64, z: 0.79 }),
    );
  }

  const chainLinks = coarse ? 3 : 6;
  for (let i = 0; i < chainLinks; i += 1) {
    const link = mesh(new THREE.TorusGeometry(0.12, 0.028, 5, 8), iron, {
      x: -1.95 + i * 0.02,
      y: 4.35 - i * 0.31,
      z: 0.73,
      rz: i % 2 ? Math.PI / 2 : 0,
    });
    link.name = i === 0 ? 'pawn-slug-dungeon-chain' : '';
    root.add(link);
  }

  if (!coarse) {
    const pawnRelic = new THREE.Group();
    pawnRelic.name = 'pawn-slug-dungeon-fallen-pawn';
    pawnRelic.position.set(2.15, 0.08, 0.95);
    pawnRelic.rotation.z = -0.38;
    pawnRelic.add(
      mesh(new THREE.CylinderGeometry(0.23, 0.36, 0.48, 10), material(0x4c4a45, 0.95), { y: 0.22 }),
      mesh(new THREE.SphereGeometry(0.23, 10, 7), material(0x56534d, 0.94), { y: 0.64 }),
    );
    root.add(pawnRelic);
  }

  return root;
}

function wreckedSearchlight(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-wrecked-searchlight';
  root.position.set(x, 0, 1.55);

  addInstanceBatch(root, {
    name: 'pawn-slug-searchlight-legs-instanced',
    geometry: new THREE.CylinderGeometry(0.055, 0.07, 1, 8),
    material: material(0x454b50, 0.62, 0.48),
    instances: [
      { x: -0.38, y: 0.72, rz: 0.46, sy: 1.65 },
      { x: 0.38, y: 0.7, rz: -0.56, sy: 1.55 },
      { x: 0.12, y: 0.68, rx: 0.32, rz: 0.12, sy: 1.55 },
    ],
  });

  const pivot = new THREE.Group();
  pivot.position.set(0.18, 1.42, 0);
  pivot.rotation.z = -0.63;
  const housing = mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, coarse ? 10 : 16), material(0x4c5359, 0.48, 0.52), { rz: Math.PI / 2 });
  const lensMaterial = material(0x9a8053, 0.3, 0.12, 0xf0a94f, coarse ? 0.18 : 1.25);
  lensMaterial.transparent = true;
  lensMaterial.opacity = coarse ? 0.48 : 0.72;
  const lens = mesh(new THREE.CircleGeometry(0.31, coarse ? 10 : 18), lensMaterial, { x: 0.27, ry: Math.PI / 2 });
  lens.name = 'pawn-slug-searchlight-lens';
  lens.castShadow = false;
  pivot.add(housing, lens);
  root.add(pivot);

  if (!coarse) {
    root.add(
      localPointLight('pawn-slug-searchlight-glow', 0xf1ac5d, 0.65, 4.4, { x: 0.42, y: 1.42, z: 0.15 }),
      mesh(new THREE.BoxGeometry(0.72, 0.12, 0.16), material(0x353a3e, 0.74, 0.42), { x: -0.72, y: 0.12, z: 0.22, rz: 0.26 }),
      mesh(new THREE.BoxGeometry(0.52, 0.09, 0.12), material(0x2b3034, 0.78, 0.38), { x: 0.88, y: 0.09, z: 0.14, rz: -0.34 }),
    );
  }
  return root;
}

function heroBarricade(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-hero-barricade';
  root.position.set(x, 0, 1.62);
  const rows = coarse ? 2 : 3;
  const bagInstances = [];
  for (let row = 0; row < rows; row += 1) {
    const count = 7 - row;
    for (let i = 0; i < count; i += 1) {
      bagInstances.push({
        x: (i - (count - 1) / 2) * 0.42 + row * 0.08,
        y: 0.13 + row * 0.2,
        z: (i % 2) * 0.035,
        rz: (i % 2 ? 1 : -1) * 0.04,
        sx: 1.18,
        sy: 0.56,
        sz: 0.82,
      });
    }
  }
  addInstanceBatch(root, {
    name: 'pawn-slug-hero-barricade-sandbags-instanced',
    geometry: new THREE.SphereGeometry(0.25, 8, 6),
    material: material(0x655946, 0.98, 0.01),
    instances: bagInstances,
  });

  const plate = mesh(new THREE.BoxGeometry(1.6, 0.54, 0.09), material(0x303438, 0.66, 0.45), { y: 0.94, z: 0.02, rz: -0.04 });
  root.add(plate);
  if (!coarse) {
    addInstanceBatch(root, {
      name: 'pawn-slug-hero-barricade-red-cross-instanced',
      geometry: new THREE.BoxGeometry(0.08, 0.36, 0.04),
      material: new THREE.MeshBasicMaterial({ color: 0xb64934 }),
      instances: [
        { x: -0.5, y: 0.95, z: 0.075 },
        { x: -0.5, y: 0.95, z: 0.077, rz: Math.PI / 2 },
      ],
    });
    root.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 7), material(0x262a2d, 0.52, 0.55), { x: 1.22, y: 1.36, rz: -0.15 }));

    const obstacle = new THREE.Group();
    obstacle.name = 'pawn-slug-barricade-hedgehog';
    obstacle.position.set(1.85, 0.38, 0.18);
    addInstanceBatch(obstacle, {
      name: 'pawn-slug-barricade-hedgehog-beams-instanced',
      geometry: new THREE.BoxGeometry(1.15, 0.11, 0.11),
      material: material(0x343a3f, 0.62, 0.5),
      instances: [-Math.PI / 3, 0, Math.PI / 3].map((rz) => ({ rz })),
    });
    root.add(obstacle);
  }
  return root;
}

function bossFortress(x, coarse) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-landmark-boss-fortress';
  root.position.set(x, 0, -2.35);

  const stone = material(0x2a3035, 0.96, 0.03);
  const darkStone = material(0x171b1f, 1, 0.01);
  const iron = material(0x30373c, 0.58, 0.52);
  const fire = material(0xff8c28, 0.4, 0.02, 0xff641f, coarse ? 1.4 : 3.4);
  const ember = material(0xffc45f, 0.34, 0.01, 0xff9b35, coarse ? 1.1 : 4.1);

  root.add(
    mesh(new THREE.BoxGeometry(13.2, 4.6, 1.15), stone, { y: 2.3 }),
    mesh(new THREE.BoxGeometry(2.55, 7.5, 1.55), darkStone, { x: -5.55, y: 3.72, z: 0.08 }),
    mesh(new THREE.BoxGeometry(2.55, 7.5, 1.55), darkStone, { x: 5.55, y: 3.72, z: 0.08 }),
    mesh(new THREE.BoxGeometry(4.15, 4.05, 0.34), material(0x080a0c, 1), { y: 1.85, z: 0.72 }),
    mesh(new THREE.BoxGeometry(4.85, 0.72, 0.7), stone, { y: 4.35, z: 0.24 }),
  );

  const arch = mesh(new THREE.TorusGeometry(2.08, 0.43, coarse ? 7 : 10, coarse ? 18 : 28, Math.PI), stone, {
    y: 3.72,
    z: 0.83,
    rz: Math.PI,
  });
  arch.name = 'pawn-slug-boss-fortress-arch';
  root.add(arch);

  const battlementGeometry = new THREE.BoxGeometry(0.72, 0.68, 0.92);
  for (const tx of [-5.95, -5.15, -4.35, -3.3, -2.25, -1.2, -0.15, 0.9, 1.95, 3.0, 4.35, 5.15, 5.95]) {
    root.add(mesh(battlementGeometry, darkStone, { x: tx, y: Math.abs(tx) > 4 ? 7.72 : 4.94, z: 0.12 }));
  }

  for (const [wx, wy, scale] of [
    [-5.45, 5.45, 1.0],
    [5.52, 5.12, 0.88],
    [-3.55, 3.2, 0.74],
    [3.28, 3.42, 0.68],
  ]) {
    root.add(
      mesh(new THREE.BoxGeometry(0.62 * scale, 1.22 * scale, 0.16), material(0x130c08, 1), { x: wx, y: wy, z: 0.92 }),
      mesh(new THREE.SphereGeometry(0.33 * scale, coarse ? 7 : 10, coarse ? 5 : 7), fire, { x: wx, y: wy, z: 1.08 }),
      mesh(new THREE.SphereGeometry(0.17 * scale, coarse ? 6 : 8, coarse ? 4 : 6), ember, { x: wx + 0.08, y: wy + 0.12, z: 1.17 }),
    );
  }

  const brazierPositions = coarse ? [-4.1, 4.1] : [-4.1, -2.9, 2.9, 4.1];
  for (const bx of brazierPositions) {
    root.add(
      mesh(new THREE.CylinderGeometry(0.34, 0.43, 0.52, 8), iron, { x: bx, y: 0.26, z: 1.02 }),
      mesh(new THREE.ConeGeometry(0.31, 0.88, coarse ? 7 : 10), fire, { x: bx, y: 0.95, z: 1.02 }),
      mesh(new THREE.ConeGeometry(0.16, 0.62, coarse ? 6 : 8), ember, { x: bx + 0.05, y: 1.03, z: 1.09 }),
    );
  }

  const rubbleCount = coarse ? 6 : 14;
  for (let i = 0; i < rubbleCount; i += 1) {
    const side = i % 2 ? 1 : -1;
    root.add(mesh(
      new THREE.BoxGeometry(0.42 + (i % 3) * 0.12, 0.18 + (i % 2) * 0.09, 0.35),
      i % 3 === 0 ? iron : stone,
      {
        x: side * (2.2 + (i % 7) * 0.55),
        y: 0.11 + (i % 3) * 0.05,
        z: 0.7 + (i % 4) * 0.11,
        rz: side * (0.08 + (i % 4) * 0.09),
      },
    ));
  }

  if (!coarse) {
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x202428, transparent: true, opacity: 0.28, depthWrite: false });
    for (const [sx, sy, ss] of [
      [-5.2, 7.9, 1.15], [-4.75, 8.85, 1.45], [-4.25, 9.9, 1.7],
      [4.95, 7.5, 1.05], [4.55, 8.45, 1.38], [4.05, 9.35, 1.55],
    ]) {
      const smoke = mesh(new THREE.SphereGeometry(ss, 10, 7), smokeMat, { x: sx, y: sy, z: -0.25 });
      smoke.castShadow = false;
      smoke.receiveShadow = false;
      root.add(smoke);
    }
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
    commandPost(PAWN_SLUG_LANDMARK_META.landmarks[0].x, coarse),
    dungeonGate(PAWN_SLUG_LANDMARK_META.landmarks[1].x, coarse),
    wreckedSearchlight(PAWN_SLUG_LANDMARK_META.landmarks[2].x, coarse),
    heroBarricade(PAWN_SLUG_LANDMARK_META.landmarks[3].x, coarse),
    bossFortress(PAWN_SLUG_LANDMARK_META.landmarks[4].x, coarse),
  );
  parent.add(root);
  return root;
}
