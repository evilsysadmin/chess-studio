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

  it('usa un caballo equino reconocible con cuello esculpido, mandíbula, hocico largo y orejas separadas', () => {
    const full = buildPiece('n', 'w', 'studio', false);
    const lite = buildPiece('n', 'w', 'studio', true);
    const details = knightSculptDetails(full);
    const roles = details.map((mesh) => mesh.userData.knightSculptDetail);
    const manes = details.filter((mesh) => mesh.userData.knightSculptDetail === 'mane');
    const muzzle = details.find((mesh) => mesh.userData.knightSculptDetail === 'muzzle');
    const jaw = details.find((mesh) => mesh.userData.knightSculptDetail === 'jaw');
    const liteDetails = knightSculptDetails(lite);
    const liteRoles = liteDetails.map((mesh) => mesh.userData.knightSculptDetail);
    const liteManes = liteDetails.filter((mesh) => mesh.userData.knightSculptDetail === 'mane');
    const liteMuzzle = liteDetails.find((mesh) => mesh.userData.knightSculptDetail === 'muzzle');
    const liteJaw = liteDetails.find((mesh) => mesh.userData.knightSculptDetail === 'jaw');
    const fullHead = knightHead(full);
    const liteHead = knightHead(lite);
    const [neck] = knightMeshesByRole(full, ':knight-neck');
    const [liteNeck] = knightMeshesByRole(lite, ':knight-neck');
    const ears = knightMeshesByRole(full, ':knight-ear');
    const liteEars = knightMeshesByRole(lite, ':knight-ear');

    expect(full.userData.board3DKnightSilhouetteVersion).toBe('equestrian-staunton-v8');
    expect(full.userData.board3DKnightPosture).toBe('sculpted-s-neck-v8');
    expect(full.userData.board3DKnightDetailVersion).toBe('equestrian-sculpted-v8');
    expect(full.userData.board3DKnightManeProfile).toBe('five-rear-carved-locks-v8');
    expect(full.userData.board3DKnightPremiumDetailCount).toBe(11);
    expect(full.userData.board3DPremiumPieceScale).toBeCloseTo(.96, 5);
    expect(fullHead.userData.knightHeadProfile).toBe('equestrian-staunton-v8');
    expect(fullHead.scale.x).toBeCloseTo(1.08, 5);
    expect(fullHead.scale.y).toBeLessThan(liteHead.scale.y);
    expect(neck.userData.knightNeckProfile).toBe('sculpted-s-neck-v8');
    expect(neck.geometry.type).toBe('ExtrudeGeometry');
    expect(neck.scale.x).toBeGreaterThan(1);
    expect(neck.scale.y).toBeGreaterThan(1);
    expect(ears).toHaveLength(2);
    expect(ears[0].position.x).toBeCloseTo(ears[1].position.x, 5);
    expect(ears[0].position.z).toBeGreaterThan(0.075);
    expect(ears[1].position.z).toBeLessThan(-0.075);
    expect(details).toHaveLength(11);
    expect(roles.filter((role) => role === 'muzzle')).toHaveLength(1);
    expect(roles.filter((role) => role === 'jaw')).toHaveLength(1);
    expect(roles.filter((role) => role === 'bridle')).toHaveLength(2);
    expect(roles.filter((role) => role === 'nostril')).toHaveLength(2);
    expect(muzzle.position.x).toBeGreaterThan(0.45);
    expect(muzzle.scale.x).toBeGreaterThan(1.7);
    expect(jaw.position.y).toBeLessThan(muzzle.position.y);
    expect(manes).toHaveLength(5);
    expect(Math.max(...manes.map((mesh) => mesh.position.y))).toBeLessThan(.9);
    expect(renderableMeshes(full).every((mesh) => mesh.frustumCulled === false && mesh.visible)).toBe(true);

    expect(lite.userData.board3DKnightSilhouetteVersion).toBe('equestrian-staunton-lite-v9');
    expect(lite.userData.board3DKnightPosture).toBe('sculpted-s-neck-lite-v9');
    expect(lite.userData.board3DKnightDetailVersion).toBe('equestrian-lite-v9');
    expect(lite.userData.board3DKnightManeProfile).toBe('four-rear-readable-locks-lite-v9');
    expect(lite.userData.board3DKnightPremiumDetailCount).toBe(6);
    expect(lite.userData.board3DPremiumPieceScale).toBeCloseTo(.9, 5);
    expect(liteHead.userData.knightHeadProfile).toBe('equestrian-staunton-lite-v9');
    expect(liteHead.geometry.type).toBe('ExtrudeGeometry');
    expect(liteNeck.userData.knightNeckProfile).toBe('sculpted-s-neck-lite-v9');
    expect(liteNeck.geometry.type).toBe('ExtrudeGeometry');
    expect(liteEars).toHaveLength(2);
    expect(liteDetails).toHaveLength(6);
    expect(liteRoles.filter((role) => role === 'muzzle')).toHaveLength(1);
    expect(liteRoles.filter((role) => role === 'jaw')).toHaveLength(1);
    expect(liteManes).toHaveLength(4);
    expect(liteMuzzle.position.x).toBeGreaterThan(0.45);
    expect(liteMuzzle.scale.x).toBeGreaterThan(1.7);
    expect(liteJaw.position.y).toBeLessThan(liteMuzzle.position.y);
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
