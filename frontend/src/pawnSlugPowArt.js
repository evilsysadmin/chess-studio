import * as THREE from 'three';

function mat(color, roughness = 0.82, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function addPrisoner(root, pose = 'bound') {
  const uniform = mat(0x6f765d, 0.94, 0.02);
  const skin = mat(0xb98768, 0.9, 0.01);
  const dark = mat(0x2a2b29, 0.95, 0.03);
  const body = new THREE.Group();
  body.name = 'pawn-slug-pow-body';

  const crouched = pose === 'kneeling' || pose === 'caged';
  const baseY = crouched ? 0.48 : 0.72;
  body.add(
    mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.72, 10), uniform, { y: baseY }),
    mesh(new THREE.SphereGeometry(0.2, 10, 7), skin, { y: baseY + 0.56 }),
    mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), dark, { x: -0.18, y: crouched ? 0.18 : 0.28, rz: crouched ? -0.55 : -0.12 }),
    mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), dark, { x: 0.18, y: crouched ? 0.18 : 0.28, rz: crouched ? 0.55 : 0.12 }),
  );

  if (pose === 'bound') {
    body.add(mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 12), mat(0x44484a, 0.5, 0.72), { y: baseY + 0.15, rx: Math.PI / 2 }));
  }
  root.add(body);
}

function addCage(root) {
  const iron = mat(0x303438, 0.48, 0.75);
  const bars = new THREE.Group();
  bars.name = 'pawn-slug-pow-cage';
  for (const x of [-0.62, -0.31, 0, 0.31, 0.62]) {
    bars.add(mesh(new THREE.BoxGeometry(0.055, 1.75, 0.055), iron, { x, y: 0.88, z: 0.22 }));
  }
  bars.add(
    mesh(new THREE.BoxGeometry(1.35, 0.08, 0.08), iron, { y: 0.08, z: 0.22 }),
    mesh(new THREE.BoxGeometry(1.35, 0.08, 0.08), iron, { y: 1.7, z: 0.22 }),
  );
  root.add(bars);
}

function addChains(root) {
  const iron = mat(0x3a3e41, 0.5, 0.72);
  const chains = new THREE.Group();
  chains.name = 'pawn-slug-pow-chains';
  for (let i = 0; i < 5; i += 1) {
    chains.add(mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 9), iron, {
      x: -0.42 + i * 0.21,
      y: 1.38 - i * 0.05,
      z: 0.38,
      rz: i % 2 ? Math.PI / 2 : 0,
    }));
  }
  root.add(chains);
}

function addRescueFlash(root) {
  const flash = mesh(
    new THREE.RingGeometry(0.18, 0.25, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0, depthWrite: false }),
    { y: 1.02, z: 0.43, rx: Math.PI / 2 },
  );
  flash.name = 'pawn-slug-pow-release-flash';
  flash.visible = false;
  flash.castShadow = false;
  flash.receiveShadow = false;
  root.add(flash);
}

export function createPawnSlugPowModel(pow, { coarse = false } = {}) {
  if (!pow?.id) throw new Error('Pawn Slug POW model requires a POW descriptor');
  const root = new THREE.Group();
  root.name = `pawn-slug-pow-${pow.id}`;
  root.userData.pawnSlugPow = true;
  root.userData.powId = pow.id;
  root.userData.pose = pow.pose || 'bound';
  root.userData.rescueRadius = coarse ? 0.95 : 0.82;
  root.userData.rescued = false;
  root.userData.rescueVisualStartedAt = null;

  addPrisoner(root, pow.pose);
  if (pow.pose === 'caged') addCage(root);
  else addChains(root);

  const marker = mesh(
    new THREE.RingGeometry(0.08, 0.12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd86a, transparent: true, opacity: 0.72, depthWrite: false }),
    { y: 1.82, z: 0.42, rx: Math.PI / 2 },
  );
  marker.name = 'pawn-slug-pow-rescue-marker';
  marker.castShadow = false;
  marker.receiveShadow = false;
  root.add(marker);
  addRescueFlash(root);
  return root;
}

export function animatePawnSlugPowModel(model, time = 0, { rescued = false, reducedMotion = false } = {}) {
  if (!model?.userData?.pawnSlugPow) return;
  const wasRescued = Boolean(model.userData.rescued);
  model.userData.rescued = Boolean(rescued);
  if (rescued && !wasRescued) model.userData.rescueVisualStartedAt = Number(time) || 0;

  const marker = model.getObjectByName('pawn-slug-pow-rescue-marker');
  const body = model.getObjectByName('pawn-slug-pow-body');
  const cage = model.getObjectByName('pawn-slug-pow-cage');
  const chains = model.getObjectByName('pawn-slug-pow-chains');
  const flash = model.getObjectByName('pawn-slug-pow-release-flash');

  if (marker) {
    marker.visible = !rescued;
    if (!reducedMotion) marker.scale.setScalar(0.92 + Math.sin(time * 4.6) * 0.08);
  }
  if (cage) cage.visible = !rescued;
  if (chains) chains.visible = !rescued;

  if (flash) {
    const startedAt = model.userData.rescueVisualStartedAt;
    const age = rescued && Number.isFinite(startedAt) ? Math.max(0, Number(time) - startedAt) : Number.POSITIVE_INFINITY;
    const active = rescued && age < 0.48;
    flash.visible = active;
    if (active) {
      const progress = Math.max(0, Math.min(1, age / 0.48));
      const scale = 0.72 + progress * 2.2;
      flash.scale.setScalar(reducedMotion ? 1.15 : scale);
      if (flash.material) flash.material.opacity = reducedMotion ? 0.42 : (1 - progress) * 0.82;
    }
  }

  if (!body || reducedMotion) return;
  if (rescued) {
    body.position.y = Math.min(0.2, (body.position.y || 0) + 0.018);
    body.rotation.z *= 0.85;
  } else {
    body.position.y = Math.max(0, Math.sin(time * 2.4 + model.id * 0.13) * 0.018);
  }
}

export const PAWN_SLUG_POW_ART_META = Object.freeze({
  style: 'military-arcade-prisoner',
  poses: Object.freeze(['kneeling', 'bound', 'caged']),
  rescueFeedback: 'contact-release-break-flash-and-rise',
  releaseFlashSeconds: 0.48,
  defaultRescueRadius: 0.82,
});
