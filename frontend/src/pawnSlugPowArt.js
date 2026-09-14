import * as THREE from 'three';

const POW_RELEASE_FLASH_SECONDS = 0.48;
const POW_RESCUE_RISE_SECONDS = 0.22;
const POW_RESCUE_RISE_HEIGHT = 0.2;
const powVisualRefs = new WeakMap();

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

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

function named(node, name) {
  node.name = name;
  return node;
}

function addGroundShadow(root) {
  const shadow = mesh(
    new THREE.CircleGeometry(0.48, 20),
    new THREE.MeshBasicMaterial({ color: 0x060708, transparent: true, opacity: 0.24, depthWrite: false }),
    { y: 0.012, z: 0, rx: -Math.PI / 2 },
  );
  shadow.name = 'pawn-slug-pow-ground-shadow';
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  root.add(shadow);
  return shadow;
}

export function pawnSlugPowRescueRise(age = 0) {
  const progress = clamp01(Math.max(0, Number(age) || 0) / POW_RESCUE_RISE_SECONDS);
  const eased = 1 - ((1 - progress) ** 3);
  return POW_RESCUE_RISE_HEIGHT * eased;
}

function addPrisoner(root, pose = 'bound') {
  const uniform = mat(0x4f5749, 0.9, 0.03);
  const uniformDark = mat(0x30362f, 0.94, 0.02);
  const webbing = mat(0x554737, 0.88, 0.03);
  const leather = mat(0x252523, 0.82, 0.08);
  const skin = mat(0xb98768, 0.9, 0.01);
  const steel = mat(0x50565a, 0.42, 0.78);
  const brass = mat(0x9d7d3f, 0.42, 0.58);
  const body = new THREE.Group();
  body.name = 'pawn-slug-pow-body';

  const crouched = pose === 'kneeling' || pose === 'caged';
  const baseY = crouched ? 0.5 : 0.7;
  const torso = named(mesh(new THREE.CylinderGeometry(0.21, 0.29, 0.64, 12), uniform, { y: baseY }), 'pawn-slug-pow-torso');
  const vest = named(mesh(new THREE.BoxGeometry(0.4, 0.28, 0.12), uniformDark, { y: baseY + 0.02, z: 0.12 }), 'pawn-slug-pow-vest');
  const belt = named(mesh(new THREE.TorusGeometry(0.245, 0.025, 6, 18), webbing, { y: baseY - 0.22, rx: Math.PI / 2 }), 'pawn-slug-pow-belt');
  const buckle = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.035), brass, { y: baseY - 0.22, z: 0.245 });
  buckle.castShadow = false;

  const neck = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.13, 9), skin, { y: baseY + 0.38 });
  const headY = baseY + 0.54;
  const head = named(mesh(new THREE.SphereGeometry(0.185, 12, 9), skin, { y: headY }), 'pawn-slug-pow-head');
  const nose = mesh(new THREE.SphereGeometry(0.035, 7, 5), skin, { y: headY, z: 0.17 });
  nose.castShadow = false;
  const cap = named(mesh(new THREE.CylinderGeometry(0.19, 0.205, 0.095, 12), uniformDark, { y: headY + 0.14 }), 'pawn-slug-pow-headgear');
  const brim = mesh(new THREE.BoxGeometry(0.29, 0.035, 0.13), uniformDark, { y: headY + 0.1, z: 0.1 });

  const shoulderY = baseY + 0.2;
  const armAngle = crouched ? 0.7 : 0.5;
  const leftArm = mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.43, 8), uniform, { x: -0.25, y: shoulderY - 0.12, z: 0.02, rz: armAngle });
  const rightArm = mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.43, 8), uniform, { x: 0.25, y: shoulderY - 0.12, z: 0.02, rz: -armAngle });
  const handY = crouched ? baseY - 0.06 : baseY - 0.02;
  const leftHand = mesh(new THREE.SphereGeometry(0.07, 8, 6), skin, { x: -0.09, y: handY, z: 0.2 });
  const rightHand = mesh(new THREE.SphereGeometry(0.07, 8, 6), skin, { x: 0.09, y: handY, z: 0.2 });

  const legY = crouched ? 0.2 : 0.25;
  const legAngle = crouched ? 0.58 : 0.08;
  const leftLeg = mesh(new THREE.CylinderGeometry(0.07, 0.09, crouched ? 0.34 : 0.46, 8), uniformDark, { x: -0.14, y: legY, rz: -legAngle });
  const rightLeg = mesh(new THREE.CylinderGeometry(0.07, 0.09, crouched ? 0.34 : 0.46, 8), uniformDark, { x: 0.14, y: legY, rz: legAngle });
  const bootY = crouched ? 0.08 : 0.055;
  const leftBoot = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), leather, { x: -0.19, y: bootY, z: 0.08, ry: crouched ? -0.16 : 0 });
  const rightBoot = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), leather, { x: 0.19, y: bootY, z: 0.08, ry: crouched ? 0.16 : 0 });

  body.add(
    torso, vest, belt, buckle, neck, head, nose, cap, brim,
    leftArm, rightArm, leftHand, rightHand, leftLeg, rightLeg, leftBoot, rightBoot,
  );

  if (pose === 'bound') {
    const cuffs = new THREE.Group();
    cuffs.name = 'pawn-slug-pow-cuffs';
    cuffs.add(
      mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 12), steel, { x: -0.085, y: handY, z: 0.205, rx: Math.PI / 2 }),
      mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 12), steel, { x: 0.085, y: handY, z: 0.205, rx: Math.PI / 2 }),
      mesh(new THREE.BoxGeometry(0.09, 0.025, 0.025), steel, { y: handY, z: 0.205 }),
    );
    body.add(cuffs);
  }

  root.add(body);
  return body;
}

function addCage(root) {
  const iron = mat(0x2b3034, 0.4, 0.82);
  const ironEdge = mat(0x596166, 0.36, 0.76);
  const brass = mat(0x98773d, 0.38, 0.62);
  const bars = new THREE.Group();
  bars.name = 'pawn-slug-pow-cage';

  bars.add(named(mesh(new THREE.BoxGeometry(1.45, 0.1, 0.74), iron, { y: 0.06 }), 'pawn-slug-pow-cage-floor'));
  for (const x of [-0.66, 0.66]) {
    for (const z of [-0.29, 0.29]) {
      bars.add(mesh(new THREE.BoxGeometry(0.075, 1.78, 0.075), ironEdge, { x, y: 0.9, z }));
    }
  }
  for (const x of [-0.44, -0.22, 0, 0.22, 0.44]) {
    bars.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.62, 7), iron, { x, y: 0.88, z: 0.31 }));
  }
  for (const z of [-0.31, 0.31]) {
    bars.add(
      mesh(new THREE.BoxGeometry(1.38, 0.075, 0.075), ironEdge, { y: 0.11, z }),
      mesh(new THREE.BoxGeometry(1.38, 0.075, 0.075), ironEdge, { y: 1.69, z }),
    );
  }
  const lock = new THREE.Group();
  lock.name = 'pawn-slug-pow-cage-lock';
  lock.add(
    mesh(new THREE.BoxGeometry(0.18, 0.2, 0.06), brass, { x: 0.36, y: 0.9, z: 0.365 }),
    mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), ironEdge, { x: 0.36, y: 1.02, z: 0.365 }),
  );
  bars.add(lock);
  root.add(bars);
  return bars;
}

function addChains(root) {
  const iron = mat(0x3a4044, 0.42, 0.78);
  const anchor = mat(0x222629, 0.5, 0.7);
  const chains = new THREE.Group();
  chains.name = 'pawn-slug-pow-chains';
  chains.add(
    mesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), anchor, { x: -0.55, y: 1.47, z: 0.32 }),
    mesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), anchor, { x: 0.55, y: 1.21, z: 0.32 }),
  );
  for (let i = 0; i < 7; i += 1) {
    chains.add(mesh(new THREE.TorusGeometry(0.07, 0.017, 5, 10), iron, {
      x: -0.45 + i * 0.15,
      y: 1.42 - i * 0.035,
      z: 0.37,
      rz: i % 2 ? Math.PI / 2 : 0,
      ry: i % 2 ? 0.15 : -0.15,
    }));
  }
  root.add(chains);
  return chains;
}

function addRescueMarker(root) {
  const marker = new THREE.Group();
  marker.name = 'pawn-slug-pow-rescue-marker';
  const brass = new THREE.MeshBasicMaterial({ color: 0xffd86a, transparent: true, opacity: 0.72, depthWrite: false });
  const halo = mesh(new THREE.RingGeometry(0.085, 0.125, 18), brass, { rx: Math.PI / 2 });
  const pip = mesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.86, depthWrite: false }), { y: 0.12 });
  halo.castShadow = false;
  halo.receiveShadow = false;
  pip.castShadow = false;
  pip.receiveShadow = false;
  marker.position.set(0, 1.82, 0.42);
  marker.add(halo, pip);
  root.add(marker);
  return marker;
}

function addRescueFlash(root) {
  const flash = mesh(
    new THREE.RingGeometry(0.18, 0.25, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0, depthWrite: false }),
    { y: 1.02, z: 0.43, rx: Math.PI / 2 },
  );
  flash.name = 'pawn-slug-pow-release-flash';
  flash.visible = false;
  flash.castShadow = false;
  flash.receiveShadow = false;
  const inner = mesh(
    new THREE.RingGeometry(0.08, 0.12, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff1bd, transparent: true, opacity: 0.58, depthWrite: false }),
    { z: 0.006 },
  );
  inner.castShadow = false;
  inner.receiveShadow = false;
  flash.add(inner);
  root.add(flash);
  return flash;
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

  addGroundShadow(root);
  const body = addPrisoner(root, pow.pose);
  const cage = pow.pose === 'caged' ? addCage(root) : null;
  const chains = pow.pose === 'caged' ? null : addChains(root);
  const marker = addRescueMarker(root);
  const flash = addRescueFlash(root);
  powVisualRefs.set(root, { marker, body, cage, chains, flash });
  return root;
}

export function animatePawnSlugPowModel(model, time = 0, { rescued = false, reducedMotion = false } = {}) {
  if (!model?.userData?.pawnSlugPow) return;
  const safeTime = Number(time) || 0;
  const wasRescued = Boolean(model.userData.rescued);
  model.userData.rescued = Boolean(rescued);
  if (rescued && !wasRescued) model.userData.rescueVisualStartedAt = safeTime;

  const refs = powVisualRefs.get(model);
  if (!refs) return;
  const { marker, body, cage, chains, flash } = refs;
  const startedAt = model.userData.rescueVisualStartedAt;
  const rescueAge = rescued && Number.isFinite(startedAt) ? Math.max(0, safeTime - startedAt) : Number.POSITIVE_INFINITY;

  marker.visible = !rescued;
  if (!reducedMotion) marker.scale.setScalar(0.92 + Math.sin(safeTime * 4.6) * 0.08);
  if (cage) cage.visible = !rescued;
  if (chains) chains.visible = !rescued;

  const activeFlash = rescued && rescueAge < POW_RELEASE_FLASH_SECONDS;
  flash.visible = activeFlash;
  if (activeFlash) {
    const progress = clamp01(rescueAge / POW_RELEASE_FLASH_SECONDS);
    const scale = 0.72 + progress * 2.2;
    flash.scale.setScalar(reducedMotion ? 1.15 : scale);
    flash.material.opacity = reducedMotion ? 0.42 : (1 - progress) * 0.82;
  }

  if (reducedMotion) return;
  if (rescued) {
    body.position.y = pawnSlugPowRescueRise(rescueAge);
    body.rotation.z *= 0.85;
  } else {
    body.position.y = Math.max(0, Math.sin(safeTime * 2.4 + model.id * 0.13) * 0.012);
  }
}

export const PAWN_SLUG_POW_ART_META = Object.freeze({
  style: 'premium-military-arcade-prisoner-v2',
  poses: Object.freeze(['kneeling', 'bound', 'caged']),
  rescueFeedback: 'contact-release-break-flash-and-rise',
  releaseFlashSeconds: POW_RELEASE_FLASH_SECONDS,
  rescueRiseSeconds: POW_RESCUE_RISE_SECONDS,
  rescueRiseHeight: POW_RESCUE_RISE_HEIGHT,
  defaultRescueRadius: 0.82,
  animationLookup: 'weakmap-cached-refs',
  materialLanguage: 'olive-canvas-dark-leather-gunmetal-restrained-brass',
  premiumDetails: Object.freeze(['webbing', 'boots', 'headgear', 'cuffs', 'chain-anchors', 'cage-lock', 'ground-shadow', 'diegetic-rescue-beacon']),
  dynamicLights: 0,
  perFrameTraversal: false,
});
