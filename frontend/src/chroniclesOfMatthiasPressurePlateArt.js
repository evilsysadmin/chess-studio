import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';

const ROOT_NAME = 'chronicles-tactics-pressure-plates';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function worldForEntry(entry, scenePlan) {
  const centerX = Number(scenePlan?.center?.x ?? 0);
  const centerY = Number(scenePlan?.center?.y ?? 0);
  return {
    x: (Number(entry?.position?.x || 0) - centerX) * CELL,
    z: (Number(entry?.position?.y || 0) - centerY) * CELL,
  };
}

export function chroniclesTacticsTrapEntries(scenePlan) {
  return (scenePlan?.content || []).filter((entry) => (
    entry?.kind === 'trap'
    && Number.isFinite(Number(entry?.position?.x))
    && Number.isFinite(Number(entry?.position?.y))
  ));
}

function buildSlagVent(root, entry, world, materials, { coarsePointer }) {
  const group = new THREE.Group();
  group.name = `chronicles-trap-${entry.id}`;
  group.userData.chroniclesTrapId = entry.id;
  group.userData.chroniclesTrapVisualType = entry.visualType || 'slag-vent';
  group.position.set(world.x, 0.02, world.z);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.62, 0.085, CELL * 0.62),
    materials.darkMetal,
  );
  rim.position.y = 0.015;
  rim.receiveShadow = true;
  group.add(rim);

  const ember = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.48, 0.035, CELL * 0.48),
    materials.ember,
  );
  ember.position.y = 0.065;
  group.add(ember);

  const barGeometry = new THREE.BoxGeometry(CELL * 0.5, 0.055, coarsePointer ? 0.085 : 0.065);
  [-0.18, 0, 0.18].forEach((offset) => {
    const bar = new THREE.Mesh(barGeometry, materials.iron);
    bar.position.set(0, 0.105, offset * CELL);
    bar.castShadow = !coarsePointer;
    group.add(bar);
  });

  const glow = new THREE.PointLight(0xff6a1a, coarsePointer ? 0.35 : 0.55, 3.4, 2);
  glow.position.y = 0.24;
  group.add(glow);

  root.add(group);
  return group;
}

function buildChainPlate(root, entry, world, materials, { coarsePointer }) {
  const group = new THREE.Group();
  group.name = `chronicles-trap-${entry.id}`;
  group.userData.chroniclesTrapId = entry.id;
  group.userData.chroniclesTrapVisualType = entry.visualType || 'chain-plate';
  group.position.set(world.x, 0.025, world.z);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.62, 0.08, CELL * 0.62),
    materials.iron,
  );
  plate.receiveShadow = true;
  group.add(plate);

  const grooveGeometry = new THREE.BoxGeometry(CELL * 0.52, 0.025, coarsePointer ? 0.09 : 0.07);
  const grooveA = new THREE.Mesh(grooveGeometry, materials.burnished);
  grooveA.position.y = 0.055;
  grooveA.rotation.y = Math.PI / 4;
  group.add(grooveA);
  const grooveB = grooveA.clone();
  grooveB.rotation.y = -Math.PI / 4;
  group.add(grooveB);

  const studGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.045, coarsePointer ? 8 : 12);
  [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ].forEach(([x, z]) => {
    const stud = new THREE.Mesh(studGeometry, materials.darkMetal);
    stud.position.set(x * CELL, 0.09, z * CELL);
    group.add(stud);
  });

  root.add(group);
  return group;
}

export function installChroniclesTacticsPressurePlateArt(scene, {
  coarsePointer = false,
  scenePlan = undefined,
} = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.(ROOT_NAME);
  if (existing) return existing;

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  scene.add(root);

  const traps = chroniclesTacticsTrapEntries(scenePlan);
  const materials = {
    iron: ownedMaterial({ color: 0x4a4741, roughness: 0.72, metalness: 0.58 }),
    darkMetal: ownedMaterial({ color: 0x24221f, roughness: 0.84, metalness: 0.5 }),
    burnished: ownedMaterial({ color: 0x75614c, roughness: 0.58, metalness: 0.7 }),
    ember: ownedMaterial({
      color: 0x6b2815,
      roughness: 0.64,
      metalness: 0.08,
      emissive: 0xff4e12,
      emissiveIntensity: coarsePointer ? 0.85 : 1.15,
    }),
  };

  const models = traps.map((entry) => {
    const world = worldForEntry(entry, scenePlan);
    return entry.visualType === 'slag-vent'
      ? buildSlagVent(root, entry, world, materials, { coarsePointer })
      : buildChainPlate(root, entry, world, materials, { coarsePointer });
  });

  root.userData.chroniclesTrapCount = traps.length;
  root.userData.chroniclesTrapIds = traps.map((entry) => entry.id);
  root.userData.chroniclesTrapModels = models;
  return root;
}
