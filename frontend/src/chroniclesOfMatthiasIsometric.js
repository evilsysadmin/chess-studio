import * as THREE from 'three';
import {
  CHRONICLES_ENEMIES,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
} from './chroniclesOfMatthias.js';
import { chroniclesPartyGridFootprint } from './chroniclesPartyFootprint.js';
import { buildChroniclesCharacter } from './chroniclesOfMatthiasArt.js';
import { buildChroniclesEnemyVisual } from './chroniclesEnemyVisualRegistry.js';
import {
  chroniclesEnemyEffectiveVisualScale,
  chroniclesEnemyRenderRoster,
} from './chroniclesEnemyRenderRoster.js';
import { installChroniclesCanonicalMatthias } from './chroniclesOfMatthiasBlenderArt.js';
import { installChroniclesTacticsPartyBlenderArt } from './chroniclesOfMatthiasPartyBlenderArt.js';
import {
  CHRONICLES_ISOMETRIC_CELL_SIZE,
  chroniclesIsometricContentByKind,
  chroniclesIsometricContentsByKind,
  chroniclesIsometricDungeonPlan,
} from './chronicles/chroniclesIsometricDungeonPlan.js';
import { chroniclesContentVisualStates } from './chronicles/chroniclesContentVisualState.js';
import {
  chroniclesIsometricCellToWorld,
  chroniclesIsometricScenePlan,
} from './chronicles/chroniclesIsometricScenePlan.js';
import { chroniclesIsometricSceneStyle } from './chronicles/chroniclesIsometricSceneStyles.js';
import {
  syncChroniclesTacticsPressurePlateArt,
  tickChroniclesTacticsPressurePlateArt,
} from './chroniclesOfMatthiasPressurePlateArt.js';
import { createExperimentalThreeRenderer } from './experimentalThreeRenderer.js';

const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;
export const CHRONICLES_ISO_PARTY_LAYOUT = Object.freeze({
  rook: Object.freeze({ x: -1.62, z: 0.08, scale: 1.03 }),
  matthias: Object.freeze({ x: -0.54, z: 0.32, scale: 1.07 }),
  bishop: Object.freeze({ x: 0.54, z: 0.32, scale: 1.01 }),
  knight: Object.freeze({ x: 1.62, z: 0.08, scale: 1.03 }),
});
export const CHRONICLES_ISO_PARTY_FACING = Math.PI;
export const CHRONICLES_ISO_MARKER_STYLE = Object.freeze({
  shape: 'square',
  moveColor: 0x65bfe3,
  attackColor: 0xc45143,
  selectionColor: 0xd8b56a,
});

const TORCH_CELLS = Object.freeze([
  Object.freeze({ x: 1, y: 5, ox: -0.98, oz: -0.78 }),
  Object.freeze({ x: 5, y: 5, ox: 0.94, oz: -0.7 }),
  Object.freeze({ x: 1, y: 3, ox: -0.88, oz: -0.82 }),
  Object.freeze({ x: 5, y: 3, ox: 0.92, oz: -0.72 }),
  Object.freeze({ x: 2, y: 1, ox: -0.72, oz: -0.92 }),
  Object.freeze({ x: 5, y: 1, ox: 0.72, oz: -0.92 }),
]);

const RUBBLE = Object.freeze([
  Object.freeze({ x: -5.95, z: 2.9, scale: 0.22, yaw: 0.5 }),
  Object.freeze({ x: -5.55, z: 3.18, scale: 0.13, yaw: 1.15 }),
  Object.freeze({ x: 5.72, z: -2.75, scale: 0.18, yaw: 0.2 }),
  Object.freeze({ x: 5.35, z: -3.08, scale: 0.11, yaw: 1.7 }),
  Object.freeze({ x: -2.9, z: -5.86, scale: 0.16, yaw: 0.95 }),
  Object.freeze({ x: 3.2, z: 5.62, scale: 0.14, yaw: 0.35 }),
]);

export function chroniclesIsoWorldForCell(x, y, scenePlan = chroniclesIsometricScenePlan()) {
  const world = chroniclesIsometricCellToWorld(scenePlan, x, y, CELL);
  return new THREE.Vector3(world.x, world.y, world.z);
}

export function chroniclesIsoWorldForContentKind(geometryPlan, kind) {
  const world = chroniclesIsometricContentByKind(geometryPlan, kind)?.world;
  if (!world) return null;
  return new THREE.Vector3(world.x, world.y, world.z);
}

export function chroniclesIsoWorldsForContentKind(geometryPlan, kind) {
  return chroniclesIsometricContentsByKind(geometryPlan, kind).map((entry) => Object.freeze({
    id: entry.id,
    visualType: entry.visualType || entry.kind,
    world: new THREE.Vector3(entry.world.x, entry.world.y, entry.world.z),
  }));
}

export function chroniclesIsoUsesLegacyDressing(scenePlan) {
  return scenePlan?.sceneStyle?.dressing === 'crypt-legacy';
}

export function chroniclesIsoScenePalette(scenePlan) {
  const palette = scenePlan?.sceneStyle?.palette;
  if (palette?.floor?.length && palette?.wall?.length) return palette;
  return chroniclesIsometricSceneStyle()?.palette;
}

export function chroniclesIsometricCameraPose(focus = { x: 0, z: 0 }) {
  return {
    position: new THREE.Vector3(focus.x, 8.15, focus.z + 8.55),
    target: new THREE.Vector3(focus.x, 0.78, focus.z - 2.65),
    fov: 38,
  };
}

export function chroniclesIsometricFovForAspect(aspect, baseFov = 38) {
  const safeBaseFov = Number.isFinite(baseFov) ? baseFov : 38;
  if (!Number.isFinite(aspect) || aspect <= 0) return safeBaseFov;

  // Preserve roughly the same horizontal battlefield read that the canonical
  // 16:10-ish desktop framing gets. A few fixed vertical-FOV bumps were not
  // enough on phone-width canvases, so right-flank actors could sit half out of
  // frame even though the viewport itself had no DOM overflow.
  const referenceAspect = 1.6;
  if (aspect >= referenceAspect) return safeBaseFov;
  const baseRadians = safeBaseFov * (Math.PI / 180);
  const horizontalRadians = 2 * Math.atan(Math.tan(baseRadians / 2) * referenceAspect);
  const fittedRadians = 2 * Math.atan(Math.tan(horizontalRadians / 2) / aspect);
  const fittedFov = fittedRadians * (180 / Math.PI);
  return Math.min(safeBaseFov + 20, Math.max(safeBaseFov, fittedFov));
}

export function chroniclesIsoInteractionForHit(interaction, hit) {
  if (!interaction?.mode || !hit) return null;
  const moveEnabled = interaction.mode === 'move' || interaction.mode === 'hybrid';
  const attackEnabled = interaction.mode === 'attack' || interaction.mode === 'hybrid';
  if (moveEnabled && hit.kind === 'cell') {
    const legal = (interaction.legalMoves || []).some((move) => move.x === hit.x && move.y === hit.y);
    return legal ? { kind: 'cell', x: hit.x, y: hit.y } : null;
  }
  if (attackEnabled && hit.kind === 'enemy') {
    const legal = (interaction.legalTargets || []).some((target) => target.enemyId === hit.enemyId);
    return legal ? { kind: 'enemy', enemyId: hit.enemyId } : null;
  }
  return null;
}

export function chroniclesIsoPointerAction(interaction, hit) {
  if (hit?.kind === 'member' && hit.memberId) {
    return { kind: 'member', memberId: hit.memberId };
  }
  return chroniclesIsoInteractionForHit(interaction, hit);
}

export function chroniclesIsoWorldObjectState(state) {
  const content = chroniclesContentVisualStates(state);
  const firstByKind = (kind) => content.find((entry) => entry.kind === kind) || null;
  return {
    triggerActivated: Boolean(firstByKind('trigger')?.activated),
    leverActivated: Boolean(firstByKind('lever')?.activated),
    pickupVisible: Boolean(firstByKind('pickup')?.visible),
  };
}

function runtimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function deterministicNoise(x, y, salt = 0) {
  const value = Math.sin((x + 17.31 + salt) * 12.9898 + (y - 9.17 - salt) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function facingAngle(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function addMesh(root, geometry, material, position, name, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function buildSquareFrameGeometry(size, thickness) {
  const half = size / 2;
  const inner = Math.max(0.01, half - thickness);
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(-inner, inner);
  hole.lineTo(inner, inner);
  hole.lineTo(inner, -inner);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

function buildDungeonColumn(root, material, trimMaterial, x, z, index, { coarsePointer }) {
  const segments = coarsePointer ? 10 : 16;
  const column = new THREE.Group();
  column.name = `chronicles-iso-column-${index}`;
  column.position.set(x, 0, z);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 2.65, segments), material);
  shaft.position.y = 1.38;
  shaft.castShadow = !coarsePointer;
  shaft.receiveShadow = true;
  column.add(shaft);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.48, 0.18, segments), trimMaterial);
  base.position.y = 0.09;
  base.castShadow = !coarsePointer;
  base.receiveShadow = true;
  column.add(base);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 8, segments), trimMaterial);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 2.55;
  collar.castShadow = !coarsePointer;
  column.add(collar);

  const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.2, segments), trimMaterial);
  capital.position.y = 2.72;
  capital.castShadow = !coarsePointer;
  capital.receiveShadow = true;
  column.add(capital);

  root.add(column);
  return column;
}

function buildFarShrine(root, wall, trim, brass, { coarsePointer }) {
  const shrine = new THREE.Group();
  shrine.name = 'chronicles-iso-far-shrine';
  shrine.position.set(0, 0, -8.35);

  const pillarGeometry = new THREE.BoxGeometry(0.78, 3.5, 0.72);
  [-2.3, 2.3].forEach((x, index) => {
    const pillar = new THREE.Mesh(pillarGeometry, wall);
    pillar.position.set(x, 1.65, 0);
    pillar.castShadow = !coarsePointer;
    pillar.receiveShadow = true;
    pillar.name = `chronicles-iso-shrine-pillar-${index}`;
    shrine.add(pillar);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.2, 0.94), trim);
    foot.position.set(x, 0.1, 0.02);
    foot.castShadow = !coarsePointer;
    foot.receiveShadow = true;
    shrine.add(foot);
  });

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.35, 0.68, 0.78), wall);
  lintel.position.set(0, 3.16, 0);
  lintel.castShadow = !coarsePointer;
  lintel.receiveShadow = true;
  shrine.add(lintel);

  const portalRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.28, 0.11, 10, coarsePointer ? 24 : 40),
    brass,
  );
  portalRing.position.set(0, 1.62, 0.42);
  portalRing.castShadow = !coarsePointer;
  shrine.add(portalRing);

  const recess = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, coarsePointer ? 24 : 40),
    ownedMaterial({ color: 0x15191b, roughness: 0.94, metalness: 0.02, emissive: 0x0c171a, emissiveIntensity: 0.32 }),
  );
  recess.position.set(0, 1.62, 0.34);
  shrine.add(recess);

  const shrineGlow = new THREE.PointLight(0x78a6b6, coarsePointer ? 0.38 : 0.52, 9.5, 2);
  shrineGlow.position.set(0, 1.8, 1.15);
  shrine.add(shrineGlow);

  root.add(shrine);
  return shrine;
}

function buildIsoDungeon({
  coarsePointer,
  scenePlan = chroniclesIsometricScenePlan(),
}) {
  const geometryPlan = chroniclesIsometricDungeonPlan(scenePlan, CELL);
  const palette = chroniclesIsoScenePalette(scenePlan);
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-dungeon';
  const floorTargets = [];

  const floorRoughness = [0.9, 0.86, 0.93, 0.89];
  const floorMetalness = [0.025, 0.025, 0.02, 0.025];
  const floorMaterials = palette.floor.map((color, index) => ownedMaterial({
    color,
    roughness: floorRoughness[index] ?? 0.9,
    metalness: floorMetalness[index] ?? 0.02,
  }));
  const foundation = ownedMaterial({ color: palette.foundation, roughness: 0.98, metalness: 0 });
  const wallRoughness = [0.97, 0.95, 0.98];
  const wallMetalness = [0.01, 0.012, 0.008];
  const wallMaterials = palette.wall.map((color, index) => ownedMaterial({
    color,
    roughness: wallRoughness[index] ?? 0.97,
    metalness: wallMetalness[index] ?? 0.01,
  }));
  const wallTrim = ownedMaterial({ color: palette.wallTrim, roughness: 0.98, metalness: 0 });
  const brass = ownedMaterial({ color: palette.metal, roughness: 0.45, metalness: 0.68, emissive: 0x160a02, emissiveIntensity: 0.24 });
  const runeMaterial = ownedMaterial({
    color: palette.rune,
    roughness: 0.22,
    metalness: 0.16,
    emissive: palette.runeEmissive,
    emissiveIntensity: 1.7,
  });

  addMesh(
    root,
    new THREE.BoxGeometry(geometryPlan.foundation.width, 0.34, geometryPlan.foundation.depth),
    foundation,
    [0, -0.31, 0],
    'chronicles-iso-foundation',
    { castShadow: false, receiveShadow: true },
  );

  const tileGeometry = new THREE.BoxGeometry(CELL * 0.982, 0.17, CELL * 0.982);
  const wallGeometry = new THREE.BoxGeometry(CELL, 2.65, CELL);
  const wallCapGeometry = new THREE.BoxGeometry(CELL * 0.96, 0.12, CELL * 0.96);

  geometryPlan.floors.forEach(({ x, y, world }) => {
    const noise = deterministicNoise(x, y);
    const material = floorMaterials[Math.min(floorMaterials.length - 1, Math.floor(noise * floorMaterials.length))];
    const tileMesh = new THREE.Mesh(tileGeometry, material);
    tileMesh.position.set(world.x, -0.095 + (noise - 0.5) * 0.025, world.z);
    tileMesh.rotation.y = (deterministicNoise(x, y, 3) - 0.5) * 0.014;
    tileMesh.receiveShadow = true;
    tileMesh.name = `chronicles-iso-floor-${x}-${y}`;
    tileMesh.userData.chroniclesIsoCell = { x, y };
    root.add(tileMesh);
    floorTargets.push(tileMesh);
  });

  geometryPlan.walls.forEach(({ x, y, world }) => {
    const noise = deterministicNoise(x, y, 7);
    const wall = wallMaterials[Math.min(wallMaterials.length - 1, Math.floor(noise * wallMaterials.length))];
    const block = new THREE.Mesh(wallGeometry, wall);
    block.position.set(world.x, 1.23, world.z);
    block.castShadow = !coarsePointer;
    block.receiveShadow = true;
    block.name = `chronicles-iso-wall-${x}-${y}`;
    root.add(block);

    const cap = new THREE.Mesh(wallCapGeometry, wallTrim);
    cap.position.set(world.x, 2.59, world.z);
    cap.castShadow = !coarsePointer;
    cap.receiveShadow = true;
    root.add(cap);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 0.075, CELL * 1.01), wallTrim);
    trim.position.set(world.x, 0.5 + ((x * 5 + y * 3) % 3) * 0.68, world.z);
    trim.receiveShadow = true;
    root.add(trim);
  });

  const sigilWorld = chroniclesIsoWorldForContentKind(geometryPlan, 'trigger');
  const sigil = addMesh(
    root,
    new THREE.TorusGeometry(0.62, 0.085, 8, coarsePointer ? 18 : 30),
    brass,
    [sigilWorld?.x ?? 0, 0.035, sigilWorld?.z ?? 0],
    'chronicles-iso-sigil',
    { castShadow: false, receiveShadow: false },
  );
  sigil.rotation.x = -Math.PI / 2;
  sigil.visible = Boolean(sigilWorld);

  const leverProps = chroniclesIsoWorldsForContentKind(geometryPlan, 'lever').map((entry) => {
    const leverRoot = new THREE.Group();
    leverRoot.name = `chronicles-iso-lever-${entry.id}`;
    leverRoot.position.set(entry.world.x + 0.62, 0, entry.world.z - 0.56);
    leverRoot.userData.chroniclesIsoContentId = entry.id;
    leverRoot.userData.chroniclesIsoVisualType = entry.visualType;

    const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.34), wallTrim);
    leverBase.position.y = 0.13;
    leverBase.castShadow = !coarsePointer;
    leverBase.receiveShadow = true;
    leverRoot.add(leverBase);

    const pivot = new THREE.Group();
    pivot.position.y = 0.28;
    const leverStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.72, 8), brass);
    leverStem.position.y = 0.34;
    leverStem.castShadow = !coarsePointer;
    const leverKnob = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), brass);
    leverKnob.position.y = 0.72;
    leverKnob.castShadow = !coarsePointer;
    pivot.add(leverStem, leverKnob);
    leverRoot.add(pivot);
    root.add(leverRoot);

    return Object.freeze({
      id: entry.id,
      visualType: entry.visualType,
      root: leverRoot,
      pivot,
    });
  });

  const pickupProps = chroniclesIsoWorldsForContentKind(geometryPlan, 'pickup').map((entry, index) => {
    const pickupRoot = new THREE.Group();
    pickupRoot.name = `chronicles-iso-pickup-${entry.id}`;
    pickupRoot.position.set(entry.world.x + 0.42, 0.18, entry.world.z + 0.2);
    pickupRoot.userData.chroniclesIsoAuthored = true;
    pickupRoot.userData.chroniclesIsoContentId = entry.id;
    pickupRoot.userData.chroniclesIsoVisualType = entry.visualType;

    const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, coarsePointer ? 16 : 24), brass);
    cradle.rotation.x = -Math.PI / 2;
    cradle.position.y = 0.08;
    cradle.castShadow = !coarsePointer;
    pickupRoot.add(cradle);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.23, 0), runeMaterial);
    core.position.y = 0.42;
    core.castShadow = !coarsePointer;
    pickupRoot.add(core);

    const glow = new THREE.PointLight(palette.runeGlow, coarsePointer ? 0.72 : 1.05, 3.6, 2);
    glow.position.y = 0.46;
    pickupRoot.add(glow);
    pickupRoot.visible = false;
    root.add(pickupRoot);

    return Object.freeze({
      id: entry.id,
      visualType: entry.visualType,
      root: pickupRoot,
      core,
      glow,
      phase: index * 1.17,
    });
  });

  if (chroniclesIsoUsesLegacyDressing(scenePlan)) {
    buildDungeonColumn(root, wallMaterials[0], wallTrim, -5.9, -4.9, 0, { coarsePointer });
    buildDungeonColumn(root, wallMaterials[1], wallTrim, 5.9, -4.9, 1, { coarsePointer });
    buildDungeonColumn(root, wallMaterials[2], wallTrim, -5.9, 5.9, 2, { coarsePointer });
    buildFarShrine(root, wallMaterials[2], wallTrim, brass, { coarsePointer });

    if (!coarsePointer) {
      const rubbleMaterial = ownedMaterial({ color: 0x34312d, roughness: 0.96, metalness: 0.01 });
      RUBBLE.forEach((piece, index) => {
        const rubble = addMesh(
          root,
          new THREE.DodecahedronGeometry(piece.scale, 0),
          rubbleMaterial,
          [piece.x, piece.scale * 0.4 - 0.02, piece.z],
          `chronicles-iso-rubble-${index}`,
        );
        rubble.rotation.set(piece.yaw * 0.25, piece.yaw, piece.yaw * 0.16);
        rubble.scale.set(1.35, 0.68, 0.92);
      });
    }
  }

  return {
    root,
    sigilMaterial: brass,
    floorTargets,
    leverProps,
    pickupProps,
    runeMaterial,
  };
}

function buildTorches(scene, {
  coarsePointer,
  scenePlan = chroniclesIsometricScenePlan(),
}) {
  const torches = [];
  const iron = ownedMaterial({ color: 0x2c2119, roughness: 0.62, metalness: 0.58 });
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc16f,
    emissive: 0xff5b14,
    emissiveIntensity: 3.25,
    roughness: 0.34,
  });
  flameMaterial.userData.chroniclesIsoOwned = true;
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8b3d,
    transparent: true,
    opacity: coarsePointer ? 0.12 : 0.15,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  glowMaterial.userData.chroniclesIsoOwned = true;

  TORCH_CELLS.forEach(({ x, y, ox, oz }, index) => {
    const cell = chroniclesIsoWorldForCell(x, y, scenePlan);
    const root = new THREE.Group();
    root.name = `chronicles-iso-torch-${index}`;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), iron);
    stem.position.y = 0.46;
    stem.castShadow = !coarsePointer;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.16, 8), iron);
    cup.position.y = 0.86;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), flameMaterial);
    flame.scale.set(0.88, 1.62, 0.88);
    flame.position.y = 1.06;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), glowMaterial);
    glow.position.y = 1.05;
    glow.scale.set(0.8, 1.45, 0.8);
    const baseIntensity = coarsePointer ? 2.35 : 3.05;
    const light = new THREE.PointLight(0xff8538, baseIntensity, coarsePointer ? 6.8 : 8.8, 2);
    light.position.y = 1.02;
    root.add(stem, cup, glow, flame, light);
    root.position.set(cell.x + ox, 0, cell.z + oz);
    scene.add(root);
    torches.push({ root, flame, glow, light, baseIntensity, phase: index * 1.37 });
  });
  return torches;
}

function buildParty(scene, {
  coarsePointer,
  reducedMotion,
  scenePlan = chroniclesIsometricScenePlan(),
}) {
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-party';
  scene.add(root);

  const models = new Map();
  ['rook', 'matthias', 'bishop', 'knight'].forEach((id) => {
    const model = buildChroniclesCharacter(id, { coarsePointer });
    const config = CHRONICLES_ISO_PARTY_LAYOUT[id];
    model.position.set(config.x, 0, config.z);
    model.scale.setScalar(config.scale);
    model.rotation.y = CHRONICLES_ISO_PARTY_FACING;
    model.userData.chroniclesIsoMemberId = id;
    root.add(model);
    if (id === 'matthias') installChroniclesCanonicalMatthias(model, { coarsePointer, reducedMotion });
    models.set(id, model);
  });
  root.userData.chroniclesArtCancel = installChroniclesTacticsPartyBlenderArt(models, {
    coarsePointer,
    reducedMotion,
    scenePlan,
  });

  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: CHRONICLES_ISO_MARKER_STYLE.selectionColor,
    transparent: true,
    opacity: coarsePointer ? 0.82 : 0.7,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  selectionMaterial.userData.chroniclesIsoOwned = true;
  const selection = new THREE.Mesh(buildSquareFrameGeometry(CELL * 0.72, coarsePointer ? 0.075 : 0.055), selectionMaterial);
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.035;
  selection.renderOrder = 9;
  root.add(selection);

  return { root, models, selection };
}

function reconcileEnemyModels(scene, models, roster, { coarsePointer }) {
  const activeIds = new Set(roster.map((entry) => entry.id));
  models.forEach((model, id) => {
    if (activeIds.has(id)) return;
    model.visible = false;
    model.userData.chroniclesIsoPlaced = false;
    model.userData.chroniclesIsoTarget = null;
  });

  roster.forEach(({ id, visualType, visualScale, visualMotion }) => {
    let model = models.get(id);
    if (model && model.userData.chroniclesIsoVisualType !== visualType) {
      scene.remove(model);
      disposeScene(model);
      models.delete(id);
      model = null;
    }

    if (!model) {
      const visual = buildChroniclesEnemyVisual(visualType, { coarsePointer });
      if (!visual) return;
      model = visual.model;
      model.name = `chronicles-iso-enemy-${id}`;
      model.userData.chroniclesIsoEnemyId = id;
      model.userData.chroniclesIsoVisualType = visualType;
      model.userData.chroniclesIsoBaseScale = visual.scale;
      model.rotation.y = -Math.PI * 0.18;
      model.visible = false;
      scene.add(model);
      models.set(id, model);
    }

    model.userData.chroniclesIsoVisualMotion = visualMotion;
    model.scale.setScalar(chroniclesEnemyEffectiveVisualScale(
      model.userData.chroniclesIsoBaseScale,
      visualScale,
    ));
  });
}

function buildInteractionMarkers(scene, { coarsePointer }) {
  const root = new THREE.Group();
  root.name = 'chronicles-isometric-interaction';
  scene.add(root);

  const moveMaterial = new THREE.MeshBasicMaterial({
    color: CHRONICLES_ISO_MARKER_STYLE.moveColor,
    transparent: true,
    opacity: coarsePointer ? 0.78 : 0.62,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const attackMaterial = new THREE.MeshBasicMaterial({
    color: CHRONICLES_ISO_MARKER_STYLE.attackColor,
    transparent: true,
    opacity: coarsePointer ? 0.86 : 0.72,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  moveMaterial.userData.chroniclesIsoOwned = true;
  attackMaterial.userData.chroniclesIsoOwned = true;
  const moveGeometry = buildSquareFrameGeometry(CELL * 0.72, coarsePointer ? 0.09 : 0.06);
  const attackGeometry = buildSquareFrameGeometry(CELL * 0.78, coarsePointer ? 0.1 : 0.072);

  const makePool = (count, geometry, material, prefix) => Array.from({ length: count }, (_, index) => {
    const marker = new THREE.Mesh(geometry, material);
    marker.name = `${prefix}-${index}`;
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.055;
    marker.renderOrder = 8;
    marker.visible = false;
    root.add(marker);
    return marker;
  });

  return {
    root,
    moveMarkers: makePool(4, moveGeometry, moveMaterial, 'chronicles-iso-move-marker'),
    attackMarkers: makePool(CHRONICLES_ENEMIES.length, attackGeometry, attackMaterial, 'chronicles-iso-attack-marker'),
  };
}

function descriptorForObject(object) {
  let current = object;
  while (current) {
    if (current.userData?.chroniclesIsoMemberId) {
      return { kind: 'member', memberId: current.userData.chroniclesIsoMemberId };
    }
    if (current.userData?.chroniclesIsoEnemyId) {
      return { kind: 'enemy', enemyId: current.userData.chroniclesIsoEnemyId };
    }
    if (current.userData?.chroniclesIsoCell) {
      const { x, y } = current.userData.chroniclesIsoCell;
      return { kind: 'cell', x, y };
    }
    current = current.parent;
  }
  return null;
}

function disposeScene(root) {
  const artCancels = new Set();
  root.traverse?.((node) => {
    if (node.userData?.chroniclesArtCancel) artCancels.add(node.userData.chroniclesArtCancel);
  });
  artCancels.forEach((cancel) => cancel());

  const geometries = new Set();
  const materials = new Set();
  root.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.filter(Boolean).forEach((material) => {
      if (material.userData?.chroniclesIsoOwned || material.userData?.chroniclesOwnedMaterial) materials.add(material);
    });
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

export function createChroniclesIsometricGame(host, {
  initialState = null,
  onReady,
  onCellClick,
  onEnemyClick,
  onMemberClick,
} = {}) {
  if (!host) throw new Error('Chronicles isometric view requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const initialScenePlan = chroniclesIsometricScenePlan(initialState);
  const scenePalette = chroniclesIsoScenePalette(initialScenePlan);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = coarse ? 1.27 : 1.2;
  renderer.setClearColor(scenePalette.background, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.7));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(scenePalette.background);
  scene.fog = new THREE.FogExp2(scenePalette.fog, coarse ? 0.022 : 0.0185);

  const initialFocus = chroniclesIsoWorldForCell(
    Number(initialScenePlan.partyStart?.x ?? 1) + 1,
    Number(initialScenePlan.partyStart?.y ?? 5),
    initialScenePlan,
  );
  const initialPose = chroniclesIsometricCameraPose({ x: initialFocus.x, z: initialFocus.z });
  const camera = new THREE.PerspectiveCamera(initialPose.fov, 1, 0.1, 70);
  camera.position.copy(initialPose.position);
  camera.lookAt(initialPose.target);
  const cameraTarget = initialPose.target.clone();

  const hemi = new THREE.HemisphereLight(scenePalette.hemiSky, scenePalette.hemiGround, coarse ? 0.82 : 0.64);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(scenePalette.key, coarse ? 2.35 : 2.95);
  key.position.set(5.5, 10, 7.5);
  key.castShadow = !coarse;
  if (!coarse) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.04;
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight(scenePalette.rim, coarse ? 0.84 : 1.2);
  rim.position.set(-7, 5, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(scenePalette.fill, coarse ? 0.38 : 0.52);
  fill.position.set(3, 4.5, -7);
  scene.add(fill);
  const warmBounce = new THREE.PointLight(scenePalette.bounce, coarse ? 0.28 : 0.4, 18, 2);
  warmBounce.position.set(0, 2.4, 2.8);
  scene.add(warmBounce);

  const dungeon = buildIsoDungeon({
    coarsePointer: coarse,
    scenePlan: initialScenePlan,
  });
  scene.add(dungeon.root);
  const torches = chroniclesIsoUsesLegacyDressing(initialScenePlan)
    ? buildTorches(scene, {
      coarsePointer: coarse,
      scenePlan: initialScenePlan,
    })
    : [];
  const party = buildParty(scene, {
    coarsePointer: coarse,
    reducedMotion,
    scenePlan: initialScenePlan,
  });
  const enemies = new Map();
  const interactionMarkers = buildInteractionMarkers(scene, { coarsePointer: coarse });

  let latestState = null;
  let latestInteraction = null;
  let selectedMemberId = 'matthias';
  let destroyed = false;
  let visible = document.visibilityState !== 'hidden';
  let frame = 0;
  const clock = new THREE.Clock();
  const desiredParty = initialFocus.clone();
  const desiredFocus = initialFocus.clone();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  party.root.position.copy(initialFocus);

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = chroniclesIsometricFovForAspect(camera.aspect, initialPose.fov);
    camera.updateProjectionMatrix();
  }

  function syncSelection({ immediate = false } = {}) {
    const config = CHRONICLES_ISO_PARTY_LAYOUT[selectedMemberId] || CHRONICLES_ISO_PARTY_LAYOUT.matthias;
    const model = party.models.get(selectedMemberId);
    const target = model?.userData?.chroniclesIsoTarget;
    party.selection.scale.setScalar(config.scale || 1);
    party.selection.visible = Boolean(model?.visible && target);
    if (!target) return;

    const selectionTarget = target.clone();
    selectionTarget.y = 0.035;
    party.selection.userData.chroniclesIsoTarget = selectionTarget;
    if (immediate || !party.selection.userData.chroniclesIsoPlaced) {
      party.selection.position.copy(selectionTarget);
      party.selection.userData.chroniclesIsoPlaced = true;
    }
  }

  function syncInteraction(nextInteraction = null) {
    latestInteraction = nextInteraction;
    interactionMarkers.moveMarkers.forEach((marker) => { marker.visible = false; });
    interactionMarkers.attackMarkers.forEach((marker) => { marker.visible = false; });

    const moveEnabled = nextInteraction?.mode === 'move' || nextInteraction?.mode === 'hybrid';
    const attackEnabled = nextInteraction?.mode === 'attack' || nextInteraction?.mode === 'hybrid';

    if (moveEnabled) {
      (nextInteraction.legalMoves || []).slice(0, interactionMarkers.moveMarkers.length).forEach((move, index) => {
        const marker = interactionMarkers.moveMarkers[index];
        const world = chroniclesIsoWorldForCell(move.x, move.y, initialScenePlan);
        marker.position.set(world.x, 0.055, world.z);
        marker.visible = true;
      });
    }
    if (attackEnabled) {
      (nextInteraction.legalTargets || []).slice(0, interactionMarkers.attackMarkers.length).forEach((target, index) => {
        const marker = interactionMarkers.attackMarkers[index];
        const world = chroniclesIsoWorldForCell(target.x, target.y, initialScenePlan);
        marker.position.set(world.x, 0.065, world.z);
        marker.visible = true;
      });
    }
    renderer.domElement.style.cursor = nextInteraction?.mode ? 'crosshair' : 'default';
  }

  function syncState(state, nextSelectedMemberId = selectedMemberId, nextInteraction = latestInteraction) {
    latestState = state;
    selectedMemberId = nextSelectedMemberId || selectedMemberId;
    const partyCell = chroniclesIsoWorldForCell(state.x, state.y, initialScenePlan);
    desiredParty.copy(partyCell);
    desiredFocus.copy(partyCell);
    const partyFootprint = chroniclesPartyGridFootprint(state);

    const enemyRoster = chroniclesEnemyRenderRoster(state);
    reconcileEnemyModels(scene, enemies, enemyRoster, { coarsePointer: coarse });
    enemyRoster.forEach(({ definition }) => {
      const model = enemies.get(definition.id);
      if (!model) return;
      const active = chroniclesEnemyIsActive(state, definition) && Number(state[definition.hpKey] || 0) > 0;
      model.visible = active;
      if (!active) return;
      const position = runtimeEnemyPosition(state, definition);
      const world = chroniclesIsoWorldForCell(position.x, position.y, initialScenePlan);
      model.userData.chroniclesIsoTarget = world;
      model.userData.chroniclesIsoTargetYaw = facingAngle(world, partyCell);
      if (!model.userData.chroniclesIsoPlaced) {
        model.position.copy(world);
        model.userData.chroniclesIsoCurrentYaw = model.userData.chroniclesIsoTargetYaw;
        model.rotation.y = model.userData.chroniclesIsoTargetYaw;
        model.userData.chroniclesIsoPlaced = true;
      }
    });

    state.party.forEach((member) => {
      const model = party.models.get(member.id);
      if (!model) return;
      const slot = partyFootprint[member.id];
      model.visible = member.hp > 0 && Boolean(slot);
      model.userData.chroniclesIsoHpRatio = Math.max(0, member.hp / member.maxHp);
      if (!slot) {
        model.userData.chroniclesIsoTarget = null;
        model.userData.chroniclesIsoPlaced = false;
        return;
      }

      const localTarget = chroniclesIsoWorldForCell(slot.x, slot.y, initialScenePlan).sub(partyCell);
      model.userData.chroniclesIsoTarget = localTarget;
      model.userData.chroniclesIsoCell = slot;
      if (!model.userData.chroniclesIsoPlaced) {
        model.position.copy(localTarget);
        model.userData.chroniclesIsoPlaced = true;
      }
    });

    const worldObjects = chroniclesIsoWorldObjectState(state);
    dungeon.sigilMaterial.emissive.setHex(worldObjects.triggerActivated ? 0x8c3f0d : 0x160a02);
    dungeon.sigilMaterial.emissiveIntensity = worldObjects.triggerActivated ? 1.25 : 0.24;

    const contentVisualById = new Map(chroniclesContentVisualStates(state).map((entry) => [entry.id, entry]));
    syncChroniclesTacticsPressurePlateArt(scene, contentVisualById, { now: clock.getElapsedTime() });
    dungeon.leverProps.forEach((lever) => {
      const visual = contentVisualById.get(lever.id);
      lever.root.visible = Boolean(visual?.visible);
      lever.pivot.rotation.z = visual?.activated ? -0.74 : 0.58;
    });
    dungeon.pickupProps.forEach((pickup) => {
      const visual = contentVisualById.get(pickup.id);
      pickup.root.visible = Boolean(visual?.visible);
    });
    dungeon.runeMaterial.emissiveIntensity = dungeon.pickupProps.some((pickup) => pickup.root.visible) ? 1.7 : 0.25;

    syncSelection({ immediate: reducedMotion });
    syncInteraction(nextInteraction);

    if (reducedMotion) {
      party.root.position.copy(desiredParty);
      party.models.forEach((model) => {
        if (!model.visible || !model.userData.chroniclesIsoTarget) return;
        model.position.copy(model.userData.chroniclesIsoTarget);
      });
      if (party.selection.visible && party.selection.userData.chroniclesIsoTarget) {
        party.selection.position.copy(party.selection.userData.chroniclesIsoTarget);
      }
      enemies.forEach((model) => {
        if (!model.visible || !model.userData.chroniclesIsoTarget) return;
        model.position.copy(model.userData.chroniclesIsoTarget);
        model.rotation.y = model.userData.chroniclesIsoTargetYaw ?? model.rotation.y;
      });
      const pose = chroniclesIsometricCameraPose({ x: desiredFocus.x, z: desiredFocus.z });
      camera.position.copy(pose.position);
      cameraTarget.copy(pose.target);
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    }
  }

  function pickPointerAction(event) {
    if (!latestState) return null;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const visibleParty = [...party.models.values()].filter((model) => model.visible);
    const visibleEnemies = [...enemies.values()].filter((model) => model.visible);
    const intersections = raycaster.intersectObjects([
      ...visibleParty,
      ...visibleEnemies,
      ...dungeon.floorTargets,
    ], true);
    for (const intersection of intersections) {
      const descriptor = descriptorForObject(intersection.object);
      const action = chroniclesIsoPointerAction(latestInteraction, descriptor);
      if (action) return action;
    }
    return null;
  }

  function onPointerUp(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const action = pickPointerAction(event);
    if (!action) return;
    if (action.kind === 'member') onMemberClick?.(action.memberId);
    else if (action.kind === 'cell') onCellClick?.({ x: action.x, y: action.y });
    else if (action.kind === 'enemy') onEnemyClick?.(action.enemyId);
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (!visible) return;
    const time = clock.getElapsedTime();

    if (!reducedMotion) {
      party.root.position.lerp(desiredParty, 0.14);
      enemies.forEach((model, id) => {
        if (!model.visible || !model.userData.chroniclesIsoTarget) return;
        model.position.lerp(model.userData.chroniclesIsoTarget, id === 'scavenger-knight' ? 0.18 : 0.13);
        model.position.y = Math.sin(time * 1.7 + id.length) * 0.012;
        const targetYaw = model.userData.chroniclesIsoTargetYaw ?? model.rotation.y;
        const currentYaw = model.userData.chroniclesIsoCurrentYaw ?? targetYaw;
        const nextYaw = currentYaw + shortestAngleDelta(currentYaw, targetYaw) * 0.12;
        model.userData.chroniclesIsoCurrentYaw = nextYaw;
        model.rotation.y = nextYaw + Math.sin(time * 0.48 + id.length) * 0.018;
      });

      party.models.forEach((model, id) => {
        if (!model.visible) return;
        const target = model.userData.chroniclesIsoTarget;
        if (target) model.position.lerp(target, 0.2);
        model.userData.chroniclesArtTick?.(time);
        model.rotation.y = CHRONICLES_ISO_PARTY_FACING + Math.sin(time * 0.55 + id.length) * 0.025;
        const hpRatio = model.userData.chroniclesIsoHpRatio ?? 1;
        model.position.y = Math.sin(time * 0.8 + id.length) * 0.006 - (1 - hpRatio) * 0.025;
      });
      if (party.selection.visible && party.selection.userData.chroniclesIsoTarget) {
        party.selection.position.lerp(party.selection.userData.chroniclesIsoTarget, 0.24);
      }

      tickChroniclesTacticsPressurePlateArt(scene, time);

      torches.forEach((torch) => {
        const pulse = 0.94 + Math.sin(time * 7.2 + torch.phase) * 0.07 + Math.sin(time * 15.8 + torch.phase) * 0.025;
        torch.light.intensity = torch.baseIntensity * pulse;
        torch.flame.scale.set(0.86 + pulse * 0.03, 1.48 + pulse * 0.15, 0.86 + pulse * 0.03);
        torch.glow.scale.set(0.78 + pulse * 0.04, 1.34 + pulse * 0.18, 0.78 + pulse * 0.04);
        torch.flame.rotation.z = Math.sin(time * 4.8 + torch.phase) * 0.08;
      });

      let pickupPulse = null;
      dungeon.pickupProps.forEach((pickup) => {
        if (!pickup.root.visible) return;
        const pulse = 0.9 + Math.sin(time * 3.1 + pickup.phase) * 0.1;
        pickup.root.rotation.y = time * 0.72 + pickup.phase;
        pickup.core.position.y = 0.42 + Math.sin(time * 2.4 + pickup.phase) * 0.055;
        pickup.glow.intensity = (coarse ? 0.72 : 1.05) * pulse;
        pickupPulse = Math.max(pickupPulse ?? pulse, pulse);
      });
      if (pickupPulse !== null) dungeon.runeMaterial.emissiveIntensity = 1.55 + pickupPulse * 0.35;

      const pose = chroniclesIsometricCameraPose({ x: desiredFocus.x, z: desiredFocus.z });
      camera.position.lerp(pose.position, 0.09);
      cameraTarget.lerp(pose.target, 0.12);
      camera.lookAt(cameraTarget);
    }

    renderer.render(scene, camera);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const onWindowResize = () => resize();
  if (!observer) window.addEventListener('resize', onWindowResize);
  const onVisibility = () => { visible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  resize();
  syncSelection();
  syncInteraction();
  render();
  onReady?.('THREE.JS · ISOMETRIC');

  return {
    renderState: syncState,
    renderMember(memberId) {
      selectedMemberId = memberId || 'matthias';
      syncSelection();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
