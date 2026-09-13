import * as THREE from 'three';
import { CHRONICLES_MAP } from './chroniclesOfMatthias.js';

const CELL = 4;

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.82,
    clearcoat: options.clearcoat ?? 0.03,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.64,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function add(group, geometry, mat, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cellWorld(x, y) {
  return [(x - 3) * CELL, (y - 3) * CELL];
}

export function chroniclesWalkableCells() {
  const cells = [];
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') cells.push({ x, y, tile });
    });
  });
  return cells;
}

export function chroniclesExposedWallFaces() {
  const faces = [];
  const dirs = [
    { dx: 0, dy: -1, side: 'north' },
    { dx: 1, dy: 0, side: 'east' },
    { dx: 0, dy: 1, side: 'south' },
    { dx: -1, dy: 0, side: 'west' },
  ];
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') return;
      dirs.forEach((dir) => {
        const neighbor = CHRONICLES_MAP[y + dir.dy]?.[x + dir.dx];
        if (neighbor && neighbor !== '#') faces.push({ x, y, side: dir.side });
      });
    });
  });
  return faces;
}

export function buildChroniclesDungeonDressing({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-dressing';

  const floorMat = material(0x3a342d, { roughness: 0.94 });
  const floorAlt = material(0x302b26, { roughness: 0.97 });
  const edgeMat = material(0x50463a, { roughness: 0.9 });
  const iron = material(0x242426, { metalness: 0.66, roughness: 0.42 });
  const rune = material(0xa96a2b, { metalness: 0.46, roughness: 0.35, emissive: 0x4b1d05, emissiveIntensity: 0.55 });

  chroniclesWalkableCells().forEach(({ x, y }, index) => {
    const [wx, wz] = cellWorld(x, y);
    const slab = add(
      root,
      new THREE.BoxGeometry(CELL * 0.94, 0.12, CELL * 0.94),
      (x + y) % 2 ? floorMat : floorAlt,
      [wx, -0.08, wz],
      [0, ((x * 7 + y * 11) % 3 - 1) * 0.008, 0],
      `chronicles-floor-slab-${index}`,
    );
    slab.position.y -= ((x * 13 + y * 5) % 4) * 0.012;
    if (!coarsePointer && index % 3 === 0) {
      add(root, new THREE.BoxGeometry(CELL * 0.48, 0.018, 0.028), edgeMat, [wx + 0.28, 0.004, wz - 0.35], [0, 0.35, 0], `chronicles-floor-crack-${index}`);
    }
  });

  chroniclesExposedWallFaces().forEach(({ x, y, side }, index) => {
    const [wx, wz] = cellWorld(x, y);
    const horizontal = side === 'north' || side === 'south';
    const outward = side === 'north' ? -1 : side === 'south' ? 1 : side === 'east' ? 1 : -1;
    const px = horizontal ? wx : wx + outward * (CELL / 2 - 0.08);
    const pz = horizontal ? wz + outward * (CELL / 2 - 0.08) : wz;
    const rotY = horizontal ? 0 : Math.PI / 2;
    add(root, new THREE.BoxGeometry(CELL * 0.88, 0.18, 0.1), edgeMat, [px, 0.55, pz], [0, rotY, 0], `chronicles-wall-course-low-${index}`);
    add(root, new THREE.BoxGeometry(CELL * 0.88, 0.13, 0.09), edgeMat, [px, 2.18, pz], [0, rotY, 0], `chronicles-wall-course-high-${index}`);
    if (!coarsePointer && index % 2 === 0) {
      const pillarX = horizontal ? px - 1.55 : px;
      const pillarZ = horizontal ? pz : pz - 1.55;
      add(root, new THREE.BoxGeometry(0.28, 2.65, 0.24), edgeMat, [pillarX, 1.35, pillarZ], [0, rotY, 0], `chronicles-wall-pilaster-${index}`);
    }
  });

  [[1, 3], [5, 3], [5, 5]].forEach(([x, y], index) => {
    const [wx, wz] = cellWorld(x, y);
    add(root, new THREE.TorusGeometry(0.24, 0.035, 8, coarsePointer ? 14 : 22), iron, [wx - 1.55, 1.72, wz], [Math.PI / 2, 0, 0], `chronicles-chain-ring-${index}`);
  });

  const [sigilX, sigilZ] = cellWorld(3, 4);
  add(root, new THREE.TorusGeometry(1.14, 0.045, 8, coarsePointer ? 22 : 36), rune, [sigilX, 0.012, sigilZ], [-Math.PI / 2, 0, 0], 'chronicles-sigil-outer-ring');
  for (let index = 0; index < 4; index += 1) {
    add(
      root,
      new THREE.BoxGeometry(0.56, 0.025, 0.055),
      rune,
      [sigilX, 0.016, sigilZ],
      [0, index * (Math.PI / 4), 0],
      `chronicles-sigil-spoke-${index}`,
    );
  }

  const gateRelief = new THREE.Group();
  gateRelief.name = 'chronicles-gate-relief';
  const [gateX, gateZ] = cellWorld(3, 1);
  gateRelief.position.set(gateX, 0, gateZ - 1.28);
  add(gateRelief, new THREE.TorusGeometry(0.86, 0.09, 10, coarsePointer ? 22 : 36), iron, [0, 1.7, 0], [0, 0, 0], 'chronicles-gate-outer-rune');
  add(gateRelief, new THREE.TorusGeometry(0.58, 0.055, 8, coarsePointer ? 18 : 28), rune, [0, 1.7, 0.03], [0, 0, 0], 'chronicles-gate-inner-rune');
  add(gateRelief, new THREE.BoxGeometry(1.72, 0.07, 0.08), iron, [0, 0.98, 0], [0, 0, 0], 'chronicles-gate-threshold');
  root.add(gateRelief);

  root.userData.chroniclesRuneMaterials = [rune];
  return root;
}
