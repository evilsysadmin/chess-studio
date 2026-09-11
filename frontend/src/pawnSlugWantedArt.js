import * as THREE from 'three';

const RANK_STYLE = Object.freeze({
  1: Object.freeze({ color: 0xa9342a, metalness: 0.32, emissive: 0x54120d }),
  2: Object.freeze({ color: 0xaeb5bc, metalness: 0.78, emissive: 0x303840 }),
  3: Object.freeze({ color: 0xd6aa45, metalness: 0.72, emissive: 0x6c4308 }),
});

function materialFor(rank) {
  const style = RANK_STYLE[rank] || RANK_STYLE[1];
  return new THREE.MeshStandardMaterial({
    color: style.color,
    roughness: rank === 1 ? 0.58 : 0.42,
    metalness: style.metalness,
    emissive: style.emissive,
    emissiveIntensity: 0.28,
  });
}

function badgeGeometry(rank) {
  if (rank >= 3) return new THREE.BoxGeometry(0.38, 0.28, 0.075);
  if (rank === 2) return new THREE.OctahedronGeometry(0.22, 0);
  return new THREE.BoxGeometry(0.34, 0.16, 0.065);
}

export function attachPawnSlugWantedInsignia(model, officer, { reducedMotion = false } = {}) {
  if (!model || !officer?.wanted) return null;
  const badge = new THREE.Mesh(badgeGeometry(officer.rank), materialFor(officer.rank));
  badge.name = `pawn-slug-wanted-rank-${officer.rank}`;
  badge.position.set(0, officer.rank >= 3 ? 1.72 : 1.58, 0.62);
  badge.rotation.z = officer.rank === 2 ? Math.PI / 4 : 0;
  badge.castShadow = false;
  badge.userData.wanted = true;
  badge.userData.rank = officer.rank;
  badge.userData.insignia = officer.insignia;
  badge.userData.spawnedAt = 0;
  badge.userData.reducedMotion = Boolean(reducedMotion);
  model.add(badge);
  model.userData.wantedOfficer = officer;
  return badge;
}

export function animatePawnSlugWantedInsignia(model, time = 0) {
  const badge = model?.children?.find((child) => child?.userData?.wanted);
  if (!badge) return;
  if (!badge.userData.spawnedAt) badge.userData.spawnedAt = Number(time) || 0;
  if (badge.userData.reducedMotion) {
    badge.scale.setScalar(1);
    if (badge.material) badge.material.emissiveIntensity = 0.28;
    return;
  }
  const age = Math.max(0, (Number(time) || 0) - badge.userData.spawnedAt);
  const entrance = Math.max(0, 1 - age / 0.75);
  const pulse = Math.sin(age * 18) * 0.08 * entrance;
  badge.scale.setScalar(1 + pulse + entrance * 0.14);
  if (badge.material) badge.material.emissiveIntensity = 0.28 + entrance * 0.55;
}

export const PAWN_SLUG_WANTED_ART_META = Object.freeze({
  rank1: 'red-tab',
  rank2: 'silver-crossed-pawns',
  rank3: 'gold-rook-chevron',
  extraLights: false,
  entrance: 'brief-pulse',
});
