import * as THREE from 'three';
import {
  PAWN_SLUG_SCENARIO_TILEMAPS,
  pawnSlugScenarioTilesByKind,
} from './pawnSlugTileMaps.js';

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
  stone: 0x24282d,
  stoneEdge: 0x353a40,
  deepStone: 0x171b1f,
  iron: 0x23282c,
  warm: 0x8c5b2f,
});

function localX(tile, scenario) {
  return tile.x - scenario.originX;
}

function renderStone(root, tile, scenario) {
  const x = localX(tile, scenario);
  root.add(mesh(new THREE.BoxGeometry(1.02, 0.5, 0.95), material(PALETTE.stone, 0.98, 0.02), {
    x,
    y: 4.45,
    z: 0.08,
  }));
}

function renderWallRib(root, tile, scenario) {
  const x = localX(tile, scenario);
  const mat = material(PALETTE.stoneEdge, 0.93, 0.03);
  root.add(
    mesh(new THREE.BoxGeometry(0.42, 4.2, 0.78), mat, { x, y: 2.1, z: 0.25 }),
    mesh(new THREE.BoxGeometry(0.92, 0.32, 0.82), mat, { x, y: 4.18, z: 0.25 }),
  );
}

function renderCeilingRib(root, tile, scenario) {
  root.add(mesh(
    new THREE.BoxGeometry(0.3, 0.42, 1.28),
    material(PALETTE.stoneEdge, 0.93, 0.03),
    { x: localX(tile, scenario), y: 4.55, z: 0.1 },
  ));
}

function renderTorch(root, tile, scenario, coarse) {
  const x = localX(tile, scenario);
  const iron = material(PALETTE.iron, 0.56, 0.58);
  const warm = material(PALETTE.warm, 0.58, 0.08, 0xff8f3f, coarse ? 0.7 : 2.2);
  root.add(
    mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 7), iron, { x, y: 2.15, z: 0.92 }),
    mesh(new THREE.ConeGeometry(0.18, 0.55, coarse ? 6 : 9), warm, { x, y: 2.64, z: 0.95 }),
  );
}

function renderGate(root, tile, scenario, coarse) {
  const x = localX(tile, scenario);
  const iron = material(PALETTE.iron, 0.56, 0.58);
  const count = coarse ? 5 : 7;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * (2.05 / Math.max(1, count - 1));
    root.add(mesh(new THREE.BoxGeometry(0.07, 3.55, 0.09), iron, { x: x + offset, y: 1.82, z: 0.92 }));
  }
  root.add(mesh(new THREE.BoxGeometry(2.35, 0.1, 0.12), iron, { x, y: 2.55, z: 0.93 }));
}

function renderChain(root, tile, scenario, coarse) {
  const x = localX(tile, scenario);
  const iron = material(PALETTE.iron, 0.56, 0.58);
  const count = coarse ? 3 : 6;
  for (let i = 0; i < count; i += 1) {
    const link = mesh(new THREE.TorusGeometry(0.12, 0.028, 5, 8), iron, {
      x: x + i * 0.02,
      y: 4.35 - i * 0.31,
      z: 0.93,
      rz: i % 2 ? Math.PI / 2 : 0,
    });
    if (i === 0) link.name = 'pawn-slug-dungeon-chain';
    root.add(link);
  }
}

function renderDrain(root, tile, scenario) {
  const node = mesh(
    new THREE.BoxGeometry(0.92, 0.035, 0.35),
    material(PALETTE.iron, 0.56, 0.58),
    { x: localX(tile, scenario), y: 0.035, z: 1.26 },
  );
  node.castShadow = false;
  root.add(node);
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

export function createPawnSlugScenarioFromTileMap(scenario, { coarse = false } = {}) {
  if (!scenario) throw new Error('Pawn Slug scenario renderer requires a tile map');
  const root = new THREE.Group();
  root.name = `pawn-slug-scenario-${scenario.id}`;
  root.userData.scenarioId = scenario.id;
  root.userData.dataDriven = true;

  const tiles = (kind) => pawnSlugScenarioTilesByKind(scenario, kind, { coarse });
  for (const tile of tiles('stone')) renderStone(root, tile, scenario);
  for (const tile of tiles('wall-rib')) renderWallRib(root, tile, scenario);
  for (const tile of tiles('ceiling-rib')) renderCeilingRib(root, tile, scenario);
  for (const tile of tiles('torch')) renderTorch(root, tile, scenario, coarse);
  for (const tile of tiles('gate')) renderGate(root, tile, scenario, coarse);
  for (const tile of tiles('chain')) renderChain(root, tile, scenario, coarse);
  for (const tile of tiles('drain')) renderDrain(root, tile, scenario);
  for (const tile of tiles('fallen-pawn')) renderFallenPawn(root, tile, scenario);

  const gateTiles = tiles('gate');
  if (gateTiles.length) {
    const archX = localX(gateTiles[0], scenario);
    const arch = mesh(
      new THREE.TorusGeometry(1.48, 0.46, coarse ? 7 : 10, coarse ? 18 : 28, Math.PI),
      material(PALETTE.stoneEdge, 0.93, 0.03),
      { x: archX, y: 3.7, z: 0.84, rz: Math.PI },
    );
    arch.name = 'pawn-slug-dungeon-arch';
    root.add(arch);
  }

  if (!coarse && gateTiles.length) {
    const shadow = mesh(
      new THREE.PlaneGeometry(2.9, 3.5),
      new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.42, depthWrite: false }),
      { x: localX(gateTiles[0], scenario), y: 1.82, z: 0.46 },
    );
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
