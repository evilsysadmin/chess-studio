import * as THREE from 'three';

function crateModel() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.88, metalness: 0.02 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x5f3c23, roughness: 0.92, metalness: 0.01 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 0.72), wood);
  box.position.y = 0.53;
  root.add(box);
  for (const x of [-0.48, 0.48]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.08, 0.76), darkWood);
    brace.position.set(x, 0.54, 0);
    root.add(brace);
  }
  const slash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.28, 0.78), darkWood);
  slash.position.y = 0.54;
  slash.rotation.z = Math.PI * 0.22;
  root.add(slash);
  root.userData.materialKind = 'wood';
  root.userData.intactScale = 1;
  return root;
}

function barrelModel() {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x53616a, roughness: 0.58, metalness: 0.62 });
  const band = new THREE.MeshStandardMaterial({ color: 0x1d2428, roughness: 0.5, metalness: 0.75 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xc58b26, roughness: 0.68, metalness: 0.12 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.08, 12), metal);
  drum.position.y = 0.54;
  root.add(drum);
  for (const y of [0.2, 0.54, 0.88]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 12), band);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    root.add(ring);
  }
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.025), hazard);
  mark.position.set(0, 0.56, 0.435);
  root.add(mark);
  root.userData.materialKind = 'metal';
  root.userData.explosive = true;
  root.userData.intactScale = 1;
  return root;
}

export function createPawnSlugDestructibleModel(type) {
  if (type === 'crate') return crateModel();
  if (type === 'barrel') return barrelModel();
  throw new Error(`Unknown Pawn Slug destructible model: ${type}`);
}

export function applyPawnSlugDestructibleDamageVisual(model, hpRatio) {
  if (!model) return;
  const ratio = Math.max(0, Math.min(1, Number(hpRatio) || 0));
  model.rotation.z = ratio < 0.5 ? -0.035 : 0;
  model.scale.y = ratio <= 0 ? 0.18 : ratio < 0.5 ? 0.94 : 1;
  model.scale.x = ratio <= 0 ? 1.12 : 1;
  model.visible = ratio > 0;
}
