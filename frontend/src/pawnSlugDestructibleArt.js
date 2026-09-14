import * as THREE from 'three';
import { PAWN_SLUG_DESTRUCTIBLE_TYPES } from './pawnSlugDestructibles.js';

function standard(color, roughness = 0.78, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.9 });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function contactShadow(width, depth, opacity = 0.26) {
  const shadow = mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x08090a, transparent: true, opacity, depthWrite: false }),
    { y: 0.012, rx: -Math.PI / 2 },
  );
  shadow.name = 'pawn-slug-destructible-contact-shadow';
  shadow.scale.set(width, depth, 1);
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  return shadow;
}

function addRivet(root, x, y, z, material) {
  const rivet = mesh(new THREE.SphereGeometry(0.025, 6, 4), material, { x, y, z });
  rivet.scale.z = 0.45;
  root.add(rivet);
}

function createCrate() {
  const root = new THREE.Group();
  const wood = standard(0x765032, 0.93, 0.02);
  const woodHighlight = standard(0x936642, 0.9, 0.02);
  const darkWood = standard(0x432b1d, 0.98, 0.01);
  const iron = standard(0x343a3d, 0.46, 0.72);
  const ironEdge = standard(0x5a6062, 0.4, 0.68);

  root.add(contactShadow(1.14, 0.72, 0.3));
  root.add(mesh(new THREE.BoxGeometry(1.08, 0.86, 0.8), wood, { y: 0.45 }));

  // Layered slats keep the silhouette chunky while adding enough surface relief
  // to read as a real field crate at normal play zoom.
  for (const y of [0.22, 0.48, 0.74]) {
    root.add(mesh(new THREE.BoxGeometry(0.94, 0.13, 0.035), woodHighlight, { y, z: 0.425 }));
  }
  for (const x of [-0.49, 0.49]) {
    root.add(mesh(new THREE.BoxGeometry(0.11, 0.96, 0.86), darkWood, { x, y: 0.49, z: 0.005 }));
  }
  for (const y of [0.13, 0.82]) {
    root.add(mesh(new THREE.BoxGeometry(1.15, 0.11, 0.86), darkWood, { y, z: 0.005 }));
  }

  const braceA = mesh(new THREE.BoxGeometry(0.075, 1.2, 0.055), iron, { y: 0.48, z: 0.46, rz: Math.PI / 4 });
  const braceB = mesh(new THREE.BoxGeometry(0.075, 1.2, 0.055), iron, { y: 0.48, z: 0.46, rz: -Math.PI / 4 });
  root.add(braceA, braceB);

  for (const x of [-0.48, 0.48]) {
    for (const y of [0.14, 0.8]) {
      const corner = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.055), ironEdge, { x, y, z: 0.472 });
      root.add(corner);
      addRivet(root, x, y, 0.505, iron);
    }
  }

  const stencilPlate = mesh(new THREE.BoxGeometry(0.38, 0.28, 0.035), standard(0x252a2d, 0.6, 0.42), { y: 0.49, z: 0.495 });
  root.add(stencilPlate);
  const stencil = mesh(new THREE.PlaneGeometry(0.24, 0.24), basic(0xd8b45f, 0.9), { y: 0.49, z: 0.517 });
  stencil.name = 'pawn-slug-destructible-stencil';
  root.add(stencil);
  return root;
}

function createBarrel() {
  const root = new THREE.Group();
  const steel = standard(0x485157, 0.42, 0.74);
  const steelHighlight = standard(0x667078, 0.36, 0.78);
  const ring = standard(0x22272a, 0.32, 0.88);
  const warning = standard(0x9f3c2c, 0.46, 0.5);
  const warningBright = standard(0xd28b35, 0.48, 0.38);

  root.add(contactShadow(0.82, 0.62, 0.3));
  root.add(mesh(new THREE.CylinderGeometry(0.37, 0.4, 1.1, 18), steel, { y: 0.56 }));
  root.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 1.04, 18, 1, true), steelHighlight, { y: 0.56 }));

  for (const y of [0.14, 0.55, 0.96]) {
    root.add(mesh(new THREE.TorusGeometry(0.397, 0.034, 7, 18), ring, { y, rx: Math.PI / 2 }));
  }

  // A proper hazard band reads much better than the old plain red cylinder.
  root.add(mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.2, 18), warning, { y: 0.58 }));
  for (const x of [-0.22, 0, 0.22]) {
    const stripe = mesh(new THREE.BoxGeometry(0.09, 0.22, 0.025), warningBright, { x, y: 0.58, z: 0.405, rz: -0.5 });
    stripe.castShadow = false;
    root.add(stripe);
  }

  const top = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.055, 18), ring, { y: 1.115 });
  const cap = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.065, 10), steelHighlight, { x: 0.16, y: 1.165, z: 0.05 });
  const bung = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8), ring, { x: -0.15, y: 1.16, z: -0.08 });
  root.add(top, cap, bung);
  return root;
}

export function pawnSlugDestructibleDamageStage(hpRatio = 1) {
  const safe = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  if (safe > 0.66) return 'intact';
  if (safe > 0.33) return 'damaged';
  return 'critical';
}

function applyMaterialDamageState(model, stage) {
  const materialKind = model.userData.material;
  const factor = stage === 'critical' ? (materialKind === 'wood' ? 0.68 : 0.8)
    : stage === 'damaged' ? (materialKind === 'wood' ? 0.84 : 0.91)
      : 1;
  const emissiveIntensity = materialKind === 'metal'
    ? (stage === 'critical' ? 0.34 : stage === 'damaged' ? 0.1 : 0)
    : 0;
  model.traverse((node) => {
    if (!node.isMesh || !node.material?.color) return;
    if (node.userData.pawnSlugBaseColor == null) node.userData.pawnSlugBaseColor = node.material.color.getHex();
    node.material.color.setHex(node.userData.pawnSlugBaseColor).multiplyScalar(factor);
    if (node.material.emissive) {
      node.material.emissive.setHex(materialKind === 'metal' ? 0x6b210f : 0x000000);
      node.material.emissiveIntensity = emissiveIntensity;
    }
  });
}

export function createPawnSlugDestructibleModel(type = 'crate') {
  const spec = PAWN_SLUG_DESTRUCTIBLE_TYPES[type];
  if (!spec) throw new Error(`Unknown Pawn Slug destructible art type: ${type}`);
  const root = type === 'barrel' ? createBarrel() : createCrate();
  root.name = `pawn-slug-destructible-${type}`;
  root.userData.pawnSlugDestructible = true;
  root.userData.destructibleType = type;
  root.userData.material = spec.material;
  root.userData.damageStage = 'intact';
  root.userData.materialDamageStage = 'intact';
  root.userData.hitbox = type === 'barrel'
    ? Object.freeze({ width: 0.82, height: 1.18 })
    : Object.freeze({ width: 1.12, height: 0.96 });
  root.userData.baseScale = 1;
  root.userData.premiumArt = 'field-prop-v2';
  return root;
}

export function animatePawnSlugDestructibleModel(model, time = 0, { hpRatio = 1, destroyed = false, reducedMotion = false } = {}) {
  if (!model?.userData?.pawnSlugDestructible) return;
  const safeHp = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  if (!Number.isFinite(model.userData.baseY)) model.userData.baseY = model.position.y;
  const baseY = model.userData.baseY;
  if (destroyed) {
    model.visible = false;
    return;
  }
  model.visible = true;
  const stage = pawnSlugDestructibleDamageStage(safeHp);
  model.userData.damageStage = stage;
  if (model.userData.materialDamageStage !== stage) {
    applyMaterialDamageState(model, stage);
    model.userData.materialDamageStage = stage;
  }

  const damage = 1 - safeHp;
  if (reducedMotion || damage <= 0.0001) {
    model.rotation.z = 0;
    model.position.y = baseY;
    return;
  }
  const materialWeight = model.userData.material === 'metal' ? 0.72 : 1;
  model.rotation.z = Math.sin(time * 34 + model.id) * 0.014 * damage * materialWeight;
  model.position.y = baseY + Math.abs(Math.sin(time * 27 + model.id * 0.3)) * 0.012 * damage * materialWeight;
}

export const PAWN_SLUG_DESTRUCTIBLE_ART_META = Object.freeze({
  crate: Object.freeze({ material: 'wood', hitbox: Object.freeze({ width: 1.12, height: 0.96 }) }),
  barrel: Object.freeze({ material: 'metal', hitbox: Object.freeze({ width: 0.82, height: 1.18 }) }),
  damageFeedback: 'material-state-plus-restrained-shake-before-break',
  damageStages: Object.freeze(['intact', 'damaged', 'critical']),
  materialRefresh: 'stage-change-only',
  intactIdleAnimation: 'none',
  artVersion: 'field-prop-v2',
  contactShadow: true,
  dynamicLights: 0,
});