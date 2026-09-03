import { describe, expect, it } from 'vitest';
import { buildPiece, disposeObject } from './Board3DPieces.js';

function vertexCount(root) {
  let count = 0;
  root.traverse((child) => {
    const position = child?.geometry?.attributes?.position;
    count += Number(position?.count || 0);
  });
  return count;
}

function meshCount(root) {
  let count = 0;
  root.traverse((child) => { if (child?.isMesh) count += 1; });
  return count;
}

function renderableMeshes(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child?.isMesh && !child.userData?.touchHitTarget) meshes.push(child);
  });
  return meshes;
}

function knightHead(root) {
  return knightMeshesByRole(root, ':knight-head')[0] || null;
}

function knightMeshesByRole(root, suffix) {
  const meshes = [];
  root.traverse((child) => {
    const role = child?.geometry?.userData?.board3DKnightGeometryRole;
    if (child?.isMesh && typeof role === 'string' && role.endsWith(suffix)) meshes.push(child);
  });
  return meshes;
}

function knightSculptDetails(root) {
  const details = [];
  root.traverse((child) => {
    if (child?.isMesh && child.userData?.knightSculptDetail) details.push(child);
  });
  return details;
}

function effectiveGeometrySize(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  return {
    x: (box.max.x - box.min.x) * mesh.scale.x,
    y: (box.max.y - box.min.y) * mesh.scale.y,
    z: (box.max.z - box.min.z) * mesh.scale.z,
  };
}

const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const startingArmy = [...backRank, ...Array(8).fill('p')];

describe('Board3D piece resilience', () => {
  it('construye las 32 piezas de una posición inicial sin dejar huecos ni culling útil', () => {
    const roots = [];
    for (const color of ['w', 'b']) {
      for (const type of startingArmy) roots.push(buildPiece(type, color, 'studio', false));
    }

    expect(roots).toHaveLength(32);
    expect(roots.every(Boolean)).toBe(true);
    expect(roots.every((root) => meshCount(root) > 0)).toBe(true);
    expect(roots.filter((root) => root.userData.warRoomFallbackPiece)).toHaveLength(0);
    expect(roots.every((root) => root.userData.board3DVisibilityGuard === 'fixed-board-no-frustum-v1')).toBe(true);
    expect(roots.every((root) => renderableMeshes(root).every((mesh) => mesh.frustumCulled === false && mesh.visible))).toBe(true);

    roots.forEach(disposeObject);
  });

  it('aísla la geometría viva de cada caballo aunque parta de una plantilla cacheada', () => {
    const b1 = buildPiece('n', 'w', 'studio', false);
    const g1 = buildPiece('n', 'w', 'studio', false);
    const black = buildPiece('n', 'b', 'studio', false);
    const b1Head = knightHead(b1);
    const g1Head = knightHead(g1);
    const blackHead = knightHead(black);

    expect(meshCount(b1)).toBeGreaterThan(0);
    expect(meshCount(g1)).toBeGreaterThan(0);
    expect(b1.userData.board3DKnightGeometryIsolation).toBe('per-piece-v2');
    expect(g1.userData.board3DKnightGeometryIsolation).toBe('per-piece-v2');
    expect(b1.userData.board3DKnightVisibilityGuard).toBe('isolated-geometry-v2');
    expect(b1Head?.geometry?.userData?.board3DKnightGeometryClone).toBe(true);
    expect(g1Head?.geometry?.userData?.board3DKnightGeometryClone).toBe(true);
    expect(g1Head?.geometry).not.toBe(b1Head?.geometry);
    expect(blackHead?.geometry).not.toBe(b1Head?.geometry);
    expect(g1Head?.geometry?.userData?.board3DKnightGeometryRole).toBe(b1Head?.geometry?.userData?.board3DKnightGeometryRole);

    let g1Disposed = false;
    g1Head?.geometry?.addEventListener?.('dispose', () => { g1Disposed = true; });
    disposeObject(b1);
    expect(g1Disposed).toBe(false);
    expect(g1Head?.geometry?.attributes?.position?.count).toBeGreaterThan(0);
    [g1, black].forEach(disposeObject);
  });

  it('usa un perfil Staunton delgado y evita que la perspectiva convierta el caballo en un bloque', () => {
    const full = buildPiece('n', 'w', 'studio', false);
    const lite = buildPiece('n', 'w', 'studio', true);
    const details = knightSculptDetails(full);
    const roles = details.map((mesh) => mesh.userData.knightSculptDetail);
    const liteDetails = knightSculptDetails(lite);
    const liteRoles = liteDetails.map((mesh) => mesh.userData.knightSculptDetail);
    const fullHead = knightHead(full);
    const liteHead = knightHead(lite);
    const fullSize = effectiveGeometrySize(fullHead);
    const liteSize = effectiveGeometrySize(liteHead);

    expect(full.userData.board3DKnightSilhouetteVersion).toBe('classic-staunton-v11');
    expect(full.userData.board3DKnightPosture).toBe('forward-carved-profile-v11');
    expect(full.userData.board3DKnightDepthProfile).toBe('slim-018-v11');
    expect(full.userData.board3DKnightHeightProfile).toBe('compact-091-v11');
    expect(full.userData.board3DKnightDetailVersion).toBe('classic-staunton-v11');
    expect(full.userData.board3DKnightManeProfile).toBe('single-rear-ridge-v11');
    expect(full.userData.board3DKnightEarProfile).toBe('single-thin-rear-ear-v11');
    expect(full.userData.board3DKnightBaseAccentProfile).toBe('three-inset-slots-v11');
    expect(full.userData.board3DKnightPremiumDetailCount).toBe(5);
    expect(full.userData.board3DKnightRetiredLegacyParts).toBe(5);
    expect(full.userData.board3DPremiumPieceScale).toBeCloseTo(.96, 5);
    expect(fullHead.userData.knightHeadProfile).toBe('classic-staunton-v11');
    expect(fullHead.geometry.type).toBe('ExtrudeGeometry');
    expect(fullHead.position.y).toBeCloseTo(.325, 5);
    expect(fullHead.scale.x).toBeCloseTo(.94, 5);
    expect(fullHead.scale.z).toBeCloseTo(.86, 5);
    expect(fullSize.y).toBeLessThan(.92);
    expect(fullSize.z).toBeLessThan(.21);
    expect(fullSize.z / fullSize.x).toBeLessThan(.34);
    expect(knightMeshesByRole(full, ':knight-neck')).toHaveLength(0);
    expect(knightMeshesByRole(full, ':knight-ear')).toHaveLength(0);
    expect(knightMeshesByRole(full, ':knight-eye')).toHaveLength(0);
    expect(details).toHaveLength(5);
    expect(roles.filter((role) => role === 'ear-fin')).toHaveLength(1);
    expect(roles.filter((role) => role === 'mane-ridge')).toHaveLength(1);
    expect(roles.filter((role) => role === 'base-slot')).toHaveLength(3);
    expect(roles).not.toContain('muzzle');
    expect(roles).not.toContain('jaw');
    expect(renderableMeshes(full).every((mesh) => mesh.frustumCulled === false && mesh.visible)).toBe(true);

    expect(lite.userData.board3DKnightSilhouetteVersion).toBe('classic-staunton-lite-v11');
    expect(lite.userData.board3DKnightPosture).toBe('forward-carved-profile-lite-v11');
    expect(lite.userData.board3DKnightDepthProfile).toBe('slim-0165-v11');
    expect(lite.userData.board3DKnightHeightProfile).toBe('compact-091-v11');
    expect(lite.userData.board3DKnightDetailVersion).toBe('classic-staunton-lite-v11');
    expect(lite.userData.board3DKnightManeProfile).toBe('no-extra-mane-lite-v11');
    expect(lite.userData.board3DKnightEarProfile).toBe('single-thin-rear-ear-v11');
    expect(lite.userData.board3DKnightBaseAccentProfile).toBe('two-inset-slots-lite-v11');
    expect(lite.userData.board3DKnightPremiumDetailCount).toBe(3);
    expect(lite.userData.board3DKnightRetiredLegacyParts).toBe(5);
    expect(lite.userData.board3DPremiumPieceScale).toBeCloseTo(.9, 5);
    expect(liteHead.userData.knightHeadProfile).toBe('classic-staunton-lite-v11');
    expect(liteHead.geometry.type).toBe('ExtrudeGeometry');
    expect(liteHead.position.y).toBeCloseTo(.315, 5);
    expect(liteHead.scale.x).toBeCloseTo(.92, 5);
    expect(liteHead.scale.z).toBeCloseTo(.84, 5);
    expect(liteSize.y).toBeLessThan(fullSize.y);
    expect(liteSize.z).toBeLessThan(.19);
    expect(knightMeshesByRole(lite, ':knight-neck')).toHaveLength(0);
    expect(knightMeshesByRole(lite, ':knight-ear')).toHaveLength(0);
    expect(knightMeshesByRole(lite, ':knight-eye')).toHaveLength(0);
    expect(liteDetails).toHaveLength(3);
    expect(liteRoles.filter((role) => role === 'ear-fin')).toHaveLength(1);
    expect(liteRoles.filter((role) => role === 'mane-ridge')).toHaveLength(0);
    expect(liteRoles.filter((role) => role === 'base-slot')).toHaveLength(2);
    expect(liteRoles).not.toContain('muzzle');
    expect(liteRoles).not.toContain('jaw');
    expect(renderableMeshes(lite).every((mesh) => mesh.frustumCulled === false && mesh.visible)).toBe(true);

    [full, lite].forEach(disposeObject);
  });

  it('mantiene vivo el caballo estacionario mientras el otro se reconstruye repetidamente', () => {
    const stationary = buildPiece('n', 'w', 'studio', false);
    const stationaryHead = knightHead(stationary);
    let stationaryDisposed = false;
    stationaryHead?.geometry?.addEventListener?.('dispose', () => { stationaryDisposed = true; });

    for (let cycle = 0; cycle < 12; cycle += 1) {
      const moving = buildPiece('n', 'w', 'studio', false);
      const movingHead = knightHead(moving);
      expect(movingHead?.geometry).not.toBe(stationaryHead?.geometry);
      disposeObject(moving);
      expect(stationaryDisposed).toBe(false);
      expect(stationaryHead?.geometry?.attributes?.position?.count).toBeGreaterThan(0);
      expect(renderableMeshes(stationary).every((mesh) => mesh.frustumCulled === false && mesh.visible)).toBe(true);
    }

    disposeObject(stationary);
    expect(stationaryDisposed).toBe(true);
  });

  it('recorta de verdad la geometría en el perfil lite/software WebGL', () => {
    const fullPawn = buildPiece('p', 'w', 'studio', false);
    const litePawn = buildPiece('p', 'w', 'studio', true);
    const fullKnight = buildPiece('n', 'b', 'studio', false);
    const liteKnight = buildPiece('n', 'b', 'studio', true);

    expect(vertexCount(litePawn)).toBeLessThan(vertexCount(fullPawn) * 0.72);
    expect(vertexCount(liteKnight)).toBeLessThan(vertexCount(fullKnight) * 0.78);

    [fullPawn, litePawn, fullKnight, liteKnight].forEach(disposeObject);
  });
});
