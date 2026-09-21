import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';

const CANONICAL_SCENE_HALF_DEPTH = CHRONICLES_ISOMETRIC_CELL_SIZE * 3;

export function chroniclesTacticsForegroundZForScenePlan(scenePlan = null) {
  const height = Math.max(1, Number(scenePlan?.height) || 7);
  const halfDepth = ((height - 1) * CHRONICLES_ISOMETRIC_CELL_SIZE) / 2;
  return Math.max(0, halfDepth - CANONICAL_SCENE_HALF_DEPTH);
}

export const CHRONICLES_TACTICS_FOREGROUND_STYLE = Object.freeze({
  motif: 'stone-guardians',
  guardianCount: 2,
  brazierCount: 2,
  parapetCount: 4,
});

export const CHRONICLES_TACTICS_FOREGROUND_PLAN = Object.freeze({
  guardians: Object.freeze([
    Object.freeze({ x: -8.05, z: 6.45, yaw: 0.28 }),
    Object.freeze({ x: 8.05, z: 6.45, yaw: -0.28 }),
  ]),
  braziers: Object.freeze([
    Object.freeze({ x: -6.65, z: 6.7 }),
    Object.freeze({ x: 6.65, z: 6.7 }),
  ]),
});

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function ownedBasicMaterial(params) {
  const material = new THREE.MeshBasicMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function addMesh(root, geometry, material, position, name, {
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function buildGuardian(root, plan, index, { stone, darkStone, coarsePointer }) {
  const guardian = new THREE.Group();
  guardian.name = `chronicles-foreground-guardian-${index}`;
  guardian.position.set(plan.x, 0, plan.z);
  guardian.rotation.y = plan.yaw;

  addMesh(
    guardian,
    new THREE.CylinderGeometry(0.58, 0.72, 0.34, coarsePointer ? 8 : 12),
    darkStone,
    [0, 0.17, 0],
    `chronicles-foreground-guardian-plinth-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );

  const body = addMesh(
    guardian,
    new THREE.BoxGeometry(0.66, 1.36, 0.48),
    stone,
    [0, 1.02, 0],
    `chronicles-foreground-guardian-body-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  body.rotation.z = index ? -0.035 : 0.035;

  const shoulders = addMesh(
    guardian,
    new THREE.BoxGeometry(1.04, 0.24, 0.54),
    darkStone,
    [0, 1.62, 0],
    `chronicles-foreground-guardian-shoulders-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  shoulders.rotation.z = index ? -0.03 : 0.03;

  const helm = addMesh(
    guardian,
    new THREE.ConeGeometry(0.35, 0.62, coarsePointer ? 6 : 8),
    stone,
    [0, 2.05, 0],
    `chronicles-foreground-guardian-helm-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  helm.rotation.y = Math.PI / 4;

  const shield = addMesh(
    guardian,
    new THREE.BoxGeometry(0.52, 0.92, 0.12),
    darkStone,
    [index ? 0.48 : -0.48, 1.05, 0.16],
    `chronicles-foreground-guardian-shield-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  shield.rotation.z = index ? -0.12 : 0.12;
  shield.rotation.y = index ? -0.16 : 0.16;

  const spear = addMesh(
    guardian,
    new THREE.CylinderGeometry(0.028, 0.035, 2.55, 6),
    darkStone,
    [index ? -0.42 : 0.42, 1.35, -0.02],
    `chronicles-foreground-guardian-spear-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  spear.rotation.z = index ? -0.08 : 0.08;

  root.add(guardian);
  return guardian;
}

function buildBrazier(root, plan, index, { iron, ember, glow, coarsePointer }) {
  const brazier = new THREE.Group();
  brazier.name = `chronicles-foreground-brazier-${index}`;
  brazier.position.set(plan.x, 0, plan.z);

  addMesh(
    brazier,
    new THREE.CylinderGeometry(0.18, 0.24, 0.72, 8),
    iron,
    [0, 0.36, 0],
    `chronicles-foreground-brazier-stem-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  addMesh(
    brazier,
    new THREE.CylinderGeometry(0.52, 0.35, 0.24, coarsePointer ? 8 : 12),
    iron,
    [0, 0.78, 0],
    `chronicles-foreground-brazier-bowl-${index}`,
    { castShadow: !coarsePointer, receiveShadow: true },
  );

  const flame = addMesh(
    brazier,
    new THREE.SphereGeometry(0.18, coarsePointer ? 8 : 12, coarsePointer ? 6 : 8),
    ember,
    [0, 1.05, 0],
    `chronicles-foreground-brazier-flame-${index}`,
    { castShadow: false, receiveShadow: false },
  );
  flame.scale.set(0.78, 1.6, 0.78);

  const halo = addMesh(
    brazier,
    new THREE.SphereGeometry(0.52, coarsePointer ? 8 : 12, coarsePointer ? 6 : 8),
    glow,
    [0, 1.02, 0],
    `chronicles-foreground-brazier-glow-${index}`,
    { castShadow: false, receiveShadow: false },
  );
  halo.scale.set(1, 0.8, 1);

  if (!coarsePointer) {
    const light = new THREE.PointLight(0xd47738, 0.42, 5.5, 2);
    light.name = `chronicles-foreground-brazier-light-${index}`;
    light.position.set(0, 1.08, 0);
    brazier.add(light);
  }

  root.add(brazier);
  return brazier;
}

export function installChroniclesTacticsForegroundFraming(
  scene,
  { coarsePointer = false, scenePlan = null } = {},
) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.('chronicles-foreground-framing');
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = 'chronicles-foreground-framing';
  root.position.z = chroniclesTacticsForegroundZForScenePlan(scenePlan);

  const stone = ownedMaterial({ color: 0x3b3834, roughness: 0.98, metalness: 0 });
  const darkStone = ownedMaterial({ color: 0x24211e, roughness: 0.98, metalness: 0.01 });
  const iron = ownedMaterial({ color: 0x2b211a, roughness: 0.62, metalness: 0.58 });
  const ember = ownedMaterial({
    color: 0xf2aa5b,
    emissive: 0xd95318,
    emissiveIntensity: 2.8,
    roughness: 0.36,
  });
  const glow = ownedBasicMaterial({
    color: 0xd47738,
    transparent: true,
    opacity: coarsePointer ? 0.055 : 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const parapetGeometry = new THREE.BoxGeometry(2.05, 0.56, 0.78);
  [
    [-7.25, 0.28, 7.02], [-5.18, 0.28, 7.02],
    [5.18, 0.28, 7.02], [7.25, 0.28, 7.02],
  ].forEach((position, index) => {
    addMesh(
      root,
      parapetGeometry,
      index % 2 ? stone : darkStone,
      position,
      `chronicles-foreground-parapet-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
  });

  CHRONICLES_TACTICS_FOREGROUND_PLAN.guardians.forEach((plan, index) => {
    buildGuardian(root, plan, index, { stone, darkStone, coarsePointer });
  });
  CHRONICLES_TACTICS_FOREGROUND_PLAN.braziers.forEach((plan, index) => {
    buildBrazier(root, plan, index, { iron, ember, glow, coarsePointer });
  });

  scene.add(root);
  return root;
}
