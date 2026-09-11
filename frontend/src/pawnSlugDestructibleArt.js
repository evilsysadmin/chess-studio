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

function createCrate() {
  const root = new THREE.Group();
  const wood = standard(0x79502e, 0.94, 0.02);
  const darkWood = standard(0x4a2d1c, 0.98, 0.01);
  const iron = standard(0x42474a, 0.52, 0.65);
  root.add(mesh(new THREE.BoxGeometry(1.1, 0.92, 0.86), wood, { y: 0.46 }));
  for (const x of [-0.48, 0.48]) root.add(mesh(new THREE.BoxGeometry(0.1, 1.0, 0.91), darkWood, { x, y: 0.49, z: 0.01 }));
  for (const y of [0.16, 0.78]) root.add(mesh(new THREE.BoxGeometry(1.16, 0.095, 0.91), darkWood, { y, z: 0.01 }));
  const braceA = mesh(new THREE.BoxGeometry(0.08, 1.25, 0.06), iron, { y: 0.48, z: 0.47, rz: Math.PI / 4 });
  const braceB = mesh(new THREE.BoxGeometry(0.08, 1.25, 0.06), iron, { y: 0.48, z: 0.47, rz: -Math.PI / 4 });
  root.add(braceA, braceB);
  const stencil = mesh(new THREE.PlaneGeometry(0.34, 0.34), basic(0xd6b463, 0.78), { y: 0.48, z: 0.505 });
  stencil.name = 'pawn-slug-destructible-stencil';
  root.add(stencil);
  return root;
}

function createBarrel() {
  const root = new THREE.Group();
  const steel = standard(0x4d5558, 0.46, 0.72);
  const ring = standard(0x252a2d, 0.38, 0.82);
  const warning = standard(0x9a3b2c, 0.5, 0.48);
  const body = mesh(new THREE.CylinderGeometry(0.38, 0.4, 1.12, 14), steel, { y: 0.56 });
  root.add(body);
  for (const y of [0.18, 0.56, 0.94]) root.add(mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 14), ring, { y, rx: Math.PI / 2 }));
  root.add(mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.18, 14), warning, { y: 0.58 }));
  const cap = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), ring, { y: 1.15 });
  root.add(cap);
  return root;
}

export function createPawnSlugDestructibleModel(type = 'crate') {
  const spec = PAWN_SLUG_DESTRUCTIBLE_TYPES[type];
  if (!spec) throw new Error(`Unknown Pawn Slug destructible art type: ${type}`);
  const root = type === 'barrel' ? createBarrel() : createCrate();
  root.name = `pawn-slug-destructible-${type}`;
  root.userData.pawnSlugDestructible = true;
  root.userData.destructibleType = type;
  root.userData.material = spec.material;
  root.userData.hitbox = type === 'barrel'
    ? Object.freeze({ width: 0.82, height: 1.18 })
    : Object.freeze({ width: 1.12, height: 0.96 });
  root.userData.baseScale = 1;
  return root;
}

export function animatePawnSlugDestructibleModel(model, time = 0, { hpRatio = 1, destroyed = false, reducedMotion = false } = {}) {
  if (!model?.userData?.pawnSlugDestructible) return;
  const safeHp = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  if (destroyed) {
    model.visible = false;
    return;
  }
  model.visible = true;
  if (reducedMotion) return;
  const damage = 1 - safeHp;
  model.rotation.z = Math.sin(time * 34 + model.id) * 0.018 * damage;
  model.position.y += Math.abs(Math.sin(time * 27 + model.id * 0.3)) * 0.018 * damage;
}

export const PAWN_SLUG_DESTRUCTIBLE_ART_META = Object.freeze({
  crate: Object.freeze({ material: 'wood', hitbox: Object.freeze({ width: 1.12, height: 0.96 }) }),
  barrel: Object.freeze({ material: 'metal', hitbox: Object.freeze({ width: 0.82, height: 1.18 }) }),
  damageFeedback: 'shake-before-break',
});
