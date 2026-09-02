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
  let head = null;
  root.traverse((child) => {
    if (!head && child?.geometry?.type === 'ExtrudeGeometry') head = child;
  });
  return head;
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
