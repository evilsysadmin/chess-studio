import * as THREE from 'three';

// The campaign service record is authoritative; this view deliberately only
// encodes an earned-count, not medal definitions, progression or rule changes.
const SQUARE = /^[a-h][1-8]$/;
const MAX_SEALS = 3;
const MAX_RECORDED = 6;

export function serializeBoard3DCombatMedals(counts = {}) {
  return Object.entries(counts || {})
    .filter(([square, value]) => SQUARE.test(square) && Number.isFinite(Number(value)) && Number(value) >= 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([square, value]) => `${square}:${Math.min(MAX_RECORDED, Math.floor(Number(value)))}`)
    .join(',');
}

export function parseBoard3DCombatMedals(payload = '') {
  const result = {};
  for (const entry of String(payload || '').split(',')) {
    const [square, raw] = entry.split(':');
    const value = Number(raw);
    if (!SQUARE.test(square || '') || !/^\d+$/.test(raw || '') || !Number.isSafeInteger(value) || value < 1) continue;
    result[square] = Math.min(MAX_RECORDED, value);
  }
  return result;
}

function disposeMedalRosettes(group) {
  const materials = new Set();
  const geometries = new Set();
  group?.traverse?.((mesh) => {
    if (mesh.geometry && !geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      mesh.geometry.dispose?.();
    }
    if (mesh.material && !materials.has(mesh.material)) {
      materials.add(mesh.material);
      mesh.material.dispose?.();
    }
  });
}

function buildMedalRosettes(square, number, earned) {
  const group = new THREE.Group();
  group.name = 'combat-service-medal-rosettes';
  group.userData.combatServiceMedals = true;
  group.userData.earnedDecorationCount = earned;
  group.userData.sealCount = number;
  group.userData.square = square;
  const foil = new THREE.MeshStandardMaterial({
    color: 0xdcb86f, metalness: 0.73, roughness: 0.28,
    emissive: 0x33220b, emissiveIntensity: 0.05,
  });
  // Faceted miniature rosettes on the front edge of the plinth; no point
  // lights, particles, textures, shadow maps or per-frame animation.
  const geometry = new THREE.OctahedronGeometry(0.059, 0);
  for (let index = 0; index < number; index += 1) {
    const medal = new THREE.Mesh(geometry, foil);
    medal.position.set((index - (number - 1) / 2) * 0.14, 0.186, 0.31);
    medal.rotation.y = Math.PI / 4;
    medal.castShadow = false;
    medal.receiveShadow = false;
    medal.userData.combatMedalRosette = true;
    group.add(medal);
  }
  return group;
}

export function syncBoard3DCombatMedals(state, wrapper) {
  if (!state?.pieceMeshes) return { decoratedPieces: 0, seals: 0 };
  const counts = parseBoard3DCombatMedals(wrapper?.dataset?.board3dCombatMedals || '');
  let decoratedPieces = 0;
  let seals = 0;
  for (const [square, piece] of state.pieceMeshes.entries()) {
    if (!piece) continue;
    const earned = counts[square] || 0;
    const desired = Math.min(MAX_SEALS, earned);
    const existing = piece.children.find((child) => child.userData?.combatServiceMedals);
    if (existing && (existing.userData.sealCount !== desired || existing.userData.earnedDecorationCount !== earned)) {
      piece.remove(existing);
      disposeMedalRosettes(existing);
    }
    if (desired && (!existing || existing.parent !== piece)) piece.add(buildMedalRosettes(square, desired, earned));
    if (desired) {
      decoratedPieces += 1;
      seals += desired;
    }
  }
  const dataset = state.renderer?.domElement?.dataset;
  if (dataset) {
    dataset.board3dServiceMedals = 'service-rosettes-v1';
    dataset.board3dDecoratedPieces = String(decoratedPieces);
    dataset.board3dMedalSeals = String(seals);
  }
  return { decoratedPieces, seals };
}
