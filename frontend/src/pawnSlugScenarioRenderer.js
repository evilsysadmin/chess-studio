import * as THREE from 'three';
import {
  PAWN_SLUG_SCENARIO_TILEMAPS,
  pawnSlugScenarioTilesByKind,
} from './pawnSlugTileMaps.js';
import { createPawnSlugScenarioStaticBatches } from './pawnSlugScenarioStaticBatches.js';

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

const PALETTE = Object.freeze({
  stoneEdge: 0x353a40,
  iron: 0x23282c,
  barkDark: 0x241c16,
  relic: 0x5b5a54,
  ruinDust: 0x9b876c,
});

function localX(tile, scenario) {
  return tile.x - scenario.originX;
}

function renderChain(root, tile, scenario, coarse) {
  const x = localX(tile, scenario);
  const iron = material(PALETTE.iron, 0.56, 0.58);
  const count = coarse ? 3 : 6;
  for (let i = 0; i < count; i += 1) {
    const link = mesh(new THREE.TorusGeometry(0.12, 0.028, 5, 8), iron, {
      x: x + i * 0.02, y: 4.35 - i * 0.31, z: 0.93, rz: i % 2 ? Math.PI / 2 : 0,
    });
    if (i === 0) link.name = 'pawn-slug-dungeon-chain';
    root.add(link);
  }
}

function renderFallenPawn(root, tile, scenario) {
  const pawn = new THREE.Group();
  pawn.name = 'pawn-slug-dungeon-fallen-pawn';
  pawn.position.set(localX(tile, scenario), 0.08, 1.08);
  pawn.rotation.z = -0.38;
  pawn.add(
    mesh(new THREE.CylinderGeometry(0.23, 0.36, 0.48, 10), material(0x4c4a45, 0.95), { y: 0.22 }),
    mesh(new THREE.SphereGeometry(0.23, 10, 7), material(0x56534d, 0.94), { y: 0.64 }),
  );
  root.add(pawn);
}

function renderFallenKnight(root, tile, scenario) {
  const relic = new THREE.Group();
  relic.name = 'pawn-slug-forest-fallen-knight';
  relic.position.set(localX(tile, scenario), 0.18, 0.75);
  relic.rotation.z = -0.48;
  relic.add(
    mesh(new THREE.CylinderGeometry(0.34, 0.48, 0.52, 10), material(PALETTE.relic, 0.95), { y: 0.2 }),
    mesh(new THREE.BoxGeometry(0.48, 0.72, 0.38), material(PALETTE.relic, 0.92), { x: 0.04, y: 0.77, rz: 0.18 }),
    mesh(new THREE.ConeGeometry(0.24, 0.62, 8), material(PALETTE.relic, 0.9), { x: 0.17, y: 1.3, rz: -0.38 }),
  );
  root.add(relic);
}

function renderFireflies(root, tile, scenario) {
  const glow = material(0x85935f, 0.4, 0, 0xc6d986, 1.8);
  const group = new THREE.Group();
  group.name = 'pawn-slug-forest-fireflies';
  for (const [dx, dy] of [[-0.22, 2.2], [0.12, 2.65], [0.36, 1.8]]) {
    const fly = mesh(new THREE.SphereGeometry(0.035, 6, 5), glow, { x: dx, y: dy, z: 0.9 });
    fly.castShadow = false;
    group.add(fly);
  }
  group.position.x = localX(tile, scenario);
  root.add(group);
}

function renderBrokenRook(root, tile, scenario) {
  const rook = new THREE.Group();
  rook.name = 'pawn-slug-ruins-broken-rook';
  rook.position.set(localX(tile, scenario), 0.15, 0.82);
  rook.rotation.z = -0.31;
  const stone = material(PALETTE.relic, 0.94, 0.01);
  rook.add(
    mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.72, 10), stone, { y: 0.34 }),
    mesh(new THREE.CylinderGeometry(0.52, 0.46, 0.48, 10), stone, { y: 0.92 }),
  );
  for (const cx of [-0.32, 0, 0.32]) {
    rook.add(mesh(new THREE.BoxGeometry(0.2, 0.34, 0.55), stone, { x: cx, y: 1.3, rz: cx === 0 ? 0.05 : -0.08 }));
  }
  root.add(rook);
}

function renderDust(root, tile, scenario) {
  const dustMat = new THREE.MeshBasicMaterial({ color: PALETTE.ruinDust, transparent: true, opacity: 0.13, depthWrite: false });
  const group = new THREE.Group();
  group.name = 'pawn-slug-ruins-dust';
  group.position.x = localX(tile, scenario);
  for (const [dx, dy, scale] of [[-0.35, 0.65, 0.34], [0.15, 1.1, 0.42], [0.5, 0.45, 0.28]]) {
    const puff = mesh(new THREE.SphereGeometry(scale, 8, 6), dustMat, { x: dx, y: dy, z: 0.35 });
    puff.castShadow = false;
    puff.receiveShadow = false;
    group.add(puff);
  }
  root.add(group);
}

export function createPawnSlugScenarioFromTileMap(scenario, { coarse = false } = {}) {
  if (!scenario) throw new Error('Pawn Slug scenario renderer requires a tile map');
  const root = new THREE.Group();
  root.name = `pawn-slug-scenario-${scenario.id}`;
  root.userData.scenarioId = scenario.id;
  root.userData.dataDriven = true;

  createPawnSlugScenarioStaticBatches(root, scenario, { coarse });

  const tiles = (kind) => pawnSlugScenarioTilesByKind(scenario, kind, { coarse });
  for (const tile of tiles('chain')) renderChain(root, tile, scenario, coarse);
  for (const tile of tiles('fallen-pawn')) renderFallenPawn(root, tile, scenario);
  for (const tile of tiles('fallen-knight')) renderFallenKnight(root, tile, scenario);
  for (const tile of tiles('fireflies')) renderFireflies(root, tile, scenario);
  for (const tile of tiles('broken-rook')) renderBrokenRook(root, tile, scenario);
  for (const tile of tiles('dust')) renderDust(root, tile, scenario);

  const gateTiles = tiles('gate');
  if (gateTiles.length) {
    const arch = mesh(new THREE.TorusGeometry(1.48, 0.46, coarse ? 7 : 10, coarse ? 18 : 28, Math.PI), material(PALETTE.stoneEdge, 0.93, 0.03), {
      x: localX(gateTiles[0], scenario), y: 3.7, z: 0.84, rz: Math.PI,
    });
    arch.name = 'pawn-slug-dungeon-arch';
    root.add(arch);
  }

  if (!coarse && gateTiles.length) {
    const shadow = mesh(new THREE.PlaneGeometry(2.9, 3.5), new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.42, depthWrite: false }), {
      x: localX(gateTiles[0], scenario), y: 1.82, z: 0.46,
    });
    shadow.name = 'pawn-slug-dungeon-depth-shadow';
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    root.add(shadow);
  }

  return root;
}

export function createPawnSlugCastleDungeon({ coarse = false } = {}) {
  return createPawnSlugScenarioFromTileMap(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon, { coarse });
}

export function createPawnSlugFallenForest({ coarse = false } = {}) {
  return createPawnSlugScenarioFromTileMap(PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest, { coarse });
}

export function createPawnSlugGambitRuins({ coarse = false } = {}) {
  return createPawnSlugScenarioFromTileMap(PAWN_SLUG_SCENARIO_TILEMAPS.gambitRuins, { coarse });
}
