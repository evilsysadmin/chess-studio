import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';

const ROOT_NAME = 'chronicles-tactics-pressure-plates';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function ownedClone(material) {
  const clone = material.clone();
  clone.userData = { ...(clone.userData || {}), chroniclesIsoOwned: true };
  return clone;
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

export function chroniclesTacticsTrapVisualMode(visualState) {
  if (visualState?.available) return 'armed';
  if (visualState?.activated) return 'spent';
  return 'safe';
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

  const emberMaterial = ownedClone(materials.ember);
  const ember = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.48, 0.035, CELL * 0.48),
    emberMaterial,
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

  const baseLightIntensity = coarsePointer ? 0.35 : 0.55;
  const glow = new THREE.PointLight(0xff6a1a, baseLightIntensity, 3.4, 2);
  glow.position.y = 0.24;
  group.add(glow);

  group.userData.chroniclesTrapVisual = {
    kind: 'slag-vent',
    ember,
    emberMaterial,
    glow,
    baseLightIntensity,
    armedEmissiveIntensity: coarsePointer ? 0.85 : 1.15,
  };

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
  plate.position.y = 0.045;
  plate.receiveShadow = true;
  group.add(plate);

  const grooveGeometry = new THREE.BoxGeometry(CELL * 0.52, 0.025, coarsePointer ? 0.09 : 0.07);
  const grooveMaterials = [ownedClone(materials.burnished), ownedClone(materials.burnished)];
  grooveMaterials.forEach((material) => {
    material.emissive.setHex(0x3a1707);
    material.emissiveIntensity = 0.28;
  });

  const grooveA = new THREE.Mesh(grooveGeometry, grooveMaterials[0]);
  grooveA.position.y = 0.092;
  grooveA.rotation.y = Math.PI / 4;
  group.add(grooveA);
  const grooveB = new THREE.Mesh(grooveGeometry, grooveMaterials[1]);
  grooveB.position.y = 0.092;
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
    stud.position.set(x * CELL, 0.115, z * CELL);
    group.add(stud);
  });

  group.userData.chroniclesTrapVisual = {
    kind: 'chain-plate',
    plate,
    grooveA,
    grooveB,
    grooveMaterials,
  };

  root.add(group);
  return group;
}

function applyTrapMode(model, mode) {
  const visual = model?.userData?.chroniclesTrapVisual;
  if (!visual) return;

  model.userData.chroniclesTrapVisualMode = mode;
  if (visual.kind === 'slag-vent') {
    visual.ember.scale.y = mode === 'armed' ? 1 : mode === 'spent' ? 0.56 : 0.34;
    visual.ember.position.y = mode === 'armed' ? 0.065 : 0.052;
    visual.emberMaterial.emissiveIntensity = mode === 'armed'
      ? visual.armedEmissiveIntensity
      : mode === 'spent' ? 0.16 : 0.025;
    visual.glow.intensity = mode === 'armed'
      ? visual.baseLightIntensity
      : mode === 'spent' ? visual.baseLightIntensity * 0.12 : 0;
    return;
  }

  const plateY = mode === 'armed' ? 0.045 : mode === 'spent' ? -0.005 : 0.012;
  const detailY = mode === 'armed' ? 0.092 : mode === 'spent' ? 0.045 : 0.062;
  visual.plate.position.y = plateY;
  visual.grooveA.position.y = detailY;
  visual.grooveB.position.y = detailY;
  visual.grooveMaterials.forEach((material) => {
    material.emissive.setHex(mode === 'safe' ? 0x071417 : 0x3a1707);
    material.emissiveIntensity = mode === 'armed' ? 0.28 : mode === 'spent' ? 0.025 : 0.08;
  });
}

function normalizeVisualStates(visualStates) {
  if (visualStates instanceof Map) return visualStates;
  return new Map((visualStates || []).map((entry) => [entry.id, entry]));
}

export function syncChroniclesTacticsPressurePlateArt(scene, visualStates, { now = 0 } = {}) {
  const root = scene?.getObjectByName?.(ROOT_NAME);
  if (!root) return null;
  const byId = normalizeVisualStates(visualStates);

  (root.userData.chroniclesTrapModels || []).forEach((model) => {
    const visualState = byId.get(model.userData.chroniclesTrapId);
    const nextMode = chroniclesTacticsTrapVisualMode(visualState);
    const previousMode = model.userData.chroniclesTrapVisualMode;
    if (previousMode === 'armed' && nextMode === 'spent') {
      model.userData.chroniclesTrapTriggeredAt = now;
    }
    applyTrapMode(model, nextMode);
  });

  return root;
}

export function tickChroniclesTacticsPressurePlateArt(scene, time = 0) {
  const root = scene?.getObjectByName?.(ROOT_NAME);
  if (!root) return null;

  (root.userData.chroniclesTrapModels || []).forEach((model, index) => {
    const visual = model.userData.chroniclesTrapVisual;
    const mode = model.userData.chroniclesTrapVisualMode;
    if (!visual) return;

    if (visual.kind === 'slag-vent') {
      if (mode === 'armed') {
        const pulse = 0.88 + Math.sin(time * 4.8 + index * 1.7) * 0.12;
        visual.emberMaterial.emissiveIntensity = visual.armedEmissiveIntensity * pulse;
        visual.glow.intensity = visual.baseLightIntensity * pulse;
      } else if (mode === 'spent') {
        const elapsed = time - Number(model.userData.chroniclesTrapTriggeredAt ?? -99);
        const flash = elapsed >= 0 && elapsed < 0.52 ? Math.sin((elapsed / 0.52) * Math.PI) : 0;
        visual.emberMaterial.emissiveIntensity = 0.16 + flash * 1.35;
        visual.glow.intensity = visual.baseLightIntensity * (0.12 + flash * 1.7);
      }
      return;
    }

    if (mode === 'armed') {
      const pulse = 0.24 + (Math.sin(time * 3.2 + index) + 1) * 0.045;
      visual.grooveMaterials.forEach((material) => { material.emissiveIntensity = pulse; });
    } else if (mode === 'spent') {
      const elapsed = time - Number(model.userData.chroniclesTrapTriggeredAt ?? -99);
      const flash = elapsed >= 0 && elapsed < 0.38 ? Math.sin((elapsed / 0.38) * Math.PI) : 0;
      visual.grooveMaterials.forEach((material) => { material.emissiveIntensity = 0.025 + flash * 0.48; });
    }
  });

  return root;
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
