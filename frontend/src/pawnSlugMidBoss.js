import * as THREE from 'three';

export const PAWN_SLUG_STURM_BISHOP_META = Object.freeze({
  label: 'STURM-BISCHOF',
  silhouette: 'armored-bishop',
  weaponMounts: 2,
  weakPoint: 'visor',
  shellTelegraphSeconds: 0.52,
  shellRange: 12.5,
  suppressionTelegraphSeconds: 0.46,
  suppressionRange: 9.5,
  suppressionBurstShots: 3,
  suppressionShotInterval: 0.14,
  entrySeconds: 0.72,
});

export function pawnSlugSturmBishopCooldownTick(cooldown, distance, range, telegraphSeconds, dt) {
  const current = Number(cooldown);
  const targetDistance = Number(distance);
  const attackRange = Number(range);
  const warningWindow = Math.max(0, Number(telegraphSeconds) || 0);
  const elapsed = Math.max(0, Number(dt) || 0);
  if (!Number.isFinite(current)) return warningWindow;
  if (!Number.isFinite(targetDistance) || !Number.isFinite(attackRange) || targetDistance > attackRange) {
    return Math.max(current, warningWindow);
  }
  return current - elapsed;
}

export function pawnSlugSturmBishopTelegraph(shellCooldown, distance) {
  const cooldown = Number(shellCooldown);
  const range = Number(distance);
  if (!Number.isFinite(cooldown) || !Number.isFinite(range) || range > PAWN_SLUG_STURM_BISHOP_META.shellRange) return 0;
  if (cooldown <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - cooldown / PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds));
}

export function pawnSlugSturmBishopSuppressionTelegraph(cooldown, distance) {
  const remaining = Number(cooldown);
  const range = Number(distance);
  if (!Number.isFinite(remaining) || !Number.isFinite(range) || range > PAWN_SLUG_STURM_BISHOP_META.suppressionRange) return 0;
  if (remaining <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - remaining / PAWN_SLUG_STURM_BISHOP_META.suppressionTelegraphSeconds));
}

export function pawnSlugSturmBishopEntryPose(age = 0, { reducedMotion = false } = {}) {
  const identity = Object.freeze({ active: false, scale: 1, y: 0, tilt: 0, visorBoost: 0 });
  if (reducedMotion) return identity;
  const duration = PAWN_SLUG_STURM_BISHOP_META.entrySeconds;
  const safeAge = Math.max(0, Number(age) || 0);
  if (safeAge >= duration) return identity;
  const t = Math.max(0, Math.min(1, safeAge / duration));
  const settle = 1 - ((1 - t) ** 3);
  const remaining = 1 - settle;
  return Object.freeze({
    active: true,
    scale: 0.88 + settle * 0.12,
    y: 0.2 * remaining,
    tilt: -0.045 * remaining,
    visorBoost: 2.2 * remaining,
  });
}

export function pawnSlugSturmBishopSuppressionLane(shotIndex = 0) {
  const lanes = Object.freeze([
    Object.freeze({ height: 0.62, speed: 8.35, damage: 12, cue: 'jump' }),
    Object.freeze({ height: 1.68, speed: 8.15, damage: 12, cue: 'crouch' }),
    Object.freeze({ height: 1.08, speed: 8.45, damage: 13, cue: 'move' }),
  ]);
  const index = ((Math.floor(Number(shotIndex) || 0) % lanes.length) + lanes.length) % lanes.length;
  return lanes[index];
}

function standard(color, roughness = 0.62, metalness = 0.34, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

export function createSturmBishopModel() {
  const root = new THREE.Group();
  root.name = 'pawn-slug-sturm-bishop';
  root.userData.midBoss = 'sturm-bishop';
  root.userData.baseY = 0;
  root.userData.baseScale = 1.18;
  root.userData.entryStartedAt = null;
  root.userData.entryReducedMotion = Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  const armor = standard(0x3d444b, 0.52, 0.52);
  const armorDark = standard(0x20262b, 0.7, 0.42);
  const brass = standard(0xb38b43, 0.38, 0.58);
  const leather = standard(0x443227, 0.86, 0.08);
  const visor = standard(0x6f1e18, 0.42, 0.28, 0xff4b2c, 1.45);

  const base = mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.42, 10), armorDark, { y: 0.23, z: 0.02 });
  base.scale.z = 0.62;
  root.add(base);

  const torso = mesh(new THREE.CylinderGeometry(0.42, 0.58, 1.05, 10), armor, { y: 0.9 });
  torso.scale.z = 0.62;
  root.add(torso);

  const chest = mesh(new THREE.BoxGeometry(0.82, 0.44, 0.26), armorDark.clone(), { y: 1.07, z: 0.28 });
  chest.rotation.z = -0.03;
  root.add(chest);

  const collar = mesh(new THREE.TorusGeometry(0.38, 0.07, 7, 16, Math.PI), brass, { y: 1.43, z: 0.05, rx: Math.PI / 2 });
  root.add(collar);

  const head = mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.48, 10), armorDark.clone(), { y: 1.65 });
  head.scale.z = 0.72;
  root.add(head);

  const mitre = mesh(new THREE.ConeGeometry(0.39, 0.86, 5), armor.clone(), { y: 2.18, rz: -0.08 });
  mitre.scale.z = 0.68;
  root.add(mitre);

  const slash = mesh(new THREE.BoxGeometry(0.09, 0.7, 0.08), brass.clone(), { x: 0.08, y: 2.18, z: 0.29, rz: -0.52 });
  root.add(slash);

  const eye = mesh(new THREE.BoxGeometry(0.43, 0.1, 0.055), visor, { y: 1.69, z: 0.32 });
  eye.userData.weakPoint = true;
  root.add(eye);

  for (const side of [-1, 1]) {
    const shoulder = mesh(new THREE.SphereGeometry(0.24, 10, 7), armor.clone(), { x: side * 0.5, y: 1.28, z: 0.03 });
    shoulder.scale.set(1.3, 0.75, 0.72);
    root.add(shoulder);

    const gun = new THREE.Group();
    gun.position.set(side * 0.64, 1.26, 0.04);
    const receiver = mesh(new THREE.BoxGeometry(0.32, 0.18, 0.2), standard(0x20262b, 0.7, 0.42, 0xd45a22, 0));
    receiver.userData.suppressionTelegraph = true;
    const barrel = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.76, 8), armor.clone(), { x: side * 0.4, rz: Math.PI / 2 });
    const muzzle = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.11, 8), standard(0xb38b43, 0.38, 0.58, 0xff6b2f, 0), { x: side * 0.79, rz: Math.PI / 2 });
    muzzle.userData.shellTelegraph = true;
    gun.add(receiver, barrel, muzzle);
    root.add(gun);
  }

  const belt = mesh(new THREE.BoxGeometry(0.98, 0.14, 0.34), leather, { y: 0.63, z: 0.06 });
  root.add(belt);

  const warningHalo = mesh(
    new THREE.RingGeometry(0.7, 0.79, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    { y: 1.18, z: 0.34 },
  );
  warningHalo.name = 'pawn-slug-sturm-warning-halo';
  warningHalo.userData.warningHalo = true;
  warningHalo.castShadow = false;
  warningHalo.receiveShadow = false;
  warningHalo.visible = false;
  root.add(warningHalo);

  root.scale.setScalar(root.userData.baseScale);
  return root;
}

export function animateSturmBishopModel(model, time, { moving = false, hurt = false, dir = -1, telegraph = 0, suppressionTelegraph = 0 } = {}) {
  if (!model) return;
  const safeTime = Number(time) || 0;
  if (!Number.isFinite(model.userData.entryStartedAt)) model.userData.entryStartedAt = safeTime;
  const reducedMotion = Boolean(model.userData.entryReducedMotion);
  const entry = pawnSlugSturmBishopEntryPose(safeTime - model.userData.entryStartedAt, { reducedMotion });
  const direction = dir < 0 ? -1 : 1;
  const stride = Math.sin(safeTime * 7.2);
  const breath = Math.sin(safeTime * 2.15);
  const warning = Math.max(0, Math.min(1, Number(telegraph) || 0));
  const suppression = Math.max(0, Math.min(1, Number(suppressionTelegraph) || 0));
  const warningPulse = warning > 0 ? 0.72 + Math.max(0, Math.sin(safeTime * (9 + warning * 9))) * 0.55 : 0;
  const suppressionPulse = suppression > 0 ? 0.68 + Math.max(0, Math.sin(safeTime * (13 + suppression * 11))) * 0.62 : 0;
  const base = model.userData.baseScale || 1.18;
  model.scale.x = Math.abs(base) * entry.scale * direction;
  model.scale.y = base * entry.scale * (1 + breath * 0.012 - (hurt ? 0.045 : 0));
  model.scale.z = base * entry.scale;
  model.position.y = model.userData.baseY + entry.y + (moving ? Math.abs(stride) * 0.035 : Math.max(0, breath) * 0.012);
  model.rotation.z = entry.tilt * direction + (moving ? -direction * stride * 0.018 : direction * suppression * suppressionPulse * 0.012);

  model.traverse((node) => {
    if (!node.isMesh) return;
    if (node.userData?.warningHalo) {
      const rawStrength = Math.max(warning, suppression);
      const animatedStrength = Math.max(warning * warningPulse, suppression * suppressionPulse);
      const strength = reducedMotion ? rawStrength : animatedStrength;
      node.visible = rawStrength > 0.015;
      node.material.opacity = node.visible ? Math.min(0.78, 0.2 + strength * 0.52) : 0;
      node.material.color.setHex(suppression > warning ? 0xff5b3d : 0xffb347);
      const haloScale = reducedMotion ? 1.04 : 0.92 + strength * 0.22;
      node.scale.setScalar(haloScale);
      node.rotation.z = reducedMotion ? 0 : safeTime * (suppression > warning ? -0.72 : 0.46);
      return;
    }
    if (!node.material?.emissive) return;
    if (node.userData?.weakPoint) {
      node.material.emissiveIntensity = hurt
        ? 2.5
        : 1.25 + entry.visorBoost + Math.max(0, breath) * 0.45 + warning * warningPulse * 1.5 + suppression * suppressionPulse * 0.7;
      return;
    }
    if (node.userData?.suppressionTelegraph) {
      node.material.emissiveIntensity = suppression * suppressionPulse * 2.4;
      return;
    }
    if (node.userData?.shellTelegraph) {
      node.material.emissiveIntensity = Math.max(warning * warningPulse * 3.2, suppression * suppressionPulse * 1.65);
      node.scale.setScalar(1 + Math.max(warning * warningPulse * 0.16, suppression * suppressionPulse * 0.08));
    }
  });
}
