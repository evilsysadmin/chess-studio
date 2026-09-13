import * as THREE from 'three';

const SQUARE_RE = /^[a-h][1-8]$/;
const MAX_BANDS = 4;

function normalizedRank(value) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 1 ? numeric : 1;
}

export function rankBandCount(rank) {
  return Math.min(MAX_BANDS, Math.max(0, normalizedRank(rank) - 1));
}

export function serializeBoard3DRankLevels(levels = {}) {
  return Object.entries(levels || {})
    .filter(([square, rank]) => SQUARE_RE.test(square) && normalizedRank(rank) > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([square, rank]) => `${square}:${normalizedRank(rank)}`)
    .join(',');
}

export function parseBoard3DRankLevels(payload = '') {
  const ranks = {};
  for (const token of String(payload || '').split(',')) {
    const [square, rawRank] = token.split(':');
    if (!SQUARE_RE.test(square || '')) continue;
    const rank = normalizedRank(rawRank);
    if (rank > 1) ranks[square] = rank;
  }
  return ranks;
}

function disposeInsignia(group) {
  const materials = new Set();
  const geometries = new Set();
  group?.traverse?.((child) => {
    if (child.geometry && !geometries.has(child.geometry)) {
      geometries.add(child.geometry);
      child.geometry.dispose?.();
    }
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

function currentInsignia(piece) {
  return piece?.children?.find?.((child) => child?.userData?.combatRankInsignia) || null;
}

function buildInsignia(square, bandCount, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'combat-rank-insignia';
  group.userData.combatRankInsignia = true;
  group.userData.rankBandCount = bandCount;
  group.userData.square = square;

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xb99445,
    metalness: 0.78,
    roughness: 0.28,
    clearcoat: 0.48,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.05,
    emissive: 0x2a1906,
    emissiveIntensity: coarsePointer ? 0.07 : 0.045,
  });
  const radialSegments = coarsePointer ? 6 : 8;
  const tubularSegments = coarsePointer ? 20 : 30;
  const tube = coarsePointer ? 0.0125 : 0.011;

  for (let index = 0; index < bandCount; index += 1) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.366, tube, radialSegments, tubularSegments),
      material,
    );
    band.position.y = 0.052 + index * 0.036;
    band.rotation.x = Math.PI / 2;
    band.castShadow = false;
    band.receiveShadow = false;
    band.frustumCulled = false;
    band.renderOrder = 2;
    band.userData.combatRankBand = index + 1;
    band.userData.square = square;
    group.add(band);
  }
  return group;
}

export function syncBoard3DRankInsignias(state) {
  if (!state?.pieceMeshes) return { rankedPieces: 0, bands: 0 };
  const wrapper = state.renderer?.domElement?.closest?.('[data-board3d-rank-levels]');
  const ranks = parseBoard3DRankLevels(wrapper?.dataset?.board3dRankLevels || '');
  let rankedPieces = 0;
  let bands = 0;

  for (const [square, piece] of state.pieceMeshes.entries()) {
    if (!piece) continue;
    const rank = normalizedRank(ranks[square]);
    const desiredBands = rankBandCount(rank);
    const existing = currentInsignia(piece);

    piece.userData.combatRankLevel = rank;
    piece.userData.combatRankBandCount = desiredBands;

    if (existing?.userData?.rankBandCount !== desiredBands) {
      if (existing) {
        piece.remove(existing);
        disposeInsignia(existing);
      }
      if (desiredBands > 0) piece.add(buildInsignia(square, desiredBands, Boolean(state.coarsePointer)));
    }

    if (desiredBands > 0) {
      rankedPieces += 1;
      bands += desiredBands;
    }
  }

  if (state.renderer?.domElement?.dataset) {
    state.renderer.domElement.dataset.board3dRankInsignia = 'plinth-bands-v1';
    state.renderer.domElement.dataset.board3dRankedPieces = String(rankedPieces);
    state.renderer.domElement.dataset.board3dRankBands = String(bands);
  }
  return { rankedPieces, bands };
}
