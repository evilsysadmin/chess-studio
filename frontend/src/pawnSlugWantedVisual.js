import * as THREE from 'three';

const COLOR_BY_INSIGNIA = Object.freeze({
  'red-knight-tab': 0xb53a32,
  'silver-crossed-pawns': 0xbfc5c9,
  'gold-rook-chevron': 0xd3a83e,
});

function material(color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.94, depthWrite: false, depthTest: true });
}

export function decoratePawnSlugWantedModel(model, officer, { reducedMotion = false } = {}) {
  if (!model || !officer?.wanted) return null;
  const color = COLOR_BY_INSIGNIA[officer.insignia] || COLOR_BY_INSIGNIA['red-knight-tab'];
  const badge = new THREE.Group();
  badge.name = 'pawn-slug-wanted-insignia';
  badge.userData.wanted = true;
  badge.userData.rank = officer.rank;
  badge.userData.insignia = officer.insignia;
  badge.userData.spawnedAt = 0;
  badge.userData.reducedMotion = Boolean(reducedMotion);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.16 + officer.rank * 0.018, 12), material(color));
  disc.position.z = 0.035;
  disc.name = 'pawn-slug-wanted-insignia-disc';
  const chevron = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.105, 3), material(0x171a1d));
  chevron.rotation.z = Math.PI;
  chevron.position.z = 0.055;
  chevron.name = 'pawn-slug-wanted-insignia-chevron';
  badge.add(disc, chevron);

  const height = model.userData.enemyType === 'rook' ? 1.55 : model.userData.enemyType === 'knight' ? 1.35 : 1.18;
  badge.position.set(0, height, 0.2);
  badge.scale.setScalar(reducedMotion ? 1 : 0.72);
  model.add(badge);
  model.userData.wantedOfficer = officer;
  return badge;
}

export function animatePawnSlugWantedInsignia(badge, time = 0) {
  if (!badge?.userData?.wanted) return;
  const t = Math.max(0, Number(time) || 0);
  if (badge.userData.reducedMotion) {
    badge.scale.setScalar(1);
    badge.rotation.z = 0;
    return;
  }
  const entry = Math.min(1, t / 0.42);
  const pulse = 1 + Math.sin(t * 5.6) * 0.045;
  const scale = (0.72 + entry * 0.28) * pulse;
  badge.scale.setScalar(scale);
  badge.rotation.z = Math.sin(t * 2.8) * 0.025;
  for (const child of badge.children) {
    if (child.material) child.material.opacity = 0.86 + Math.sin(t * 5.6) * 0.08;
  }
}

export const PAWN_SLUG_WANTED_VISUAL_META = Object.freeze({
  style: 'diegetic-officer-insignia',
  addsLights: false,
  rankColors: Object.freeze({ 1: 'red', 2: 'silver', 3: 'gold' }),
});
