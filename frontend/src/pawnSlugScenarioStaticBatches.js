import * as THREE from 'three';
import { createPawnSlugStaticInstanceBatch } from './pawnSlugStaticInstances.js';
import { pawnSlugScenarioTilesByKind } from './pawnSlugTileMaps.js';

const PALETTE = Object.freeze({
  stone: 0x24282d,
  stoneEdge: 0x353a40,
  iron: 0x23282c,
  warm: 0x8c5b2f,
  bark: 0x453625,
  barkDark: 0x241c16,
  ruinStone: 0x71695f,
  ruinShade: 0x423d38,
});

function material(color, roughness = 0.8, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function localX(tile, scenario) {
  return tile.x - scenario.originX;
}

function marker(root, name, { x = 0, y = 0, z = 0 } = {}) {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.set(x, y, z);
  node.userData.pawnSlugScenarioBatchMarker = true;
  root.add(node);
  return node;
}

function addBatch(root, name, geometry, mat, instances, { castShadow = true, receiveShadow = true } = {}) {
  const batch = createPawnSlugStaticInstanceBatch({
    name,
    geometry,
    material: mat,
    instances,
    castShadow,
    receiveShadow,
  });
  if (!batch) {
    geometry.dispose();
    mat.dispose();
    return null;
  }
  batch.userData.pawnSlugScenarioStaticBatch = true;
  root.add(batch);
  return batch;
}

function batchDungeon(root, scenario, coarse, tiles) {
  const batches = [];
  const stone = tiles('stone');
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-stone-instanced',
    new THREE.BoxGeometry(1.02, 0.5, 0.95),
    material(PALETTE.stone, 0.98, 0.02),
    stone.map((tile) => ({ x: localX(tile, scenario), y: 4.45, z: 0.08 })),
  ));

  const wallRibs = tiles('wall-rib');
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-wall-ribs-instanced',
    new THREE.BoxGeometry(0.42, 4.2, 0.78),
    material(PALETTE.stoneEdge, 0.93, 0.03),
    wallRibs.map((tile) => ({ x: localX(tile, scenario), y: 2.1, z: 0.25 })),
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-wall-caps-instanced',
    new THREE.BoxGeometry(0.92, 0.32, 0.82),
    material(PALETTE.stoneEdge, 0.93, 0.03),
    wallRibs.map((tile) => ({ x: localX(tile, scenario), y: 4.18, z: 0.25 })),
  ));

  const ceiling = tiles('ceiling-rib');
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-ceiling-ribs-instanced',
    new THREE.BoxGeometry(0.3, 0.42, 1.28),
    material(PALETTE.stoneEdge, 0.93, 0.03),
    ceiling.map((tile) => ({ x: localX(tile, scenario), y: 4.55, z: 0.1 })),
  ));

  const torches = tiles('torch');
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-torch-stems-instanced',
    new THREE.CylinderGeometry(0.035, 0.05, 0.72, 7),
    material(PALETTE.iron, 0.56, 0.58),
    torches.map((tile) => ({ x: localX(tile, scenario), y: 2.15, z: 0.92 })),
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-torch-flames-instanced',
    new THREE.ConeGeometry(0.18, 0.55, coarse ? 6 : 9),
    material(PALETTE.warm, 0.58, 0.08, 0xff8f3f, coarse ? 0.7 : 2.2),
    torches.map((tile) => ({ x: localX(tile, scenario), y: 2.64, z: 0.95 })),
  ));

  const gateTiles = tiles('gate');
  const bars = [];
  const rails = [];
  for (const tile of gateTiles) {
    const x = localX(tile, scenario);
    const count = coarse ? 5 : 7;
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * (2.05 / Math.max(1, count - 1));
      bars.push({ x: x + offset, y: 1.82, z: 0.92 });
    }
    rails.push({ x, y: 2.55, z: 0.93 });
  }
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-gate-bars-instanced',
    new THREE.BoxGeometry(0.07, 3.55, 0.09),
    material(PALETTE.iron, 0.56, 0.58),
    bars,
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-gate-rails-instanced',
    new THREE.BoxGeometry(2.35, 0.1, 0.12),
    material(PALETTE.iron, 0.56, 0.58),
    rails,
  ));

  const drains = tiles('drain');
  batches.push(addBatch(
    root,
    'pawn-slug-dungeon-drains-instanced',
    new THREE.BoxGeometry(0.92, 0.035, 0.35),
    material(PALETTE.iron, 0.56, 0.58),
    drains.map((tile) => ({ x: localX(tile, scenario), y: 0.035, z: 1.26 })),
    { castShadow: false },
  ));
  return batches.filter(Boolean);
}

function batchForest(root, scenario, coarse, tiles) {
  const batches = [];
  const trunks = tiles('forest-trunk');
  const trunkY = coarse ? 2.4 : 3.1;
  const branchY = coarse ? 3.1 : 4.2;
  batches.push(addBatch(
    root,
    'pawn-slug-forest-trunks-instanced',
    new THREE.CylinderGeometry(0.42, 0.62, coarse ? 4.8 : 6.2, coarse ? 7 : 10),
    material(PALETTE.bark, 0.98),
    trunks.map((tile) => ({ x: localX(tile, scenario), y: trunkY, z: -0.35, rz: 0.04 })),
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-forest-branches-instanced',
    new THREE.CylinderGeometry(0.18, 0.28, 2.1, coarse ? 6 : 8),
    material(PALETTE.barkDark, 1),
    trunks.map((tile) => ({ x: localX(tile, scenario) + 0.48, y: branchY, z: -0.35, rz: -0.72 })),
  ));
  for (const tile of trunks) marker(root, 'pawn-slug-forest-trunk', { x: localX(tile, scenario), z: -0.35 });

  const roots = tiles('forest-root');
  batches.push(addBatch(
    root,
    'pawn-slug-forest-roots-instanced',
    new THREE.CylinderGeometry(0.13, 0.24, 1.3, 7),
    material(PALETTE.barkDark, 1),
    roots.map((tile) => ({ x: localX(tile, scenario), y: 0.12, z: 0.52, rz: Math.PI / 2 - 0.12 })),
  ));
  for (const tile of roots) marker(root, 'pawn-slug-forest-root', { x: localX(tile, scenario), y: 0.12, z: 0.52 });
  return batches.filter(Boolean);
}

function batchRuins(root, scenario, coarse, tiles) {
  const batches = [];
  const columns = tiles('ruin-column');
  const bodyY = coarse ? 1.85 : 2.6;
  const capY = coarse ? 3.65 : 5.08;
  batches.push(addBatch(
    root,
    'pawn-slug-ruins-columns-instanced',
    new THREE.CylinderGeometry(0.42, 0.5, coarse ? 3.7 : 5.2, coarse ? 8 : 12),
    material(PALETTE.ruinStone, 0.96, 0.02),
    columns.map((tile) => ({ x: localX(tile, scenario), y: bodyY, z: -0.42 })),
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-ruins-column-bases-instanced',
    new THREE.CylinderGeometry(0.58, 0.58, 0.22, coarse ? 8 : 12),
    material(PALETTE.ruinShade, 0.99, 0.01),
    columns.map((tile) => ({ x: localX(tile, scenario), y: 0.11, z: -0.42 })),
  ));
  batches.push(addBatch(
    root,
    'pawn-slug-ruins-column-caps-instanced',
    new THREE.BoxGeometry(1.18, 0.28, 0.92),
    material(PALETTE.ruinStone, 0.96, 0.02),
    columns.map((tile) => {
      const x = localX(tile, scenario);
      return { x, y: capY, z: -0.42, rz: x % 2 ? 0.04 : -0.05 };
    }),
  ));
  for (const tile of columns) marker(root, 'pawn-slug-ruins-column', { x: localX(tile, scenario), z: -0.42 });

  const slabs = tiles('ruin-slab');
  batches.push(addBatch(
    root,
    'pawn-slug-ruins-slabs-instanced',
    new THREE.BoxGeometry(0.95, 0.18, 1.08),
    material(PALETTE.ruinShade, 0.98),
    slabs.map((tile) => ({
      x: localX(tile, scenario),
      y: 0.08,
      z: 0.55,
      rz: ((tile.column % 3) - 1) * 0.04,
    })),
  ));
  for (const tile of slabs) marker(root, 'pawn-slug-ruins-slab', { x: localX(tile, scenario), y: 0.08, z: 0.55 });
  return batches.filter(Boolean);
}

export function createPawnSlugScenarioStaticBatches(root, scenario, { coarse = false } = {}) {
  if (!root || !scenario) return Object.freeze({ batches: 0, instances: 0 });
  const cache = new Map();
  const tiles = (kind) => {
    if (!cache.has(kind)) cache.set(kind, pawnSlugScenarioTilesByKind(scenario, kind, { coarse }));
    return cache.get(kind);
  };

  let batches = [];
  if (scenario.id === 'castle-dungeon') batches = batchDungeon(root, scenario, coarse, tiles);
  else if (scenario.id === 'fallen-forest') batches = batchForest(root, scenario, coarse, tiles);
  else if (scenario.id === 'gambit-ruins') batches = batchRuins(root, scenario, coarse, tiles);

  const instances = batches.reduce((total, batch) => total + batch.count, 0);
  root.userData.pawnSlugScenarioStaticBatches = batches.length;
  root.userData.pawnSlugScenarioStaticInstances = instances;
  return Object.freeze({ batches: batches.length, instances });
}

export const PAWN_SLUG_SCENARIO_STATIC_BATCH_META = Object.freeze({
  strategy: 'instanced-by-scenario-part',
  preservesHeroProps: true,
  preservesAmbientActors: true,
  compatibilityMarkers: Object.freeze(['forest-trunk', 'forest-root', 'ruins-column', 'ruins-slab']),
});
